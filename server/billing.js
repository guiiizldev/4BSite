import { Router } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { requireAdmin, requireAuth } from './auth.js';
import { auditAction, db } from './db.js';

const paidStatuses = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']);
const ignoredStatuses = new Set(['DELETED', 'CANCELED']);
const billingProfileSchema = z.object({
  cpfCnpj: z.string().transform(value => value.replace(/\D/g, '')).refine(value => [11, 14].includes(value.length)),
  phone: z.string().transform(value => value.replace(/\D/g, '')).refine(value => value.length >= 10 && value.length <= 11)
});
const subscribeSchema = billingProfileSchema.extend({
  licenseId: z.number().int().positive(),
  planId: z.number().int().positive(),
  billingType: z.enum(['PIX', 'BOLETO']),
  nextDueDate: z.string().date()
});
const planSchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(2).max(80),
  product: z.string().trim().min(2).max(80).default('4Byts PDV'),
  priceCents: z.number().int().positive(),
  cycle: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUALLY', 'YEARLY']).default('MONTHLY'),
  active: z.boolean().default(true)
});

class AsaasError extends Error {
  constructor(status, payload) {
    const providerMessage = payload?.errors?.map(item => item.description).filter(Boolean).join(' ') || payload?.message;
    super(providerMessage || `O Asaas recusou a operação (${status}).`);
    this.status = status;
  }
}

