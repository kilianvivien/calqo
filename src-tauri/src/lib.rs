// The desktop shell is intentionally thin: the .calqo document is the source of
// truth and all rendering/export happens in the web frontend. The Rust side wires
// up the native macOS menu bar (so it has the standard App/Edit/Window submenus,
// predefined items, and a native About) and system-font discovery. Menu
// selections are emitted into the webview so React still owns command behavior.
mod mcp;

use std::collections::HashMap;
use tauri::{
    menu::{
        AboutMetadata, Menu, MenuBuilder, MenuItem, MenuItemKind, PredefinedMenuItem,
        SubmenuBuilder,
    },
    AppHandle, Emitter, Runtime,
};

/// Custom menu item ids that map 1:1 to the web `AppCommandId`s in
/// `src/app/commands/appCommands.ts`. Selecting one emits `calqo-menu` to the
/// webview, where the command router runs it. Predefined items (About, Services,
/// Hide, Quit, Minimize, Zoom, Full Screen) are handled natively and never appear
/// here. Keep this list in sync with the submenus built in `build_menu`.
const APP_COMMAND_IDS: &[&str] = &[
    "app.settings",
    "file.new",
    "file.open",
    "file.save",
    "file.saveAs",
    "file.saveAsStarter",
    "file.export",
    "file.share",
    "file.close",
    "edit.undo",
    "edit.redo",
    "edit.copy",
    "edit.paste",
    "edit.selectAll",
    "edit.duplicate",
    "edit.delete",
    "insert.text",
    "insert.list",
    "insert.image",
    "insert.imageFromClipboard",
    "insert.svg",
    "object.group",
    "object.ungroup",
    "object.forward",
    "object.backward",
    "object.front",
    "object.back",
    "view.zoomIn",
    "view.zoomOut",
    "view.fit",
    "view.toggleSnap",
    "view.theme",
    "ai.promptTemplate",
    "ai.translate",
    "window.shortcuts",
    "help.github",
    "help.diagnostics",
];

/// Pick the English or French label for the current menu language. The web i18n
/// store is the source of truth for the app language; it pushes the resolved
/// locale to Rust via `set_menu_locale`, which rebuilds the menu. Predefined items
/// default to the macOS/app-bundle language, so we pass explicit text variants to
/// keep the whole bar following the in-app locale.
fn tr(lang: &str, en: &'static str, fr: &'static str) -> &'static str {
    if lang == "fr" {
        fr
    } else {
        en
    }
}

fn about_metadata(lang: &str) -> AboutMetadata<'static> {
    AboutMetadata {
        name: Some("Calqo".into()),
        version: Some(env!("CARGO_PKG_VERSION").into()),
        short_version: Some(format!(
            "{}.{}",
            env!("CARGO_PKG_VERSION_MAJOR"),
            env!("CARGO_PKG_VERSION_MINOR")
        )),
        authors: Some(vec!["Calqo contributors".into()]),
        comments: Some(
            tr(
                lang,
                "A simple, glass-native social visual maker",
                "Un créateur de visuels sociaux, simple et tout en verre",
            )
            .into(),
        ),
        license: Some("MIT".into()),
        copyright: Some("MIT licence Kilian Vivien".into()),
        ..Default::default()
    }
}

fn item<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    label: &str,
    accelerator: Option<&str>,
) -> tauri::Result<MenuItem<R>> {
    MenuItem::with_id(app, id, label, true, accelerator)
}

