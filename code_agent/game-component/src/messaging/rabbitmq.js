'use strict';

const amqp = require('amqplib');
const config = require('../config/index');
const logger = require('../utils/logger');

let connection = null;
let channel = null;

/**
 * Connect to RabbitMQ and create the game events channel.
 * @returns {Promise<object>} The channel object
 */
async function connectRabbitMQ() {
  if (channel) {
    return channel;
  }

  const url = `amqp://${config.rabbitmq.user}:${config.rabbitmq.password}@${config.rabbitmq.host}:${config.rabbitmq.port}`;

  connection = await amqp.connect(url);

  connection.on('error', (err) => {
    logger.error('RabbitMQ connection error', { error: err.message });
  });

  connection.on('close', () => {
    logger.warn('RabbitMQ connection closed');
    channel = null;
  });

  channel = await connection.createChannel();

  // Assert the topic exchange for game events
  await channel.assertExchange(config.rabbitmq.gameExchange, 'topic', {
    durable: true,
    autoDelete: false,
  });

  logger.info('RabbitMQ connected and channel created', {
    host: config.rabbitmq.host,
    exchange: config.rabbitmq.gameExchange,
  });

  return channel;
}

/**
 * Publish a game event to the RabbitMQ exchange.
 * @param {string} routingKey - e.g. 'game.started', 'game.completed'
 * @param {object} data - The event payload
 * @returns {Promise<boolean>}
 */
async function publishEvent(routingKey, data) {
  try {
    if (!channel) {
      await connectRabbitMQ();
    }

    const buffer = Buffer.from(JSON.stringify(data));
    const published = channel.publish(
      config.rabbitmq.gameExchange,
      routingKey,
      buffer,
      {
        persistent: true,
        contentType: 'application/json',
        timestamp: Date.now(),
      },
    );

    logger.debug('Event published', { routingKey, eventId: data.gameId });
    return published;
  } catch (err) {
    logger.error('Failed to publish event', {
      routingKey,
      error: err.message,
    });
    return false;
  }
}

/**
 * Consume events from a specific queue bound to the game exchange.
 * @param {string} queueName
 * @param {string} bindingKey - e.g. 'game.#' for all game events
 * @param {Function} handler - async (msg) => void
 */
async function consumeEvents(queueName, bindingKey, handler) {
  try {
    if (!channel) {
      await connectRabbitMQ();
    }

    await channel.assertQueue(queueName, { durable: true });
    await channel.bindQueue(queueName, config.rabbitmq.gameExchange, bindingKey);

    await channel.consume(queueName, async (msg) => {
      if (msg) {
        try {
          const data = JSON.parse(msg.content.toString());
          await handler(data);
          channel.ack(msg);
        } catch (err) {
          logger.error('Error processing message', { error: err.message });
          channel.nack(msg, false, false); // discard the bad message
        }
      }
    });

    logger.info('Consuming events', { queue: queueName, bindingKey });
  } catch (err) {
    logger.error('Failed to set up event consumer', { error: err.message });
  }
}

/**
 * Gracefully close the RabbitMQ connection.
 */
async function closeRabbitMQ() {
  try {
    if (channel) {
      await channel.close();
      channel = null;
    }
    if (connection) {
      await connection.close();
      connection = null;
    }
    logger.info('RabbitMQ connection closed');
  } catch (err) {
    logger.warn('Error closing RabbitMQ', { error: err.message });
  }
}

module.exports = {
  connectRabbitMQ,
  publishEvent,
  consumeEvents,
  closeRabbitMQ,
};
