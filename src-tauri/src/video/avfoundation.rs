//! macOS AVFoundation / VideoToolbox encoder (plan §7 / AN-4.4).
//!
//! Compiled only for `#[cfg(all(target_os = "macos", feature = "video-toolbox"))]`.
//! Drives an `AVAssetWriter` with an `AVAssetWriterInputPixelBufferAdaptor`: the
//! writer selects VideoToolbox's hardware H.264/HEVC encoder on Apple silicon and
//! muxes the MP4 to a temp file. RGBA frames from the webview are wrapped in a
//! `CVPixelBuffer` (converted to BGRA, which every macOS encoder accepts) and
//! appended at explicit microsecond presentation times.
//!
//! NOTE FOR MACOS BUILDS: this file uses Objective-C interop (`objc2`) against the
//! installed SDK and cannot be compiled on the Linux CI host, so it is gated
//! behind the default-off `video-toolbox` feature. Build/verify it on macOS with
//! `cargo build --features video-toolbox`; `objc2` selector signatures and the
//! extern framework constants below may need small adjustments against the exact
//! `objc2`/SDK versions in use.
#![allow(non_upper_case_globals, non_snake_case)]

use std::ffi::c_void;
use std::path::PathBuf;
use std::time::Duration;

use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::{class, msg_send, Encode, Encoding, RefEncode};
use objc2_foundation::{NSNumber, NSString, NSURL};

use super::{VtFinalizeResult, VtProbeResult};

// --- CoreMedia / CoreVideo FFI --------------------------------------------

/// `CMTime` (CoreMedia). We only ever build valid times, so a minimal mirror.
#[repr(C)]
#[derive(Clone, Copy)]
struct CMTime {
    value: i64,
    timescale: i32,
    flags: u32,
    epoch: i64,
}

// Let `msg_send!` pass `CMTime` by value.
unsafe impl Encode for CMTime {
    const ENCODING: Encoding = Encoding::Struct(
        "?",
        &[
            i64::ENCODING,
            i32::ENCODING,
            u32::ENCODING,
            i64::ENCODING,
        ],
    );
}
unsafe impl RefEncode for CMTime {
    const ENCODING_REF: Encoding = Encoding::Pointer(&Self::ENCODING);
}

/// `kCMTimeFlags_Valid`.
const CM_TIME_FLAGS_VALID: u32 = 1;

fn cm_time(micros: i64) -> CMTime {
    CMTime {
        value: micros,
        timescale: 1_000_000,
        flags: CM_TIME_FLAGS_VALID,
        epoch: 0,
    }
}

#[repr(C)]
struct __CVBuffer(c_void);
type CVPixelBufferRef = *mut __CVBuffer;

/// `kCVPixelFormatType_32BGRA` (FourCC 'BGRA').
const K_CV_PIXEL_FORMAT_TYPE_32BGRA: u32 = 0x4247_5241;

extern "C" {
    fn CVPixelBufferCreateWithBytes(
        allocator: *const c_void,
        width: usize,
        height: usize,
        pixel_format_type: u32,
        base_address: *mut c_void,
        bytes_per_row: usize,
        release_callback: *const c_void,
        release_ref_con: *mut c_void,
        pixel_buffer_attributes: *const c_void,
        pixel_buffer_out: *mut CVPixelBufferRef,
    ) -> i32;
    fn CVPixelBufferRelease(buffer: CVPixelBufferRef);
}

// --- AVFoundation string constants (extern statics) -----------------------

extern "C" {
    static AVVideoCodecKey: *const NSString;
    static AVVideoWidthKey: *const NSString;
    static AVVideoHeightKey: *const NSString;
    static AVVideoCompressionPropertiesKey: *const NSString;
    static AVVideoAverageBitRateKey: *const NSString;
    static AVVideoMaxKeyFrameIntervalKey: *const NSString;
    static AVVideoCodecTypeH264: *const NSString;
    static AVVideoCodecTypeHEVC: *const NSString;
    static AVMediaTypeVideo: *const NSString;
    static AVFileTypeMPEG4: *const NSString;
}

// --- Encoder --------------------------------------------------------------

pub struct AvEncoder {
    writer: Retained<AnyObject>,
    input: Retained<AnyObject>,
    adaptor: Retained<AnyObject>,
    path: PathBuf,
    width: u32,
    height: u32,
    fps: u32,
    started: bool,
}

