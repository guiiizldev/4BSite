import bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { db } from './db.js';

const prompt = createInterface({ input, output });
const name = (await prompt.question('Nome do administrador: ')).trim();
const email = (await prompt.question('E-mail: ')).trim().toLowerCase();
const password = await prompt.question('Senha inicial (mínimo 8 caracteres): ');
prompt.close();

if (name.length < 2 || !email.includes('@') || password.length < 8) {
  console.error('Dados inválidos. Nenhuma conta foi criada.');
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, 12);
db.prepare(`
  INSERT INTO users (name, email, password_hash, role)
  VALUES (?, ?, ?, 'admin')
  ON CONFLICT(email) DO UPDATE SET name = excluded.name, password_hash = excluded.password_hash, role = 'admin', updated_at = datetime('now')
`).run(name, email, passwordHash);

console.log(`Administrador ${email} criado/atualizado com sucesso.`);
