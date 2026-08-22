import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const databasePath = resolve(process.env.ATENDIMENTO_DATABASE_PATH || './data/atendimento.db');
mkdirSync(dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    central_user_id INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL,
    license_key TEXT NOT NULL UNIQUE,
    license_status TEXT NOT NULL DEFAULT 'active',
    license_checked_at TEXT,
    bot_enabled INTEGER NOT NULL DEFAULT 1,
    welcome_message TEXT NOT NULL DEFAULT 'Olá! Sou o assistente virtual da empresa. Como podemos ajudar?',
    handoff_message TEXT NOT NULL DEFAULT 'Perfeito! Encaminhei sua conversa para nossa equipe. Aguarde um instante.',
    menu_json TEXT NOT NULL DEFAULT '[{"key":"1","label":"Comercial","department":"comercial"},{"key":"2","label":"Suporte","department":"suporte"},{"key":"3","label":"Financeiro","department":"financeiro"},{"key":"0","label":"Falar com atendente","department":"geral"}]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    central_user_id INTEGER,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'supervisor', 'agent')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (tenant_id, email)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    phone_number_id TEXT NOT NULL UNIQUE,
    waba_id TEXT,
    display_phone TEXT,
    access_token_encrypted TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    wa_id TEXT NOT NULL,
    name TEXT,
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (tenant_id, wa_id)
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'bot' CHECK (status IN ('bot', 'waiting', 'human', 'closed')),
    department TEXT NOT NULL DEFAULT 'triagem',
    assigned_agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
    unread_count INTEGER NOT NULL DEFAULT 0,
    last_message_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    closed_at TEXT,
    UNIQUE (tenant_id, contact_id, channel_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    provider_message_id TEXT UNIQUE,
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'bot', 'agent')),
    agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
    message_type TEXT NOT NULL DEFAULT 'text',
    content TEXT NOT NULL,
    provider_status TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_conversations_tenant_status ON conversations(tenant_id, status, last_message_at DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, id);
  CREATE INDEX IF NOT EXISTS idx_sessions_hash ON sessions(token_hash);
`);

export function purgeExpiredSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
}
