const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

const isRender = String(process.env.RENDER || '').toLowerCase() === 'true';
const isProductionLike = isRender || String(process.env.NODE_ENV || '').toLowerCase() === 'production';

const connectionString = firstNonEmpty(
  process.env.DATABASE_URL,
  process.env.POSTGRES_INTERNAL_URL,
  process.env.POSTGRES_URL,
  process.env.PG_CONNECTION_STRING
);

const hasConnectionString = !!connectionString;
const forceSsl = String(process.env.DB_SSL || '').toLowerCase() === 'true';
const sslRequired = forceSsl || isProductionLike;

const host = firstNonEmpty(process.env.DB_HOST, process.env.PGHOST, process.env.POSTGRES_HOST);
const port = Number(firstNonEmpty(process.env.DB_PORT, process.env.PGPORT, process.env.POSTGRES_PORT) || 5432);
const databaseName = firstNonEmpty(process.env.DB_NAME, process.env.PGDATABASE, process.env.POSTGRES_DB);
const user = firstNonEmpty(process.env.DB_USER, process.env.PGUSER, process.env.POSTGRES_USER);
const password = firstNonEmpty(process.env.DB_PASSWORD, process.env.PGPASSWORD, process.env.POSTGRES_PASSWORD);

if (!hasConnectionString && isProductionLike && (!host || !databaseName || !user || !password)) {
  throw new Error(
    'Banco não configurado para produção. Defina DATABASE_URL (ou POSTGRES_INTERNAL_URL) no ambiente do Render.'
  );
}

const poolConfig = hasConnectionString
  ? {
      connectionString,
      ...(sslRequired ? { ssl: { rejectUnauthorized: false } } : {}),
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    }
  : {
      host: host || 'localhost',
      port,
      database: databaseName || 'copal',
      user: user || 'postgres',
      password: password || 'postgres',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ...(sslRequired ? { ssl: { rejectUnauthorized: false } } : {}),
    };

const pool = new Pool(poolConfig);

function translatePlaceholders(sql) {
  let index = 0;
  return String(sql).replace(/\?/g, () => ` $${++index}`.trimStart());
}

function normalizeSql(sql) {
  return translatePlaceholders(sql)
    .replace(/AUTOINCREMENT/gi, 'BIGSERIAL')
    .replace(/INTEGER PRIMARY KEY BIGSERIAL/gi, 'BIGSERIAL PRIMARY KEY');
}

class CompatDatabase {
  constructor(poolInstance) {
    this.pool = poolInstance;
    this.queue = Promise.resolve();
  }

  serialize(callback) {
    callback();
  }

  enqueue(task) {
    this.queue = this.queue.then(task, task);
    return this.queue;
  }

  run(sql, params = [], callback) {
    const finalSql = normalizeSql(sql);
    const isInsert = /^\s*insert\s/i.test(finalSql);
    const needsReturning = isInsert && !/\breturning\b/i.test(finalSql);
    const query = needsReturning ? `${finalSql} RETURNING id` : finalSql;

    return this.enqueue(async () => {
      const result = await this.pool.query(query, params);
      const meta = {
        lastID: result.rows?.[0]?.id ?? null,
        changes: result.rowCount || 0,
      };
      if (typeof callback === 'function') {
        callback.call(meta, null);
      }
      return meta;
    }).catch((error) => {
      if (typeof callback === 'function') {
        callback(error);
        return null;
      }
      throw error;
    });
  }

  get(sql, params = [], callback) {
    const finalSql = normalizeSql(sql);
    return this.enqueue(async () => {
      const result = await this.pool.query(finalSql, params);
      const row = result.rows?.[0] || undefined;
      if (typeof callback === 'function') {
        callback(null, row);
      }
      return row;
    }).catch((error) => {
      if (typeof callback === 'function') {
        callback(error);
        return null;
      }
      throw error;
    });
  }

  all(sql, params = [], callback) {
    const finalSql = normalizeSql(sql);
    return this.enqueue(async () => {
      const result = await this.pool.query(finalSql, params);
      const rows = result.rows || [];
      if (typeof callback === 'function') {
        callback(null, rows);
      }
      return rows;
    }).catch((error) => {
      if (typeof callback === 'function') {
        callback(error);
        return null;
      }
      throw error;
    });
  }

  async query(sql, params = []) {
    const finalSql = normalizeSql(sql);
    return this.pool.query(finalSql, params);
  }

  close() {
    return this.pool.end();
  }
}

function createDatabase() {
  return new CompatDatabase(pool);
}

module.exports = {
  pool,
  createDatabase,
};
