'use strict';

const app = require('./app');
const config = require('./config/index');
const logger = require('./utils/logger');
const { getPool, close: closeDb } = require('./config/database');
const { createRedisClient, closeRedis } = require('./cache/redisClient');
const { connectRabbitMQ, closeRabbitMQ } = require('./messaging/rabbitmq');
const { startMetricsServer } = require('./utils/metrics');

let server = null;

async function start() {
  try {
    // ─── Initialize Database Pool ──────────────────────────
    getPool();
    logger.info('Database pool initialized');

    // ─── Initialize Redis ──────────────────────────────────
    await createRedisClient();
    logger.info('Redis client initialized');

    // ─── Initialize RabbitMQ ───────────────────────────────
    await connectRabbitMQ();
    logger.info('RabbitMQ connection established');

    // ─── Start HTTP Server ─────────────────────────────────
    server = app.listen(config.server.port, config.server.host, () => {
      logger.info(
        `Space Fractions GameComponent started on ${config.server.host}:${config.server.port}`,
        { env: config.env },
      );
    });

    // ─── Start Metrics Server ──────────────────────────────
    startMetricsServer();

    // ─── Graceful Shutdown ─────────────────────────────────
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);

      if (server) {
        server.close(() => {
          logger.info('HTTP server closed');
        });
      }

      await closeRabbitMQ();
      await closeRedis();
      await closeDb();

      logger.info('All connections closed. Goodbye.');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // ─── Unhandled Rejections ──────────────────────────────
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Rejection', { reason: reason.message || reason });
    });

    process.on('uncaughtException', (err) => {
      logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
      process.exit(1);
    });
  } catch (err) {
    logger.error('Failed to start server', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

start();
