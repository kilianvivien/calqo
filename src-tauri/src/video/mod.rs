//! Native VideoToolbox video export (plan §7 / AN-4.4).
//!
//! The web layer's `tauriVideoToolboxAdapter` speaks the `vt_*` commands below.
//! On macOS with the `video-toolbox` feature enabled they drive an AVFoundation
//! `AVAssetWriter` (which sits on VideoToolbox — the M-series hardware encoder),
//! streaming an MP4 to a temp file that the web side then moves to the user's
//! chosen destination. On every other build the commands compile but report the
//! encoder unavailable, so the web layer falls back to WebCodecs.
//!
//! Frame pixels arrive as raw RGBA bytes (`Vec<u8>`, transferred from a JS
//! `ArrayBuffer` — never JSON), one `vt_add_frame` call per frame. Each call
//! returns only once the encoder is ready for the next frame, so the awaiting
//! webview naturally backpressures instead of queueing ~8 MB frames.

mod session;

#[cfg(all(target_os = "macos", feature = "video-toolbox"))]
mod avfoundation;

use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

/// Result of `vt_probe`: which codecs the native encoder can produce here.
#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VtProbeResult {
    pub available: bool,
    pub h264: bool,
    pub h265: bool,
    pub power_efficient: bool,
}

/// Result of `vt_finalize`: the finished temp file the web side reads/moves.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VtFinalizeResult {
    pub path: String,
    pub byte_length: u64,
}

/// Live encode sessions, keyed by the id the web side mints per export.
#[derive(Default)]
pub struct VideoState {
    sessions: Mutex<HashMap<String, session::Session>>,
}

#[tauri::command]
pub fn vt_probe(width: u32, height: u32, fps: u32) -> VtProbeResult {
    session::probe(width, height, fps)
}

#[tauri::command]
pub fn vt_begin(
    state: State<'_, VideoState>,
    session_id: String,
    codec: String,
    width: u32,
    height: u32,
    fps: u32,
    bitrate: Option<u32>,
) -> Result<(), String> {
    let session = session::Session::begin(&codec, width, height, fps, bitrate)?;
    let mut sessions = state.sessions.lock().map_err(|_| "session lock poisoned")?;
    sessions.insert(session_id, session);
    Ok(())
}

#[tauri::command]
pub fn vt_add_frame(
    state: State<'_, VideoState>,
    session_id: String,
    timestamp_micros: i64,
    duration_micros: i64,
    rgba: Vec<u8>,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|_| "session lock poisoned")?;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| format!("unknown export session \"{session_id}\""))?;
    session.add_frame(timestamp_micros, duration_micros, &rgba)
}

#[tauri::command]
pub fn vt_finalize(
    state: State<'_, VideoState>,
    session_id: String,
) -> Result<VtFinalizeResult, String> {
    let session = {
        let mut sessions = state.sessions.lock().map_err(|_| "session lock poisoned")?;
        sessions
            .remove(&session_id)
            .ok_or_else(|| format!("unknown export session \"{session_id}\""))?
    };
    session.finalize()
}

#[tauri::command]
pub fn vt_cancel(state: State<'_, VideoState>, session_id: String) -> Result<(), String> {
    let session = {
        let mut sessions = state.sessions.lock().map_err(|_| "session lock poisoned")?;
        sessions.remove(&session_id)
    };
    if let Some(session) = session {
        session.cancel();
    }
    Ok(())
}
