'use strict';

/**
 * Database migration runner.
 * Reads migration files from sql/migrations/ and applies them in order.
 *
 * Usage: node src/config/migrate.js
 */

const fs = require('fs');
const path = require('path');
const { getPool, close } = require('./database');
const logger = require('../utils/logger');

const MIGRATIONS_DIR = path.resolve(__dirname, '../../sql/migrations');

async function runMigrations() {
  const pool = getPool();

  // Ensure migration tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  // Get already-applied migrations
  const { rows: applied } = await pool.query(
    'SELECT filename FROM migrations ORDER BY filename',
  );
  const appliedSet = new Set(applied.map((r) => r.filename));

  // Read migration files sorted by name
  let files;
  try {
    files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  } catch (err) {
    logger.warn('No migration files found', { directory: MIGRATIONS_DIR });
    return;
  }

  for (const file of files) {
    if (appliedSet.has(file)) {
      logger.info(`Migration already applied: ${file}`);
      continue;
    }

    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    logger.info(`Applying migration: ${file}`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO migrations (filename) VALUES ($1)',
        [file],
      );
      await client.query('COMMIT');
      logger.info(`Migration applied successfully: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(`Migration failed: ${file}`, { error: err.message });
      throw err;
    } finally {
      client.release();
    }
  }

  logger.info('All migrations completed');
}

runMigrations()
  .then(() => close())
  .catch((err) => {
    logger.error('Migration runner failed', { error: err.message });
    process.exit(1);
  });
