import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = mkdtempSync(join(tmpdir(), '4byts-atendimento-test-'));
const databasePath = join(directory, 'central.db');

try {
  const database = new Database(databasePath);
  database.exec(`
    CREATE TABLE products (id INTEGER PRIMARY KEY, code TEXT UNIQUE, name TEXT, license_prefix TEXT UNIQUE, description TEXT, active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE licenses (id INTEGER PRIMARY KEY, product TEXT, plan TEXT, product_id INTEGER, product_code TEXT);
    CREATE TABLE billing_plans (id INTEGER PRIMARY KEY, code TEXT UNIQUE, name TEXT, product TEXT, product_id INTEGER, price_cents INTEGER, cycle TEXT, active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE billing_subscriptions (id INTEGER PRIMARY KEY, plan_id INTEGER);
    CREATE TABLE audit_logs (id INTEGER PRIMARY KEY, actor_user_id INTEGER, action TEXT, entity_type TEXT, entity_id TEXT, summary TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  `);
  database.close();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const execution = spawnSync(process.execPath, ['scripts/seed-atendimento-product.js'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_PATH: databasePath, ATENDIMENTO_MONTHLY_PRICE_CENTS: '29900' },
      encoding: 'utf8'
    });
    if (execution.status !== 0) throw new Error(execution.stderr || execution.stdout || 'O cadastro do Atendimento falhou.');
  }

  const verification = new Database(databasePath);
  const product = verification.prepare("SELECT * FROM products WHERE code = 'atendimento'").get();
  const plan = verification.prepare("SELECT * FROM billing_plans WHERE code = 'atendimento-mensal'").get();
  const productCount = verification.prepare("SELECT COUNT(*) AS count FROM products WHERE code = 'atendimento'").get().count;
  const planCount = verification.prepare("SELECT COUNT(*) AS count FROM billing_plans WHERE code = 'atendimento-mensal'").get().count;
  verification.close();

  if (!product || product.name !== '4Byts Atendimento' || product.license_prefix !== 'WPP' || productCount !== 1) {
    throw new Error('O produto Atendimento não foi cadastrado de forma isolada e idempotente.');
  }
  if (!plan || plan.product_id !== product.id || plan.price_cents !== 29900 || planCount !== 1) {
    throw new Error('O plano do Atendimento não foi vinculado ao produto correto.');
  }
  console.log('4Byts Atendimento aprovado: produto isolado, prefixo WPP e plano configurável.');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
