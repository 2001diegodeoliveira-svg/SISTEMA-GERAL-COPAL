const { createDatabase } = require('../config/database');

async function main() {
  const usersDb = createDatabase('users');
  const contractsDb = createDatabase('contracts');

  const usersInfo = await usersDb.query('SELECT current_database() AS db');
  const contractsInfo = await contractsDb.query('SELECT current_database() AS db');

  const usersTable = await usersDb.query("SELECT to_regclass('public.users') AS table_name");
  const contractsTable = await contractsDb.query("SELECT to_regclass('public.contracts') AS table_name");

  console.log(`USERS_SCOPE_DB=${usersInfo.rows[0].db}`);
  console.log(`USERS_TABLE=${usersTable.rows[0].table_name || 'missing'}`);
  console.log(`CONTRACTS_SCOPE_DB=${contractsInfo.rows[0].db}`);
  console.log(`CONTRACTS_TABLE=${contractsTable.rows[0].table_name || 'missing'}`);
}

main().catch((error) => {
  console.error('VERIFY_DUAL_DB_FAIL', error.message || error);
  process.exit(1);
});
