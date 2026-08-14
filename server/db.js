import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const databasePath = resolve(process.env.DATABASE_PATH || './data/4byts.db');
mkdirSync(dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    company TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    ip_address TEXT,
    user_agent TEXT
  );

  CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key TEXT NOT NULL UNIQUE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    product TEXT NOT NULL,
    plan TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'expired', 'revoked')),
    max_devices INTEGER NOT NULL DEFAULT 1 CHECK (max_devices > 0),
    expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    activated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_id INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    device_name TEXT,
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    activated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (license_id, device_id)
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_licenses_user ON licenses(user_id);
  CREATE INDEX IF NOT EXISTS idx_devices_license ON devices(license_id);
`);

const deviceColumns = new Set(db.prepare('PRAGMA table_info(devices)').all().map(column => column.name));
if (!deviceColumns.has('activation_token_hash')) db.exec('ALTER TABLE devices ADD COLUMN activation_token_hash TEXT');
if (!deviceColumns.has('company_document')) db.exec('ALTER TABLE devices ADD COLUMN company_document TEXT');
if (!deviceColumns.has('last_ip')) db.exec('ALTER TABLE devices ADD COLUMN last_ip TEXT');
if (!deviceColumns.has('released_at')) db.exec('ALTER TABLE devices ADD COLUMN released_at TEXT');
if (!deviceColumns.has('released_by')) db.exec('ALTER TABLE devices ADD COLUMN released_by INTEGER');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_activation_token ON devices(activation_token_hash) WHERE activation_token_hash IS NOT NULL');

export function cleanupExpiredSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
}
