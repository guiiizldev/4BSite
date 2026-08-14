import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const serviceKey = '4byts-license-test-key-with-at-least-32-characters';
const tempDirectory = mkdtempSync(join(tmpdir(), '4byts-license-test-'));
const databasePath = join(tempDirectory, 'licenses.db');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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

async function waitForHealth(baseUrl, child, output) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`A API encerrou com código ${child.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`A API não iniciou em ${baseUrl}. Saída: ${output() || '(vazia)'}`);
}

async function post(baseUrl, path, body, key = serviceKey) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-4byts-service-key': key },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

const port = await availablePort();
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server/index.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: String(port),
    DATABASE_PATH: databasePath,
    LICENSE_SERVICE_API_KEY: serviceKey
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverOutput = '';
child.stdout.on('data', chunk => { serverOutput += chunk; });
child.stderr.on('data', chunk => { serverOutput += chunk; });

try {
  await waitForHealth(baseUrl, child, () => serverOutput.trim());
  const database = new Database(databasePath);
  const user = database.prepare(`
    INSERT INTO users (name, email, company, password_hash) VALUES (?, ?, ?, ?)
  `).run('Cliente Teste', 'cliente@teste.local', 'Empresa Teste', bcrypt.hashSync('SenhaCliente123!', 4));
  database.prepare(`
    INSERT INTO licenses (license_key, user_id, product, plan, status, max_devices)
    VALUES (?, ?, '4Byts PDV', 'Profissional', 'active', 1)
  `).run('4BYTS-TESTE-0001', user.lastInsertRowid);
  database.prepare(`
    INSERT INTO users (name, email, company, password_hash, role) VALUES (?, ?, ?, ?, 'admin')
  `).run('Administrador Teste', 'admin@teste.local', '4Byts', bcrypt.hashSync('SenhaTeste123!', 4));

  const unauthorized = await post(baseUrl, '/api/v1/licenses/activate', {
    licenseKey: '4BYTS-TESTE-0001', instanceId: 'pdv:11222333000181', companyName: 'Empresa Teste', companyDocument: '11222333000181'
  }, 'wrong-key-with-at-least-thirty-two-characters');
  assert(unauthorized.status === 401, 'A central aceitou uma credencial de serviço incorreta.');

  const activation = await post(baseUrl, '/api/v1/licenses/activate', {
    licenseKey: '4BYTS-TESTE-0001', instanceId: 'pdv:11222333000181', companyName: 'Empresa Teste', companyDocument: '11222333000181'
  });
  assert(activation.status === 201, `Ativação falhou: ${JSON.stringify(activation.body)}`);
  assert(activation.body.activationToken?.length >= 32, 'Token de ativação não foi emitido.');

  const validation = await post(baseUrl, '/api/v1/licenses/validate', { activationToken: activation.body.activationToken });
  assert(validation.status === 200 && validation.body.valid === true, 'Licença ativa não foi validada.');

  const deviceLimit = await post(baseUrl, '/api/v1/licenses/activate', {
    licenseKey: '4BYTS-TESTE-0001', instanceId: 'pdv:99888777000166', companyName: 'Outra Empresa', companyDocument: '99888777000166'
  });
  assert(deviceLimit.status === 409, 'O limite de instalações não foi aplicado.');

  const unauthenticatedDevices = await fetch(`${baseUrl}/api/admin/licenses/1/devices`);
  assert(unauthenticatedDevices.status === 401, 'A lista de instalações ficou acessível sem login.');

  const customerLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'cliente@teste.local', password: 'SenhaCliente123!' })
  });
  const customerCookie = customerLogin.headers.get('set-cookie')?.split(';')[0];
  const customerDevices = await fetch(`${baseUrl}/api/admin/licenses/1/devices`, { headers: { cookie: customerCookie } });
  assert(customerDevices.status === 403, 'Uma conta de cliente acessou o gerenciamento administrativo.');

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@teste.local', password: 'SenhaTeste123!' })
  });
  assert(login.status === 200, 'Não foi possível autenticar o administrador no teste.');
  const adminCookie = login.headers.get('set-cookie')?.split(';')[0];
  assert(adminCookie, 'Cookie administrativo não foi emitido.');

  const devicesResponse = await fetch(`${baseUrl}/api/admin/licenses/1/devices`, { headers: { cookie: adminCookie } });
  const devicesPayload = await devicesResponse.json();
  assert(devicesResponse.status === 200 && devicesPayload.devices.length === 1, 'A instalação ativa não apareceu no painel.');
  const release = await fetch(`${baseUrl}/api/admin/licenses/1/devices/${devicesPayload.devices[0].id}/release`, {
    method: 'PATCH', headers: { cookie: adminCookie, 'content-type': 'application/json' }
  });
  assert(release.status === 200, 'O administrador não conseguiu liberar a instalação.');

  const releasedToken = await post(baseUrl, '/api/v1/licenses/validate', { activationToken: activation.body.activationToken });
  assert(releasedToken.status === 401 && releasedToken.body.valid === false, 'O token liberado continuou válido.');

  const reactivation = await post(baseUrl, '/api/v1/licenses/activate', {
    licenseKey: '4BYTS-TESTE-0001', instanceId: 'pdv:11222333000181', companyName: 'Empresa Teste', companyDocument: '11222333000181'
  });
  assert(reactivation.status === 200 && reactivation.body.activationToken, 'A instalação liberada não pôde ser reativada.');

  const activeDevicesResponse = await fetch(`${baseUrl}/api/admin/licenses/1/devices`, { headers: { cookie: adminCookie } });
  const activeDevicesPayload = await activeDevicesResponse.json();
  await fetch(`${baseUrl}/api/admin/licenses/1/devices/${activeDevicesPayload.devices[0].id}/release`, {
    method: 'PATCH', headers: { cookie: adminCookie, 'content-type': 'application/json' }
  });
  const replacement = await post(baseUrl, '/api/v1/licenses/activate', {
    licenseKey: '4BYTS-TESTE-0001', instanceId: 'pdv:99888777000166', companyName: 'Outra Empresa', companyDocument: '99888777000166'
  });
  assert(replacement.status === 201, 'Uma nova instalação não ocupou a vaga liberada.');
  const oldDeviceReturn = await post(baseUrl, '/api/v1/licenses/activate', {
    licenseKey: '4BYTS-TESTE-0001', instanceId: 'pdv:11222333000181', companyName: 'Empresa Teste', companyDocument: '11222333000181'
  });
  assert(oldDeviceReturn.status === 409, 'Uma instalação antiga ultrapassou o limite ao tentar retornar.');

  database.prepare("UPDATE licenses SET status = 'revoked' WHERE license_key = ?").run('4BYTS-TESTE-0001');
  const revoked = await post(baseUrl, '/api/v1/licenses/validate', { activationToken: replacement.body.activationToken });
  assert(revoked.status === 403 && revoked.body.valid === false && revoked.body.status === 'revoked', 'A revogação não bloqueou a licença.');
  database.close();

  console.log('Fluxo de licenças aprovado: ativação, limite, liberação administrativa, reativação e revogação.');
} catch (error) {
  if (serverOutput.trim()) console.error(serverOutput.trim());
  throw error;
} finally {
  child.kill();
  await new Promise(resolve => child.once('exit', resolve));
  rmSync(tempDirectory, { recursive: true, force: true });
}
