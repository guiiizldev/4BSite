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

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL UNIQUE,
    license_prefix TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS billing_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    product TEXT NOT NULL DEFAULT '4Byts PDV',
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    cycle TEXT NOT NULL DEFAULT 'MONTHLY' CHECK (cycle IN ('MONTHLY', 'QUARTERLY', 'SEMIANNUALLY', 'YEARLY')),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS billing_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    cpf_cnpj TEXT NOT NULL,
    phone TEXT,
    provider_customer_id TEXT UNIQUE,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS billing_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    license_id INTEGER NOT NULL UNIQUE REFERENCES licenses(id) ON DELETE CASCADE,
    plan_id INTEGER NOT NULL REFERENCES billing_plans(id),
    provider TEXT NOT NULL DEFAULT 'asaas',
    provider_subscription_id TEXT UNIQUE,
    billing_type TEXT NOT NULL CHECK (billing_type IN ('PIX', 'BOLETO')),
    status TEXT NOT NULL DEFAULT 'pending',
    next_due_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS billing_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id INTEGER NOT NULL REFERENCES billing_subscriptions(id) ON DELETE CASCADE,
    provider_payment_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    value_cents INTEGER NOT NULL DEFAULT 0,
    due_date TEXT,
    paid_at TEXT,
    invoice_url TEXT,
    bank_slip_url TEXT,
    pix_payload TEXT,
    pix_encoded_image TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS billing_webhook_events (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT (datetime('now')),
    processed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS device_allowed_ips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    ip_address TEXT NOT NULL,
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approved_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (device_id, ip_address)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    summary TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_licenses_user ON licenses(user_id);
  CREATE INDEX IF NOT EXISTS idx_devices_license ON devices(license_id);
  CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_user ON billing_subscriptions(user_id);
  CREATE INDEX IF NOT EXISTS idx_billing_payments_subscription ON billing_payments(subscription_id);
  CREATE INDEX IF NOT EXISTS idx_device_allowed_ips_device ON device_allowed_ips(device_id);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
`);

const deviceColumns = new Set(db.prepare('PRAGMA table_info(devices)').all().map(column => column.name));
if (!deviceColumns.has('activation_token_hash')) db.exec('ALTER TABLE devices ADD COLUMN activation_token_hash TEXT');
if (!deviceColumns.has('company_document')) db.exec('ALTER TABLE devices ADD COLUMN company_document TEXT');
if (!deviceColumns.has('last_ip')) db.exec('ALTER TABLE devices ADD COLUMN last_ip TEXT');
if (!deviceColumns.has('released_at')) db.exec('ALTER TABLE devices ADD COLUMN released_at TEXT');
if (!deviceColumns.has('released_by')) db.exec('ALTER TABLE devices ADD COLUMN released_by INTEGER');
if (!deviceColumns.has('approval_status')) db.exec("ALTER TABLE devices ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved'");
if (!deviceColumns.has('ip_enforced')) db.exec('ALTER TABLE devices ADD COLUMN ip_enforced INTEGER NOT NULL DEFAULT 0');
if (!deviceColumns.has('requested_ip')) db.exec('ALTER TABLE devices ADD COLUMN requested_ip TEXT');
if (!deviceColumns.has('approved_at')) db.exec('ALTER TABLE devices ADD COLUMN approved_at TEXT');
if (!deviceColumns.has('approved_by')) db.exec('ALTER TABLE devices ADD COLUMN approved_by INTEGER');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_activation_token ON devices(activation_token_hash) WHERE activation_token_hash IS NOT NULL');

const licenseColumns = new Set(db.prepare('PRAGMA table_info(licenses)').all().map(column => column.name));
if (!licenseColumns.has('billing_enforced')) db.exec('ALTER TABLE licenses ADD COLUMN billing_enforced INTEGER NOT NULL DEFAULT 0');
if (!licenseColumns.has('billing_status')) db.exec("ALTER TABLE licenses ADD COLUMN billing_status TEXT NOT NULL DEFAULT 'exempt'");
if (!licenseColumns.has('billing_grace_until')) db.exec('ALTER TABLE licenses ADD COLUMN billing_grace_until TEXT');
if (!licenseColumns.has('product_id')) db.exec('ALTER TABLE licenses ADD COLUMN product_id INTEGER REFERENCES products(id)');
if (!licenseColumns.has('product_code')) db.exec('ALTER TABLE licenses ADD COLUMN product_code TEXT');

const planColumns = new Set(db.prepare('PRAGMA table_info(billing_plans)').all().map(column => column.name));
if (!planColumns.has('product_id')) db.exec('ALTER TABLE billing_plans ADD COLUMN product_id INTEGER REFERENCES products(id)');

db.prepare(`
  INSERT INTO products (code, name, license_prefix, description)
  VALUES ('pdv', '4Byts PDV', 'PDV', 'Sistema de frente de caixa e gestão comercial')
  ON CONFLICT(code) DO UPDATE SET
    name = excluded.name,
    license_prefix = excluded.license_prefix,
    description = CASE WHEN products.description = '' THEN excluded.description ELSE products.description END,
    updated_at = datetime('now')
`).run();

db.exec(`
  UPDATE billing_plans
     SET product_id = (SELECT id FROM products WHERE lower(products.name) = lower(billing_plans.product))
   WHERE product_id IS NULL;
  UPDATE licenses
     SET product_id = (SELECT id FROM products WHERE lower(products.name) = lower(licenses.product)),
         product_code = COALESCE(product_code, CASE WHEN lower(product) LIKE '%pdv%' THEN 'pdv' END)
   WHERE product_id IS NULL OR product_code IS NULL;
`);

export function cleanupExpiredSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
}

export function auditAction(actorUserId, action, entityType, entityId, summary) {
  db.prepare(`
    INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, summary)
    VALUES (?, ?, ?, ?, ?)
  `).run(actorUserId || null, action, entityType, entityId == null ? null : String(entityId), summary);
}
