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

use objc2::rc::{Allocated, Retained};
use objc2::runtime::AnyObject;
use objc2::{class, msg_send, Encode, Encoding, RefEncode};
use objc2_foundation::{NSError, NSNumber, NSString, NSURL};

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

// `CVPixelBufferRef` is an opaque CoreFoundation type; to Objective-C it is just
// a pointer. Without this, `*mut __CVBuffer` cannot be passed to `msg_send!`.
unsafe impl RefEncode for __CVBuffer {
    const ENCODING_REF: Encoding = Encoding::Pointer(&Encoding::Void);
}

/// `kCVPixelFormatType_32BGRA` (FourCC 'BGRA').
const K_CV_PIXEL_FORMAT_TYPE_32BGRA: u32 = 0x4247_5241;

/// Opaque `CVPixelBufferPoolRef` (owned by the writer's adaptor).
type CVPixelBufferPoolRef = *mut c_void;

#[link(name = "CoreVideo", kind = "framework")]
extern "C" {
    fn CVPixelBufferCreate(
        allocator: *const c_void,
        width: usize,
        height: usize,
        pixel_format_type: u32,
        pixel_buffer_attributes: *const c_void,
        pixel_buffer_out: *mut CVPixelBufferRef,
    ) -> i32;
    fn CVPixelBufferPoolCreatePixelBuffer(
        allocator: *const c_void,
        pool: CVPixelBufferPoolRef,
        pixel_buffer_out: *mut CVPixelBufferRef,
    ) -> i32;
    fn CVPixelBufferLockBaseAddress(buffer: CVPixelBufferRef, flags: u64) -> i32;
    fn CVPixelBufferUnlockBaseAddress(buffer: CVPixelBufferRef, flags: u64) -> i32;
    fn CVPixelBufferGetBaseAddress(buffer: CVPixelBufferRef) -> *mut c_void;
    fn CVPixelBufferGetBytesPerRow(buffer: CVPixelBufferRef) -> usize;
    fn CVPixelBufferRelease(buffer: CVPixelBufferRef);

    static kCVPixelBufferPixelFormatTypeKey: *const NSString;
    static kCVPixelBufferWidthKey: *const NSString;
    static kCVPixelBufferHeightKey: *const NSString;
}

// --- AVFoundation string constants (extern statics) -----------------------

#[link(name = "AVFoundation", kind = "framework")]
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
    started: bool,
}

