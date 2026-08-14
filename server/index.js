import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { clearSessionCookie, createSession, destroySession, publicUser, requireAdmin, requireAuth, setSessionCookie } from './auth.js';
import { cleanupExpiredSessions, db } from './db.js';

const app = express();
const port = Number(process.env.PORT || 4310);
const host = process.env.HOST || '127.0.0.1';

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use('/api', (_request, response, next) => {
  response.set('Cache-Control', 'no-store, private');
  next();
});

app.use((request, response, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return next();
  const origin = request.get('origin');
  const allowedOrigins = new Set([
    'https://4byts.com',
    'https://www.4byts.com',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ]);
  if (origin && !allowedOrigins.has(origin)) return response.status(403).json({ error: 'Origem da requisição não permitida.' });
  next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos.' }
});

const activationLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Limite de validações excedido. Tente novamente em instantes.' }
});

const hashActivationToken = token => createHash('sha256').update(token).digest('hex');
const digitsOnly = value => String(value || '').replace(/\D/g, '');

function requireLicenseService(request, response, next) {
  const expected = process.env.LICENSE_SERVICE_API_KEY || '';
  const received = request.get('x-4byts-service-key') || '';
  if (!expected || expected.length < 32) return response.status(503).json({ error: 'Serviço de licenças não configurado.' });
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length || !timingSafeEqual(expectedBuffer, receivedBuffer)) {
    return response.status(401).json({ error: 'Credencial de serviço inválida.' });
  }
  next();
}

const activationSchema = z.object({
  licenseKey: z.string().trim().min(8).max(100).transform(value => value.toUpperCase()),
  instanceId: z.string().trim().min(8).max(120),
  companyName: z.string().trim().min(2).max(160),
  companyDocument: z.string().transform(digitsOnly).refine(value => value.length === 14)
});

const validationSchema = z.object({
  activationToken: z.string().trim().min(32).max(200)
});

function licenseEntitlement(license) {
  return {
    id: license.id,
    product: license.product,
    plan: license.plan,
    status: license.status,
    maxDevices: license.max_devices,
    expiresAt: license.expires_at
  };
}

function effectiveLicenseStatus(license) {
  if (license.status === 'active' && license.expires_at && new Date(license.expires_at).getTime() <= Date.now()) {
    db.prepare("UPDATE licenses SET status = 'expired' WHERE id = ?").run(license.id);
    return 'expired';
  }
  return license.status;
}

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(180).transform(value => value.toLowerCase()),
  company: z.string().trim().max(120).optional().default(''),
  password: z.string().min(8).max(72)
});

const loginSchema = z.object({
  email: z.string().trim().email().transform(value => value.toLowerCase()),
  password: z.string().min(1).max(72)
});

const adminLicenseSchema = z.object({
  email: z.string().trim().email().optional(),
  product: z.string().trim().min(2).max(80).default('4Byts PDV'),
  plan: z.string().trim().min(2).max(50).default('Profissional'),
  maxDevices: z.number().int().min(1).max(100).default(1),
  expiresAt: z.string().datetime().nullable().optional()
});

const adminUserSchema = registerSchema.extend({
  role: z.enum(['customer', 'admin']).optional().default('customer')
});

const adminUserUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(180).transform(value => value.toLowerCase()),
  company: z.string().trim().max(120).optional().default(''),
  role: z.enum(['customer', 'admin']),
  password: z.union([z.string().min(8).max(72), z.literal('')]).optional()
});

const adminLicenseUpdateSchema = z.object({
  email: z.union([z.string().trim().email(), z.literal('')]).optional(),
  product: z.string().trim().min(2).max(80),
  plan: z.string().trim().min(2).max(50),
  status: z.enum(['active', 'suspended', 'expired', 'revoked']),
  maxDevices: z.number().int().min(1).max(100),
  expiresAt: z.union([z.string().datetime(), z.null()]).optional()
});

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', service: '4byts-api', time: new Date().toISOString() });
});