fn build_menu<R: Runtime>(app: &AppHandle<R>, lang: &str) -> tauri::Result<Menu<R>> {
    let app_menu = SubmenuBuilder::new(app, "Calqo")
        .item(&PredefinedMenuItem::about(
            app,
            Some(tr(lang, "About Calqo", "À propos de Calqo")),
            Some(about_metadata(lang)),
        )?)
        .separator()
        .item(&item(
            app,
            "app.settings",
            tr(lang, "Settings…", "Réglages…"),
            Some("CmdOrCtrl+,"),
        )?)
        .separator()
        .services_with_text(tr(lang, "Services", "Services"))
        .separator()
        .hide_with_text(tr(lang, "Hide Calqo", "Masquer Calqo"))
        .hide_others_with_text(tr(lang, "Hide Others", "Masquer les autres"))
        .show_all_with_text(tr(lang, "Show All", "Tout afficher"))
        .separator()
        .quit_with_text(tr(lang, "Quit Calqo", "Quitter Calqo"))
        .build()?;

    let file_menu = SubmenuBuilder::new(app, tr(lang, "File", "Fichier"))
        .item(&item(
            app,
            "file.new",
            tr(lang, "New", "Nouveau"),
            Some("CmdOrCtrl+N"),
        )?)
        .item(&item(
            app,
            "file.open",
            tr(lang, "Open…", "Ouvrir…"),
            Some("CmdOrCtrl+O"),
        )?)
        .separator()
        .item(&item(
            app,
            "file.save",
            tr(lang, "Save", "Enregistrer"),
            Some("CmdOrCtrl+S"),
        )?)
        .item(&item(
            app,
            "file.saveAs",
            tr(lang, "Save As…", "Enregistrer sous…"),
            Some("CmdOrCtrl+Shift+S"),
        )?)
        .item(&item(
            app,
            "file.saveAsStarter",
            tr(lang, "Save as Model", "Enregistrer comme modèle"),
            None,
        )?)
        .separator()
        .item(&item(
            app,
            "file.export",
            tr(lang, "Export…", "Exporter…"),
            Some("CmdOrCtrl+E"),
        )?)
        .item(&item(
            app,
            "file.share",
            tr(lang, "Share", "Partager"),
            Some("CmdOrCtrl+Shift+E"),
        )?)
        .separator()
        .item(&item(
            app,
            "file.close",
            tr(lang, "Close", "Fermer"),
            Some("CmdOrCtrl+W"),
        )?)
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, tr(lang, "Edit", "Édition"))
        .item(&item(
            app,
            "edit.undo",
            tr(lang, "Undo", "Annuler"),
            Some("CmdOrCtrl+Z"),
        )?)
        .item(&item(
            app,
            "edit.redo",
            tr(lang, "Redo", "Rétablir"),
            Some("CmdOrCtrl+Shift+Z"),
        )?)
        .separator()
        // Calqo's copy/paste/select-all act on canvas layers, not OS text, so they
        // are custom items routed to the web command router (not predefined).
        .item(&item(
            app,
            "edit.copy",
            tr(lang, "Copy", "Copier"),
            Some("CmdOrCtrl+C"),
        )?)
        .item(&item(
            app,
            "edit.paste",
            tr(lang, "Paste", "Coller"),
            Some("CmdOrCtrl+V"),
        )?)
        .item(&item(
            app,
            "edit.selectAll",
            tr(lang, "Select All", "Tout sélectionner"),
            Some("CmdOrCtrl+A"),
        )?)
        .separator()
        .item(&item(
            app,
            "edit.duplicate",
            tr(lang, "Duplicate", "Dupliquer"),
            Some("CmdOrCtrl+D"),
        )?)
        .item(&item(
            app,
            "edit.delete",
            tr(lang, "Delete", "Supprimer"),
            Some("Delete"),
        )?)
        .build()?;

    let insert_menu = SubmenuBuilder::new(app, tr(lang, "Insert", "Insérer"))
        .item(&item(app, "insert.text", tr(lang, "Text", "Texte"), Some("T"))?)
        .item(&item(
            app,
            "insert.list",
            tr(lang, "List", "Liste"),
            Some("Shift+L"),
        )?)
        .item(&item(
            app,
            "insert.image",
            tr(lang, "Image", "Image"),
            Some("I"),
        )?)
        .item(&item(
            app,
            "insert.imageFromClipboard",
            tr(lang, "Image from Clipboard", "Image du presse-papiers"),
            None,
        )?)
        .item(&item(app, "insert.svg", tr(lang, "SVG", "SVG"), None)?)
        .build()?;

    let object_menu = SubmenuBuilder::new(app, tr(lang, "Object", "Objet"))
        .item(&item(
            app,
            "object.group",
            tr(lang, "Group", "Grouper"),
            Some("CmdOrCtrl+G"),
        )?)
        .item(&item(
            app,
            "object.ungroup",
            tr(lang, "Ungroup", "Dégrouper"),
            Some("CmdOrCtrl+Shift+G"),
        )?)
        .separator()
        .item(&item(
            app,
            "object.forward",
            tr(lang, "Bring Forward", "Avancer"),
            Some("]"),
        )?)
        .item(&item(
            app,
            "object.backward",
            tr(lang, "Send Backward", "Reculer"),
            Some("["),
        )?)
        .item(&item(
            app,
            "object.front",
            tr(lang, "Bring to Front", "Premier plan"),
            Some("CmdOrCtrl+]"),
        )?)
        .item(&item(
            app,
            "object.back",
            tr(lang, "Send to Back", "Arrière-plan"),
            Some("CmdOrCtrl+["),
        )?)
        .build()?;

    let view_menu = SubmenuBuilder::new(app, tr(lang, "View", "Affichage"))
        .item(&item(
            app,
            "view.zoomIn",
            tr(lang, "Zoom In", "Zoomer"),
            Some("CmdOrCtrl+="),
        )?)
        .item(&item(
            app,
            "view.zoomOut",
            tr(lang, "Zoom Out", "Dézoomer"),
            Some("CmdOrCtrl+-"),
        )?)
        .item(&item(
            app,
            "view.fit",
            tr(lang, "Fit to Screen", "Ajuster à l’écran"),
            Some("CmdOrCtrl+0"),
        )?)
        .separator()
        .item(&item(
            app,
            "view.toggleSnap",
            tr(lang, "Toggle Snap", "Basculer l’accrochage"),
            None,
        )?)
        .item(&item(
            app,
            "view.theme",
            tr(lang, "Toggle Theme", "Basculer le thème"),
            None,
        )?)
        .separator()
        .fullscreen_with_text(tr(
            lang,
            "Toggle Full Screen",
            "Activer/Désactiver le plein écran",
        ))
        .build()?;

    let ai_menu = SubmenuBuilder::new(app, tr(lang, "AI", "IA"))
        .item(&item(
            app,
            "ai.promptTemplate",
            tr(lang, "Prompt to Template…", "Prompt vers modèle…"),
            None,
        )?)
        .item(&item(
            app,
            "ai.translate",
            tr(lang, "Translate…", "Traduire…"),
            None,
        )?)
        .build()?;

    let window_menu = SubmenuBuilder::new(app, tr(lang, "Window", "Fenêtre"))
        .minimize_with_text(tr(lang, "Minimize", "Réduire"))
        .maximize_with_text(tr(lang, "Zoom", "Agrandir/Réduire"))
        .separator()
        .bring_all_to_front_with_text(tr(
            lang,
            "Bring All to Front",
            "Tout ramener au premier plan",
        ))
        .build()?;

    let help_menu = SubmenuBuilder::new(app, tr(lang, "Help", "Aide"))
        .item(&item(
            app,
            "help.github",
            tr(lang, "Calqo on GitHub", "Calqo sur GitHub"),
            None,
        )?)
        .item(&item(
            app,
            "window.shortcuts",
            tr(lang, "Keyboard Shortcuts", "Raccourcis clavier"),
            Some("?"),
        )?)
        .separator()
        .item(&item(
            app,
            "help.diagnostics",
            tr(lang, "Diagnostics", "Diagnostic"),
            None,
        )?)
        .build()?;

    MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&insert_menu)
        .item(&object_menu)
        .item(&view_menu)
        .item(&ai_menu)
        .item(&window_menu)
        .item(&help_menu)
        .build()
}

