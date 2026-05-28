use crate::db::{DbPathState, DbState};
use crate::YoutubeProxyPort;
use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{command, AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

// ── Entries ──────────────────────────────────────────────────────────────────

#[command]
pub fn get_entry(state: State<DbState>, date: String) -> Result<Option<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT content FROM entries WHERE date = ?1")
        .map_err(|e| e.to_string())?;
    let result: Option<String> = stmt
        .query_row([&date], |row| row.get(0))
        .ok();
    Ok(result)
}

#[command]
pub fn save_entry(state: State<DbState>, date: String, content: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO entries (date, content, updated_at)
         VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(date) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at",
        [&date, &content],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub fn list_month_entries(state: State<DbState>, year_month: String) -> Result<Vec<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let pattern = format!("{}%", year_month);
    let mut stmt = conn
        .prepare("SELECT date FROM entries WHERE date LIKE ?1 ORDER BY date")
        .map_err(|e| e.to_string())?;
    let dates = stmt
        .query_map([&pattern], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(dates)
}

#[derive(Serialize)]
pub struct DayBgInfo {
    pub date: String,
    pub bg: Option<String>,
    pub bg_image: Option<String>,
}

#[command]
pub fn list_month_bgs(state: State<DbState>, year_month: String) -> Result<Vec<DayBgInfo>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let pattern = format!("{}%", year_month);
    let mut stmt = conn
        .prepare(
            "SELECT date,
                    json_extract(content, '$.bg'),
                    json_extract(content, '$.bgImage')
             FROM entries WHERE date LIKE ?1 ORDER BY date",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([&pattern], |row| {
            Ok(DayBgInfo {
                date: row.get(0)?,
                bg: row.get(1)?,
                bg_image: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

// ── Monthly Data ──────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct MonthlyData {
    pub goals: Vec<String>,
    pub bucket_list: Vec<String>,
    pub events: Vec<serde_json::Value>,
    pub profile: serde_json::Value,
}

#[command]
pub fn get_monthly(state: State<DbState>, year_month: String) -> Result<MonthlyData, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let result = conn.query_row(
        "SELECT goals, bucket_list, events, profile FROM monthly_data WHERE year_month = ?1",
        [&year_month],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        },
    );
    match result {
        Ok((goals, bucket_list, events, profile)) => Ok(MonthlyData {
            goals: serde_json::from_str(&goals).unwrap_or_default(),
            bucket_list: serde_json::from_str(&bucket_list).unwrap_or_default(),
            events: serde_json::from_str(&events).unwrap_or_default(),
            profile: serde_json::from_str(&profile).unwrap_or(serde_json::Value::Object(Default::default())),
        }),
        Err(_) => Ok(MonthlyData {
            goals: vec![],
            bucket_list: vec![],
            events: vec![],
            profile: serde_json::Value::Object(Default::default()),
        }),
    }
}

#[command]
pub fn save_monthly(state: State<DbState>, year_month: String, data: MonthlyData) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO monthly_data (year_month, goals, bucket_list, events, profile)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(year_month) DO UPDATE SET
           goals = excluded.goals,
           bucket_list = excluded.bucket_list,
           events = excluded.events,
           profile = excluded.profile",
        [
            &year_month,
            &serde_json::to_string(&data.goals).unwrap_or_default(),
            &serde_json::to_string(&data.bucket_list).unwrap_or_default(),
            &serde_json::to_string(&data.events).unwrap_or_default(),
            &serde_json::to_string(&data.profile).unwrap_or_default(),
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Settings ──────────────────────────────────────────────────────────────────

#[command]
pub fn get_setting(state: State<DbState>, key: String) -> Result<Option<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let result: Option<String> = conn
        .query_row("SELECT value FROM settings WHERE key = ?1", [&key], |row| row.get(0))
        .ok();
    Ok(result)
}

#[command]
pub fn get_settings_batch(state: State<DbState>, keys: Vec<String>) -> Result<std::collections::HashMap<String, String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut map = std::collections::HashMap::new();
    for key in &keys {
        if let Ok(val) = conn.query_row(
            "SELECT value FROM settings WHERE key = ?1", [key.as_str()], |row| row.get::<_, String>(0)
        ) {
            map.insert(key.clone(), val);
        }
    }
    Ok(map)
}

