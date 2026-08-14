import { createHash, randomBytes } from 'node:crypto';
import { db } from './db.js';

export const COOKIE_NAME = '4byts_session';
const SESSION_DAYS = 30;

const hashToken = token => createHash('sha256').update(token).digest('hex');

export function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    company: user.company,
    role: user.role,
    createdAt: user.created_at
  };
}

export function createSession(userId, request) {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  db.prepare(`
    INSERT INTO sessions (user_id, token_hash, expires_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, tokenHash, expiresAt.toISOString(), request.ip, request.get('user-agent')?.slice(0, 300));
  return { token, expiresAt };
}

export function setSessionCookie(response, session) {
  response.cookie(COOKIE_NAME, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    expires: session.expiresAt
  });
}

export function clearSessionCookie(response) {
  response.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  });
}

export function readSession(request) {
  const token = request.cookies?.[COOKIE_NAME];
  if (!token) return null;
  return db.prepare(`
    SELECT users.*, sessions.id AS session_id
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > datetime('now')
  `).get(hashToken(token));
}

export function destroySession(request) {
  const token = request.cookies?.[COOKIE_NAME];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

export function requireAuth(request, response, next) {
  const user = readSession(request);
  if (!user) return response.status(401).json({ error: 'Faça login para continuar.' });
  request.user = user;
  next();
}

export function requireAdmin(request, response, next) {
  if (request.user?.role !== 'admin') return response.status(403).json({ error: 'Acesso restrito à equipe 4Byts.' });
  next();
}
