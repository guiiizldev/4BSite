import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const serviceKey = '4byts-ip-test-key-with-at-least-32-characters';
const tempDirectory = mkdtempSync(join(tmpdir(), '4byts-ip-test-'));
const databasePath = join(tempDirectory, 'ip-approval.db');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function availablePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function post(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-4byts-service-key': serviceKey },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

const port = await availablePort();
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server/index.js'], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port), DATABASE_PATH: databasePath, LICENSE_SERVICE_API_KEY: serviceKey, LICENSE_REQUIRE_IP_APPROVAL: 'true' },
  stdio: ['ignore', 'pipe', 'pipe']
});

let output = '';
child.stdout.on('data', chunk => { output += chunk; });
child.stderr.on('data', chunk => { output += chunk; });

try {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(`${baseUrl}/api/health`)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const database = new Database(databasePath);
  const user = database.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run('Cliente IP', 'ip@teste.local', bcrypt.hashSync('SenhaTeste123!', 4));
  database.prepare(`INSERT INTO licenses (license_key, user_id, product, plan) VALUES (?, ?, '4Byts PDV', 'Profissional')`)
    .run('4BYTS-IP-TESTE', user.lastInsertRowid);
  const activationBody = { licenseKey: '4BYTS-IP-TESTE', instanceId: 'pdv:12345678000190', companyName: 'Empresa IP', companyDocument: '12345678000190', sourceIp: '203.0.113.10' };
  const pending = await post(baseUrl, '/api/v1/licenses/activate', activationBody);
  assert(pending.status === 403 && pending.body.status === 'pending_approval', 'Nova instalação não ficou pendente.');
  const device = database.prepare('SELECT * FROM devices WHERE device_id = ?').get(activationBody.instanceId);
  assert(device?.requested_ip === activationBody.sourceIp, 'IP solicitado não foi registrado.');
  database.prepare("UPDATE devices SET approval_status = 'approved', ip_enforced = 1, approved_at = datetime('now') WHERE id = ?").run(device.id);
  database.prepare('INSERT INTO device_allowed_ips (device_id, ip_address) VALUES (?, ?)').run(device.id, activationBody.sourceIp);
  const approved = await post(baseUrl, '/api/v1/licenses/activate', activationBody);
  assert(approved.status === 200 && approved.body.activationToken, 'Máquina aprovada não conseguiu ativar.');
  const denied = await post(baseUrl, '/api/v1/licenses/validate', { activationToken: approved.body.activationToken, sourceIp: '203.0.113.11' });
  assert(denied.status === 403 && denied.body.status === 'ip_not_allowed', 'IP diferente não foi bloqueado.');
  database.prepare('INSERT INTO device_allowed_ips (device_id, ip_address) VALUES (?, ?)').run(device.id, '203.0.113.11');
  const allowed = await post(baseUrl, '/api/v1/licenses/validate', { activationToken: approved.body.activationToken, sourceIp: '203.0.113.11' });
  assert(allowed.status === 200 && allowed.body.valid, 'Novo IP aprovado não conseguiu validar.');
  database.close();
  console.log('Aprovação de máquina/IP aprovada: pendência, liberação, bloqueio e novo IP.');
} catch (error) {
  if (output.trim()) console.error(output.trim());
  throw error;
} finally {
  child.kill();
  await new Promise(resolve => child.once('exit', resolve));
  rmSync(tempDirectory, { recursive: true, force: true });
}
