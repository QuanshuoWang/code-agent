'use strict';

const { Pool } = require('pg');
const config = require('./index');
const logger = require('../utils/logger');

let pool = null;

/**
 * Create and return a PostgreSQL connection pool.
 * Uses singleton pattern so only one pool exists per process.
 */
function getPool() {
  if (!pool) {
    pool = new Pool({
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: config.db.user,
      password: config.db.password,
      min: config.db.poolMin,
      max: config.db.poolMax,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      logger.error('Unexpected PostgreSQL pool error', { error: err.message });
    });

    pool.on('connect', () => {
      logger.debug('New PostgreSQL connection acquired from pool');
    });

    logger.info('PostgreSQL pool initialized', {
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      min: config.db.poolMin,
      max: config.db.poolMax,
    });
  }

  return pool;
}

/**
 * Execute a single query against the database.
 * @param {string} text - SQL query text
 * @param {Array} [params] - Query parameters
 * @returns {Promise<object>} Query result
 */
async function query(text, params) {
  const client = await getPool().connect();
  try {
    const start = Date.now();
    const result = await client.query(text, params);
    const duration = Date.now() - start;

    logger.debug('Query executed', {
      text: text.substring(0, 80),
      duration,
      rows: result.rowCount,
    });

    return result;
  } finally {
    client.release();
  }
}

/**
 * Execute a transaction with a callback that receives a client.
 * The callback should return a promise. Auto-commits on success,
 * rolls back on error.
 * @param {Function} callback - async (client) => result
 * @returns {Promise<*>} Result of the callback
 */
async function transaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Gracefully shut down the pool.
 */
async function close() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('PostgreSQL pool closed');
  }
}

module.exports = {
  getPool,
  query,
  transaction,
  close,
};