function secureEquals(expected, received) {
  const left = Buffer.from(expected || '');
  const right = Buffer.from(received || '');
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

function asaasConfigured() {
  return Boolean(process.env.ASAAS_API_KEY && process.env.ASAAS_API_KEY.length >= 20);
}

async function asaasRequest(path, options = {}) {
  if (!asaasConfigured()) throw new AsaasError(503, { message: 'Integração Asaas ainda não configurada.' });
  const baseUrl = (process.env.ASAAS_API_URL || 'https://api-sandbox.asaas.com/v3').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers: {
      accept: 'application/json',
      access_token: process.env.ASAAS_API_KEY,
      ...(options.body ? { 'content-type': 'application/json' } : {})
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new AsaasError(response.status, payload);
  return payload;
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T23:59:59.999Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function upsertPayment(subscriptionId, payment, pix = null) {
  if (!payment?.id) return;
  const valueCents = Math.round(Number(payment.value || 0) * 100);
  db.prepare(`
    INSERT INTO billing_payments
      (subscription_id, provider_payment_id, status, value_cents, due_date, paid_at, invoice_url, bank_slip_url, pix_payload, pix_encoded_image)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider_payment_id) DO UPDATE SET
      status = excluded.status, value_cents = excluded.value_cents, due_date = excluded.due_date,
      paid_at = excluded.paid_at, invoice_url = excluded.invoice_url, bank_slip_url = excluded.bank_slip_url,
      pix_payload = COALESCE(excluded.pix_payload, billing_payments.pix_payload),
      pix_encoded_image = COALESCE(excluded.pix_encoded_image, billing_payments.pix_encoded_image),
      updated_at = datetime('now')
  `).run(
    subscriptionId,
    payment.id,
    payment.status || 'PENDING',
    valueCents,
    payment.dueDate || null,
    payment.paymentDate || payment.confirmedDate || null,
    payment.invoiceUrl || null,
    payment.bankSlipUrl || null,
    pix?.payload || null,
    pix?.encodedImage || null
  );
}

function recomputeLicenseBilling(subscriptionId) {
  const subscription = db.prepare('SELECT license_id FROM billing_subscriptions WHERE id = ?').get(subscriptionId);
  if (!subscription) return;
  const payments = db.prepare(`
    SELECT status, due_date FROM billing_payments WHERE subscription_id = ? ORDER BY due_date ASC
  `).all(subscriptionId);
  const open = payments.filter(payment => !paidStatuses.has(payment.status) && !ignoredStatuses.has(payment.status));
  const overdue = open.find(payment => ['OVERDUE', 'REFUNDED', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE'].includes(payment.status));
  const current = overdue || open[0];
  const billingStatus = overdue ? 'overdue' : current ? 'pending' : payments.length ? 'paid' : 'pending';
  const graceUntil = current?.due_date ? addDays(current.due_date, 5) : null;
  db.prepare(`
    UPDATE licenses SET billing_enforced = 1, billing_status = ?, billing_grace_until = ? WHERE id = ?
  `).run(billingStatus, graceUntil, subscription.license_id);
  db.prepare(`
    UPDATE billing_subscriptions SET status = ?, next_due_date = ?, updated_at = datetime('now') WHERE id = ?
  `).run(billingStatus, current?.due_date || null, subscriptionId);
}

async function syncSubscriptionPayments(subscription) {
  const payload = await asaasRequest(`/subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}/payments?limit=100`);
  for (const payment of payload.data || []) {
    let pix = null;
    if (subscription.billing_type === 'PIX' && !paidStatuses.has(payment.status)) {
      try { pix = await asaasRequest(`/payments/${encodeURIComponent(payment.id)}/pixQrCode`); } catch (error) {
        if (!(error instanceof AsaasError) || error.status >= 500) throw error;
      }
    }
    upsertPayment(subscription.id, payment, pix);
  }
  recomputeLicenseBilling(subscription.id);
}

async function ensureProviderCustomer(user, profile) {
  if (profile.provider_customer_id) return profile.provider_customer_id;
  const customer = await asaasRequest('/customers', {
    method: 'POST',
    body: {
      name: user.company || user.name,
      cpfCnpj: profile.cpf_cnpj,
      email: user.email,
      mobilePhone: profile.phone,
      externalReference: `4byts-user-${user.id}`
    }
  });
  db.prepare('UPDATE billing_profiles SET provider_customer_id = ?, updated_at = datetime(\'now\') WHERE user_id = ?')
    .run(customer.id, user.id);
  return customer.id;
}

function customerBilling(userId) {
  const subscription = db.prepare(`
    SELECT subscriptions.*, plans.code AS plan_code, plans.name AS plan_name, plans.product,
      plans.price_cents, plans.cycle, licenses.license_key, licenses.billing_status, licenses.billing_grace_until
    FROM billing_subscriptions subscriptions
    JOIN billing_plans plans ON plans.id = subscriptions.plan_id
    JOIN licenses ON licenses.id = subscriptions.license_id
    WHERE subscriptions.user_id = ? ORDER BY subscriptions.created_at DESC LIMIT 1
  `).get(userId);
  if (!subscription) return { subscription: null, payments: [] };
  const payments = db.prepare(`
    SELECT provider_payment_id AS id, status, value_cents AS valueCents, due_date AS dueDate,
      paid_at AS paidAt, invoice_url AS invoiceUrl, bank_slip_url AS bankSlipUrl,
      pix_payload AS pixPayload, pix_encoded_image AS pixEncodedImage
    FROM billing_payments WHERE subscription_id = ? ORDER BY due_date DESC
  `).all(subscription.id);
  return { subscription, payments };
}

export const billingRouter = Router();

billingRouter.get('/billing/plans', requireAuth, (_request, response) => {
  const plans = db.prepare('SELECT * FROM billing_plans WHERE active = 1 ORDER BY price_cents').all();
  response.json({ plans, providerConfigured: asaasConfigured(), environment: process.env.ASAAS_API_URL?.includes('sandbox') || !process.env.ASAAS_API_URL ? 'sandbox' : 'production' });
});

billingRouter.get('/billing', requireAuth, (request, response) => {
  response.json(customerBilling(request.user.id));
});

billingRouter.put('/billing/profile', requireAuth, (request, response) => {
  const parsed = billingProfileSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Informe CPF/CNPJ e telefone válidos.' });
  db.prepare(`
    INSERT INTO billing_profiles (user_id, cpf_cnpj, phone) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET cpf_cnpj = excluded.cpf_cnpj, phone = excluded.phone, updated_at = datetime('now')
  `).run(request.user.id, parsed.data.cpfCnpj, parsed.data.phone);
  response.json({ message: 'Dados de cobrança atualizados.' });
});

billingRouter.post('/billing/subscribe', requireAuth, async (request, response, next) => {
  const parsed = subscribeSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Revise os dados da assinatura.' });
  const license = db.prepare('SELECT * FROM licenses WHERE id = ? AND user_id = ?').get(parsed.data.licenseId, request.user.id);
  const plan = db.prepare('SELECT * FROM billing_plans WHERE id = ? AND active = 1').get(parsed.data.planId);
  if (!license) return response.status(404).json({ error: 'Licença não encontrada.' });
  if (!plan || plan.price_cents <= 0) return response.status(409).json({ error: 'Plano indisponível para assinatura.' });
  if (db.prepare('SELECT id FROM billing_subscriptions WHERE license_id = ?').get(license.id)) {
    return response.status(409).json({ error: 'Esta licença já possui uma assinatura.' });
  }
  try {
    db.prepare(`
      INSERT INTO billing_profiles (user_id, cpf_cnpj, phone) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET cpf_cnpj = excluded.cpf_cnpj, phone = excluded.phone, updated_at = datetime('now')
    `).run(request.user.id, parsed.data.cpfCnpj, parsed.data.phone);
    const profile = db.prepare('SELECT * FROM billing_profiles WHERE user_id = ?').get(request.user.id);
    const customerId = await ensureProviderCustomer(request.user, profile);
    const providerSubscription = await asaasRequest('/subscriptions', {
      method: 'POST',
      body: {
        customer: customerId,
        billingType: parsed.data.billingType,
        value: plan.price_cents / 100,
        nextDueDate: parsed.data.nextDueDate,
        cycle: plan.cycle,
        description: `${plan.name} — ${plan.product}`,
        externalReference: `4byts-license-${license.id}`
      }
    });
    const result = db.prepare(`
      INSERT INTO billing_subscriptions
        (user_id, license_id, plan_id, provider_subscription_id, billing_type, status, next_due_date)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `).run(request.user.id, license.id, plan.id, providerSubscription.id, parsed.data.billingType, parsed.data.nextDueDate);
    const subscription = db.prepare('SELECT * FROM billing_subscriptions WHERE id = ?').get(result.lastInsertRowid);
    await syncSubscriptionPayments(subscription);
    response.status(201).json(customerBilling(request.user.id));
  } catch (error) {
    if (error instanceof AsaasError) return response.status(error.status >= 500 ? 502 : 400).json({ error: error.message });
    next(error);
  }
});

billingRouter.post('/billing/sync', requireAuth, async (request, response, next) => {
  const subscription = db.prepare('SELECT * FROM billing_subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(request.user.id);
  if (!subscription) return response.status(404).json({ error: 'Assinatura não encontrada.' });
  try {
    await syncSubscriptionPayments(subscription);
    response.json(customerBilling(request.user.id));
  } catch (error) {
    if (error instanceof AsaasError) return response.status(error.status >= 500 ? 502 : 400).json({ error: error.message });
    next(error);
  }
});

billingRouter.get('/admin/billing/plans', requireAuth, requireAdmin, (_request, response) => {
  response.json({
    plans: db.prepare('SELECT * FROM billing_plans ORDER BY created_at DESC').all(),
    providerConfigured: asaasConfigured(),
    environment: process.env.ASAAS_API_URL?.includes('sandbox') || !process.env.ASAAS_API_URL ? 'sandbox' : 'production',
    ipApprovalRequired: process.env.LICENSE_REQUIRE_IP_APPROVAL !== 'false',
    billingGraceDays: 5
  });
});

billingRouter.get('/admin/billing/subscriptions', requireAuth, requireAdmin, (_request, response) => {
  const subscriptions = db.prepare(`
    SELECT subscriptions.id, subscriptions.status, subscriptions.billing_type, subscriptions.next_due_date,
      subscriptions.created_at, users.name AS customer_name, users.email AS customer_email,
      licenses.license_key, plans.name AS plan_name, plans.price_cents,
      (SELECT status FROM billing_payments WHERE subscription_id = subscriptions.id ORDER BY due_date DESC, id DESC LIMIT 1) AS payment_status,
      (SELECT due_date FROM billing_payments WHERE subscription_id = subscriptions.id ORDER BY due_date DESC, id DESC LIMIT 1) AS payment_due_date
    FROM billing_subscriptions subscriptions
    JOIN users ON users.id = subscriptions.user_id
    JOIN licenses ON licenses.id = subscriptions.license_id
    JOIN billing_plans plans ON plans.id = subscriptions.plan_id
    ORDER BY subscriptions.created_at DESC
  `).all();
  response.json({ subscriptions });
});

billingRouter.post('/admin/billing/plans', requireAuth, requireAdmin, (request, response) => {
  const parsed = planSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Revise os dados do plano.' });
  try {
    const result = db.prepare(`
      INSERT INTO billing_plans (code, name, product, price_cents, cycle, active) VALUES (?, ?, ?, ?, ?, ?)
    `).run(parsed.data.code, parsed.data.name, parsed.data.product, parsed.data.priceCents, parsed.data.cycle, Number(parsed.data.active));
    auditAction(request.user.id, 'create', 'billing_plan', result.lastInsertRowid, `Plano ${parsed.data.name} criado`);
    response.status(201).json({ id: Number(result.lastInsertRowid) });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return response.status(409).json({ error: 'Já existe um plano com esse código.' });
    throw error;
  }
});

billingRouter.post('/webhooks/asaas', (request, response, next) => {
  const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN || '';
  if (!secureEquals(expectedToken, request.get('asaas-access-token'))) return response.status(401).json({ error: 'Webhook não autorizado.' });
  const parsed = z.object({ id: z.string().min(4), event: z.string().min(3), payment: z.object({ id: z.string().min(3) }).passthrough() }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Evento inválido.' });
  const payloadHash = createHash('sha256').update(JSON.stringify(request.body)).digest('hex');
  try {
    const processEvent = db.transaction(() => {
      const inserted = db.prepare(`
        INSERT OR IGNORE INTO billing_webhook_events (event_id, event_type, payload_hash) VALUES (?, ?, ?)
      `).run(parsed.data.id, parsed.data.event, payloadHash);
      if (!inserted.changes) return false;
      const providerSubscriptionId = parsed.data.payment.subscription;
      if (providerSubscriptionId) {
        const subscription = db.prepare('SELECT * FROM billing_subscriptions WHERE provider_subscription_id = ?').get(providerSubscriptionId);
        if (subscription) {
          upsertPayment(subscription.id, parsed.data.payment);
          recomputeLicenseBilling(subscription.id);
        }
      }
      db.prepare("UPDATE billing_webhook_events SET processed_at = datetime('now') WHERE event_id = ?").run(parsed.data.id);
      return true;
    });
    response.status(200).json({ received: true, processed: processEvent() });
  } catch (error) { next(error); }
});

export function financialLicenseStatus(license) {
  if (!license.billing_enforced) return null;
  if (license.billing_status === 'paid') return null;
  if (!license.billing_grace_until) return null;
  if (new Date(license.billing_grace_until).getTime() > Date.now()) return null;
  return 'payment_overdue';
}
