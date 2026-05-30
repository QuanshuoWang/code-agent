'use strict';

const gameService = require('../services/gameService');

/**
 * ─── GameController ──────────────────────────────────────
 * HTTP request handlers for game-related endpoints.
 * Delegates business logic to GameService.
 */
class GameController {
  /**
   * POST /api/v1/games
   * Create and start a new game.
   */
  async createGame(req, res, next) {
    try {
      const userId = req.user.id;
      const game = await gameService.startGame(userId);

      return res.status(201).json({
        success: true,
        data: {
          game: this._sanitizeGame(game),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/games/active
   * Get all active games for the current user.
   */
  async getActiveGames(req, res, next) {
    try {
      const userId = req.user.id;
      const games = await gameService.getActiveGames(userId);

      return res.json({
        success: true,
        data: {
          games: games.map((g) => this._sanitizeGame(g)),
          count: games.length,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/games/recent
   * Get recent completed games for the current user.
   */
  async getRecentGames(req, res, next) {
    try {
      const userId = req.user.id;
      const limit = parseInt(req.query.limit, 10) || 20;
      const games = await gameService.getRecentGames(userId, limit);

      return res.json({
        success: true,
        data: {
          games: games.map((g) => this._sanitizeGame(g)),
          count: games.length,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/games/stats
   * Get game statistics for the current user.
   */
  async getUserStats(req, res, next) {
    try {
      const userId = req.user.id;
      const stats = await gameService.getUserStats(userId);

      return res.json({
        success: true,
        data: stats,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/games/:id
   * Get a specific game by ID.
   */
  async getGameById(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const game = await gameService.getGame(id, userId);

      return res.json({
        success: true,
        data: {
          game: this._sanitizeGame(game),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/games/:id/submit
   * Submit an answer for a specific game.
   */
  async submitAnswer(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { questionId, answer, timeSpent } = req.body;

      const result = await gameService.submitAnswer(
        id, userId, questionId, answer, timeSpent,
      );

      return res.json({
        success: true,
        data: {
          game: this._sanitizeGame(result.game),
          correct: result.correct,
          isGameOver: result.isGameOver,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/games/:id/state
   * Update game state (pause, resume, abandon).
   */
  async updateGameState(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { status, gameState } = req.body;

      const game = await gameService.updateState(id, userId, status, gameState);

      return res.json({
        success: true,
        data: {
          game: this._sanitizeGame(game),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/games/:id/complete
   * Complete a game manually.
   */
  async completeGame(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const game = await gameService.completeGame(id, userId);

      return res.json({
        success: true,
        data: {
          game: this._sanitizeGame(game),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Remove sensitive or unnecessary fields before sending to client.
   * @param {object} game
   * @returns {object}
   */
  _sanitizeGame(game) {
    if (!game) return null;

    return {
      id: game.id,
      userId: game.userId,
      status: game.status,
      score: game.score,
      totalQuestions: game.totalQuestions,
      correctAnswers: game.correctAnswers,
      accuracy: game.accuracy,
      isActive: game.isActive,
      duration: game.duration,
      gameState: {
        currentQuestionIndex: game.gameState.currentQuestionIndex,
        answeredQuestions: game.gameState.answeredQuestions,
        lives: game.gameState.lives,
        streak: game.gameState.streak,
      },
      startedAt: game.startedAt,
      completedAt: game.completedAt,
      createdAt: game.createdAt,
    };
  }
}

module.exports = new GameController();
