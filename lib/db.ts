import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const configuredDbPath = process.env.DATABASE_PATH;
const dbPath = configuredDbPath
  ? path.resolve(/* turbopackIgnore: true */ configuredDbPath)
  : path.join(process.cwd(), "data", "aipm.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const globalDb = globalThis as unknown as { aipmDb?: DatabaseSync };
export const db = globalDb.aipmDb ?? new DatabaseSync(dbPath);
if (process.env.NODE_ENV !== "production") globalDb.aipmDb = db;

db.exec("PRAGMA busy_timeout = 30000;");
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  github_id INTEGER NOT NULL UNIQUE,
  full_name TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  stars INTEGER NOT NULL DEFAULT 0,
  forks INTEGER NOT NULL DEFAULT 0,
  language TEXT,
  updated_at TEXT NOT NULL,
  pushed_at TEXT NOT NULL,
  open_issues INTEGER NOT NULL DEFAULT 0,
  readme TEXT NOT NULL DEFAULT '',
  readme_hash TEXT NOT NULL DEFAULT '',
  license TEXT,
  category TEXT NOT NULL,
  homepage TEXT,
  product_score REAL NOT NULL DEFAULT 0,
  is_mock INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS project_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stars INTEGER NOT NULL,
  forks INTEGER NOT NULL,
  open_issues INTEGER NOT NULL,
  captured_at TEXT NOT NULL,
  UNIQUE(project_id, captured_at)
);
CREATE TABLE IF NOT EXISTS analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  readme_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  content_json TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(project_id, readme_hash, model)
);
CREATE TABLE IF NOT EXISTS weekly_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  title TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  project_ids_json TEXT NOT NULL,
  is_mock INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger_type TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  collected_count INTEGER NOT NULL DEFAULT 0,
  analyzed_count INTEGER NOT NULL DEFAULT 0,
  cache_hits INTEGER NOT NULL DEFAULT 0,
  error_json TEXT
);
CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER REFERENCES pipeline_runs(id),
  project_id INTEGER REFERENCES projects(id),
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  estimated_cost REAL NOT NULL,
  success INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS job_locks (
  name TEXT PRIMARY KEY,
  locked_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
`);

function hasColumn(table: string, column: string) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some(item => item.name === column);
}

const migrations = [
  { version: 1, name: "baseline", up: () => {} },
  { version: 2, name: "link_pipeline_report", up: () => {
    if (!hasColumn("pipeline_runs", "report_id")) db.exec("ALTER TABLE pipeline_runs ADD COLUMN report_id INTEGER REFERENCES weekly_reports(id)");
  } },
  { version: 3, name: "report_analysis_provenance", up: () => {
    if (!hasColumn("weekly_reports", "analysis_provider")) db.exec("ALTER TABLE weekly_reports ADD COLUMN analysis_provider TEXT NOT NULL DEFAULT 'unknown'");
  } },
  { version: 4, name: "ai_usage_provider", up: () => {
    if (!hasColumn("ai_usage", "provider")) db.exec("ALTER TABLE ai_usage ADD COLUMN provider TEXT NOT NULL DEFAULT 'unknown'");
    db.exec("UPDATE ai_usage SET provider='mock' WHERE provider='unknown' AND model LIKE 'mock%'");
  } },
  { version: 5, name: "backfill_usage_provider_from_reports", up: () => {
    db.exec(`UPDATE ai_usage SET provider=(SELECT w.analysis_provider FROM pipeline_runs r JOIN weekly_reports w ON w.id=r.report_id WHERE r.id=ai_usage.run_id) WHERE provider='unknown' AND EXISTS (SELECT 1 FROM pipeline_runs r JOIN weekly_reports w ON w.id=r.report_id WHERE r.id=ai_usage.run_id AND w.analysis_provider IN ('mock','openai'))`);
  } },
  { version: 6, name: "analysis_fingerprint", up: () => {
    if (!hasColumn("projects", "analysis_fingerprint")) db.exec("ALTER TABLE projects ADD COLUMN analysis_fingerprint TEXT NOT NULL DEFAULT ''");
  } },
  { version: 7, name: "ai_degradation_and_cache_audit", up: () => {
    if (!hasColumn("ai_usage", "cache_hit")) db.exec("ALTER TABLE ai_usage ADD COLUMN cache_hit INTEGER NOT NULL DEFAULT 0");
    db.exec(`CREATE TABLE IF NOT EXISTS service_status (
      service TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      code TEXT,
      message TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_error_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER REFERENCES pipeline_runs(id),
      project_id INTEGER REFERENCES projects(id),
      code TEXT NOT NULL,
      message TEXT NOT NULL,
      retryable INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );`);
    db.prepare("INSERT OR IGNORE INTO service_status(service,status,code,message,updated_at) VALUES('ai','healthy',NULL,'AI 分析服务正常',?)").run(new Date().toISOString());
  } },
];

for (const migration of migrations) {
  const applied=db.prepare("SELECT 1 FROM schema_migrations WHERE version=?").get(migration.version);
  if(applied)continue;
  db.exec("BEGIN IMMEDIATE");
  try{
    migration.up();
    db.prepare("INSERT INTO schema_migrations(version,name,applied_at) VALUES(?,?,?)").run(migration.version,migration.name,new Date().toISOString());
    db.exec("COMMIT");
  }catch(error){db.exec("ROLLBACK");throw error;}
}

export function nowIso() { return new Date().toISOString(); }

export function acquireLock(name: string, ttlMinutes = 60): boolean {
  const now = nowIso();
  db.prepare("DELETE FROM job_locks WHERE expires_at < ?").run(now);
  try {
    db.prepare("INSERT INTO job_locks(name, locked_at, expires_at) VALUES (?, ?, ?)")
      .run(name, now, new Date(Date.now() + ttlMinutes * 60000).toISOString());
    return true;
  } catch { return false; }
}

export function releaseLock(name: string) {
  db.prepare("DELETE FROM job_locks WHERE name = ?").run(name);
}
