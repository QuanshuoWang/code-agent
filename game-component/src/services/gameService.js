'use strict';

const { Game, GameStatus } = require('../models/Game');
const { getRedisClient } = require('../cache/redisClient');
const { publishEvent } = require('../messaging/rabbitmq');
const { gamesStarted, gamesCompleted, activeGames, gameDuration } = require('../utils/metrics');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const config = require('../config/index');

/**
 * ─── GameService ─────────────────────────────────────────
 * Core business logic for the GameComponent.
 * Manages the full lifecycle of a game session.
 */
class GameService {
  /**
   * Start a new game for a user.
   * Creates the game in PostgreSQL and caches initial state in Redis.
   * @param {string} userId
   * @returns {Promise<Game>}
   */
  async startGame(userId) {
    // Create game in database
    const game = await Game.create(userId);

    // Cache game state in Redis for fast access
    await this._cacheGameState(game);

    // Increment metric
    gamesStarted.inc();
    activeGames.inc();

    // Publish game started event
    await publishEvent('game.started', {
      gameId: game.id,
      userId,
      timestamp: new Date().toISOString(),
    });

    logger.info('Game started', { gameId: game.id, userId });
    return game;
  }

  /**
   * Retrieve a game by ID. First checks Redis cache,
   * falls back to PostgreSQL.
   * @param {string} gameId
   * @param {string} userId - For ownership verification
   * @returns {Promise<Game>}
   */
  async getGame(gameId, userId) {
    // Try cache first
    let game = await this._getCachedGame(gameId);

    if (!game) {
      // Fall back to database
      game = await Game.findById(gameId);
      if (game) {
        await this._cacheGameState(game);
      }
    }

    if (!game) {
      throw new AppError('Game not found', 404);
    }

    // Verify ownership
    if (game.userId !== userId) {
      throw new AppError('Access denied: this game does not belong to you', 403);
    }

    return game;
  }

  /**
   * Submit an answer for a question in the game.
   * Updates game score and state.
   * @param {string} gameId
   * @param {string} userId
   * @param {string} questionId
   * @param {*} answer
   * @param {number} [timeSpent]
   * @returns {Promise<{game: Game, correct: boolean, isGameOver: boolean}>}
   */
  async submitAnswer(gameId, userId, questionId, answer, timeSpent) {
    const game = await this.getGame(gameId, userId);

    if (game.status !== GameStatus.PLAYING) {
      throw new AppError('Game is not in playing state', 400);
    }

    // TODO: Validate answer with QuestionComponent via gRPC/HTTP
    // For now, simulate answer checking with a placeholder
    const correct = await this._checkAnswer(questionId, answer);

    // Update game state
    game.totalQuestions += 1;
    if (correct) {
      game.correctAnswers += 1;
      game.score += this._calculateScore(timeSpent || 10, game.gameState.streak || 0);
      game.gameState.streak = (game.gameState.streak || 0) + 1;
    } else {
      game.gameState.streak = 0;
      if (game.gameState.lives !== undefined) {
        game.gameState.lives -= 1;
      }
    }

    // Track answered questions
    game.gameState.answeredQuestions.push({
      questionId,
      correct,
      timeSpent: timeSpent || 0,
    });
    game.gameState.currentQuestionIndex += 1;

    // Check game over conditions
    const isGameOver = this._isGameOver(game);

    if (isGameOver) {
      await game.complete();
      await this._clearGameCache(gameId);
      activeGames.dec();
      gamesCompleted.inc();
      gameDuration.observe(game.duration);

      await publishEvent('game.completed', {
        gameId: game.id,
        userId,
        score: game.score,
        totalQuestions: game.totalQuestions,
        correctAnswers: game.correctAnswers,
        duration: game.duration,
        timestamp: new Date().toISOString(),
      });

      logger.info('Game completed', { gameId: game.id, userId, score: game.score });
    } else {
      await game.save();
      await this._cacheGameState(game);
    }

    return { game, correct, isGameOver };
  }

  /**
   * Update game state (pause, resume, abandon).
   * @param {string} gameId
   * @param {string} userId
   * @param {string} status - New status
   * @param {object} [gameState] - Optional state updates
   * @returns {Promise<Game>}
   */
  async updateState(gameId, userId, status, gameState) {
    const game = await this.getGame(gameId, userId);

    if (status === GameStatus.ABANDONED) {
      game.status = GameStatus.ABANDONED;
      await game.save();
      await this._clearGameCache(gameId);
      activeGames.dec();

      await publishEvent('game.abandoned', {
        gameId: game.id,
        userId,
        timestamp: new Date().toISOString(),
      });

      logger.info('Game abandoned', { gameId: game.id, userId });
    } else if (status === GameStatus.PAUSED || status === GameStatus.PLAYING) {
      game.status = status;
      if (gameState) {
        Object.assign(game.gameState, gameState);
      }
      await game.save();
      await this._cacheGameState(game);
    }

    return game;
  }

