const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const hasConnectionString = !!process.env.DATABASE_URL;
const forceSsl = String(process.env.DB_SSL || '').toLowerCase() === 'true';

const poolConfig = hasConnectionString
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME || 'copal',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ...(forceSsl ? { ssl: { rejectUnauthorized: false } } : {}),
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
