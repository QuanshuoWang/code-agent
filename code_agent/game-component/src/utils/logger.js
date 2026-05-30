'use strict';

const winston = require('winston');
const config = require('../config/index');

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format((info) => {
    const { timestamp, level, message, ...rest } = info;
    return { timestamp, level, message, ...rest };
  })(),
);

const consoleFormat = winston.format.combine(
  logFormat,
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  }),
);

const jsonFormat = winston.format.combine(
  logFormat,
  winston.format.json(),
);

const logger = winston.createLogger({
  level: config.logging.level,
  transports: [
    new winston.transports.Console({
      format: config.isProduction ? jsonFormat : consoleFormat,
    }),
  ],
});

module.exports = logger;
