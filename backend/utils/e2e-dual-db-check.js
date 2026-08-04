const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

async function queryOne(dbName, sql, params = []) {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: dbName,
  });
  await client.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows[0] || null;
  } finally {
    await client.end();
  }
}

async function main() {
  const stamp = Date.now();
  const email = `dual.${stamp}@sesp.mt.gov.br`;
  const matricula = `DUAL-${stamp}`;
  const numContrato = `DUAL-${stamp}`;

  const regRes = await fetch('http://localhost:3000/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'Teste@1234',
      name: 'Teste Dual DB',
      matricula,
      cpf: '11122233344',
      role: 'user',
    }),
  });
  const regBody = await regRes.text();

  const contractRes = await fetch('http://localhost:3000/api/contracts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      numContrato,
      numProcesso: `PROC-${stamp}`,
      credor: 'Fornecedor Teste',
      valorGlobal: 'R$ 1.000,00',
      objeto: 'Contrato de teste dual DB',
      lotes: [],
      unidades: [],
      aditivos: [],
      empenhos: [],
    }),
  });
  const contractBody = await contractRes.text();

  const usersDbName = process.env.USERS_DB_NAME || 'usuarios';
  const contractsDbName = process.env.CONTRACTS_DB_NAME || process.env.DB_NAME || 'copal';

  const userRow = await queryOne(usersDbName, 'SELECT id, email, matricula FROM users WHERE email = $1', [email]);
  const contractRow = await queryOne(contractsDbName, 'SELECT id, numcontrato FROM contracts WHERE numcontrato = $1', [numContrato]);

  console.log('REGISTER_STATUS', regRes.status);
  console.log('REGISTER_BODY', regBody);
  console.log('CONTRACT_STATUS', contractRes.status);
  console.log('CONTRACT_BODY', contractBody);
  console.log('USER_IN_DB', usersDbName, userRow ? 'YES' : 'NO', userRow ? userRow.id : '');
  console.log('CONTRACT_IN_DB', contractsDbName, contractRow ? 'YES' : 'NO', contractRow ? contractRow.id : '');
}

main().catch((error) => {
  console.error('E2E_DUAL_DB_FAIL', error.message || error);
  process.exit(1);
});
