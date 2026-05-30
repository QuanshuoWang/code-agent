'use strict';

const logger = require('../utils/logger');

/**
 * Custom application error with HTTP status code.
 */
class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global error handling middleware.
 * Catches all errors thrown in route handlers and returns
 * a consistent JSON error response.
 */
function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Log all errors
  logger.error(`${req.method} ${req.originalUrl} -> ${statusCode}`, {
    error: message,
    stack: err.stack,
    details: err.details,
  });

  // Production: don't leak stack traces
  const response = {
    error: message,
    statusCode,
  };

  if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  if (err.details) {
    response.details = err.details;
  }

  res.status(statusCode).json(response);
}

module.exports = { errorHandler, AppError };
