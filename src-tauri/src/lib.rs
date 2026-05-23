mod db;
mod commands;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // iCloud Drive에 저장해서 다른 기기와 동기화
            let icloud_dir = dirs::home_dir()
                .expect("no home dir")
                .join("Library/Mobile Documents/com~apple~CloudDocs/on_diary_data");
            let db_dir = if std::fs::create_dir_all(&icloud_dir).is_ok() {
                icloud_dir
            } else {
                // iCloud 사용 불가 시 App Support로 폴백
                let fallback = app.path().app_data_dir()?;
                std::fs::create_dir_all(&fallback)?;
                fallback
            };
            let db_path = db_dir.join("diary.db");
            db::setup_database(&db_path)?;
            app.manage(db::DbState::new(db_path));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_entry,
            commands::save_entry,
            commands::list_month_entries,
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
            commands::open_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
