const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const pools = new Map();

const GENERIC_URL_KEYS = [
  'DATABASE_URL',
  'POSTGRES_INTERNAL_URL',
  'POSTGRES_URL',
  'PG_CONNECTION_STRING',
  'POSTGRES_PRISMA_URL',
  'POSTGRESQL_URL',
  'RENDER_POSTGRES_INTERNAL_URL',
  'RENDER_POSTGRES_URL',
];

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function normalizeScope(scope) {
  return String(scope || 'default').trim().toLowerCase() || 'default';
}

function scopePrefix(scope) {
  const normalized = normalizeScope(scope);
  if (normalized === 'default') return '';
  return normalized.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

function findConnectionStringFromEnv(scope) {
  const prefix = scopePrefix(scope);
  const scopedKeys = prefix
    ? [
        `${prefix}_DATABASE_URL`,
        `${prefix}_POSTGRES_INTERNAL_URL`,
        `${prefix}_POSTGRES_URL`,
        `${prefix}_PG_CONNECTION_STRING`,
        `${prefix}_POSTGRESQL_URL`,
      ]
    : [];

  const preferredKeys = [...scopedKeys, ...GENERIC_URL_KEYS];

  for (const key of preferredKeys) {
    const value = firstNonEmpty(process.env[key]);
    if (value) return value;
  }

  // Fallback: tenta descobrir automaticamente qualquer variável de URL de banco.
  const dynamicEntry = Object.entries(process.env).find(([key, value]) => {
    if (typeof value !== 'string' || !value.trim()) return false;
    if (!/url/i.test(key)) return false;
    if (!/(postgres|database|pg)/i.test(key)) return false;
    if (prefix && !key.startsWith(`${prefix}_`)) return false;
    return /^postgres(ql)?:\/\//i.test(value.trim());
  });

  if (dynamicEntry) return dynamicEntry[1].trim();

  if (prefix) {
    const genericDynamicEntry = Object.entries(process.env).find(([key, value]) => {
      if (typeof value !== 'string' || !value.trim()) return false;
      if (!/url/i.test(key)) return false;
      if (!/(postgres|database|pg)/i.test(key)) return false;
      return /^postgres(ql)?:\/\//i.test(value.trim());
    });

    return genericDynamicEntry ? genericDynamicEntry[1].trim() : '';
  }

  return '';
}

function resolveWithScope(scope, keys) {
  const prefix = scopePrefix(scope);
  const scopedKeys = prefix ? keys.map((key) => `${prefix}_${key}`) : [];
  return firstNonEmpty(...scopedKeys.map((key) => process.env[key]), ...keys.map((key) => process.env[key]));
}

function getFallbackDatabaseName(scope) {
  const normalized = normalizeScope(scope);
  if (normalized === 'users') return 'usuarios';
  if (normalized === 'contracts') return 'copal';
  return 'copal';
}

const isRender = String(process.env.RENDER || '').toLowerCase() === 'true';
const isProductionLike = isRender || String(process.env.NODE_ENV || '').toLowerCase() === 'production';
const forceSsl = String(process.env.DB_SSL || '').toLowerCase() === 'true';
const sslRequired = forceSsl || isProductionLike;

function resolvePoolConfig(scope) {
  const connectionString = findConnectionStringFromEnv(scope);
  const hasConnectionString = !!connectionString;

  const host = resolveWithScope(scope, ['DB_HOST', 'PGHOST', 'POSTGRES_HOST']);
  const port = Number(resolveWithScope(scope, ['DB_PORT', 'PGPORT', 'POSTGRES_PORT']) || 5432);
  const databaseName = resolveWithScope(scope, ['DB_NAME', 'PGDATABASE', 'POSTGRES_DB']);
  const dbUser = resolveWithScope(scope, ['DB_USER', 'PGUSER', 'POSTGRES_USER']);
  const dbPassword = resolveWithScope(scope, ['DB_PASSWORD', 'PGPASSWORD', 'POSTGRES_PASSWORD']);

  if (!hasConnectionString && isProductionLike && !host) {
    const urlLikeKeys = Object.keys(process.env)
      .filter((key) => /url/i.test(key) && /(postgres|database|pg)/i.test(key))
      .sort();

    throw new Error(
      `Banco '${normalizeScope(scope)}' não configurado para produção. Defina ${scopePrefix(scope) ? `${scopePrefix(scope)}_DATABASE_URL` : 'DATABASE_URL'} (ou *_POSTGRES_INTERNAL_URL) no ambiente do Render. Variáveis URL detectadas: ${urlLikeKeys.join(', ') || 'nenhuma'}.`
    );
  }

  if (hasConnectionString) {
    return {
      connectionString,
      ...(sslRequired ? { ssl: { rejectUnauthorized: false } } : {}),
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };
  }

  return {
    host: host || 'localhost',
    port,
    database: databaseName || getFallbackDatabaseName(scope),
    user: dbUser || 'postgres',
    password: dbPassword || '',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ...(sslRequired ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

function getPool(scope = 'default') {
  const normalizedScope = normalizeScope(scope);
  if (pools.has(normalizedScope)) {
    return pools.get(normalizedScope);
  }

  const pool = new Pool(resolvePoolConfig(normalizedScope));
  pools.set(normalizedScope, pool);
  return pool;
}

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

function createDatabase(scopeOrOptions = 'default') {
  const scope = typeof scopeOrOptions === 'string'
    ? scopeOrOptions
    : (scopeOrOptions && scopeOrOptions.scope) || 'default';
  return new CompatDatabase(getPool(scope));
}

const exported = { createDatabase, getPool };

Object.defineProperty(exported, 'pool', {
  enumerable: true,
  get() {
    return getPool('default');
  },
});

module.exports = exported;
