const dotenv = require('dotenv');
const path = require('path');
const { Client } = require('pg');

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'copal',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    connectionTimeoutMillis: 2500,
  };

  const client = new Client(config);

  try {
    await client.connect();
    const result = await client.query('SELECT current_database() AS db, current_user AS usr, version() AS version');
    const row = result.rows[0] || {};
    console.log('DB_OK');
    console.log(`host=${config.host} port=${config.port} database=${row.db} user=${row.usr}`);
    console.log(row.version);
    process.exit(0);
  } catch (error) {
    console.error('DB_FAIL');
    console.error(error.message || error);
    process.exit(1);
  } finally {
    try {
      await client.end();
    } catch (_) {
      // ignore close errors in diagnostic mode
    }
  }
}

main();