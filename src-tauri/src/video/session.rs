//! Encode-session wrapper. The real backend is the macOS AVFoundation encoder,
//! compiled only for `#[cfg(all(target_os = "macos", feature = "video-toolbox"))]`.
//! Every other build gets the fallbacks here, which never construct a session
//! (`begin` errors) so the web side falls back to WebCodecs.

use super::{VtFinalizeResult, VtProbeResult};

#[cfg(all(target_os = "macos", feature = "video-toolbox"))]
use super::avfoundation;

/// One in-flight native encode. On a native build this owns the AVFoundation
/// encoder; otherwise it is an empty shell that is never created.
pub struct Session {
    #[cfg(all(target_os = "macos", feature = "video-toolbox"))]
    inner: avfoundation::AvEncoder,
}

impl Session {
    #[cfg(all(target_os = "macos", feature = "video-toolbox"))]
    pub fn begin(
        codec: &str,
        width: u32,
        height: u32,
        fps: u32,
        bitrate: Option<u32>,
    ) -> Result<Session, String> {
        Ok(Session {
            inner: avfoundation::AvEncoder::begin(codec, width, height, fps, bitrate)?,
        })
    }

    #[cfg(not(all(target_os = "macos", feature = "video-toolbox")))]
    pub fn begin(
        _codec: &str,
        _width: u32,
        _height: u32,
        _fps: u32,
        _bitrate: Option<u32>,
    ) -> Result<Session, String> {
        Err("native video export is not available in this build".to_string())
    }

    #[cfg(all(target_os = "macos", feature = "video-toolbox"))]
    pub fn add_frame(
        &mut self,
        timestamp_micros: i64,
        duration_micros: i64,
        rgba: &[u8],
    ) -> Result<(), String> {
        self.inner.add_frame(timestamp_micros, duration_micros, rgba)
    }

    #[cfg(not(all(target_os = "macos", feature = "video-toolbox")))]
    pub fn add_frame(
        &mut self,
        _timestamp_micros: i64,
        _duration_micros: i64,
        _rgba: &[u8],
    ) -> Result<(), String> {
        Err("native video export is not available in this build".to_string())
    }

    #[cfg(all(target_os = "macos", feature = "video-toolbox"))]
    pub fn finalize(self) -> Result<VtFinalizeResult, String> {
        self.inner.finalize()
    }

    #[cfg(not(all(target_os = "macos", feature = "video-toolbox")))]
    pub fn finalize(self) -> Result<VtFinalizeResult, String> {
        Err("native video export is not available in this build".to_string())
    }

    #[cfg(all(target_os = "macos", feature = "video-toolbox"))]
    pub fn cancel(self) {
        self.inner.cancel();
    }

    #[cfg(not(all(target_os = "macos", feature = "video-toolbox")))]
    pub fn cancel(self) {}
}

/// Probe the native encoder. Reports unavailable on any build without the
/// macOS AVFoundation backend.
pub fn probe(width: u32, height: u32, fps: u32) -> VtProbeResult {
    #[cfg(all(target_os = "macos", feature = "video-toolbox"))]
    {
        return avfoundation::probe(width, height, fps);
    }
    #[cfg(not(all(target_os = "macos", feature = "video-toolbox")))]
    {
        let _ = (width, height, fps);
        VtProbeResult::default()
    }
}
