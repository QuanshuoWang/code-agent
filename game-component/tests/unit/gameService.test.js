'use strict';

const { Game, GameStatus } = require('../models/Game');
const gameService = require('../../src/services/gameService');
const { getRedisClient } = require('../../src/cache/redisClient');
const { publishEvent } = require('../../src/messaging/rabbitmq');
const { gamesStarted, gamesCompleted, activeGames, gameDuration } = require('../../src/utils/metrics');
const { AppError } = require('../../src/middleware/errorHandler');

// ─── Mocks ────────────────────────────────────────────────
jest.mock('../../src/models/Game');
jest.mock('../../src/cache/redisClient');
jest.mock('../../src/messaging/rabbitmq');
jest.mock('../../src/utils/metrics', () => ({
  gamesStarted: { inc: jest.fn() },
  gamesCompleted: { inc: jest.fn() },
  activeGames: { inc: jest.fn(), dec: jest.fn() },
  gameDuration: { observe: jest.fn() },
}));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
}));
jest.mock('../../src/config/index', () => ({
  redis: { ttl: 3600 },
}));

// ─── Helper: create a mock game instance ─────────────────
function createMockGame(overrides = {}) {
  const defaults = {
    id: 'game-uuid-123',
    userId: 'user-uuid-456',
    status: GameStatus.PLAYING,
    score: 0,
    totalQuestions: 0,
    correctAnswers: 0,
    gameState: {
      currentQuestionIndex: 0,
      answeredQuestions: [],
      score: 0,
      lives: 3,
      streak: 0,
    },
    startedAt: new Date('2025-01-01T00:00:00Z'),
    completedAt: null,
    duration: 0,
    isActive: true,
    accuracy: 0,
    save: jest.fn().mockResolvedValue(true),
    complete: jest.fn().mockResolvedValue(true),
    updateState: jest.fn().mockResolvedValue(true),
    delete: jest.fn().mockResolvedValue(true),
  };

  return { ...defaults, ...overrides };
}

