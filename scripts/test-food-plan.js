import Database from 'better-sqlite3';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), '4byts-food-plan-test-'));
const databasePath = join(directory, '4byts.db');
const database = new Database(databasePath);

try {
  database.exec(`
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      license_prefix TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE billing_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      product TEXT NOT NULL,
      product_id INTEGER REFERENCES products(id),
      price_cents INTEGER NOT NULL,
      cycle TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE licenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_key TEXT NOT NULL UNIQUE,
      product TEXT NOT NULL,
      product_id INTEGER REFERENCES products(id),
      product_code TEXT,
      plan TEXT NOT NULL
    );
    CREATE TABLE billing_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL REFERENCES billing_plans(id)
    );
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  database.prepare(`
    INSERT INTO licenses (license_key, product, plan) VALUES (?, '4Byts Food', 'food-mensal')
  `).run('4B-FOOD-LEGACY-TEST');
  database.close();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = spawnSync(process.execPath, ['scripts/seed-food-plan.js'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_PATH: databasePath },
      encoding: 'utf8'
    });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'O script Food falhou.');
  }

  const verification = new Database(databasePath);
  const product = verification.prepare('SELECT * FROM products WHERE code = ?').get('food');
  const plan = verification.prepare('SELECT * FROM billing_plans WHERE code = ?').get('food-mensal');
  const productCount = verification.prepare('SELECT COUNT(*) AS count FROM products WHERE code = ?').get('food').count;
  const planCount = verification.prepare('SELECT COUNT(*) AS count FROM billing_plans WHERE code = ?').get('food-mensal').count;
  const legacyLicense = verification.prepare('SELECT * FROM licenses WHERE license_key = ?').get('4B-FOOD-LEGACY-TEST');
  verification.close();

  if (!product || product.name !== '4Byts Food' || product.license_prefix !== 'FOOD' || productCount !== 1) {
    throw new Error('O produto Food nao foi cadastrado de forma isolada e idempotente.');
  }
  if (!plan || plan.product_id !== product.id || plan.price_cents !== 35000 || plan.cycle !== 'MONTHLY' || planCount !== 1) {
    throw new Error('O plano mensal de R$ 350 nao foi vinculado corretamente ao Food.');
  }
  if (legacyLicense.product_id !== product.id || legacyLicense.product_code !== 'food') {
    throw new Error('Uma licenca Food existente nao foi migrada para o cadastro separado.');
  }

  console.log('Cadastro automatico do 4Byts Food aprovado: produto separado e plano mensal de R$ 350,00.');
} finally {
  try { database.close(); } catch {}
  rmSync(directory, { recursive: true, force: true });
}