/// Default target bitrate (bits/s), mirroring the WebCodecs policy so file sizes
/// are comparable across backends.
fn default_bitrate(codec: &str, width: u32, height: u32) -> u32 {
    let megapixels = (width as f64 * height as f64) / 1_000_000.0;
    let per_mp = if codec == "h265" { 3_500_000.0 } else { 6_000_000.0 };
    (megapixels * per_mp).max(1_000_000.0) as u32
}

impl AvEncoder {
    pub fn begin(
        codec: &str,
        width: u32,
        height: u32,
        fps: u32,
        bitrate: Option<u32>,
    ) -> Result<AvEncoder, String> {
        let path = std::env::temp_dir().join(format!("calqo-export-{}.mp4", uid()));
        let bitrate = bitrate.unwrap_or_else(|| default_bitrate(codec, width, height));

        unsafe {
            let url = NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy()));

            let codec_type: *const NSString = if codec == "h265" {
                AVVideoCodecTypeHEVC
            } else {
                AVVideoCodecTypeH264
            };

            // Compression properties: target bitrate + ~2 s keyframe interval.
            let compression: Retained<AnyObject> = {
                let dict: Retained<AnyObject> = msg_send![class!(NSMutableDictionary), dictionary];
                let bitrate_num = NSNumber::new_u32(bitrate);
                let () = msg_send![&*dict, setObject: &*bitrate_num, forKey: AVVideoAverageBitRateKey];
                let gop = NSNumber::new_u32((fps * 2).max(1));
                let () = msg_send![&*dict, setObject: &*gop, forKey: AVVideoMaxKeyFrameIntervalKey];
                dict
            };

            // Output settings for the writer input.
            let settings: Retained<AnyObject> = {
                let dict: Retained<AnyObject> = msg_send![class!(NSMutableDictionary), dictionary];
                let () = msg_send![&*dict, setObject: codec_type, forKey: AVVideoCodecKey];
                let w = NSNumber::new_u32(width);
                let h = NSNumber::new_u32(height);
                let () = msg_send![&*dict, setObject: &*w, forKey: AVVideoWidthKey];
                let () = msg_send![&*dict, setObject: &*h, forKey: AVVideoHeightKey];
                let () = msg_send![&*dict, setObject: &*compression, forKey: AVVideoCompressionPropertiesKey];
                dict
            };

            // Writer.
            let alloc: *mut AnyObject = msg_send![class!(AVAssetWriter), alloc];
            let writer: Option<Retained<AnyObject>> = msg_send![
                alloc,
                initWithURL: &*url,
                fileType: AVFileTypeMPEG4,
                error: std::ptr::null_mut::<*mut AnyObject>()
            ];
            let writer = writer.ok_or("failed to create AVAssetWriter")?;

            // Writer input.
            let input: Retained<AnyObject> = msg_send![
                class!(AVAssetWriterInput),
                assetWriterInputWithMediaType: AVMediaTypeVideo,
                outputSettings: &*settings
            ];
            let () = msg_send![&*input, setExpectsMediaDataInRealTime: false];

            // Pixel-buffer adaptor (source pixels are BGRA).
            let px_attrs: Retained<AnyObject> = {
                let dict: Retained<AnyObject> = msg_send![class!(NSMutableDictionary), dictionary];
                let fmt = NSNumber::new_u32(K_CV_PIXEL_FORMAT_TYPE_32BGRA);
                // kCVPixelBufferPixelFormatTypeKey's string value is "PixelFormatType".
                let key = NSString::from_str("PixelFormatType");
                let () = msg_send![&*dict, setObject: &*fmt, forKey: &*key];
                dict
            };
            let adaptor: Retained<AnyObject> = msg_send![
                class!(AVAssetWriterInputPixelBufferAdaptor),
                assetWriterInputPixelBufferAdaptorWithAssetWriterInput: &*input,
                sourcePixelBufferAttributes: &*px_attrs
            ];

            let added: bool = msg_send![&*writer, canAddInput: &*input];
            if !added {
                return Err("AVAssetWriter rejected the video input".to_string());
            }
            let () = msg_send![&*writer, addInput: &*input];

