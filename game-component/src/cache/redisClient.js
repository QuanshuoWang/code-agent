'use strict';

const Redis = require('ioredis');
const config = require('../config/index');
const logger = require('../utils/logger');

let redisClient = null;

/**
 * Create and connect the Redis client instance.
 * Uses a singleton pattern so only one client is created.
 * @returns {Promise<object>} Connected Redis client
 */
async function createRedisClient() {
  if (redisClient) {
    return redisClient;
  }

  const options = {
    host: config.redis.host,
    port: config.redis.port,
    retryStrategy: (times) => {
      const delay = Math.min(times * 100, 3000);
      logger.warn(`Redis reconnecting in ${delay}ms (attempt ${times})`);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  };

  if (config.redis.password) {
    options.password = config.redis.password;
  }

  redisClient = new Redis(options);

  redisClient.on('connect', () => {
    logger.info('Redis client connected', {
      host: config.redis.host,
      port: config.redis.port,
    });
  });

  redisClient.on('ready', () => {
    logger.info('Redis client ready');
  });

  redisClient.on('error', (err) => {
    logger.error('Redis client error', { error: err.message });
  });

  redisClient.on('close', () => {
    logger.warn('Redis connection closed');
  });

  // Wait for ready state
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Redis connection timeout'));
    }, 10000);

    redisClient.once('ready', () => {
      clearTimeout(timeout);
      resolve();
    });

    redisClient.once('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  return redisClient;
}

/**
 * Get the existing Redis client instance.
 * @returns {object|null}
 */
function getRedisClient() {
  return redisClient;
}

/**
 * Gracefully close the Redis connection.
 */
async function closeRedis() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis client closed');
  }
}

module.exports = { createRedisClient, getRedisClient, closeRedis };
