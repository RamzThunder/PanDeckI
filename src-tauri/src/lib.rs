mod db;
mod commands;

use std::path::PathBuf;
use tauri::Manager;

fn resolve_db_path(app: &tauri::App) -> PathBuf {
    let app_data = app.path().app_data_dir().expect("no app data dir");
    std::fs::create_dir_all(&app_data).ok();

    // 커스텀 경로가 config 파일에 저장돼 있으면 우선 사용
    let config_path = app_data.join("db_path.txt");
    if let Ok(raw) = std::fs::read_to_string(&config_path) {
        let p = PathBuf::from(raw.trim());
        if p.parent().map(|d| d.exists()).unwrap_or(false) {
            return p;
        }
    }

    // 기본값: iCloud → App Support 폴백
    let icloud_dir = dirs::home_dir()
        .expect("no home dir")
        .join("Library/Mobile Documents/com~apple~CloudDocs/on_diary_data");
    let db_dir = if std::fs::create_dir_all(&icloud_dir).is_ok() {
        icloud_dir
    } else {
        app_data
    };
    db_dir.join("diary.db")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let db_path = resolve_db_path(app);
            db::setup_database(&db_path)?;
            app.manage(db::DbPathState(std::sync::Mutex::new(db_path.clone())));
            app.manage(db::DbState::new(db_path));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_entry,
            commands::save_entry,
            commands::list_month_entries,
            commands::list_month_bgs,
            commands::get_monthly,
            commands::save_monthly,
            commands::get_setting,
            commands::set_setting,
            commands::pick_image,
            commands::pick_video,
            commands::read_file_b64,
            commands::get_sticker_dir,
            commands::list_sticker_packs,
            commands::pick_sticker_dir,
            commands::list_system_fonts,
            commands::resize_window,
            commands::window_start_dragging,
            commands::window_close,
            commands::window_minimize,
            commands::window_toggle_maximize,
            commands::fetch_text,
            commands::fetch_image_b64,
            commands::save_png,
            commands::capture_screenshot_to,
            commands::backup_export_to,
            commands::backup_import_from,
            commands::get_db_path,
            commands::pick_db_dir,
            commands::reset_db_path,
            commands::open_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
