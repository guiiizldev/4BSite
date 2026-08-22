import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createHash, randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { db, purgeExpiredSessions } from './db.js';
import { sendText, validWebhookSignature } from './meta.js';
import { encryptSecret } from './secrets.js';

const app = express();
const port = Number(process.env.ATENDIMENTO_PORT || 5280);
const host = process.env.ATENDIMENTO_HOST || '127.0.0.1';
const centralUrl = (process.env.CENTRAL_API_URL || 'http://127.0.0.1:4310').replace(/\/$/, '');
const serviceKey = process.env.LICENSE_SERVICE_API_KEY || '';
const sessionCookie = '4byts_atendimento_session';
const publicDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const brandDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'assets');

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cookieParser());

const hash = value => createHash('sha256').update(value).digest('hex');
const json = response => response.json().catch(() => ({}));
const publicAgent = agent => ({ id: agent.id, name: agent.name, email: agent.email, role: agent.role, tenantName: agent.tenant_name });

async function centralRequest(path, body) {
  if (serviceKey.length < 32) throw new Error('Credencial da central de licenças não configurada.');
  const response = await fetch(`${centralUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-4byts-service-key': serviceKey },
    body: JSON.stringify(body)
  });
  const payload = await json(response);
  if (!response.ok) {
    const error = new Error(payload.error || 'A central 4Byts recusou a solicitação.');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function ensureEntitlement(tenant, force = false) {
  const lastCheck = tenant.license_checked_at ? new Date(`${tenant.license_checked_at}Z`).getTime() : 0;
  if (!force && tenant.license_status === 'active' && Date.now() - lastCheck < 15 * 60 * 1000) return true;
  try {
    await centralRequest('/api/v1/licenses/entitlement', { licenseKey: tenant.license_key, productCode: 'atendimento' });
    db.prepare("UPDATE tenants SET license_status = 'active', license_checked_at = datetime('now') WHERE id = ?").run(tenant.id);
    return true;
  } catch (error) {
    if (error.status && error.status < 500) db.prepare("UPDATE tenants SET license_status = ?, license_checked_at = datetime('now') WHERE id = ?").run(error.payload?.status || 'blocked', tenant.id);
    return false;
  }
}

async function requireAgent(request, response, next) {
  const token = request.cookies?.[sessionCookie];
  if (!token) return response.status(401).json({ error: 'Faça login para continuar.' });
  const agent = db.prepare(`
    SELECT agents.*, tenants.name AS tenant_name, tenants.license_key, tenants.license_status, tenants.license_checked_at
      FROM sessions JOIN agents ON agents.id = sessions.agent_id JOIN tenants ON tenants.id = agents.tenant_id
     WHERE sessions.token_hash = ? AND sessions.expires_at > datetime('now') AND agents.active = 1
  `).get(hash(token));
  if (!agent) return response.status(401).json({ error: 'Sua sessão expirou.' });
  if (!await ensureEntitlement(agent)) return response.status(403).json({ error: 'A licença do 4Byts Atendimento está bloqueada ou vencida.', status: 'license_blocked' });
  request.agent = agent;
  next();
}

function createSession(agentId, response) {
  purgeExpiredSessions();
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 30 * 86400000);
  db.prepare('INSERT INTO sessions (agent_id, token_hash, expires_at) VALUES (?, ?, ?)').run(agentId, hash(token), expiresAt.toISOString());
  response.cookie(sessionCookie, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', expires: expiresAt });
}

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(72) });
const channelSchema = z.object({
  phoneNumberId: z.string().trim().min(5).max(80),
  wabaId: z.string().trim().max(80).optional().default(''),
  displayPhone: z.string().trim().max(30).optional().default(''),
  accessToken: z.string().trim().max(500).optional().default('')
});
const botSchema = z.object({
  botEnabled: z.boolean(),
  welcomeMessage: z.string().trim().min(5).max(1000),
  handoffMessage: z.string().trim().min(5).max(1000),
  menu: z.array(z.object({ key: z.string().trim().min(1).max(10), label: z.string().trim().min(2).max(80), department: z.string().trim().min(2).max(40) })).min(1).max(10)
});

app.get('/webhooks/whatsapp', (request, response) => {
  const valid = request.query['hub.mode'] === 'subscribe' && request.query['hub.verify_token'] === process.env.WHATSAPP_VERIFY_TOKEN;
  if (!valid) return response.sendStatus(403);
  response.status(200).send(String(request.query['hub.challenge'] || ''));
});

function messageContent(message) {
  return message.text?.body || message.button?.text || message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || `[${message.type || 'mensagem'}]`;
}

function menuText(tenant) {
  const menu = JSON.parse(tenant.menu_json || '[]');
  return `${tenant.welcome_message}\n\n${menu.map(item => `*${item.key}* — ${item.label}`).join('\n')}`;
}

async function saveOutbound(conversationId, channel, recipient, content, senderType, agentId = null) {
  const providerId = await sendText(channel, recipient, content);
  db.prepare(`INSERT INTO messages (conversation_id, provider_message_id, direction, sender_type, agent_id, content, provider_status) VALUES (?, ?, 'outbound', ?, ?, ?, 'sent')`)
    .run(conversationId, providerId, senderType, agentId, content);
  db.prepare("UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?").run(conversationId);
}

async function processIncoming(payload) {
  for (const entry of payload.entry || []) for (const change of entry.changes || []) {
    const value = change.value || {};
    const phoneNumberId = value.metadata?.phone_number_id;
    const channel = phoneNumberId ? db.prepare('SELECT * FROM channels WHERE phone_number_id = ? AND active = 1').get(phoneNumberId) : null;
    if (!channel) continue;
    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(channel.tenant_id);
    if (!tenant || !await ensureEntitlement(tenant)) continue;

    for (const status of value.statuses || []) db.prepare('UPDATE messages SET provider_status = ? WHERE provider_message_id = ?').run(status.status, status.id);
    for (const message of value.messages || []) {
      if (db.prepare('SELECT 1 FROM messages WHERE provider_message_id = ?').get(message.id)) continue;
      const waId = message.from;
      const profileName = value.contacts?.find(contact => contact.wa_id === waId)?.profile?.name || waId;
      db.prepare(`
        INSERT INTO contacts (tenant_id, wa_id, name) VALUES (?, ?, ?)
        ON CONFLICT(tenant_id, wa_id) DO UPDATE SET name = excluded.name, last_seen_at = datetime('now')
      `).run(tenant.id, waId, profileName);
      const contact = db.prepare('SELECT * FROM contacts WHERE tenant_id = ? AND wa_id = ?').get(tenant.id, waId);
      let conversation = db.prepare('SELECT * FROM conversations WHERE tenant_id = ? AND contact_id = ? AND channel_id = ?').get(tenant.id, contact.id, channel.id);
      const wasNew = !conversation || conversation.status === 'closed';
      if (!conversation) {
        const result = db.prepare('INSERT INTO conversations (tenant_id, contact_id, channel_id) VALUES (?, ?, ?)').run(tenant.id, contact.id, channel.id);
        conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(result.lastInsertRowid);
      } else if (conversation.status === 'closed') {
        db.prepare("UPDATE conversations SET status = 'bot', department = 'triagem', assigned_agent_id = NULL, closed_at = NULL WHERE id = ?").run(conversation.id);
        conversation = { ...conversation, status: 'bot', department: 'triagem' };
      }
      const content = messageContent(message);
      db.prepare(`INSERT INTO messages (conversation_id, provider_message_id, direction, sender_type, message_type, content, provider_status) VALUES (?, ?, 'inbound', 'customer', ?, ?, 'received')`)
        .run(conversation.id, message.id, message.type || 'text', content);
      db.prepare("UPDATE conversations SET unread_count = unread_count + 1, last_message_at = datetime('now') WHERE id = ?").run(conversation.id);
      if (conversation.status === 'human' || conversation.status === 'waiting') continue;

      const normalized = content.trim().toLowerCase();
      const menu = JSON.parse(tenant.menu_json || '[]');
      const selection = menu.find(item => item.key.toLowerCase() === normalized || item.label.toLowerCase() === normalized);
      const asksHuman = /atendente|humano|pessoa|falar com algu[eé]m/.test(normalized);
      if (!tenant.bot_enabled || selection || asksHuman) {
        const department = selection?.department || 'geral';
        db.prepare("UPDATE conversations SET status = 'waiting', department = ? WHERE id = ?").run(department, conversation.id);
        await saveOutbound(conversation.id, channel, waId, tenant.handoff_message, 'bot');
      } else {
        await saveOutbound(conversation.id, channel, waId, wasNew ? menuText(tenant) : `Não consegui identificar sua opção.\n\n${menuText(tenant)}`, 'bot');
      }
    }
  }
}

app.post('/webhooks/whatsapp', express.raw({ type: 'application/json', limit: '1mb' }), (request, response) => {
  if (!validWebhookSignature(request.body, request.get('x-hub-signature-256'))) return response.sendStatus(401);
  let payload;
  try { payload = JSON.parse(request.body.toString('utf8')); } catch { return response.sendStatus(400); }
  response.sendStatus(200);
  processIncoming(payload).catch(error => console.error('Falha ao processar webhook do WhatsApp:', error.message));
});

app.use(express.json({ limit: '64kb' }));
app.use('/api', (_request, response, next) => { response.set('Cache-Control', 'no-store, private'); next(); });
app.use('/api', (request, response, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return next();
  const origin = request.get('origin');
  const allowed = new Set(['https://atendimento.4byts.com', 'http://localhost:5280', 'http://127.0.0.1:5280']);
  if (origin && !allowed.has(origin)) return response.status(403).json({ error: 'Origem da requisição não permitida.' });
  next();
});

app.get('/api/health', (_request, response) => response.json({ status: 'ok', service: '4byts-atendimento', time: new Date().toISOString() }));

app.post('/api/auth/login', loginLimiter, async (request, response) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Informe e-mail e senha.' });
  try {
    const entitlement = await centralRequest('/api/v1/auth/product-login', { ...parsed.data, productCode: 'atendimento' });
    const tenantName = entitlement.user.company || entitlement.user.name;
    db.prepare(`
      INSERT INTO tenants (central_user_id, name, license_key, license_status, license_checked_at) VALUES (?, ?, ?, 'active', datetime('now'))
      ON CONFLICT(central_user_id) DO UPDATE SET name = excluded.name, license_key = excluded.license_key, license_status = 'active', license_checked_at = datetime('now'), updated_at = datetime('now')
    `).run(entitlement.user.id, tenantName, entitlement.licenseKey);
    const tenant = db.prepare('SELECT * FROM tenants WHERE central_user_id = ?').get(entitlement.user.id);
    db.prepare(`
      INSERT INTO agents (tenant_id, central_user_id, name, email, role) VALUES (?, ?, ?, ?, 'owner')
      ON CONFLICT(tenant_id, email) DO UPDATE SET name = excluded.name, central_user_id = excluded.central_user_id, active = 1
    `).run(tenant.id, entitlement.user.id, entitlement.user.name, entitlement.user.email);
    const agent = db.prepare('SELECT agents.*, tenants.name AS tenant_name FROM agents JOIN tenants ON tenants.id = agents.tenant_id WHERE agents.tenant_id = ? AND agents.email = ?').get(tenant.id, entitlement.user.email);
    createSession(agent.id, response);
    response.json({ agent: publicAgent(agent) });
  } catch (error) {
    response.status(error.status && error.status < 500 ? error.status : 502).json({ error: error.message });
  }
});

app.post('/api/auth/logout', requireAgent, (request, response) => {
  const token = request.cookies?.[sessionCookie];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(token));
  response.clearCookie(sessionCookie, { path: '/' });
  response.status(204).end();
});
app.get('/api/auth/me', requireAgent, (request, response) => response.json({ agent: publicAgent(request.agent) }));

app.get('/api/dashboard', requireAgent, (request, response) => {
  const tenantId = request.agent.tenant_id;
  const counters = db.prepare(`SELECT COUNT(*) total, SUM(status = 'waiting') waiting, SUM(status = 'human') human, SUM(status = 'bot') bot FROM conversations WHERE tenant_id = ?`).get(tenantId);
  const channel = db.prepare('SELECT id, phone_number_id AS phoneNumberId, waba_id AS wabaId, display_phone AS displayPhone, active FROM channels WHERE tenant_id = ?').get(tenantId) || null;
  response.json({ counters: { total: counters.total || 0, waiting: counters.waiting || 0, human: counters.human || 0, bot: counters.bot || 0 }, channel });
});

app.get('/api/conversations', requireAgent, (request, response) => {
  const status = ['bot', 'waiting', 'human', 'closed'].includes(request.query.status) ? request.query.status : null;
  const conversations = db.prepare(`
    SELECT conversations.id, conversations.status, conversations.department, conversations.unread_count AS unreadCount,
      conversations.last_message_at AS lastMessageAt, conversations.assigned_agent_id AS assignedAgentId,
      contacts.name AS contactName, contacts.wa_id AS phone,
      (SELECT content FROM messages WHERE conversation_id = conversations.id ORDER BY id DESC LIMIT 1) AS lastMessage,
      agents.name AS assignedAgent
    FROM conversations JOIN contacts ON contacts.id = conversations.contact_id
    LEFT JOIN agents ON agents.id = conversations.assigned_agent_id
    WHERE conversations.tenant_id = ? AND (? IS NULL OR conversations.status = ?)
    ORDER BY conversations.last_message_at DESC LIMIT 200
  `).all(request.agent.tenant_id, status, status);
  response.json({ conversations });
});

app.get('/api/conversations/:id/messages', requireAgent, (request, response) => {
  const conversation = db.prepare(`SELECT conversations.*, contacts.name AS contactName, contacts.wa_id AS phone FROM conversations JOIN contacts ON contacts.id = conversations.contact_id WHERE conversations.id = ? AND conversations.tenant_id = ?`).get(Number(request.params.id), request.agent.tenant_id);
  if (!conversation) return response.status(404).json({ error: 'Conversa não encontrada.' });
  db.prepare('UPDATE conversations SET unread_count = 0 WHERE id = ?').run(conversation.id);
  const messages = db.prepare(`SELECT messages.id, direction, sender_type AS senderType, content, provider_status AS providerStatus, messages.created_at AS createdAt, agents.name AS agentName FROM messages LEFT JOIN agents ON agents.id = messages.agent_id WHERE conversation_id = ? ORDER BY messages.id`).all(conversation.id);
  response.json({ conversation, messages });
});

app.post('/api/conversations/:id/assign', requireAgent, (request, response) => {
  const conversation = db.prepare('SELECT id FROM conversations WHERE id = ? AND tenant_id = ?').get(Number(request.params.id), request.agent.tenant_id);
  if (!conversation) return response.status(404).json({ error: 'Conversa não encontrada.' });
  db.prepare("UPDATE conversations SET status = 'human', assigned_agent_id = ?, unread_count = 0 WHERE id = ?").run(request.agent.id, conversation.id);
  response.json({ message: 'Conversa assumida por você.' });
});

app.post('/api/conversations/:id/close', requireAgent, (request, response) => {
  const result = db.prepare("UPDATE conversations SET status = 'closed', closed_at = datetime('now'), unread_count = 0 WHERE id = ? AND tenant_id = ?").run(Number(request.params.id), request.agent.tenant_id);
  if (!result.changes) return response.status(404).json({ error: 'Conversa não encontrada.' });
  response.json({ message: 'Atendimento encerrado.' });
});

app.post('/api/conversations/:id/messages', requireAgent, async (request, response) => {
  const content = z.string().trim().min(1).max(4096).safeParse(request.body?.content);
  if (!content.success) return response.status(400).json({ error: 'Digite uma mensagem válida.' });
  const conversation = db.prepare(`SELECT conversations.*, contacts.wa_id AS phone, channels.phone_number_id, channels.access_token_encrypted FROM conversations JOIN contacts ON contacts.id = conversations.contact_id JOIN channels ON channels.id = conversations.channel_id WHERE conversations.id = ? AND conversations.tenant_id = ?`).get(Number(request.params.id), request.agent.tenant_id);
  if (!conversation) return response.status(404).json({ error: 'Conversa não encontrada.' });
  try {
    await saveOutbound(conversation.id, conversation, conversation.phone, content.data, 'agent', request.agent.id);
    db.prepare("UPDATE conversations SET status = 'human', assigned_agent_id = ?, unread_count = 0 WHERE id = ?").run(request.agent.id, conversation.id);
    response.status(201).json({ message: 'Mensagem enviada.' });
  } catch (error) { response.status(502).json({ error: error.message }); }
});

app.get('/api/settings', requireAgent, (request, response) => {
  const tenant = db.prepare('SELECT bot_enabled AS botEnabled, welcome_message AS welcomeMessage, handoff_message AS handoffMessage, menu_json AS menuJson FROM tenants WHERE id = ?').get(request.agent.tenant_id);
  const channel = db.prepare('SELECT phone_number_id AS phoneNumberId, waba_id AS wabaId, display_phone AS displayPhone, active FROM channels WHERE tenant_id = ?').get(request.agent.tenant_id) || null;
  response.json({ bot: { ...tenant, botEnabled: Boolean(tenant.botEnabled), menu: JSON.parse(tenant.menuJson) }, channel });
});

app.put('/api/settings/bot', requireAgent, (request, response) => {
  const parsed = botSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Revise as configurações do bot.' });
  db.prepare("UPDATE tenants SET bot_enabled = ?, welcome_message = ?, handoff_message = ?, menu_json = ?, updated_at = datetime('now') WHERE id = ?")
    .run(Number(parsed.data.botEnabled), parsed.data.welcomeMessage, parsed.data.handoffMessage, JSON.stringify(parsed.data.menu), request.agent.tenant_id);
  response.json({ message: 'Fluxo de atendimento atualizado.' });
});

app.put('/api/settings/channel', requireAgent, (request, response) => {
  const parsed = channelSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Revise os dados do canal.' });
  const current = db.prepare('SELECT * FROM channels WHERE tenant_id = ?').get(request.agent.tenant_id);
  if (!current && !parsed.data.accessToken) return response.status(400).json({ error: 'Informe o token permanente da Meta na primeira configuração.' });
  const encryptedToken = parsed.data.accessToken ? encryptSecret(parsed.data.accessToken) : current.access_token_encrypted;
  db.prepare(`
    INSERT INTO channels (tenant_id, phone_number_id, waba_id, display_phone, access_token_encrypted)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id) DO UPDATE SET phone_number_id = excluded.phone_number_id, waba_id = excluded.waba_id, display_phone = excluded.display_phone, access_token_encrypted = excluded.access_token_encrypted, active = 1, updated_at = datetime('now')
  `).run(request.agent.tenant_id, parsed.data.phoneNumberId, parsed.data.wabaId || null, parsed.data.displayPhone || null, encryptedToken);
  response.json({ message: 'Canal oficial do WhatsApp configurado.' });
});

app.use('/assets', express.static(brandDirectory, { maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0 }));
app.use(express.static(publicDirectory, { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
app.use((_request, response) => response.sendFile(join(publicDirectory, 'index.html')));
app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: 'Erro interno no 4Byts Atendimento.' });
});

app.listen(port, host, () => console.log(`4Byts Atendimento disponível em http://${host}:${port}`));
