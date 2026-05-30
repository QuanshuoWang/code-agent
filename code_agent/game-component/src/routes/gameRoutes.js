'use strict';

const { Router } = require('express');
const gameController = require('../controllers/gameController');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validator');

const router = Router();

/**
 * ─── Game Routes ─────────────────────────────────────────
 * All game-related endpoints are prefixed with /games
 */

// POST /api/v1/games - Create a new game
router.post(
  '/',
  authenticate,
  gameController.createGame,
);

// GET /api/v1/games/active - Get active games for current user
router.get(
  '/active',
  authenticate,
  gameController.getActiveGames,
);

// GET /api/v1/games/recent - Get recent completed games
router.get(
  '/recent',
  authenticate,
  gameController.getRecentGames,
);

// GET /api/v1/games/stats - Get user game statistics
router.get(
  '/stats',
  authenticate,
  gameController.getUserStats,
);

// GET /api/v1/games/:id - Get game by ID
router.get(
  '/:id',
  authenticate,
  gameController.getGameById,
);

// POST /api/v1/games/:id/submit - Submit an answer for a game
router.post(
  '/:id/submit',
  authenticate,
  gameController.submitAnswer,
);

// PATCH /api/v1/games/:id/state - Update game state (pause/resume/abandon)
router.patch(
  '/:id/state',
  authenticate,
  gameController.updateGameState,
);

// POST /api/v1/games/:id/complete - Complete a game
router.post(
  '/:id/complete',
  authenticate,
  gameController.completeGame,
);

module.exports = router;