/// Rebuild the native menu in the given language. Called by the web i18n store
/// (the source of truth for the app language) whenever the resolved locale
/// changes. Rebuilding resets every item to enabled, so the web re-applies state
/// via `set_menu_enabled` afterwards.
#[tauri::command]
fn set_menu_locale(app: AppHandle, locale: String) -> tauri::Result<()> {
    let menu = build_menu(&app, &locale)?;
    app.set_menu(menu)?;
    Ok(())
}

/// Grey out / re-enable menu items by id. The web shell computes each command's
/// enabled state (project open, selection, history) and pushes the map here so the
/// native bar matches. Walks the top-level submenus since every custom item lives
/// one level deep.
#[tauri::command]
fn set_menu_enabled(app: AppHandle, states: HashMap<String, bool>) -> tauri::Result<()> {
    let Some(menu) = app.menu() else {
        return Ok(());
    };
    for kind in menu.items()? {
        if let MenuItemKind::Submenu(submenu) = kind {
            for child in submenu.items()? {
                if let MenuItemKind::MenuItem(menu_item) = child {
                    if let Some(&enabled) = states.get(menu_item.id().as_ref()) {
                        menu_item.set_enabled(enabled)?;
                    }
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn list_system_fonts() -> Result<Vec<String>, String> {
    font_kit::source::SystemSource::new()
        .all_families()
        .map_err(|err| format!("font enumeration failed: {err}"))
}

/// One installed face for a given family. Weight is the OS-resolved CSS weight
/// (100…900) and italic is `true` for any slanted face (italic or oblique).
/// Used by the inspector to show only the weight toggles the current font
/// actually has installed.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct FontVariant {
    weight: u16,
    italic: bool,
}

/// Enumerate the available faces of an installed font family. The OS reports
/// each `(weight, italic)` pair exactly once, so the UI can decide which
/// named-weight toggles to expose. Returns an empty list (not an error) when
/// the family isn't installed or the platform can't introspect it, so the
/// caller can fall back to the schema's defaults.
#[tauri::command]
fn list_font_variants(family: String) -> Result<Vec<FontVariant>, String> {
    use std::collections::BTreeSet;
    let source = font_kit::source::SystemSource::new();
    let Ok(handle) = source.select_family_by_name(&family) else {
        return Ok(Vec::new());
    };
    let mut seen: BTreeSet<(u16, bool)> = BTreeSet::new();
    for font_handle in handle.fonts() {
        let Ok(font) = font_handle.load() else { continue };
        let props = font.properties();
        // CoreText reports weights on a piecewise scale (e.g. Thin ≈ 268,
        // Light = 300, Regular = 400, …). Snap to the nearest CSS bucket.
        let weight = (((props.weight.0 + 50.0) / 100.0).floor() * 100.0) as u16;
        let weight = weight.clamp(100, 900);
        let italic = !matches!(props.style, font_kit::properties::Style::Normal);
        seen.insert((weight, italic));
    }
    Ok(seen
        .into_iter()
        .map(|(weight, italic)| FontVariant { weight, italic })
        .collect())
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
        .invoke_handler(tauri::generate_handler![
            list_system_fonts,
            list_font_variants,
            set_menu_locale,
            set_menu_enabled,
            mcp::mcp_start_server,
            mcp::mcp_stop_server,
            mcp::mcp_server_status,
            mcp::mcp_bridge_respond,
            mcp::setup::mcp_setup_client
        ])
        .setup(|app| {
            // Default to English; the web shell pushes the resolved locale via
            // `set_menu_locale` as soon as it mounts.
            let menu = build_menu(app.handle(), "en")?;
            app.set_menu(menu)?;
            mcp::init(app.handle());
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if APP_COMMAND_IDS.contains(&id) {
                let _ = app.emit_to("main", "calqo-menu", id);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Calqo");
}