  /**
   * Complete a game manually.
   * @param {string} gameId
   * @param {string} userId
   * @returns {Promise<Game>}
   */
  async completeGame(gameId, userId) {
    const game = await this.getGame(gameId, userId);

    if (game.status === GameStatus.COMPLETED) {
      throw new AppError('Game is already completed', 400);
    }

    await game.complete();
    await this._clearGameCache(gameId);
    activeGames.dec();
    gamesCompleted.inc();
    gameDuration.observe(game.duration);

    await publishEvent('game.completed', {
      gameId: game.id,
      userId,
      score: game.score,
      totalQuestions: game.totalQuestions,
      correctAnswers: game.correctAnswers,
      duration: game.duration,
      timestamp: new Date().toISOString(),
    });

    logger.info('Game manually completed', { gameId: game.id, userId, score: game.score });
    return game;
  }

  /**
   * Get statistics for a user.
   * @param {string} userId
   * @returns {Promise<object>}
   */
  async getUserStats(userId) {
    return Game.getUserStats(userId);
  }

  /**
   * Get active games for a user.
   * @param {string} userId
   * @returns {Promise<Game[]>}
   */
  async getActiveGames(userId) {
    return Game.findActiveByUserId(userId);
  }

  /**
   * Get recent completed games for a user.
   * @param {string} userId
   * @param {number} limit
   * @returns {Promise<Game[]>}
   */
  async getRecentGames(userId, limit = 20) {
    return Game.findRecentByUserId(userId, limit);
  }

  // ─── Private Helpers ─────────────────────────────────

  /**
   * Calculate score for a correct answer.
   * Base score + time bonus + streak bonus.
   * @param {number} timeSpent - Seconds spent on the question
   * @param {number} streak - Current correct answer streak
   * @returns {number}
   */
  _calculateScore(timeSpent, streak) {
    const baseScore = 100;
    const timeBonus = Math.max(0, 30 - timeSpent) * 5; // Faster answers earn more
    const streakMultiplier = 1 + (streak * 0.1); // 10% per streak level
    return Math.round((baseScore + timeBonus) * streakMultiplier);
  }

  /**
   * Check if the game is over.
   * @param {Game} game
   * @returns {boolean}
   */
  _isGameOver(game) {
    // Game over if lives run out
    if (game.gameState.lives !== undefined && game.gameState.lives <= 0) {
      return true;
    }
    // Game over if max questions reached
    if (game.gameState.maxQuestions && game.totalQuestions >= game.gameState.maxQuestions) {
      return true;
    }
    return false;
  }

  /**
   * Validate answer against QuestionComponent.
   * @param {string} questionId
   * @param {*} answer
   * @returns {Promise<boolean>}
   */
  async _checkAnswer(questionId, answer) {
    // TODO: In production, call QuestionComponent via gRPC or HTTP
    // For now, simulate with a placeholder that always returns true
    // This will be replaced with actual QuestionComponent integration
    logger.debug('Answer check (placeholder)', { questionId, answer });
    return true;
  }

  // ─── Redis Caching ────────────────────────────────────

  /**
   * Cache game state in Redis for fast access.
   * @param {Game} game
   */
  async _cacheGameState(game) {
    try {
      const redis = getRedisClient();
      if (redis) {
        const key = `game:${game.id}`;
        await redis.set(key, JSON.stringify(game), 'EX', config.redis.ttl);
      }
    } catch (err) {
      logger.warn('Failed to cache game state in Redis', { gameId: game.id, error: err.message });
    }
  }

  /**
   * Retrieve game from Redis cache.
   * @param {string} gameId
   * @returns {Promise<Game|null>}
   */
  async _getCachedGame(gameId) {
    try {
      const redis = getRedisClient();
      if (redis) {
        const key = `game:${gameId}`;
        const data = await redis.get(key);
        if (data) {
          return new Game(JSON.parse(data));
        }
      }
    } catch (err) {
      logger.warn('Failed to retrieve game from Redis cache', { gameId, error: err.message });
    }
    return null;
  }

  /**
   * Clear game from Redis cache.
   * @param {string} gameId
   */
  async _clearGameCache(gameId) {
    try {
      const redis = getRedisClient();
      if (redis) {
        const key = `game:${gameId}`;
        await redis.del(key);
      }
    } catch (err) {
      logger.warn('Failed to clear game from Redis cache', { gameId, error: err.message });
    }
  }
}

module.exports = new GameService();