#[command]
pub fn set_setting(state: State<DbState>, key: String, value: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [&key, &value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── File picker ───────────────────────────────────────────────────────────────

#[command]
pub async fn pick_image(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let result = app
        .dialog()
        .file()
        .add_filter("Images", &["jpg", "jpeg", "png", "gif", "webp"])
        .blocking_pick_file();

    match result {
        Some(path) => {
            let path_str = path.to_string();
            let data = fs::read(&path_str).map_err(|e| e.to_string())?;
            let ext = std::path::Path::new(&path_str)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("jpg")
                .to_lowercase();
            let mime = match ext.as_str() {
                "png" => "image/png",
                "gif" => "image/gif",
                "webp" => "image/webp",
                _ => "image/jpeg",
            };
            let b64 = general_purpose::STANDARD.encode(&data);
            Ok(Some(format!("data:{};base64,{}", mime, b64)))
        }
        None => Ok(None),
    }
}

#[command]
pub async fn pick_video(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let result = app
        .dialog()
        .file()
        .add_filter("Videos", &["mp4", "mov", "m4v", "webm", "avi", "mkv"])
        .blocking_pick_file();

    match result {
        Some(path) => Ok(Some(path.to_string())),
        None => Ok(None),
    }
}

// ── Read file as base64 data URL ──────────────────────────────────────────────

#[command]
pub fn read_file_b64(path: String) -> Result<String, String> {
    let data = fs::read(&path).map_err(|e| e.to_string())?;
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "image/png",
    };
    let b64 = general_purpose::STANDARD.encode(&data);
    Ok(format!("data:{};base64,{}", mime, b64))
}

// ── Sticker packs ─────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct StickerPack {
    pub name: String,
    pub files: Vec<String>, // absolute paths
}

fn find_sticker_dir_dev() -> Option<PathBuf> {
    // Check current working directory first (Tauri dev sets cwd = project root,
    // even when CARGO_TARGET_DIR is set outside the project tree)
    if let Ok(cwd) = std::env::current_dir() {
        let candidate = cwd.join("sticker");
        if candidate.exists() && candidate.is_dir() {
            return Some(candidate);
        }
    }
    // Walk up from the executable as a fallback
    let exe = std::env::current_exe().ok()?;
    let mut dir = exe.parent()?;
    for _ in 0..6 {
        let candidate = dir.join("sticker");
        if candidate.exists() && candidate.is_dir() {
            return Some(candidate);
        }
        dir = dir.parent()?;
    }
    None
}

#[command]
pub fn get_sticker_dir(state: State<DbState>, app: tauri::AppHandle) -> String {
    // Check saved setting first
    if let Ok(conn) = state.0.lock() {
        let saved: Option<String> = conn
            .query_row("SELECT value FROM settings WHERE key = 'sticker_dir'", [], |r| r.get(0))
            .ok();
        if let Some(dir) = saved {
            if std::path::Path::new(&dir).exists() {
                return dir;
            }
        }
    }
    // Dev: look for project sticker folder
    if cfg!(debug_assertions) {
        if let Some(dev_dir) = find_sticker_dir_dev() {
            return dev_dir.to_string_lossy().to_string();
        }
    }
    // Production default
    app.path()
        .app_data_dir()
        .map(|p| p.join("stickers").to_string_lossy().to_string())
        .unwrap_or_default()
}

