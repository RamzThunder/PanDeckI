use rusqlite::{Connection, Result};
use std::path::PathBuf;
use std::sync::Mutex;

pub struct DbState(pub Mutex<Connection>);

impl DbState {
    pub fn new(db_path: PathBuf) -> Self {
        let conn = Connection::open(&db_path).expect("failed to open db");
        // WAL 대신 DELETE 모드: iCloud가 단일 diary.db 파일만 동기화하면 됨
        conn.execute_batch("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;").ok();
        DbState(Mutex::new(conn))
    }
}

pub fn setup_database(db_path: &PathBuf) -> Result<()> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;")?;
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL UNIQUE,
            content TEXT NOT NULL DEFAULT '{}',
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS monthly_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            year_month TEXT NOT NULL UNIQUE,
            goals TEXT NOT NULL DEFAULT '[]',
            bucket_list TEXT NOT NULL DEFAULT '[]',
            events TEXT NOT NULL DEFAULT '[]',
            profile TEXT NOT NULL DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    ")?;
    Ok(())
}
