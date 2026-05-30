'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const config = require('./config/index');
const routes = require('./routes/index');
const { errorHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');
const { metricsMiddleware } = require('./utils/metrics');

const app = express();

// ─── Security Headers ────────────────────────────────────
app.use(helmet());

// ─── CORS ────────────────────────────────────────────────
app.use(cors({
  origin: config.isProduction ? process.env.CORS_ORIGIN : '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// ─── Rate Limiting ───────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(limiter);

// ─── Compression ─────────────────────────────────────────
app.use(compression());

// ─── Body Parsers ────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── Request Logging ─────────────────────────────────────
if (!config.isTest) {
  app.use(morgan('short', {
    stream: { write: (msg) => logger.info(msg.trim()) },
  }));
}

// ─── Prometheus Metrics ─────────────────────────────────
app.use(metricsMiddleware);

// ─── Health Check ────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    service: 'space-fractions-game-component',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ─── API Routes ──────────────────────────────────────────
app.use('/api/v1', routes);

// ─── 404 Handler ─────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// ─── Global Error Handler ────────────────────────────────
app.use(errorHandler);

module.exports = app;
