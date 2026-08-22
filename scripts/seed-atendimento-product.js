import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const databasePath = resolve(process.env.DATABASE_PATH || './data/4byts.db');
const priceCents = Number(process.env.ATENDIMENTO_MONTHLY_PRICE_CENTS || 7500);
const product = {
  code: 'atendimento',
  name: '4Byts Atendimento',
  licensePrefix: 'WPP',
  description: 'Autoatendimento no WhatsApp com triagem, fila e transferência para atendentes'
};

if (!existsSync(databasePath)) {
  console.error(`Banco da central não encontrado em ${databasePath}. Nenhum arquivo foi criado.`);
  process.exit(1);
}
if (!Number.isSafeInteger(priceCents) || priceCents < 0) {
  console.error('ATENDIMENTO_MONTHLY_PRICE_CENTS deve ser um valor inteiro em centavos.');
  process.exit(1);
}

const database = new Database(databasePath);
database.pragma('foreign_keys = ON');
database.pragma('busy_timeout = 5000');

try {
  const requiredTables = ['products', 'licenses', 'billing_plans', 'billing_subscriptions', 'audit_logs'];
  const missingTables = requiredTables.filter(name => !database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
  if (missingTables.length) throw new Error(`Atualize e reinicie a central 4Byts primeiro. Tabelas ausentes: ${missingTables.join(', ')}.`);

  const result = database.transaction(() => {
    database.prepare(`
      INSERT INTO products (code, name, license_prefix, description, active)
      VALUES (@code, @name, @licensePrefix, @description, 1)
      ON CONFLICT(code) DO UPDATE SET
        name = excluded.name,
        license_prefix = excluded.license_prefix,
        description = excluded.description,
        active = 1,
        updated_at = datetime('now')
    `).run(product);
    const savedProduct = database.prepare('SELECT id, code, name, license_prefix FROM products WHERE code = ?').get(product.code);
    let savedPlan = database.prepare('SELECT * FROM billing_plans WHERE code = ?').get('atendimento-mensal') || null;

    if (priceCents > 0) {
      if (savedPlan && savedPlan.price_cents !== priceCents) {
        const subscriptions = database.prepare('SELECT COUNT(*) AS count FROM billing_subscriptions WHERE plan_id = ?').get(savedPlan.id).count;
        if (subscriptions > 0) throw new Error(`O plano já possui ${subscriptions} assinatura(s). O valor não foi alterado para evitar divergência com o Asaas.`);
      }
      database.prepare(`
        INSERT INTO billing_plans (code, name, product, product_id, price_cents, cycle, active)
        VALUES ('atendimento-mensal', 'ATENDIMENTO PROFISSIONAL', ?, ?, ?, 'MONTHLY', 1)
        ON CONFLICT(code) DO UPDATE SET
          name = excluded.name,
          product = excluded.product,
          product_id = excluded.product_id,
          price_cents = excluded.price_cents,
          cycle = excluded.cycle,
          active = 1,
          updated_at = datetime('now')
      `).run(savedProduct.name, savedProduct.id, priceCents);
      savedPlan = database.prepare('SELECT * FROM billing_plans WHERE code = ?').get('atendimento-mensal');
    }

    database.prepare(`
      UPDATE licenses SET product = ?, product_id = ?, product_code = ?
       WHERE lower(product) IN ('4byts atendimento', '4byts whatsapp') OR plan = 'atendimento-mensal'
    `).run(savedProduct.name, savedProduct.id, savedProduct.code);
    database.prepare(`
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, summary)
      VALUES (NULL, 'upsert', 'product', ?, 'Produto 4Byts Atendimento configurado automaticamente por script')
    `).run(String(savedProduct.id));
    return { savedProduct, savedPlan };
  })();

  console.log(JSON.stringify({
    status: 'ok',
    product: {
      id: result.savedProduct.id,
      code: result.savedProduct.code,
      name: result.savedProduct.name,
      licensePrefix: result.savedProduct.license_prefix
    },
    plan: result.savedPlan ? {
      id: result.savedPlan.id,
      code: result.savedPlan.code,
      price: `R$ ${(result.savedPlan.price_cents / 100).toFixed(2).replace('.', ',')}`,
      cycle: result.savedPlan.cycle
    } : null,
    nextAction: result.savedPlan ? null : 'Informe um valor positivo em ATENDIMENTO_MONTHLY_PRICE_CENTS para reativar o plano comercial.'
  }, null, 2));
} finally {
  database.close();
}
