use std::{collections::BTreeSet, fs, path::Path};

#[tauri::command]
fn list_system_fonts() -> Vec<String> {
    let mut names = BTreeSet::new();
    for dir in font_dirs() {
        collect_font_names(Path::new(dir), &mut names);
    }
    names.into_iter().collect()
}

fn font_dirs() -> &'static [&'static str] {
    #[cfg(target_os = "macos")]
    {
        &[
            "/System/Library/Fonts",
            "/Library/Fonts",
            "/System/Library/Fonts/Supplemental",
        ]
    }
    #[cfg(target_os = "windows")]
    {
        &["C:\\Windows\\Fonts"]
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        &["/usr/share/fonts", "/usr/local/share/fonts"]
    }
}

fn collect_font_names(dir: &Path, names: &mut BTreeSet<String>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_font_names(&path, names);
            continue;
        }
        let Some(ext) = path.extension().and_then(|value| value.to_str()) else {
            continue;
        };
        if !matches!(ext.to_ascii_lowercase().as_str(), "ttf" | "otf" | "ttc") {
            continue;
        }
        if let Some(name) = path.file_stem().and_then(|value| value.to_str()) {
            let cleaned = name
                .replace(['-', '_'], " ")
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ");
            if !cleaned.is_empty() {
                names.insert(cleaned);
            }
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_stronghold::Builder::new(|password| {
                let mut key = vec![0_u8; 32];
                for (index, byte) in password.as_bytes().iter().enumerate() {
                    let first = index % key.len();
                    let second = (index * 7) % key.len();
                    key[first] ^= byte;
                    key[second] = key[second].wrapping_add(*byte);
                }
                key
            })
            .build(),
        )
        .invoke_handler(tauri::generate_handler![list_system_fonts])
        .run(tauri::generate_context!())
        .expect("error while running Calqo");
}
