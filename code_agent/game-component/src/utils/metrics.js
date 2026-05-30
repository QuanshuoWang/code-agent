'use strict';

const promClient = require('prom-client');
const express = require('express');
const config = require('../config/index');
const logger = require('./logger');

// ─── Collect default metrics ─────────────────────────────
const collectDefaultMetrics = promClient.collectDefaultMetrics;
collectDefaultMetrics({ prefix: 'spacefractions_', gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5] });

// ─── Custom Metrics ──────────────────────────────────────
const httpRequestDuration = new promClient.Histogram({
  name: 'spacefractions_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

const httpRequestTotal = new promClient.Counter({
  name: 'spacefractions_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

const gamesStarted = new promClient.Counter({
  name: 'spacefractions_games_started_total',
  help: 'Total number of games started',
});

const gamesCompleted = new promClient.Counter({
  name: 'spacefractions_games_completed_total',
  help: 'Total number of games completed',
});

const activeGames = new promClient.Gauge({
  name: 'spacefractions_active_games',
  help: 'Number of active games currently in progress',
});

const gameDuration = new promClient.Histogram({
  name: 'spacefractions_game_duration_seconds',
  help: 'Duration of completed games in seconds',
  buckets: [30, 60, 120, 300, 600, 900, 1800, 3600],
});

/**
 * Middleware to track HTTP request metrics.
 */
function metricsMiddleware(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route ? req.route.path : req.path;

    httpRequestDuration.observe({ method: req.method, route, status_code: res.statusCode }, duration);
    httpRequestTotal.inc({ method: req.method, route, status_code: res.statusCode });
  });

  next();
}

/**
 * Start a separate HTTP server for Prometheus metrics scraping.
 */
function startMetricsServer() {
  const metricsApp = express();

  metricsApp.get('/metrics', async (req, res) => {
    res.set('Content-Type', promClient.register.contentType);
    const metrics = await promClient.register.metrics();
    res.end(metrics);
  });

  metricsApp.listen(config.metrics.port, config.server.host, () => {
    logger.info(`Metrics server listening on ${config.server.host}:${config.metrics.port}`);
  });
}

module.exports = {
  metricsMiddleware,
  startMetricsServer,
  gamesStarted,
  gamesCompleted,
  activeGames,
  gameDuration,
  httpRequestDuration,
  httpRequestTotal,
};