describe('GameService', () => {
  let mockRedis;
  let mockGame;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default Redis mock: return a mock client with set/get/del
    mockRedis = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
    };
    getRedisClient.mockReturnValue(mockRedis);

    // Default game instance
    mockGame = createMockGame();
  });

  // ──────────────────────────────────────────────────────
  //  startGame
  // ──────────────────────────────────────────────────────
  describe('startGame', () => {
    it('should create a new game, cache it in Redis, increment metrics, and publish event', async () => {
      Game.create.mockResolvedValue(mockGame);

      const result = await gameService.startGame('user-uuid-456');

      expect(Game.create).toHaveBeenCalledTimes(1);
      expect(Game.create).toHaveBeenCalledWith('user-uuid-456');

      // Redis cache called
      expect(mockRedis.set).toHaveBeenCalledWith(
        'game:game-uuid-123',
        expect.any(String),
        'EX',
        3600,
      );

      // Metrics incremented
      expect(gamesStarted.inc).toHaveBeenCalledTimes(1);
      expect(activeGames.inc).toHaveBeenCalledTimes(1);

      // Event published
      expect(publishEvent).toHaveBeenCalledWith('game.started', {
        gameId: 'game-uuid-123',
        userId: 'user-uuid-456',
        timestamp: expect.any(String),
      });

      expect(result).toEqual(mockGame);
    });

    it('should still return game even if Redis caching fails', async () => {
      Game.create.mockResolvedValue(mockGame);
      mockRedis.set.mockRejectedValue(new Error('Redis down'));

      const result = await gameService.startGame('user-uuid-456');

      expect(result).toEqual(mockGame);
      expect(mockRedis.set).toHaveBeenCalled();
      expect(publishEvent).toHaveBeenCalled();
    });

    it('should propagate error if Game.create fails', async () => {
      const dbError = new Error('Database connection failed');
      Game.create.mockRejectedValue(dbError);

      await expect(gameService.startGame('user-uuid-456')).rejects.toThrow('Database connection failed');
    });
  });

  // ──────────────────────────────────────────────────────
  //  getGame
  // ──────────────────────────────────────────────────────
  describe('getGame', () => {
    it('should return game from Redis cache when available', async () => {
      const cachedGame = createMockGame({ id: 'game-uuid-123', userId: 'user-uuid-456' });
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedGame));

      const result = await gameService.getGame('game-uuid-123', 'user-uuid-456');

      expect(mockRedis.get).toHaveBeenCalledWith('game:game-uuid-123');
      expect(Game.findById).not.toHaveBeenCalled();
      expect(result.id).toBe('game-uuid-123');
      expect(result.userId).toBe('user-uuid-456');
    });

    it('should fall back to database if Redis cache misses', async () => {
      mockRedis.get.mockResolvedValue(null);
      Game.findById.mockResolvedValue(mockGame);

      const result = await gameService.getGame('game-uuid-123', 'user-uuid-456');

      expect(mockRedis.get).toHaveBeenCalledWith('game:game-uuid-123');
      expect(Game.findById).toHaveBeenCalledWith('game-uuid-123');
      // Should re-cache the result
      expect(mockRedis.set).toHaveBeenCalledWith(
        'game:game-uuid-123',
        expect.any(String),
        'EX',
        3600,
      );
      expect(result).toEqual(mockGame);
    });

    it('should throw 404 if game not found in cache or database', async () => {
      mockRedis.get.mockResolvedValue(null);
      Game.findById.mockResolvedValue(null);

      await expect(
        gameService.getGame('nonexistent-id', 'user-uuid-456'),
      ).rejects.toThrow(AppError);

      await expect(
        gameService.getGame('nonexistent-id', 'user-uuid-456'),
      ).rejects.toMatchObject({ statusCode: 404, message: 'Game not found' });
    });

    it('should throw 403 if userId does not match game owner', async () => {
      mockRedis.get.mockResolvedValue(null);
      Game.findById.mockResolvedValue(mockGame); // game.userId = 'user-uuid-456'

      await expect(
        gameService.getGame('game-uuid-123', 'different-user'),
      ).rejects.toThrow(AppError);

      await expect(
        gameService.getGame('game-uuid-123', 'different-user'),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringContaining('Access denied'),
      });
    });

    it('should handle Redis error gracefully and fall back to DB', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));
      Game.findById.mockResolvedValue(mockGame);

      const result = await gameService.getGame('game-uuid-123', 'user-uuid-456');

      expect(Game.findById).toHaveBeenCalledWith('game-uuid-123');
      expect(result).toEqual(mockGame);
    });
  });

  // ──────────────────────────────────────────────────────
  //  submitAnswer
  // ──────────────────────────────────────────────────────
  describe('submitAnswer', () => {
    it('should correctly process a correct answer, updating score and streak', async () => {
      // getGame will be called internally — mock via Game.findById
      mockRedis.get.mockResolvedValue(null);
      Game.findById.mockResolvedValue(mockGame);

      const result = await gameService.submitAnswer(
        'game-uuid-123', 'user-uuid-456', 'question-1', '42', 5,
      );

      expect(result.correct).toBe(true);
      expect(result.isGameOver).toBe(false);

      // Game state updated
      expect(mockGame.totalQuestions).toBe(1);
      expect(mockGame.correctAnswers).toBe(1);
      expect(mockGame.gameState.streak).toBe(1);
      expect(mockGame.gameState.currentQuestionIndex).toBe(1);
      expect(mockGame.gameState.answeredQuestions.length).toBe(1);
      expect(mockGame.gameState.answeredQuestions[0]).toEqual({
        questionId: 'question-1',
        correct: true,
        timeSpent: 5,
      });

      // Score should be calculated: base=100, timeBonus=(30-5)*5=125, streak=0 => multiplier=1
      // (100+125)*1 = 225
      expect(mockGame.score).toBe(225);

      // Game saved (not completed)
      expect(mockGame.save).toHaveBeenCalledTimes(1);
      expect(mockGame.complete).not.toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalled(); // re-cached
      expect(publishEvent).not.toHaveBeenCalledWith('game.completed', expect.anything());
    });

    it('should handle a wrong answer by resetting streak and decrementing lives', async () => {
      // Override _checkAnswer to return false for this test
      const originalCheck = gameService._checkAnswer;
      gameService._checkAnswer = jest.fn().mockResolvedValue(false);

      mockRedis.get.mockResolvedValue(null);
      Game.findById.mockResolvedValue(mockGame);

      const result = await gameService.submitAnswer(
        'game-uuid-123', 'user-uuid-456', 'question-1', 'wrong', 10,
      );

      expect(result.correct).toBe(false);
      expect(result.isGameOver).toBe(false);

      expect(mockGame.totalQuestions).toBe(1);
      expect(mockGame.correctAnswers).toBe(0);
      expect(mockGame.gameState.streak).toBe(0);
      expect(mockGame.gameState.lives).toBe(2); // decreased from 3
      expect(mockGame.score).toBe(0); // no score for wrong answer

      // Restore original
      gameService._checkAnswer = originalCheck;
    });

    it('should trigger game over when lives reach 0', async () => {
      // Override _checkAnswer to return false
      const originalCheck = gameService._checkAnswer;
      gameService._checkAnswer = jest.fn().mockResolvedValue(false);

      mockGame.gameState.lives = 1;
      mockRedis.get.mockResolvedValue(null);
      Game.findById.mockResolvedValue(mockGame);

      const result = await gameService.submitAnswer(
        'game-uuid-123', 'user-uuid-456', 'question-1', 'wrong', 10,
      );

      expect(result.correct).toBe(false);
      expect(result.isGameOver).toBe(true);

      // Game should be completed
      expect(mockGame.complete).toHaveBeenCalledTimes(1);
      expect(mockRedis.del).toHaveBeenCalledWith('game:game-uuid-123');
      expect(activeGames.dec).toHaveBeenCalled();
      expect(gamesCompleted.inc).toHaveBeenCalled();
      expect(gameDuration.observe).toHaveBeenCalled();
      expect(publishEvent).toHaveBeenCalledWith('game.completed', expect.objectContaining({
        gameId: 'game-uuid-123',
        userId: 'user-uuid-456',
      }));

      // Restore
      gameService._checkAnswer = originalCheck;
    });

    it('should trigger game over when maxQuestions reached', async () => {
      mockGame.gameState.maxQuestions = 3;
      mockGame.totalQuestions = 2; // after this answer, it'll be 3 => game over
      mockRedis.get.mockResolvedValue(null);
      Game.findById.mockResolvedValue(mockGame);

      const result = await gameService.submitAnswer(
        'game-uuid-123', 'user-uuid-456', 'question-1', 'correct', 10,
      );

      expect(result.isGameOver).toBe(true);
      expect(mockGame.complete).toHaveBeenCalledTimes(1);
    });

    it('should throw 400 if game is not in playing state', async () => {
      mockGame.status = GameStatus.PAUSED;
      mockRedis.get.mockResolvedValue(null);
      Game.findById.mockResolvedValue(mockGame);

      await expect(
        gameService.submitAnswer('game-uuid-123', 'user-uuid-456', 'q1', 'ans', 10),
      ).rejects.toThrow(AppError);

      await expect(
        gameService.submitAnswer('game-uuid-123', 'user-uuid-456', 'q1', 'ans', 10),
      ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('not in playing') });
    });

    it('should use default timeSpent of 0 when not provided', async () => {
      const originalCheck = gameService._checkAnswer;
      gameService._checkAnswer = jest.fn().mockResolvedValue(true);

      mockRedis.get.mockResolvedValue(null);
      Game.findById.mockResolvedValue(mockGame);

      await gameService.submitAnswer(
        'game-uuid-123', 'user-uuid-456', 'question-1', 'ans',
      );

      expect(mockGame.gameState.answeredQuestions[0].timeSpent).toBe(0);

      gameService._checkAnswer = originalCheck;
    });
  });

  // ──────────────────────────────────────────────────────
  //  updateState (pause, resume, abandon)
  // ──────────────────────────────────────────────────────
  describe('updateState', () => {
    beforeEach(() => {
      mockRedis.get.mockResolvedValue(null);
      Game.findById.mockResolvedValue(mockGame);
    });

    it('should pause the game', async () => {
      const result = await gameService.updateState(
        'game-uuid-123', 'user-uuid-456', GameStatus.PAUSED,
      );

      expect(mockGame.status).toBe(GameStatus.PAUSED);
      expect(mockGame.save).toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalled(); // re-cached
      expect(result).toEqual(mockGame);
    });

    it('should resume the game (playing)', async () => {
      mockGame.status = GameStatus.PAUSED;

      const result = await gameService.updateState(
        'game-uuid-123', 'user-uuid-456', GameStatus.PLAYING,
      );

      expect(mockGame.status).toBe(GameStatus.PLAYING);
      expect(mockGame.save).toHaveBeenCalled();
    });

    it('should abandon the game, clear cache, and decrement active games', async () => {
      const result = await gameService.updateState(
        'game-uuid-123', 'user-uuid-456', GameStatus.ABANDONED,
      );

      expect(mockGame.status).toBe(GameStatus.ABANDONED);
      expect(mockGame.save).toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalledWith('game:game-uuid-123');
      expect(activeGames.dec).toHaveBeenCalled();
      expect(publishEvent).toHaveBeenCalledWith('game.abandoned', {
        gameId: 'game-uuid-123',
        userId: 'user-uuid-456',
        timestamp: expect.any(String),
      });
    });

    it('should apply optional gameState updates when pausing', async () => {
      const extraState = { customNote: 'taking a break' };

      await gameService.updateState(
        'game-uuid-123', 'user-uuid-456', GameStatus.PAUSED, extraState,
      );

      expect(mockGame.gameState.customNote).toBe('taking a break');
      expect(mockGame.save).toHaveBeenCalled();
    });

    it('should verify ownership before updating state', async () => {
      await expect(
        gameService.updateState('game-uuid-123', 'wrong-user', GameStatus.PAUSED),
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  // ──────────────────────────────────────────────────────
  //  completeGame (manual)
  // ──────────────────────────────────────────────────────
  describe('completeGame', () => {
    beforeEach(() => {
      mockRedis.get.mockResolvedValue(null);
      Game.findById.mockResolvedValue(mockGame);
    });

    it('should complete a game manually', async () => {
      const result = await gameService.completeGame('game-uuid-123', 'user-uuid-456');

      expect(mockGame.complete).toHaveBeenCalledTimes(1);
      expect(mockRedis.del).toHaveBeenCalledWith('game:game-uuid-123');
      expect(activeGames.dec).toHaveBeenCalled();
      expect(gamesCompleted.inc).toHaveBeenCalled();
      expect(gameDuration.observe).toHaveBeenCalled();
      expect(publishEvent).toHaveBeenCalledWith('game.completed', expect.objectContaining({
        gameId: 'game-uuid-123',
        userId: 'user-uuid-456',
      }));
      expect(result).toEqual(mockGame);
    });

    it('should throw 400 if game is already completed', async () => {
      mockGame.status = GameStatus.COMPLETED;

      await expect(
        gameService.completeGame('game-uuid-123', 'user-uuid-456'),
      ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('already completed') });
    });
  });

  // ──────────────────────────────────────────────────────
  //  getUserStats
  // ──────────────────────────────────────────────────────
  describe('getUserStats', () => {
    it('should return user stats from Game model', async () => {
      const mockStats = {
        totalGames: 10,
        completedGames: 8,
        avgScore: '1250.50',
        bestScore: 2500,
        totalQuestionsAnswered: 80,
        totalCorrectAnswers: 65,
        overallAccuracy: 81,
      };
      Game.getUserStats.mockResolvedValue(mockStats);

      const result = await gameService.getUserStats('user-uuid-456');

      expect(Game.getUserStats).toHaveBeenCalledWith('user-uuid-456');
      expect(result).toEqual(mockStats);
    });

    it('should return empty stats for new user', async () => {
      const emptyStats = {
        totalGames: 0,
        completedGames: 0,
        avgScore: '0.00',
        bestScore: 0,
        totalQuestionsAnswered: 0,
        totalCorrectAnswers: 0,
        overallAccuracy: 0,
      };
      Game.getUserStats.mockResolvedValue(emptyStats);

      const result = await gameService.getUserStats('new-user');

      expect(result.totalGames).toBe(0);
      expect(result.overallAccuracy).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────
  //  getActiveGames / getRecentGames
  // ──────────────────────────────────────────────────────
  describe('getActiveGames', () => {
    it('should return active games for a user', async () => {
      const mockGames = [createMockGame(), createMockGame({ id: 'game-2' })];
      Game.findActiveByUserId.mockResolvedValue(mockGames);

      const result = await gameService.getActiveGames('user-uuid-456');

      expect(Game.findActiveByUserId).toHaveBeenCalledWith('user-uuid-456');
      expect(result).toHaveLength(2);
    });
  });

  describe('getRecentGames', () => {
    it('should return recent completed games with default limit', async () => {
      const mockGames = [createMockGame({ id: 'game-1' })];
      Game.findRecentByUserId.mockResolvedValue(mockGames);

      const result = await gameService.getRecentGames('user-uuid-456');

      expect(Game.findRecentByUserId).toHaveBeenCalledWith('user-uuid-456', 20);
      expect(result).toEqual(mockGames);
    });

    it('should accept a custom limit parameter', async () => {
      Game.findRecentByUserId.mockResolvedValue([]);

      await gameService.getRecentGames('user-uuid-456', 5);

      expect(Game.findRecentByUserId).toHaveBeenCalledWith('user-uuid-456', 5);
    });
  });

  // ──────────────────────────────────────────────────────
  //  _calculateScore (private helper)
  // ──────────────────────────────────────────────────────
  describe('_calculateScore', () => {
    it('should calculate base score with time bonus and streak multiplier', () => {
      // base=100, timeBonus=(30-10)*5=100, streak=2 => multiplier=1.2
      // (100+100)*1.2 = 240
      const score = gameService._calculateScore(10, 2);
      expect(score).toBe(240);
    });

    it('should give max time bonus for very fast answers', () => {
      // timeSpent=1 => timeBonus=(30-1)*5=145
      const score = gameService._calculateScore(1, 0);
      expect(score).toBe(245); // (100+145)*1 = 245
    });

    it('should give zero time bonus for slow answers', () => {
      // timeSpent=40 => timeBonus=max(0,30-40)*5=0
      const score = gameService._calculateScore(40, 0);
      expect(score).toBe(100); // (100+0)*1 = 100
    });

    it('should handle high streak values', () => {
      // streak=10 => multiplier=1+(10*0.1)=2.0
      // timeSpent=5 => timeBonus=(30-5)*5=125
      // (100+125)*2.0 = 450
      const score = gameService._calculateScore(5, 10);
      expect(score).toBe(450);
    });
  });

  // ──────────────────────────────────────────────────────
  //  _isGameOver (private helper)
  // ──────────────────────────────────────────────────────
  describe('_isGameOver', () => {
    it('should return true when lives reach 0', () => {
      mockGame.gameState.lives = 0;
      expect(gameService._isGameOver(mockGame)).toBe(true);
    });

    it('should return true when lives are negative', () => {
      mockGame.gameState.lives = -1;
      expect(gameService._isGameOver(mockGame)).toBe(true);
    });

    it('should return true when maxQuestions reached', () => {
      mockGame.gameState.maxQuestions = 10;
      mockGame.totalQuestions = 10;
      expect(gameService._isGameOver(mockGame)).toBe(true);
    });

    it('should return false when game can continue', () => {
      mockGame.gameState.lives = 2;
      mockGame.totalQuestions = 5;
      mockGame.gameState.maxQuestions = 10;
      expect(gameService._isGameOver(mockGame)).toBe(false);
    });

    it('should return false when lives undefined and no maxQuestions', () => {
      delete mockGame.gameState.lives;
      delete mockGame.gameState.maxQuestions;
      expect(gameService._isGameOver(mockGame)).toBe(false);
    });
  });
});
