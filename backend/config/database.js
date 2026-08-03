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

function findConnectionStringFromEnv() {
  const preferredKeys = [
    'DATABASE_URL',
    'POSTGRES_INTERNAL_URL',
    'POSTGRES_URL',
    'PG_CONNECTION_STRING',
    'POSTGRES_PRISMA_URL',
    'POSTGRESQL_URL',
    'RENDER_POSTGRES_INTERNAL_URL',
    'RENDER_POSTGRES_URL',
  ];

  for (const key of preferredKeys) {
    const value = firstNonEmpty(process.env[key]);
    if (value) return value;
  }

  // Fallback: tenta descobrir automaticamente qualquer variável de URL de banco.
  const dynamicEntry = Object.entries(process.env).find(([key, value]) => {
    if (typeof value !== 'string' || !value.trim()) return false;
    if (!/url/i.test(key)) return false;
    if (!/(postgres|database|pg)/i.test(key)) return false;
    return /^postgres(ql)?:\/\//i.test(value.trim());
  });

  return dynamicEntry ? dynamicEntry[1].trim() : '';
}

const isRender = String(process.env.RENDER || '').toLowerCase() === 'true';
const isProductionLike = isRender || String(process.env.NODE_ENV || '').toLowerCase() === 'production';

const connectionString = findConnectionStringFromEnv();

const hasConnectionString = !!connectionString;
const forceSsl = String(process.env.DB_SSL || '').toLowerCase() === 'true';
const sslRequired = forceSsl || isProductionLike;

const host = firstNonEmpty(process.env.DB_HOST, process.env.PGHOST, process.env.POSTGRES_HOST);
const port = Number(firstNonEmpty(process.env.DB_PORT, process.env.PGPORT, process.env.POSTGRES_PORT) || 5432);
const databaseName = firstNonEmpty(process.env.DB_NAME, process.env.PGDATABASE, process.env.POSTGRES_DB);
const user = firstNonEmpty(process.env.DB_USER, process.env.PGUSER, process.env.POSTGRES_USER);
const password = firstNonEmpty(process.env.DB_PASSWORD, process.env.PGPASSWORD, process.env.POSTGRES_PASSWORD);

if (!hasConnectionString && isProductionLike && !host) {
  const urlLikeKeys = Object.keys(process.env)
    .filter((key) => /url/i.test(key) && /(postgres|database|pg)/i.test(key))
    .sort();

  throw new Error(
    `Banco não configurado para produção. Defina DATABASE_URL (ou POSTGRES_INTERNAL_URL) no ambiente do Render. Variáveis URL detectadas: ${urlLikeKeys.join(', ') || 'nenhuma'}.`
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
      database: databaseName || user || 'copal',
      user: user || 'postgres',
      password: password || '',
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
