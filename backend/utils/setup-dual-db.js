const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

function splitStatements(sqlText) {
  return sqlText
    .replace(/^--.*$/gm, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function ensureDatabase(baseConfig, dbName) {
  const adminClient = new Client({ ...baseConfig, database: 'postgres' });
  await adminClient.connect();
  const exists = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (!exists.rowCount) {
    await adminClient.query(`CREATE DATABASE ${dbName}`);
    console.log(`DB_CREATED ${dbName}`);
  } else {
    console.log(`DB_EXISTS ${dbName}`);
  }
  await adminClient.end();
}

async function runSqlFile(baseConfig, dbName, filePath) {
  const sql = fs.readFileSync(filePath, 'utf-8');
  const statements = splitStatements(sql);
  const client = new Client({ ...baseConfig, database: dbName });
  await client.connect();
  for (const statement of statements) {
    await client.query(statement);
  }
  await client.end();
}

async function checkTable(baseConfig, dbName, tableName) {
  const client = new Client({ ...baseConfig, database: dbName });
  await client.connect();
  const result = await client.query('SELECT to_regclass($1) AS table_name', [`public.${tableName}`]);
  await client.end();
  return result.rows[0]?.table_name || null;
}

(async () => {
  const baseConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  };

  const usersDbName = process.env.USERS_DB_NAME || 'usuarios';
  const contractsDbName = process.env.CONTRACTS_DB_NAME || process.env.DB_NAME || 'copal';

  const schemaPath = path.resolve(__dirname, '..', 'database', 'schema.sql');
  const seedPath = path.resolve(__dirname, '..', 'database', 'seed.sql');

  await ensureDatabase(baseConfig, usersDbName);
  await ensureDatabase(baseConfig, contractsDbName);

  // Prepare users DB with required app schema.
  await runSqlFile(baseConfig, usersDbName, schemaPath);
  await runSqlFile(baseConfig, usersDbName, seedPath);

  // Ensure contracts table exists in contracts DB.
  const contractsTable = await checkTable(baseConfig, contractsDbName, 'contracts');
  if (!contractsTable) {
    await runSqlFile(baseConfig, contractsDbName, schemaPath);
  }

  const usersTable = await checkTable(baseConfig, usersDbName, 'users');
  const contractsTableAfter = await checkTable(baseConfig, contractsDbName, 'contracts');

  console.log(`USERS_DB=${usersDbName} USERS_TABLE=${usersTable || 'missing'}`);
  console.log(`CONTRACTS_DB=${contractsDbName} CONTRACTS_TABLE=${contractsTableAfter || 'missing'}`);
})().catch((error) => {
  console.error('SETUP_DUAL_DB_FAIL', error.message || error);
  process.exit(1);
});
