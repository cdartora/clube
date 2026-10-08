// Cria o primeiro admin do Clube.
//
//   npm run seed:admin -- --email voce@exemplo.com --username voce --name "Seu Nome"
//   npm run seed:admin -- --email ... --username ... --name ... --remote   (banco de produção)

import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    username: { type: "string" },
    name: { type: "string" },
    remote: { type: "boolean", default: false },
  },
});

const fail = (msg) => {
  console.error(`Erro: ${msg}`);
  process.exit(1);
};

const email = values.email?.trim().toLowerCase();
const username = values.username?.trim().toLowerCase();
const name = values.name?.trim();

if (!email || !username || !name) {
  fail('informe --email, --username e --name. Ex.: --email voce@exemplo.com --username voce --name "Seu Nome"');
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(`email inválido: ${email}`);
if (!/^[a-z0-9_]{3,20}$/.test(username)) {
  fail("o apelido deve ter de 3 a 20 caracteres: letras minúsculas, números ou _");
}

const quote = (s) => `'${s.replaceAll("'", "''")}'`;
const sql = `INSERT INTO users (email, username, display_name, role) VALUES (${quote(email)}, ${quote(username)}, ${quote(name)}, 'admin');`;

const result = spawnSync(
  "npx",
  ["wrangler", "d1", "execute", "clube", values.remote ? "--remote" : "--local", "--command", sql],
  { stdio: "inherit" },
);

if (result.status !== 0) {
  fail("não consegui criar o admin (o email ou o apelido já existem? as migrations foram aplicadas?)");
}
console.log(`\nAdmin criado: ${name} (@${username}) <${email}>`);