// SAFETY: `Retained<AnyObject>` is `!Send` because Objective-C objects may have
// thread affinity, but `AVAssetWriter`, its input, and the pixel-buffer adaptor
// are not UI objects: Apple documents them as usable from any thread provided
// calls are serialized. Every access goes through `VideoState`'s `Mutex`, which
// provides exactly that serialization, and Objective-C retain/release is atomic,
// so dropping on a different thread than we created on is also sound. This impl
// is what lets `VideoState` satisfy Tauri's `State<T>: Send + Sync` bound.
unsafe impl Send for AvEncoder {}

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

            // Writer. The receiver must be `Allocated` so `objc2` applies init
            // memory-management semantics; `error: _` turns the `NSError**`
            // out-param into a `Result`.
            let alloc: Allocated<AnyObject> = msg_send![class!(AVAssetWriter), alloc];
            let writer: Retained<AnyObject> = msg_send![
                alloc,
                initWithURL: &*url,
                fileType: AVFileTypeMPEG4,
                error: _
            ]
            .map_err(|e: Retained<NSError>| {
                format!("failed to create AVAssetWriter: {}", e.localizedDescription())
            })?;

            // Writer input.
            let input: Retained<AnyObject> = msg_send![
                class!(AVAssetWriterInput),
                assetWriterInputWithMediaType: AVMediaTypeVideo,
                outputSettings: &*settings
            ];
            let () = msg_send![&*input, setExpectsMediaDataInRealTime: false];

            // Pixel-buffer adaptor (source pixels are BGRA).
            // Width/height must be present for the adaptor to vend a pixel-buffer
            // pool; without a pool every frame would allocate a fresh IOSurface.
            let px_attrs: Retained<AnyObject> = {
                let dict: Retained<AnyObject> = msg_send![class!(NSMutableDictionary), dictionary];
                let fmt = NSNumber::new_u32(K_CV_PIXEL_FORMAT_TYPE_32BGRA);
                let () = msg_send![&*dict, setObject: &*fmt, forKey: kCVPixelBufferPixelFormatTypeKey];
                let w = NSNumber::new_u32(width);
                let h = NSNumber::new_u32(height);
                let () = msg_send![&*dict, setObject: &*w, forKey: kCVPixelBufferWidthKey];
                let () = msg_send![&*dict, setObject: &*h, forKey: kCVPixelBufferHeightKey];
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

        unsafe {
            // Backpressure first: wait to be asked for data before taking a buffer
            // out of the pool, so a stall doesn't drain it.
            let mut waited = 0u32;
            loop {
                let ready: bool = msg_send![&*self.input, isReadyForMoreMediaData];
                if ready {
                    break;
                }
                if waited > 5_000 {
                    return Err("encoder stalled waiting for readiness".to_string());
                }
                std::thread::sleep(Duration::from_millis(2));
                waited += 2;
            }

            // The pixel data must live in CoreVideo-owned memory. Wrapping a Rust
            // buffer with `CVPixelBufferCreateWithBytes` is a use-after-free: the
            // encoder reads asynchronously, well after `appendPixelBuffer` returns
            // and after the Rust allocation is gone. That corrupted the frames at
            // the start of an export, where the pipeline is empty and many frames
            // are in flight at once.
            let mut pixel_buffer: CVPixelBufferRef = std::ptr::null_mut();
            let pool: CVPixelBufferPoolRef = msg_send![&*self.adaptor, pixelBufferPool];
            let status = if pool.is_null() {
                CVPixelBufferCreate(
                    std::ptr::null(),
                    self.width as usize,
                    self.height as usize,
                    K_CV_PIXEL_FORMAT_TYPE_32BGRA,
                    std::ptr::null(),
                    &mut pixel_buffer,
                )
            } else {
                CVPixelBufferPoolCreatePixelBuffer(std::ptr::null(), pool, &mut pixel_buffer)
            };
            if status != 0 || pixel_buffer.is_null() {
                return Err(format!("could not obtain a CVPixelBuffer ({status})"));
            }

            let lock = CVPixelBufferLockBaseAddress(pixel_buffer, 0);
            if lock != 0 {
                CVPixelBufferRelease(pixel_buffer);
                return Err(format!("CVPixelBufferLockBaseAddress failed ({lock})"));
            }
            let base = CVPixelBufferGetBaseAddress(pixel_buffer) as *mut u8;
            // Rows are padded for alignment, so the destination stride is usually
            // wider than `width * 4`; copying as one block would shear the image.
            let dst_stride = CVPixelBufferGetBytesPerRow(pixel_buffer);
            let src_stride = (self.width as usize) * 4;
            if base.is_null() || dst_stride < src_stride {
                CVPixelBufferUnlockBaseAddress(pixel_buffer, 0);
                CVPixelBufferRelease(pixel_buffer);
                return Err("CVPixelBuffer has no usable base address".to_string());
            }

            // RGBA (canvas) → BGRA (CoreVideo), written straight into the pixel
            // buffer a row at a time. Chunked iteration keeps the per-pixel swap
            // bounds-check-free over what is several megabytes per frame.
            for row in 0..(self.height as usize) {
                let src = &rgba[row * src_stride..row * src_stride + src_stride];
                let dst = base.add(row * dst_stride);
                for (i, px) in src.chunks_exact(4).enumerate() {
                    let d = dst.add(i * 4);
                    *d = px[2];
                    *d.add(1) = px[1];
                    *d.add(2) = px[0];
                    *d.add(3) = px[3];
                }
            }
            CVPixelBufferUnlockBaseAddress(pixel_buffer, 0);

            let appended: bool = msg_send![
                &*self.adaptor,
                appendPixelBuffer: pixel_buffer,
                withPresentationTime: cm_time(timestamp_micros)
            ];
            // `appendPixelBuffer` retains the buffer for as long as it needs it, so
            // dropping our own reference here is safe.
            CVPixelBufferRelease(pixel_buffer);
            if !appended {
                let error: Option<Retained<NSError>> = msg_send![&*self.writer, error];
                return Err(match error {
                    Some(e) => format!("appendPixelBuffer failed: {}", e.localizedDescription()),
                    None => "appendPixelBuffer failed".to_string(),
                });
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
                let error: Option<Retained<NSError>> = msg_send![&*self.writer, error];
                return Err(match error {
                    Some(e) => format!(
                        "AVAssetWriter failed to finish writing: {}",
                        e.localizedDescription()
                    ),
                    None => "AVAssetWriter failed to finish writing".to_string(),
                });
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
