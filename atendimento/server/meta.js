import { createHmac, timingSafeEqual } from 'node:crypto';
import { decryptSecret } from './secrets.js';

const graphVersion = process.env.WHATSAPP_GRAPH_VERSION || 'v25.0';
const graphBaseUrl = (process.env.WHATSAPP_GRAPH_BASE_URL || 'https://graph.facebook.com').replace(/\/$/, '');

export function validWebhookSignature(rawBody, signature) {
  const appSecret = process.env.WHATSAPP_APP_SECRET || '';
  if (!appSecret || !signature?.startsWith('sha256=')) return false;
  const expected = Buffer.from(createHmac('sha256', appSecret).update(rawBody).digest('hex'));
  const received = Buffer.from(signature.slice(7));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function sendText(channel, recipient, text) {
  const response = await fetch(`${graphBaseUrl}/${graphVersion}/${encodeURIComponent(channel.phone_number_id)}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${decryptSecret(channel.access_token_encrypted)}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: recipient, type: 'text', text: { preview_url: false, body: text } })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `A Meta recusou a mensagem (${response.status}).`);
  return payload.messages?.[0]?.id || null;
}
