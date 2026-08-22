import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const availablePort = () => new Promise((resolve, reject) => { const server = net.createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
const directory = mkdtempSync(join(tmpdir(), '4byts-atendimento-app-'));
const databasePath = join(directory, 'atendimento.db');
const appSecret = 'meta-app-secret-for-tests';
const serviceKey = 'central-service-key-with-more-than-32-characters';
const mockPort = await availablePort();
const appPort = await availablePort();

const central = createServer((request, response) => {
  response.setHeader('content-type', 'application/json');
  if (request.url === '/v25.0/1234567890/messages') {
    response.statusCode = 200;
    return response.end(JSON.stringify({ messages: [{ id: `wamid.test.${Date.now()}` }] }));
  }
  if (request.headers['x-4byts-service-key'] !== serviceKey) return response.end(JSON.stringify({ error: 'invalid service key' }));
  let body = '';
  request.on('data', chunk => { body += chunk; });
  request.on('end', () => {
    const payload = JSON.parse(body || '{}');
    if (request.url === '/api/v1/auth/product-login' && payload.email === 'cliente@teste.local' && payload.password === 'Senha123!' && payload.productCode === 'atendimento') {
      response.statusCode = 200;
      return response.end(JSON.stringify({ user: { id: 7, name: 'Cliente Teste', email: payload.email, company: 'Empresa Teste' }, licenseKey: '4B-WPP-TESTE-0001', license: { status: 'active' } }));
    }
    if (request.url === '/api/v1/licenses/entitlement' && payload.licenseKey === '4B-WPP-TESTE-0001') {
      response.statusCode = 200;
      return response.end(JSON.stringify({ valid: true, status: 'active' }));
    }
    response.statusCode = 401;
    response.end(JSON.stringify({ error: 'E-mail ou senha inválidos.' }));
  });
});
await new Promise(resolve => central.listen(mockPort, '127.0.0.1', resolve));

const child = spawn(process.execPath, ['atendimento/server/index.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'test',
    ATENDIMENTO_HOST: '127.0.0.1',
    ATENDIMENTO_PORT: String(appPort),
    ATENDIMENTO_DATABASE_PATH: databasePath,
    ATENDIMENTO_ENCRYPTION_KEY: 'encryption-key-for-tests-with-more-than-32-characters',
    CENTRAL_API_URL: `http://127.0.0.1:${mockPort}`,
    LICENSE_SERVICE_API_KEY: serviceKey,
    WHATSAPP_VERIFY_TOKEN: 'verify-token-test',
    WHATSAPP_APP_SECRET: appSecret,
    WHATSAPP_GRAPH_BASE_URL: `http://127.0.0.1:${mockPort}`
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let output = '';
child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });

try {
  const baseUrl = `http://127.0.0.1:${appPort}`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(`${baseUrl}/api/health`)).ok) break; } catch {}
    if (attempt === 79) throw new Error(`O Atendimento não iniciou. ${output}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const login = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'cliente@teste.local', password: 'Senha123!' }) });
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  assert(login.status === 200 && cookie, 'O login central do Atendimento falhou.');
  const channel = await fetch(`${baseUrl}/api/settings/channel`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ phoneNumberId: '1234567890', wabaId: '99887766', displayPhone: '+55 11 99999-9999', accessToken: 'token-meta-ultrassecreto' }) });
  assert(channel.status === 200, 'A configuração do canal oficial falhou.');
  const settings = await fetch(`${baseUrl}/api/settings`, { headers: { cookie } });
  const settingsPayload = await settings.json();
  assert(settings.status === 200 && settingsPayload.channel.phoneNumberId === '1234567890' && !JSON.stringify(settingsPayload).includes('token-meta'), 'O painel expôs ou perdeu a configuração do canal.');
  const verification = await fetch(`${baseUrl}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-token-test&hub.challenge=12345`);
  assert(verification.status === 200 && await verification.text() === '12345', 'A verificação do webhook falhou.');
  const webhookBody = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
  const signature = `sha256=${createHmac('sha256', appSecret).update(webhookBody).digest('hex')}`;
  const webhook = await fetch(`${baseUrl}/webhooks/whatsapp`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature }, body: webhookBody });
  assert(webhook.status === 200, 'O webhook assinado da Meta não foi aceito.');
  const invalidWebhook = await fetch(`${baseUrl}/webhooks/whatsapp`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=invalid' }, body: webhookBody });
  assert(invalidWebhook.status === 401, 'Um webhook sem assinatura válida foi aceito.');
  const incomingBody = JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: '1234567890' }, contacts: [{ wa_id: '5511999999999', profile: { name: 'Maria Cliente' } }], messages: [{ id: 'wamid.inbound.1', from: '5511999999999', type: 'text', text: { body: '1' } }] } }] }] });
  const incomingSignature = `sha256=${createHmac('sha256', appSecret).update(incomingBody).digest('hex')}`;
  const incoming = await fetch(`${baseUrl}/webhooks/whatsapp`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': incomingSignature }, body: incomingBody });
  assert(incoming.status === 200, 'A mensagem recebida da Meta não foi aceita.');
  await new Promise(resolve => setTimeout(resolve, 200));
  const conversationsResponse = await fetch(`${baseUrl}/api/conversations?status=waiting`, { headers: { cookie } });
  const conversations = await conversationsResponse.json();
  assert(conversationsResponse.status === 200 && conversations.conversations.length === 1 && conversations.conversations[0].department === 'comercial', 'A triagem não encaminhou o contato para a fila Comercial.');
  const conversationId = conversations.conversations[0].id;
  const historyResponse = await fetch(`${baseUrl}/api/conversations/${conversationId}/messages`, { headers: { cookie } });
  const history = await historyResponse.json();
  assert(history.messages.length === 2 && history.messages.some(item => item.senderType === 'bot'), 'A resposta automática não foi registrada no histórico.');
  const assign = await fetch(`${baseUrl}/api/conversations/${conversationId}/assign`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}' });
  assert(assign.status === 200, 'O atendente não conseguiu assumir a conversa.');
  const humanReply = await fetch(`${baseUrl}/api/conversations/${conversationId}/messages`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ content: 'Olá, vou continuar seu atendimento.' }) });
  assert(humanReply.status === 201, 'O atendente não conseguiu responder pelo painel.');
  const database = new Database(databasePath, { readonly: true });
  const savedChannel = database.prepare('SELECT access_token_encrypted FROM channels').get();
  database.close();
  assert(savedChannel && !savedChannel.access_token_encrypted.includes('token-meta-ultrassecreto'), 'O token da Meta não foi criptografado.');
  console.log('4Byts Atendimento aprovado: login central, canal criptografado, painel e webhook oficial protegido.');
} finally {
  child.kill();
  await new Promise(resolve => child.once('exit', resolve));
  await new Promise(resolve => central.close(resolve));
  rmSync(directory, { recursive: true, force: true });
}
