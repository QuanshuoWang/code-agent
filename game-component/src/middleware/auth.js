'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config/index');
const logger = require('../utils/logger');

/**
 * OAuth2 / JWT authentication middleware.
 * Extracts and verifies a Bearer token from the Authorization header.
 * Attaches decoded user payload to req.user.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header is required' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Authorization must be Bearer <token>' });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = {
      id: decoded.sub || decoded.id,
      username: decoded.username,
      roles: decoded.roles || [],
    };
    next();
  } catch (err) {
    logger.warn('JWT verification failed', { error: err.message });

    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token has expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Optional authentication - attaches user if token is present,
 * but doesn't reject unauthenticated requests.
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    req.user = null;
    return next();
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(parts[1], config.jwt.secret);
    req.user = {
      id: decoded.sub || decoded.id,
      username: decoded.username,
      roles: decoded.roles || [],
    };
  } catch (err) {
    req.user = null;
  }

  next();
}

/**
 * Role-based authorization middleware.
 * Must be used after authenticate().
 * @param  {...string} roles - Allowed roles
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const hasRole = roles.some((role) => req.user.roles.includes(role));
    if (!hasRole) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

module.exports = { authenticate, optionalAuth, authorize };