app.post('/api/v1/licenses/activate', activationLimiter, requireLicenseService, (request, response) => {
  const parsed = activationSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Dados de ativação inválidos.' });
  const license = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(parsed.data.licenseKey);
  if (!license || !license.user_id) return response.status(404).json({ error: 'Licença não encontrada ou ainda não vinculada a um cliente.' });
  const status = effectiveLicenseStatus(license);
  if (status !== 'active') return response.status(403).json({ error: `Licença ${status}.`, status });
  if (!license.product.toLowerCase().includes('pdv')) return response.status(409).json({ error: 'Esta licença não pertence ao 4Byts PDV.' });

  const existing = db.prepare('SELECT * FROM devices WHERE license_id = ? AND device_id = ?').get(license.id, parsed.data.instanceId);
  const activeDevices = db.prepare('SELECT COUNT(*) AS count FROM devices WHERE license_id = ?').get(license.id).count;
  if (!existing && activeDevices >= license.max_devices) {
    return response.status(409).json({ error: 'Limite de instalações atingido para esta licença.' });
  }

  const activationToken = randomBytes(48).toString('base64url');
  const tokenHash = hashActivationToken(activationToken);
  if (existing) {
    db.prepare(`
      UPDATE devices SET device_name = ?, company_document = ?, activation_token_hash = ?,
        last_seen_at = datetime('now'), last_ip = ? WHERE id = ?
    `).run(parsed.data.companyName, parsed.data.companyDocument, tokenHash, request.ip, existing.id);
  } else {
    db.prepare(`
      INSERT INTO devices (license_id, device_id, device_name, company_document, activation_token_hash, last_ip)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(license.id, parsed.data.instanceId, parsed.data.companyName, parsed.data.companyDocument, tokenHash, request.ip);
  }
  db.prepare("UPDATE licenses SET activated_at = COALESCE(activated_at, datetime('now')) WHERE id = ?").run(license.id);
  response.status(existing ? 200 : 201).json({ activationToken, license: licenseEntitlement({ ...license, status }) });
});

app.post('/api/v1/licenses/validate', activationLimiter, requireLicenseService, (request, response) => {
  const parsed = validationSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Token de ativação inválido.' });
  const device = db.prepare(`
    SELECT devices.id AS device_row_id, devices.device_id, devices.company_document, licenses.*
    FROM devices JOIN licenses ON licenses.id = devices.license_id
    WHERE devices.activation_token_hash = ?
  `).get(hashActivationToken(parsed.data.activationToken));
  if (!device) return response.status(401).json({ valid: false, error: 'Ativação não encontrada.' });
  const status = effectiveLicenseStatus(device);
  db.prepare("UPDATE devices SET last_seen_at = datetime('now'), last_ip = ? WHERE id = ?").run(request.ip, device.device_row_id);
  if (status !== 'active') return response.status(403).json({ valid: false, status, license: licenseEntitlement({ ...device, status }) });
  response.json({ valid: true, license: licenseEntitlement({ ...device, status }) });
});

app.post('/api/auth/register', authLimiter, async (request, response) => {
  const parsed = registerSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Revise os dados informados.' });
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(parsed.data.email);
  if (existing) return response.status(409).json({ error: 'Este e-mail já possui uma conta.' });

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const result = db.prepare(`
    INSERT INTO users (name, email, company, password_hash) VALUES (?, ?, ?, ?)
  `).run(parsed.data.name, parsed.data.email, parsed.data.company || null, passwordHash);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  const session = createSession(user.id, request);
  setSessionCookie(response, session);
  response.status(201).json({ user: publicUser(user) });
});

app.post('/api/auth/login', authLimiter, async (request, response) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'E-mail ou senha inválidos.' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(parsed.data.email);
  const validPassword = user && await bcrypt.compare(parsed.data.password, user.password_hash);
  if (!validPassword) return response.status(401).json({ error: 'E-mail ou senha inválidos.' });
  const session = createSession(user.id, request);
  setSessionCookie(response, session);
  response.json({ user: publicUser(user) });
});

app.post('/api/auth/logout', (request, response) => {
  destroySession(request);
  clearSessionCookie(response);
  response.status(204).end();
});

app.get('/api/auth/me', requireAuth, (request, response) => {
  response.json({ user: publicUser(request.user) });
});

app.get('/api/licenses', requireAuth, (request, response) => {
  const licenses = db.prepare(`
    SELECT licenses.*,
      (SELECT COUNT(*) FROM devices WHERE devices.license_id = licenses.id) AS device_count
    FROM licenses WHERE user_id = ? ORDER BY created_at DESC
  `).all(request.user.id).map(license => ({
    id: license.id,
    key: license.license_key,
    product: license.product,
    plan: license.plan,
    status: license.status,
    maxDevices: license.max_devices,
    deviceCount: license.device_count,
    expiresAt: license.expires_at,
    activatedAt: license.activated_at,
    createdAt: license.created_at
  }));
  response.json({ licenses });
});

app.post('/api/licenses/claim', requireAuth, (request, response) => {
  const parsed = z.object({ key: z.string().trim().min(8).max(100).transform(value => value.toUpperCase()) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Informe uma chave válida.' });
  const license = db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(parsed.data.key);
  if (!license) return response.status(404).json({ error: 'Licença não encontrada.' });
  if (license.user_id && license.user_id !== request.user.id) return response.status(409).json({ error: 'Esta licença já pertence a outra conta.' });
  if (['revoked', 'suspended'].includes(license.status)) return response.status(409).json({ error: 'Esta licença não pode ser vinculada.' });
  db.prepare("UPDATE licenses SET user_id = ?, activated_at = COALESCE(activated_at, datetime('now')) WHERE id = ?").run(request.user.id, license.id);
  response.json({ message: 'Licença vinculada com sucesso.' });
});

app.get('/api/admin/users', requireAuth, requireAdmin, (_request, response) => {
  const users = db.prepare(`
    SELECT id, name, email, company, role, created_at,
      (SELECT COUNT(*) FROM licenses WHERE licenses.user_id = users.id) AS license_count
    FROM users ORDER BY created_at DESC
  `).all();
  response.json({ users });
});

app.post('/api/admin/users', requireAuth, requireAdmin, async (request, response) => {
  const parsed = adminUserSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Revise os dados do cliente.' });
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(parsed.data.email);
  if (existing) return response.status(409).json({ error: 'Este e-mail já possui uma conta.' });
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const result = db.prepare(`
    INSERT INTO users (name, email, company, password_hash, role) VALUES (?, ?, ?, ?, ?)
  `).run(parsed.data.name, parsed.data.email, parsed.data.company || null, passwordHash, parsed.data.role);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  response.status(201).json({ user: publicUser(user) });
});

app.patch('/api/admin/users/:id', requireAuth, requireAdmin, async (request, response) => {
  const id = Number(request.params.id);
  const parsed = adminUserUpdateSchema.safeParse(request.body);
  if (!Number.isSafeInteger(id) || !parsed.success) return response.status(400).json({ error: 'Revise os dados da conta.' });
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!existing) return response.status(404).json({ error: 'Conta não encontrada.' });
  if (id === request.user.id && parsed.data.role !== 'admin') return response.status(409).json({ error: 'Você não pode remover sua própria permissão de administrador.' });
  const emailOwner = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(parsed.data.email, id);
  if (emailOwner) return response.status(409).json({ error: 'Este e-mail já pertence a outra conta.' });
  const passwordHash = parsed.data.password ? await bcrypt.hash(parsed.data.password, 12) : existing.password_hash;
  db.prepare(`
    UPDATE users SET name = ?, email = ?, company = ?, role = ?, password_hash = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(parsed.data.name, parsed.data.email, parsed.data.company || null, parsed.data.role, passwordHash, id);
  if (parsed.data.password) db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(id, request.user.session_id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  response.json({ user: publicUser(user), message: 'Conta atualizada com sucesso.' });
});

app.get('/api/admin/licenses', requireAuth, requireAdmin, (_request, response) => {
  const licenses = db.prepare(`
    SELECT licenses.*, users.name AS customer_name, users.email AS customer_email
    FROM licenses LEFT JOIN users ON users.id = licenses.user_id ORDER BY licenses.created_at DESC
  `).all();
  response.json({ licenses });
});

app.post('/api/admin/licenses', requireAuth, requireAdmin, (request, response) => {
  const parsed = adminLicenseSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Revise os dados da licença.' });
  const user = parsed.data.email ? db.prepare('SELECT id FROM users WHERE email = ?').get(parsed.data.email.toLowerCase()) : null;
  if (parsed.data.email && !user) return response.status(404).json({ error: 'Cliente não encontrado.' });
  const productCode = parsed.data.product.toUpperCase().includes('PDV') ? 'PDV' : 'SYS';
  const key = `4B-${productCode}-${randomBytes(3).toString('hex').toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
  const result = db.prepare(`
    INSERT INTO licenses (license_key, user_id, product, plan, max_devices, expires_at, activated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(key, user?.id || null, parsed.data.product, parsed.data.plan, parsed.data.maxDevices, parsed.data.expiresAt || null, user ? new Date().toISOString() : null);
  response.status(201).json({ id: Number(result.lastInsertRowid), key });
});

app.patch('/api/admin/licenses/:id', requireAuth, requireAdmin, (request, response) => {
  const id = Number(request.params.id);
  const parsed = adminLicenseUpdateSchema.safeParse(request.body);
  if (!Number.isSafeInteger(id) || !parsed.success) return response.status(400).json({ error: 'Revise os dados da licença.' });
  const existing = db.prepare('SELECT id FROM licenses WHERE id = ?').get(id);
  if (!existing) return response.status(404).json({ error: 'Licença não encontrada.' });
  const normalizedEmail = parsed.data.email?.toLowerCase() || '';
  const user = normalizedEmail ? db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail) : null;
  if (normalizedEmail && !user) return response.status(404).json({ error: 'Cliente não encontrado.' });
  db.prepare(`
    UPDATE licenses SET user_id = ?, product = ?, plan = ?, status = ?, max_devices = ?, expires_at = ?,
      activated_at = CASE WHEN ? IS NOT NULL THEN COALESCE(activated_at, datetime('now')) ELSE activated_at END
    WHERE id = ?
  `).run(user?.id || null, parsed.data.product, parsed.data.plan, parsed.data.status, parsed.data.maxDevices, parsed.data.expiresAt || null, user?.id || null, id);
  response.json({ message: 'Licença atualizada com sucesso.' });
});

app.use('/api', (_request, response) => response.status(404).json({ error: 'Rota não encontrada.' }));
app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: 'Erro interno. Tente novamente.' });
});

cleanupExpiredSessions();
setInterval(cleanupExpiredSessions, 6 * 60 * 60 * 1000).unref();

app.listen(port, host, () => console.log(`4Byts API disponível em http://${host}:${port}`));
