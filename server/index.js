import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { randomBytes } from 'node:crypto';
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

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', service: '4byts-api', time: new Date().toISOString() });
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

app.use('/api', (_request, response) => response.status(404).json({ error: 'Rota não encontrada.' }));
app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: 'Erro interno. Tente novamente.' });
});

cleanupExpiredSessions();
setInterval(cleanupExpiredSessions, 6 * 60 * 60 * 1000).unref();

app.listen(port, host, () => console.log(`4Byts API disponível em http://${host}:${port}`));
