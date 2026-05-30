'use strict';

const gameController = require('../../src/controllers/gameController');
const gameService = require('../../src/services/gameService');

// ─── Mocks ────────────────────────────────────────────────
jest.mock('../../src/services/gameService');

// Helper: create a mock Express response object
function mockResponse() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// Helper: create a mock Game-like object as returned by _sanitizeGame
function createMockSanitizedGame(overrides = {}) {
  return {
    id: 'game-uuid-123',
    userId: 'user-uuid-456',
    status: 'playing',
    score: 0,
    totalQuestions: 0,
    correctAnswers: 0,
    accuracy: 0,
    isActive: true,
    duration: 0,
    gameState: {
      currentQuestionIndex: 0,
      answeredQuestions: [],
      lives: 3,
      streak: 0,
    },
    startedAt: '2025-01-01T00:00:00.000Z',
    completedAt: null,
    createdAt: null,
    ...overrides,
  };
}

describe('GameController', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      user: { id: 'user-uuid-456', username: 'testuser', roles: ['player'] },
      params: {},
      query: {},
      body: {},
    };
    res = mockResponse();
    next = jest.fn();
  });

  // ──────────────────────────────────────────────────────
  //  createGame
  // ──────────────────────────────────────────────────────
  describe('createGame', () => {
    it('should return 201 with the created game data', async () => {
      const mockGame = createMockSanitizedGame();
      gameService.startGame.mockResolvedValue(mockGame);

      await gameController.createGame(req, res, next);

      expect(gameService.startGame).toHaveBeenCalledWith('user-uuid-456');
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { game: mockGame },
      });
    });

    it('should call next with error if gameService throws', async () => {
      const error = new Error('DB failure');
      gameService.startGame.mockRejectedValue(error);

      await gameController.createGame(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────
  //  getActiveGames
  // ──────────────────────────────────────────────────────
  describe('getActiveGames', () => {
    it('should return 200 with list of active games', async () => {
      const games = [
        createMockSanitizedGame({ id: 'game-1' }),
        createMockSanitizedGame({ id: 'game-2' }),
      ];
      gameService.getActiveGames.mockResolvedValue(games);

      await gameController.getActiveGames(req, res, next);

      expect(gameService.getActiveGames).toHaveBeenCalledWith('user-uuid-456');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { games, count: 2 },
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return empty list when no active games', async () => {
      gameService.getActiveGames.mockResolvedValue([]);

      await gameController.getActiveGames(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { games: [], count: 0 },
      });
    });

    it('should call next on error', async () => {
      const error = new Error('Service error');
      gameService.getActiveGames.mockRejectedValue(error);

      await gameController.getActiveGames(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // ──────────────────────────────────────────────────────
  //  getRecentGames
  // ──────────────────────────────────────────────────────
  describe('getRecentGames', () => {
    it('should return 200 with recent games and default limit', async () => {
      const games = [createMockSanitizedGame()];
      gameService.getRecentGames.mockResolvedValue(games);

      await gameController.getRecentGames(req, res, next);

      expect(gameService.getRecentGames).toHaveBeenCalledWith('user-uuid-456', 20);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { games, count: 1 },
      });
    });

    it('should use custom limit from query params', async () => {
      req.query.limit = '5';
      gameService.getRecentGames.mockResolvedValue([]);

      await gameController.getRecentGames(req, res, next);

      expect(gameService.getRecentGames).toHaveBeenCalledWith('user-uuid-456', 5);
    });

    it('should handle invalid limit query param gracefully', async () => {
      req.query.limit = 'abc';
      gameService.getRecentGames.mockResolvedValue([]);

      await gameController.getRecentGames(req, res, next);

      // parseInt('abc') = NaN, which is falsy, so falls back to 20
      expect(gameService.getRecentGames).toHaveBeenCalledWith('user-uuid-456', 20);
    });

    it('should call next on error', async () => {
      gameService.getRecentGames.mockRejectedValue(new Error('fail'));

      await gameController.getRecentGames(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // ──────────────────────────────────────────────────────
  //  getUserStats
  // ──────────────────────────────────────────────────────
  describe('getUserStats', () => {
    it('should return 200 with user stats', async () => {
      const stats = {
        totalGames: 10,
        completedGames: 8,
        avgScore: '1250.50',
        bestScore: 2500,
        totalQuestionsAnswered: 80,
        totalCorrectAnswers: 65,
        overallAccuracy: 81,
      };
      gameService.getUserStats.mockResolvedValue(stats);

      await gameController.getUserStats(req, res, next);

      expect(gameService.getUserStats).toHaveBeenCalledWith('user-uuid-456');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: stats,
      });
    });

    it('should call next on error', async () => {
      gameService.getUserStats.mockRejectedValue(new Error('stats error'));

      await gameController.getUserStats(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // ──────────────────────────────────────────────────────
  //  getGameById
  // ──────────────────────────────────────────────────────
  describe('getGameById', () => {
    it('should return 200 with the requested game', async () => {
      req.params.id = 'game-uuid-123';
      const mockGame = createMockSanitizedGame();
      gameService.getGame.mockResolvedValue(mockGame);

      await gameController.getGameById(req, res, next);

      expect(gameService.getGame).toHaveBeenCalledWith('game-uuid-123', 'user-uuid-456');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { game: mockGame },
      });
    });

    it('should call next if game not found (404 propagated)', async () => {
      req.params.id = 'nonexistent';
      const notFoundError = new Error('Game not found');
      notFoundError.statusCode = 404;
      gameService.getGame.mockRejectedValue(notFoundError);

      await gameController.getGameById(req, res, next);

      expect(next).toHaveBeenCalledWith(notFoundError);
    });

    it('should call next if access denied (403 propagated)', async () => {
      req.params.id = 'game-uuid-123';
      const accessError = new Error('Access denied');
      accessError.statusCode = 403;
      gameService.getGame.mockRejectedValue(accessError);

      await gameController.getGameById(req, res, next);

      expect(next).toHaveBeenCalledWith(accessError);
    });
  });

  // ──────────────────────────────────────────────────────
  //  submitAnswer
  // ──────────────────────────────────────────────────────
  describe('submitAnswer', () => {
    beforeEach(() => {
      req.params.id = 'game-uuid-123';
      req.body = {
        questionId: 'question-1',
        answer: '42',
        timeSpent: 10,
      };
    });

    it('should return 200 with submit result', async () => {
      const submitResult = {
        game: createMockSanitizedGame({ score: 225 }),
        correct: true,
        isGameOver: false,
      };
      gameService.submitAnswer.mockResolvedValue(submitResult);

      await gameController.submitAnswer(req, res, next);

      expect(gameService.submitAnswer).toHaveBeenCalledWith(
        'game-uuid-123', 'user-uuid-456', 'question-1', '42', 10,
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          game: submitResult.game,
          correct: true,
          isGameOver: false,
        },
      });
    });

    it('should handle game-over submission', async () => {
      const submitResult = {
        game: createMockSanitizedGame({ status: 'completed', score: 1500 }),
        correct: true,
        isGameOver: true,
      };
      gameService.submitAnswer.mockResolvedValue(submitResult);

      await gameController.submitAnswer(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          game: submitResult.game,
          correct: true,
          isGameOver: true,
        },
      });
    });

    it('should call next on service error', async () => {
      const error = new Error('Game is not in playing state');
      error.statusCode = 400;
      gameService.submitAnswer.mockRejectedValue(error);

      await gameController.submitAnswer(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // ──────────────────────────────────────────────────────
  //  updateGameState (pause/resume/abandon)
  // ──────────────────────────────────────────────────────
  describe('updateGameState', () => {
    beforeEach(() => {
      req.params.id = 'game-uuid-123';
      req.body = { status: 'paused', gameState: { note: 'break time' } };
    });

    it('should return 200 with updated game state', async () => {
      const updatedGame = createMockSanitizedGame({ status: 'paused' });
      gameService.updateState.mockResolvedValue(updatedGame);

      await gameController.updateGameState(req, res, next);

      expect(gameService.updateState).toHaveBeenCalledWith(
        'game-uuid-123', 'user-uuid-456', 'paused', { note: 'break time' },
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { game: updatedGame },
      });
    });

    it('should handle abandon state', async () => {
      req.body = { status: 'abandoned' };
      const abandonedGame = createMockSanitizedGame({ status: 'abandoned' });
      gameService.updateState.mockResolvedValue(abandonedGame);

      await gameController.updateGameState(req, res, next);

      expect(gameService.updateState).toHaveBeenCalledWith(
        'game-uuid-123', 'user-uuid-456', 'abandoned', undefined,
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { game: abandonedGame },
      });
    });

    it('should call next on service error', async () => {
      gameService.updateState.mockRejectedValue(new Error('Update failed'));

      await gameController.updateGameState(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // ──────────────────────────────────────────────────────
  //  completeGame
  // ──────────────────────────────────────────────────────
  describe('completeGame', () => {
    beforeEach(() => {
      req.params.id = 'game-uuid-123';
    });

    it('should return 200 with completed game', async () => {
      const completedGame = createMockSanitizedGame({ status: 'completed', score: 1500 });
      gameService.completeGame.mockResolvedValue(completedGame);

      await gameController.completeGame(req, res, next);

      expect(gameService.completeGame).toHaveBeenCalledWith('game-uuid-123', 'user-uuid-456');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { game: completedGame },
      });
    });

    it('should call next if game already completed', async () => {
      const conflictError = new Error('Game is already completed');
      conflictError.statusCode = 400;
      gameService.completeGame.mockRejectedValue(conflictError);

      await gameController.completeGame(req, res, next);

      expect(next).toHaveBeenCalledWith(conflictError);
    });
  });

  // ──────────────────────────────────────────────────────
  //  _sanitizeGame (private helper)
  // ──────────────────────────────────────────────────────
  describe('_sanitizeGame', () => {
    it('should strip out unwanted fields and return sanitized object', () => {
      const rawGame = {
        id: 'game-uuid-123',
        userId: 'user-uuid-456',
        status: 'playing',
        score: 500,
        totalQuestions: 10,
        correctAnswers: 7,
        accuracy: 70,
        isActive: true,
        duration: 300,
        gameState: {
          currentQuestionIndex: 5,
          answeredQuestions: [{}],
          lives: 2,
          streak: 3,
          internalField: 'should not appear',
        },
        startedAt: '2025-01-01T00:00:00.000Z',
        completedAt: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T01:00:00.000Z',
        internal_token: 'secret',
      };

      const sanitized = gameController._sanitizeGame(rawGame);

      expect(sanitized).toEqual({
        id: 'game-uuid-123',
        userId: 'user-uuid-456',
        status: 'playing',
        score: 500,
        totalQuestions: 10,
        correctAnswers: 7,
        accuracy: 70,
        isActive: true,
        duration: 300,
        gameState: {
          currentQuestionIndex: 5,
          answeredQuestions: [{}],
          lives: 2,
          streak: 3,
        },
        startedAt: '2025-01-01T00:00:00.000Z',
        completedAt: null,
        createdAt: '2025-01-01T00:00:00.000Z',
      });

      // Ensure sensitive/internal fields are excluded
      expect(sanitized.internal_token).toBeUndefined();
      expect(sanitized.updatedAt).toBeUndefined();
      expect(sanitized.gameState.internalField).toBeUndefined();
    });

    it('should return null if game is falsy', () => {
      expect(gameController._sanitizeGame(null)).toBeNull();
      expect(gameController._sanitizeGame(undefined)).toBeNull();
    });
  });
});