#[command]
pub fn list_sticker_packs(state: State<DbState>, app: tauri::AppHandle) -> Vec<StickerPack> {
    let sticker_dir = get_sticker_dir(state, app);
    let base = std::path::Path::new(&sticker_dir);
    if !base.exists() {
        return vec![];
    }
    let mut packs: Vec<StickerPack> = vec![];
    if let Ok(entries) = fs::read_dir(base) {
        let mut dirs: Vec<_> = entries
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_dir())
            .collect();
        dirs.sort_by_key(|e| e.file_name());
        for entry in dirs {
            let pack_name = entry.file_name().to_string_lossy().to_string();
            let mut files: Vec<String> = vec![];
            if let Ok(imgs) = fs::read_dir(entry.path()) {
                let mut img_list: Vec<_> = imgs
                    .filter_map(|e| e.ok())
                    .filter(|e| {
                        let p = e.path();
                        matches!(
                            p.extension().and_then(|x| x.to_str()).map(|x| x.to_lowercase()).as_deref(),
                            Some("png" | "jpg" | "jpeg" | "gif" | "webp")
                        )
                    })
                    .collect();
                img_list.sort_by_key(|e| e.file_name());
                files = img_list
                    .into_iter()
                    .map(|e| e.path().to_string_lossy().replace('\\', "/"))
                    .collect();
            }
            packs.push(StickerPack { name: pack_name, files });
        }
    }
    packs
}

#[command]
pub async fn pick_sticker_dir(app: tauri::AppHandle, state: State<'_, DbState>) -> Result<Option<String>, String> {
    let result = app.dialog().file().blocking_pick_folder();
    if let Some(path) = result {
        let path_str = path.to_string().replace('\\', "/");
        if let Ok(conn) = state.0.lock() {
            let _ = conn.execute(
                "INSERT INTO settings (key, value) VALUES ('sticker_dir', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [&path_str],
            );
        }
        return Ok(Some(path_str));
    }
    Ok(None)
}

// ── System fonts ──────────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
fn list_fonts_impl() -> Vec<String> {
    let script = r#"
from AppKit import NSFontManager
import json
fm = NSFontManager.sharedFontManager()
print(json.dumps(sorted(fm.availableFontFamilies())))
"#;
    let output = std::process::Command::new("python3")
        .args(["-c", script])
        .output()
        .ok();
    if let Some(out) = output {
        if out.status.success() {
            if let Ok(s) = String::from_utf8(out.stdout) {
                if let Ok(fonts) = serde_json::from_str::<Vec<String>>(s.trim()) {
                    if !fonts.is_empty() { return fonts; }
                }
            }
        }
    }
    let mut fonts = std::collections::BTreeSet::new();
    let home = std::env::var("HOME").unwrap_or_default();
    for dir in [
        "/System/Library/Fonts".to_string(),
        "/Library/Fonts".to_string(),
        format!("{}/Library/Fonts", home),
    ] {
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                if ["ttf", "otf"].contains(&ext.as_str()) {
                    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                        fonts.insert(stem.split('-').next().unwrap_or(stem).to_string());
                    }
                }
            }
        }
    }
    fonts.into_iter().collect()
}

#[cfg(target_os = "windows")]
fn run_ps(script: &str) -> Option<Vec<String>> {
    let out = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script])
        .output().ok()?;
    if !out.status.success() { return None; }
    let s = String::from_utf8_lossy(&out.stdout).to_string();
    let s = s.trim();
    if let Ok(v) = serde_json::from_str::<Vec<String>>(s) {
        if !v.is_empty() { return Some(v); }
    }
    // ConvertTo-Json이 단일 항목일 때 배열 대신 문자열 반환하는 경우 대응
    if let Ok(v) = serde_json::from_str::<String>(s) {
        if !v.is_empty() { return Some(vec![v]); }
    }
    None
}

