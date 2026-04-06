import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";

const DB_DIR = path.join(os.homedir(), ".openclaw-sherra", "projects", "mem0");
const DB_PATH = path.join(DB_DIR, "memory.db");

fs.mkdirSync(DB_DIR, { recursive: true });

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  migrate(_db);
  return _db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory (
      id TEXT PRIMARY KEY,
      fact TEXT NOT NULL,
      fact_type TEXT CHECK(fact_type IN ('preference','correction','inferred','explicit','goal')) NOT NULL DEFAULT 'inferred',
      confidence REAL DEFAULT 0.7,
      extraction_count INTEGER DEFAULT 1,
      embedding TEXT, -- JSON array of floats
      source_context TEXT,
      superseded_by TEXT REFERENCES memory(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS extraction_state (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

export function getLastProcessedTime(): number {
  const db = getDb();
  const row = db.prepare("SELECT value FROM extraction_state WHERE key = 'last_processed_at'").get() as { value: string } | undefined;
  return row ? parseInt(row.value, 10) : 0;
}

export function setLastProcessedTime(ts: number) {
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO extraction_state (key, value) VALUES ('last_processed_at', ?)").run(String(ts));
}
