mod db;
mod commands;

use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

pub struct YoutubeProxyPort(pub u16);

fn start_youtube_proxy() -> u16 {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("youtube proxy bind failed");
    let port = listener.local_addr().unwrap().port();
    std::thread::Builder::new()
        .name("youtube-proxy".into())
        .spawn(move || {
            for stream in listener.incoming() {
                let Ok(stream) = stream else { continue };
                std::thread::spawn(move || handle_youtube_proxy(stream));
            }
        })
        .expect("youtube proxy thread failed");
    port
}

fn handle_youtube_proxy(mut stream: std::net::TcpStream) {
    let mut buf = vec![0u8; 2048];
    let n = stream.read(&mut buf).unwrap_or(0);
    let req = std::str::from_utf8(&buf[..n]).unwrap_or("");

    // "GET /?v=VIDEO_ID HTTP/1.1" 에서 video ID 파싱
    let raw_id = req
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|path| path.split('?').nth(1))
        .and_then(|query| query.split('&').find(|p| p.starts_with("v=")))
        .map(|p| p.trim_start_matches("v="))
        .unwrap_or("");

    // 안전한 문자만 허용 (YouTube ID = 11자, alphanumeric + - + _)
    let safe_id: String = raw_id
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .take(11)
        .collect();

    let html = format!(
        r#"<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{{margin:0;padding:0;box-sizing:border-box}}html,body{{width:100%;height:100%;background:#000}}</style></head><body><iframe src="https://www.youtube.com/embed/{safe_id}?rel=0&playsinline=1" width="100%" height="100%" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></body></html>"#
    );
    let resp = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        html.len(), html
    );
    let _ = stream.write_all(resp.as_bytes());
}

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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let yt_port = start_youtube_proxy();
            app.manage(YoutubeProxyPort(yt_port));

            // Safari UA로 창 생성 — asset:// 오리진을 YouTube가 거부하는 문제 우회
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("dida")
                .inner_size(1800.0, 1012.0)
                .min_inner_size(900.0, 506.0)
                .resizable(true)
                .decorations(false)
                .transparent(true)
                .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15")
                .build()?;

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
            commands::capture_screenshot_b64,
            commands::backup_export_to,
            commands::backup_import_from,
            commands::get_db_path,
            commands::pick_db_dir,
            commands::reset_db_path,
            commands::open_url,
            commands::get_youtube_proxy_port,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