#[cfg(target_os = "windows")]
fn list_fonts_impl() -> Vec<String> {
    // 1순위: DirectWrite(PresentationCore) — 한글 포함 전체 시스템 폰트
    let dw = r#"[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Add-Type -AssemblyName PresentationCore; [System.Windows.Media.Fonts]::SystemFontFamilies | ForEach-Object { $_.Source } | Sort-Object -Unique | ConvertTo-Json -Compress"#;
    if let Some(fonts) = run_ps(dw) { return fonts; }

    // 2순위: GDI InstalledFontCollection (UTF-8 강제)
    let gdi = r#"[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.Drawing; [System.Drawing.Text.InstalledFontCollection]::new().Families | ForEach-Object { $_.Name } | Sort-Object | ConvertTo-Json -Compress"#;
    if let Some(fonts) = run_ps(gdi) { return fonts; }

    vec![]
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn list_fonts_impl() -> Vec<String> { vec![] }

#[command]
pub fn list_system_fonts() -> Vec<String> {
    list_fonts_impl()
}

#[cfg(target_os = "macos")]
fn font_data_url_impl(font_name: &str) -> Result<Option<String>, String> {
    let script = r#"
import json
import sys
from AppKit import NSFontManager
from CoreText import CTFontCreateWithName, CTFontCopyAttribute, kCTFontURLAttribute

family = sys.argv[1]
fm = NSFontManager.sharedFontManager()
members = fm.availableMembersOfFontFamily_(family) or []
postscript = None
for m in members:
    style = str(m[1]).lower() if len(m) > 1 else ''
    if 'regular' in style or 'normal' in style:
        postscript = str(m[0])
        break
if not postscript and members:
    postscript = str(members[0][0])
if not postscript:
    postscript = family

font = CTFontCreateWithName(postscript, 12, None)
url = CTFontCopyAttribute(font, kCTFontURLAttribute)
print(json.dumps(str(url.path()) if url else None))
"#;
    let output = std::process::Command::new("python3")
        .args(["-c", script, font_name])
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Ok(None);
    }
    let stdout = String::from_utf8(output.stdout).map_err(|e| e.to_string())?;
    let path: Option<String> = serde_json::from_str(stdout.trim()).map_err(|e| e.to_string())?;
    let Some(path) = path else { return Ok(None) };
    let data = fs::read(&path).map_err(|e| e.to_string())?;
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("otf")
        .to_lowercase();
    let mime = match ext.as_str() {
        "ttf" => "font/ttf",
        "ttc" => "font/collection",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        _ => "font/otf",
    };
    let b64 = general_purpose::STANDARD.encode(&data);
    Ok(Some(format!("data:{};base64,{}", mime, b64)))
}

#[cfg(not(target_os = "macos"))]
fn font_data_url_impl(_font_name: &str) -> Result<Option<String>, String> {
    Ok(None)
}

#[command]
pub fn font_data_url(font_name: String) -> Result<Option<String>, String> {
    font_data_url_impl(&font_name)
}

// ── Window ────────────────────────────────────────────────────────────────────