            let ok: bool = msg_send![&*writer, startWriting];
            if !ok {
                return Err("AVAssetWriter failed to start writing".to_string());
            }
            let () = msg_send![&*writer, startSessionAtSourceTime: cm_time(0)];

            Ok(AvEncoder {
                writer,
                input,
                adaptor,
                path,
                width,
                height,
                fps,
                started: true,
            })
        }
    }

    pub fn add_frame(
        &mut self,
        timestamp_micros: i64,
        _duration_micros: i64,
        rgba: &[u8],
    ) -> Result<(), String> {
        if !self.started {
            return Err("encoder is not running".to_string());
        }
        let expected = (self.width as usize) * (self.height as usize) * 4;
        if rgba.len() < expected {
            return Err(format!(
                "frame is {} bytes; expected {expected} for {}x{}",
                rgba.len(),
                self.width,
                self.height
            ));
        }

        // RGBA (canvas) → BGRA (CoreVideo): swap the R and B channels.
        let mut bgra = vec![0u8; expected];
        for i in (0..expected).step_by(4) {
            bgra[i] = rgba[i + 2];
            bgra[i + 1] = rgba[i + 1];
            bgra[i + 2] = rgba[i];
            bgra[i + 3] = rgba[i + 3];
        }

        unsafe {
            let mut pixel_buffer: CVPixelBufferRef = std::ptr::null_mut();
            let status = CVPixelBufferCreateWithBytes(
                std::ptr::null(),
                self.width as usize,
                self.height as usize,
                K_CV_PIXEL_FORMAT_TYPE_32BGRA,
                bgra.as_mut_ptr() as *mut c_void,
                (self.width as usize) * 4,
                std::ptr::null(),
                std::ptr::null_mut(),
                std::ptr::null(),
                &mut pixel_buffer,
            );
            if status != 0 || pixel_buffer.is_null() {
                return Err(format!("CVPixelBufferCreateWithBytes failed ({status})"));
            }

            // Backpressure: wait until the encoder can accept another frame.
            let mut waited = 0u32;
            loop {
                let ready: bool = msg_send![&*self.input, isReadyForMoreMediaData];
                if ready {
                    break;
                }
                if waited > 5_000 {
                    CVPixelBufferRelease(pixel_buffer);
                    return Err("encoder stalled waiting for readiness".to_string());
                }
                std::thread::sleep(Duration::from_millis(2));
                waited += 2;
            }

            let appended: bool = msg_send![
                &*self.adaptor,
                appendPixelBuffer: pixel_buffer,
                withPresentationTime: cm_time(timestamp_micros)
            ];
            CVPixelBufferRelease(pixel_buffer);
            if !appended {
                return Err("appendPixelBuffer failed".to_string());
            }
        }
        Ok(())
    }

    pub fn finalize(mut self) -> Result<VtFinalizeResult, String> {
        self.started = false;
        unsafe {
            let () = msg_send![&*self.input, markAsFinished];
            // Synchronous finish so the file is complete when we read its size.
            let ok: bool = msg_send![&*self.writer, finishWriting];
            if !ok {
                return Err("AVAssetWriter failed to finish writing".to_string());
            }
        }
        let byte_length = std::fs::metadata(&self.path)
            .map(|m| m.len())
            .map_err(|e| format!("finished file is unreadable: {e}"))?;
        Ok(VtFinalizeResult {
            path: self.path.to_string_lossy().into_owned(),
            byte_length,
        })
    }

    pub fn cancel(mut self) {
        self.started = false;
        unsafe {
            let () = msg_send![&*self.writer, cancelWriting];
        }
        let _ = std::fs::remove_file(&self.path);
    }
}

/// Probe whether the native encoder is usable. VideoToolbox on Apple silicon
/// hardware-encodes both H.264 and HEVC; we report `power_efficient` true on
/// aarch64 (M-series) and leave the web probe to confirm at begin time.
pub fn probe(_width: u32, _height: u32, _fps: u32) -> VtProbeResult {
    let power_efficient = cfg!(target_arch = "aarch64");
    VtProbeResult {
        available: true,
        h264: true,
        h265: true,
        power_efficient,
    }
}

/// Small unique-ish id for the temp filename (avoids pulling in a uuid dep).
fn uid() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{nanos:x}")
}
