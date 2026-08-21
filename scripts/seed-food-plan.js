import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const databasePath = resolve(process.env.DATABASE_PATH || './data/4byts.db');
const plan = {
  code: 'food-mensal',
  name: 'FOOD PREMIUM',
  product: '4Byts Food',
  priceCents: 35000,
  cycle: 'MONTHLY'
};
const product = {
  code: 'food',
  name: '4Byts Food',
  licensePrefix: 'FOOD',
  description: 'Sistema para restaurantes, lanchonetes e bares'
};

if (!existsSync(databasePath)) {
  console.error(`Banco da central não encontrado em ${databasePath}. Nenhum arquivo foi criado.`);
  process.exit(1);
}

const database = new Database(databasePath);
database.pragma('foreign_keys = ON');
database.pragma('busy_timeout = 5000');

try {
  const requiredTables = ['products', 'licenses', 'billing_plans', 'billing_subscriptions', 'audit_logs'];
  const missingTables = requiredTables.filter(name => !database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
  if (missingTables.length) throw new Error(`Atualize e reinicie a central 4Byts primeiro. Tabelas ausentes: ${missingTables.join(', ')}.`);

  const existing = database.prepare('SELECT * FROM billing_plans WHERE code = ?').get(plan.code);
  if (existing && existing.price_cents !== plan.priceCents) {
    const subscriptions = database.prepare('SELECT COUNT(*) AS count FROM billing_subscriptions WHERE plan_id = ?').get(existing.id).count;
    if (subscriptions > 0) {
      throw new Error(`O plano já possui ${subscriptions} assinatura(s). O valor não foi alterado para evitar divergência com o Asaas.`);
    }
  }

  const upsert = database.transaction(() => {
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

    database.prepare(`
      INSERT INTO billing_plans (code, name, product, product_id, price_cents, cycle, active)
      VALUES (@code, @name, @productName, @productId, @priceCents, @cycle, 1)
      ON CONFLICT(code) DO UPDATE SET
        name = excluded.name,
        product = excluded.product,
        product_id = excluded.product_id,
        price_cents = excluded.price_cents,
        cycle = excluded.cycle,
        active = 1,
        updated_at = datetime('now')
    `).run({ ...plan, productName: savedProduct.name, productId: savedProduct.id });

    database.prepare(`
      UPDATE licenses
         SET product = ?, product_id = ?, product_code = ?
       WHERE lower(product) = lower(?) OR plan = ?
    `).run(savedProduct.name, savedProduct.id, savedProduct.code, savedProduct.name, plan.code);

    const saved = database.prepare('SELECT id, code, name, product, price_cents, cycle, active FROM billing_plans WHERE code = ?').get(plan.code);
    database.prepare(`
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, summary)
      VALUES (NULL, 'upsert', 'billing_plan', ?, ?)
    `).run(String(saved.id), `Plano ${saved.code} configurado automaticamente por script`);
    return { saved, savedProduct };
  });

  const { saved, savedProduct } = upsert();
  console.log(JSON.stringify({
    status: 'ok',
    product: {
      id: savedProduct.id,
      code: savedProduct.code,
      name: savedProduct.name,
      licensePrefix: savedProduct.license_prefix
    },
    plan: {
    id: saved.id,
    code: saved.code,
    name: saved.name,
    product: saved.product,
    price: `R$ ${(saved.price_cents / 100).toFixed(2).replace('.', ',')}`,
    cycle: saved.cycle,
    active: saved.active === 1
    }
  }, null, 2));
} finally {
  database.close();
}