#[command]
pub fn resize_window(app: AppHandle, width: u32, height: u32) -> Result<(), String> {
    use tauri::LogicalSize;
    if let Some(win) = app.get_webview_window("main") {
        win.set_size(LogicalSize::new(width, height)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[command]
pub fn window_start_dragging(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") { win.start_dragging().ok(); }
}

#[command]
pub fn window_close(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") { win.close().ok(); }
}

#[command]
pub fn window_minimize(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") { win.minimize().ok(); }
}

#[command]
pub fn window_toggle_maximize(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_maximized().unwrap_or(false) { win.unmaximize().ok(); }
        else { win.maximize().ok(); }
    }
}

// ── PNG 내보내기 ──────────────────────────────────────────────────────────────

#[command]
pub async fn save_png(app: AppHandle, b64: String, filename: String) -> Result<(), String> {
    let path = app
        .dialog()
        .file()
        .set_title("PNG로 내보내기")
        .set_file_name(&filename)
        .add_filter("PNG 이미지", &["png"])
        .blocking_save_file();
    if let Some(fpath) = path {
        let path_str = fpath.to_string();
        let bytes = general_purpose::STANDARD.decode(&b64).map_err(|e| e.to_string())?;
        fs::write(&path_str, bytes).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── 백업 / 복원 ───────────────────────────────────────────────────────────────

#[command]
pub fn backup_export_to(state: State<DbState>, path: String) -> Result<(), String> {
    use std::io::{BufWriter, Write};
    let file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    let mut w = BufWriter::new(file);

    let conn = state.0.lock().map_err(|e| e.to_string())?;

    macro_rules! wr {
        ($($t:tt)*) => { write!(w, $($t)*).map_err(|e: std::io::Error| e.to_string())? };
    }

    // ── entries ─────────────────────────────────────────────────
    // content는 DB에 JSON 문자열로 저장되어 있으므로 파싱 없이 그대로 삽입
    wr!(r#"{{"version":1,"entries":["#);
    let mut stmt = conn.prepare("SELECT date, content FROM entries").map_err(|e| e.to_string())?;
    let mut first = true;
    for row in stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))).map_err(|e| e.to_string())?.filter_map(|r| r.ok()) {
        if !first { wr!(","); }
        first = false;
        let date_j = serde_json::to_string(&row.0).map_err(|e| e.to_string())?;
        wr!(r#"{{"date":{},"content":{}}}"#, date_j, row.1);  // content: raw JSON 직접 출력
    }

    // ── monthly_data ─────────────────────────────────────────────
    wr!(r#"],"monthly":["#);
    let mut stmt = conn.prepare("SELECT year_month, goals, bucket_list, events, profile FROM monthly_data").map_err(|e| e.to_string())?;
    let mut first = true;
    for row in stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?, r.get::<_, String>(4)?))).map_err(|e| e.to_string())?.filter_map(|r| r.ok()) {
        if !first { wr!(","); }
        first = false;
        let ym = serde_json::to_string(&row.0).map_err(|e| e.to_string())?;
        let g  = serde_json::to_string(&row.1).map_err(|e| e.to_string())?;
        let b  = serde_json::to_string(&row.2).map_err(|e| e.to_string())?;
        let e  = serde_json::to_string(&row.3).map_err(|e| e.to_string())?;
        let p  = serde_json::to_string(&row.4).map_err(|e| e.to_string())?;
        wr!(r#"{{"year_month":{},"goals":{},"bucket_list":{},"events":{},"profile":{}}}"#, ym, g, b, e, p);
    }

    // ── settings ─────────────────────────────────────────────────
    wr!(r#"],"settings":["#);
    let mut stmt = conn.prepare("SELECT key, value FROM settings").map_err(|e| e.to_string())?;
    let mut first = true;
    for row in stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))).map_err(|e| e.to_string())?.filter_map(|r| r.ok()) {
        if !first { wr!(","); }
        first = false;
        let k = serde_json::to_string(&row.0).map_err(|e| e.to_string())?;
        let v = serde_json::to_string(&row.1).map_err(|e| e.to_string())?;
        wr!(r#"{{"key":{},"value":{}}}"#, k, v);
    }
    wr!("]}}");

    w.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub fn backup_import_from(state: State<DbState>, path: String) -> Result<(), String> {
    let json = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let backup: serde_json::Value = serde_json::from_str(&json).map_err(|e| e.to_string())?;

    let conn = state.0.lock().map_err(|e| e.to_string())?;

    conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;

    let result = (|| -> Result<(), String> {
        // entries — content는 새 포맷(JSON 객체) 또는 구 포맷(문자열) 모두 처리
        if let Some(entries) = backup["entries"].as_array() {
            for entry in entries {
                let date = entry["date"].as_str().unwrap_or("");
                let content = match &entry["content"] {
                    serde_json::Value::String(s) => s.clone(),
                    val => serde_json::to_string(val).unwrap_or_else(|_| "{}".to_string()),
                };
                conn.execute(
                    "INSERT INTO entries (date, content, updated_at) VALUES (?1, ?2, datetime('now'))
                     ON CONFLICT(date) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at",
                    [date, content.as_str()],
                ).map_err(|e| e.to_string())?;
            }
        }
        // monthly
        if let Some(monthly) = backup["monthly"].as_array() {
            for m in monthly {
                let ym = m["year_month"].as_str().unwrap_or("");
                let g  = m["goals"].as_str().unwrap_or("[]");
                let b  = m["bucket_list"].as_str().unwrap_or("[]");
                let e  = m["events"].as_str().unwrap_or("[]");
                let p  = m["profile"].as_str().unwrap_or("{}");
                conn.execute(
                    "INSERT INTO monthly_data (year_month, goals, bucket_list, events, profile)
                     VALUES (?1, ?2, ?3, ?4, ?5)
                     ON CONFLICT(year_month) DO UPDATE SET
                       goals = excluded.goals, bucket_list = excluded.bucket_list,
                       events = excluded.events, profile = excluded.profile",
                    [ym, g, b, e, p],
                ).map_err(|e| e.to_string())?;
            }
        }
        // settings
        if let Some(settings) = backup["settings"].as_array() {
            for s in settings {
                let k = s["key"].as_str().unwrap_or("");
                let v = s["value"].as_str().unwrap_or("");
                conn.execute(
                    "INSERT INTO settings (key, value) VALUES (?1, ?2)
                     ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    [k, v],
                ).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    })();

    match result {
        Ok(_) => {
            conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
            Ok(())
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

// ── 저장 위치 관리 ────────────────────────────────────────────────────────────

#[command]
pub fn get_db_path(state: State<DbPathState>) -> String {
    state.0.lock().unwrap().to_string_lossy().to_string()
}

#[command]
pub fn open_db_folder(state: State<DbPathState>) -> Result<(), String> {
    let db_path = state.0.lock().map_err(|e| e.to_string())?.clone();
    let folder = db_path.parent().unwrap_or(db_path.as_path());
    let folder = folder.to_string_lossy().to_string();

    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(&folder).spawn().map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd").args(["/c", "start", "", &folder]).spawn().map_err(|e| e.to_string())?;
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    std::process::Command::new("xdg-open").arg(&folder).spawn().map_err(|e| e.to_string())?;

    Ok(())
}

#[command]
pub async fn pick_db_dir(app: AppHandle, path_state: State<'_, DbPathState>) -> Result<String, String> {
    let folder = app.dialog().file().blocking_pick_folder()
        .ok_or_else(|| "취소됨".to_string())?;
    let new_dir = PathBuf::from(folder.to_string());
    let new_db_path = new_dir.join("diary.db");

    // 현재 DB 파일을 새 위치로 복사
    let current = path_state.0.lock().map_err(|e| e.to_string())?.clone();
    fs::copy(&current, &new_db_path).map_err(|e| format!("복사 실패: {e}"))?;

    // config 파일에 새 경로 저장
    let config = app.path().app_data_dir().map_err(|e| e.to_string())?.join("db_path.txt");
    fs::write(&config, new_db_path.to_string_lossy().as_bytes()).map_err(|e| e.to_string())?;

    Ok(new_db_path.to_string_lossy().to_string())
}

#[command]
pub fn reset_db_path(app: AppHandle) -> Result<(), String> {
    let config = app.path().app_data_dir().map_err(|e| e.to_string())?.join("db_path.txt");
    if config.exists() {
        fs::remove_file(&config).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── 화면 캡처 내보내기 ─────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
fn screenshot_region(lx: i32, ly: i32, lw: u32, lh: u32, path: &str) -> Result<(), String> {
    let region = format!("{},{},{},{}", lx, ly, lw, lh);
    std::process::Command::new("screencapture")
        .args(["-R", &region, "-x", path])
        .status()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn screenshot_region(lx: i32, ly: i32, lw: u32, lh: u32, path: &str) -> Result<(), String> {
    let path_ps = path.replace('\'', "''");
    let script = format!(
        "Add-Type -AssemblyName 'System.Windows.Forms','System.Drawing'; \
         $b=New-Object System.Drawing.Bitmap({lw},{lh}); \
         $g=[System.Drawing.Graphics]::FromImage($b); \
         $g.CopyFromScreen({lx},{ly},0,0,[System.Drawing.Size]::new({lw},{lh})); \
         $g.Dispose(); $b.Save('{path}',[System.Drawing.Imaging.ImageFormat]::Png); $b.Dispose()",
        lw = lw, lh = lh, lx = lx, ly = ly, path = path_ps
    );
    std::process::Command::new("powershell")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
        .status()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn screenshot_region(_lx: i32, _ly: i32, _lw: u32, _lh: u32, _path: &str) -> Result<(), String> {
    Err("screenshot not supported on this platform".into())
}

#[cfg(target_os = "macos")]
fn get_cg_window_id(win: &tauri::WebviewWindow) -> Option<u32> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    let handle = win.window_handle().ok()?;
    let ns_view = match handle.as_raw() {
        RawWindowHandle::AppKit(h) => h.ns_view.as_ptr() as *mut std::ffi::c_void,
        _ => return None,
    };
    #[link(name = "objc")]
    extern "C" {
        fn sel_registerName(s: *const std::os::raw::c_char) -> *const std::ffi::c_void;
        fn objc_msgSend(recv: *mut std::ffi::c_void, sel: *const std::ffi::c_void, ...) -> *mut std::ffi::c_void;
    }
    unsafe {
        let sel_window = sel_registerName(b"window\0".as_ptr() as *const _);
        let ns_window = objc_msgSend(ns_view, sel_window);
        if ns_window.is_null() { return None; }
        let sel_num = sel_registerName(b"windowNumber\0".as_ptr() as *const _);
        let n = objc_msgSend(ns_window, sel_num) as std::os::raw::c_long;
        if n > 0 { Some(n as u32) } else { None }
    }
}

#[cfg(target_os = "macos")]
fn capture_window_to_file(app: &AppHandle, tmp: &std::path::Path) -> Result<(), String> {
    let win = app.get_webview_window("main").ok_or("window not found")?;
    if let Some(wid) = get_cg_window_id(&win) {
        std::process::Command::new("screencapture")
            .args(["-l", &wid.to_string(), "-x", tmp.to_str().unwrap()])
            .status()
            .map_err(|e| e.to_string())?;
        if tmp.exists() {
            return Ok(());
        }
    }
    // fallback: 영역 스크린샷
    let scale = win.scale_factor().map_err(|e| e.to_string())?;
    let phys_pos = win.outer_position().map_err(|e| e.to_string())?;
    let phys_size = win.outer_size().map_err(|e| e.to_string())?;
    let lx = (phys_pos.x as f64 / scale) as i32;
    let ly = (phys_pos.y as f64 / scale) as i32;
    let lw = (phys_size.width as f64 / scale) as u32;
    let lh = (phys_size.height as f64 / scale) as u32;
    screenshot_region(lx, ly, lw, lh, tmp.to_str().unwrap())
}

#[cfg(target_os = "windows")]
fn capture_window_to_file(app: &AppHandle, tmp: &std::path::Path) -> Result<(), String> {
    let win = app.get_webview_window("main").ok_or("window not found")?;
    // inner_position/size는 물리 픽셀 좌표 → scale로 나누지 않고 그대로 DPI-aware CopyFromScreen에 전달
    let phys_pos = win.inner_position().map_err(|e| e.to_string())?;
    let phys_size = win.inner_size().map_err(|e| e.to_string())?;
    let x = phys_pos.x;
    let y = phys_pos.y;
    let w = phys_size.width;
    let h = phys_size.height;
    let tmp_path = tmp.to_string_lossy().replace('\'', "''");
    // C# 컴파일은 DPI 함수만 — System.Drawing은 PowerShell 네이티브로 사용
    let script = format!(
        r#"Add-Type @'
using System;
using System.Runtime.InteropServices;
public class DpiFix {{
    [DllImport("user32.dll")]
    public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr v);
}}
'@
[DpiFix]::SetThreadDpiAwarenessContext([IntPtr](-4))
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap({w}, {h})
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen({x}, {y}, 0, 0, $bmp.Size)
$g.Dispose()
$bmp.Save('{tmp}', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()"#,
        w = w, h = h, x = x, y = y, tmp = tmp_path
    );
    let ok = std::process::Command::new("powershell")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if ok && tmp.exists() { return Ok(()); }
    Err("capture failed".into())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn capture_window_to_file(_app: &AppHandle, _tmp: &std::path::Path) -> Result<(), String> {
    Err("screenshot not supported on this platform".into())
}

#[command]
pub fn capture_screenshot_to(app: AppHandle, path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")] {
        let tmp = std::env::temp_dir().join("dida_screenshot_tmp.png");
        capture_window_to_file(&app, &tmp)?;
        fs::copy(&tmp, &path).map_err(|e| e.to_string())?;
        fs::remove_file(&tmp).ok();
        return Ok(());
    }
    #[allow(unreachable_code)]
    {
        let win = app.get_webview_window("main").ok_or("window not found")?;
        let scale = win.scale_factor().map_err(|e| e.to_string())?;
        let phys_pos = win.outer_position().map_err(|e| e.to_string())?;
        let phys_size = win.outer_size().map_err(|e| e.to_string())?;
        let lx = (phys_pos.x as f64 / scale) as i32;
        let ly = (phys_pos.y as f64 / scale) as i32;
        let lw = (phys_size.width as f64 / scale) as u32;
        let lh = (phys_size.height as f64 / scale) as u32;
        screenshot_region(lx, ly, lw, lh, &path)
    }
}

#[command]
pub fn capture_screenshot_b64(app: AppHandle) -> Result<String, String> {
    let tmp = std::env::temp_dir().join("dida_preview_tmp.png");
    capture_window_to_file(&app, &tmp)?;
    let bytes = fs::read(&tmp).map_err(|e| e.to_string())?;
    fs::remove_file(&tmp).ok();
    Ok(general_purpose::STANDARD.encode(&bytes))
}

#[command]
pub fn capture_region_b64(app: AppHandle, x: f64, y: f64, w: f64, h: f64) -> Result<String, String> {
    let win = app.get_webview_window("main").ok_or("window not found")?;
    let scale = win.scale_factor().map_err(|e| e.to_string())?;
    let inner = win.inner_position().map_err(|e| e.to_string())?;
    let lx = (inner.x as f64 / scale + x).round() as i32;
    let ly = (inner.y as f64 / scale + y).round() as i32;
    let lw = w.round().max(1.0) as u32;
    let lh = h.round().max(1.0) as u32;
    let tmp = std::env::temp_dir().join("dida_region_tmp.png");
    screenshot_region(lx, ly, lw, lh, tmp.to_str().ok_or("invalid temp path")?)?;
    let bytes = fs::read(&tmp).map_err(|e| e.to_string())?;
    fs::remove_file(&tmp).ok();
    Ok(general_purpose::STANDARD.encode(&bytes))
}

// ── HTTP fetch (트위터 등 외부 API – WebView CORS 우회) ──────────────────────

fn make_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15")
        .build()
        .map_err(|e| e.to_string())
}

#[command]
pub async fn fetch_text(url: String) -> Result<String, String> {
    let client = make_http_client()?;
    let res = client
        .get(&url)
        .header("Accept", "application/json, text/html, */*")
        .header("Referer", "https://twitter.com/")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    res.text().await.map_err(|e| e.to_string())
}

#[command]
pub async fn fetch_image_b64(url: String) -> Result<String, String> {
    if url.is_empty() {
        return Ok(String::new());
    }
    let client = make_http_client()?;
    let res = client
        .get(&url)
        .header("Referer", "https://twitter.com/")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let content_type = res
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .split(';')
        .next()
        .unwrap_or("image/jpeg")
        .trim()
        .to_string();
    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    let b64 = general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", content_type, b64))
}

// ── YouTube proxy port ───────────────────────────────────────────────────────

#[command]
pub fn get_youtube_proxy_port(state: State<YoutubeProxyPort>) -> u16 {
    state.0
}

// ── Open URL in default browser ───────────────────────────────────────────────

#[command]
pub fn open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(&url).spawn().map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd").args(["/c", "start", "", &url]).spawn().map_err(|e| e.to_string())?;
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    std::process::Command::new("xdg-open").arg(&url).spawn().map_err(|e| e.to_string())?;
    Ok(())
}
