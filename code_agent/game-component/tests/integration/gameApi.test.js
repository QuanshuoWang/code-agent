'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');

// ─── Mock external dependencies BEFORE requiring app ────
jest.mock('jsonwebtoken');
jest.mock('ioredis');
jest.mock('amqplib');
jest.mock('winston', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
    add: jest.fn(),
    createLogger: jest.fn().mockReturnThis(),
    transports: {
      Console: jest.fn(),
      File: jest.fn(),
    },
    format: {
      combine: jest.fn(),
      timestamp: jest.fn(),
      errors: jest.fn(),
      colorize: jest.fn(),
      printf: jest.fn(),
      json: jest.fn(),
      splat: jest.fn(),
      simple: jest.fn(),
      align: jest.fn(),
      label: jest.fn(),
      uncolorize: jest.fn(),
      prettyPrint: jest.fn(),
      logstash: jest.fn(),
      padLevels: jest.fn(),
    },
  };
  return mockLogger;
});

// Mock prom-client
jest.mock('prom-client', () => {
  const mockMetric = {
    inc: jest.fn(),
    dec: jest.fn(),
    set: jest.fn(),
    observe: jest.fn(),
    labels: jest.fn().mockReturnThis(),
  };
  return {
    collectDefaultMetrics: jest.fn(),
    Counter: jest.fn().mockReturnValue(mockMetric),
    Gauge: jest.fn().mockReturnValue(mockMetric),
    Histogram: jest.fn().mockReturnValue(mockMetric),
    register: {
      contentType: 'text/plain',
      metrics: jest.fn().mockResolvedValue('mock metrics'),
    },
  };
});

// Mock ioredis to return a fake Redis client
const Redis = require('ioredis');
const mockRedisInstance = {
  set: jest.fn().mockResolvedValue('OK'),
  get: jest.fn().mockResolvedValue(null),
  del: jest.fn().mockResolvedValue(1),
  on: jest.fn().mockReturnThis(),
  once: jest.fn().mockReturnThis(),
  quit: jest.fn().mockResolvedValue('OK'),
  connect: jest.fn().mockResolvedValue(undefined),
};
Redis.mockImplementation(() => mockRedisInstance);

// Mock amqplib
const amqp = require('amqplib');
const mockChannel = {
  assertExchange: jest.fn().mockResolvedValue(undefined),
  publish: jest.fn().mockReturnValue(true),
  assertQueue: jest.fn().mockResolvedValue({ queue: 'test-queue' }),
  bindQueue: jest.fn().mockResolvedValue(undefined),
  consume: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  ack: jest.fn(),
  nack: jest.fn(),
};
const mockConnection = {
  createChannel: jest.fn().mockResolvedValue(mockChannel),
  on: jest.fn().mockReturnThis(),
  close: jest.fn().mockResolvedValue(undefined),
};
amqp.connect.mockResolvedValue(mockConnection);

// ─── Mock Game model ────────────────────────────────────
const { Game, GameStatus } = require('../../src/models/Game');
const mockGameData = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  user_id: 'user-uuid-789',
  userId: 'user-uuid-789',
  status: GameStatus.PLAYING,
  score: 0,
  total_questions: 0,
  totalQuestions: 0,
  correct_answers: 0,
  correctAnswers: 0,
  game_state: {
    currentQuestionIndex: 0,
    answeredQuestions: [],
    score: 0,
    lives: 3,
    streak: 0,
  },
  gameState: {
    currentQuestionIndex: 0,
    answeredQuestions: [],
    score: 0,
    lives: 3,
    streak: 0,
  },
  startedAt: new Date('2025-01-01T00:00:00.000Z'),
  started_at: new Date('2025-01-01T00:00:00.000Z'),
  completedAt: null,
  completed_at: null,
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  created_at: new Date('2025-01-01T00:00:00.000Z'),
  updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  updated_at: new Date('2025-01-01T00:00:00.000Z'),
  isActive: true,
  accuracy: 0,
  duration: 0,
  save: jest.fn().mockResolvedValue(true),
  complete: jest.fn().mockResolvedValue(true),
};

// Now require the Express app (mocks are already in place)
const app = require('../../src/app');

describe('Game API - Integration Tests', () => {
  // ─── Setup ──────────────────────────────────────────────
  beforeAll(() => {
    // Make jwt.verify return a known user for authenticated requests
    jwt.verify.mockImplementation((token) => {
      if (token === 'valid-token') {
        return {
          sub: 'user-uuid-789',
          username: 'testplayer',
          roles: ['player'],
        };
      }
      if (token === 'expired-token') {
        const err = new Error('Token has expired');
        err.name = 'TokenExpiredError';
        throw err;
      }
      throw new Error('Invalid token');
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────
  //  Health Check (no auth required)
  // ──────────────────────────────────────────────────────
  describe('GET /health', () => {
    it('should return 200 with service status', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'UP',
        service: 'space-fractions-game-component',
      });
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('uptime');
    });
  });

  // ──────────────────────────────────────────────────────
  //  Authentication
  // ──────────────────────────────────────────────────────
  describe('Authentication middleware', () => {
    it('should return 401 when no Authorization header provided', async () => {
      const res = await request(app).post('/api/v1/games');

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 401 with invalid token format', async () => {
      const res = await request(app)
        .post('/api/v1/games')
        .set('Authorization', 'InvalidHeader no-bearer');

      expect(res.status).toBe(401);
    });

    it('should return 401 with expired token', async () => {
      const res = await request(app)
        .post('/api/v1/games')
        .set('Authorization', 'Bearer expired-token');

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('expired');
    });

    it('should return 401 with completely invalid token', async () => {
      const res = await request(app)
        .post('/api/v1/games')
        .set('Authorization', 'Bearer totally-invalid');

      expect(res.status).toBe(401);
    });
  });

  // ──────────────────────────────────────────────────────
  //  POST /api/v1/games - Create Game
  // ──────────────────────────────────────────────────────
  describe('POST /api/v1/games', () => {
    it('should return 201 with created game data', async () => {
      Game.create.mockResolvedValue(mockGameData);

      const res = await request(app)
        .post('/api/v1/games')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('game');
      expect(res.body.data.game.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(res.body.data.game.userId).toBe('user-uuid-789');
      expect(res.body.data.game.status).toBe('playing');
      expect(res.body.data.game).not.toHaveProperty('updatedAt'); // sanitized
    });

    it('should return 500 when Game.create throws', async () => {
      Game.create.mockRejectedValue(new Error('Database is down'));

      const res = await request(app)
        .post('/api/v1/games')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ──────────────────────────────────────────────────────
  //  GET /api/v1/games/active
  // ──────────────────────────────────────────────────────
  describe('GET /api/v1/games/active', () => {
    it('should return 200 with list of active games', async () => {
      Game.findActiveByUserId.mockResolvedValue([mockGameData, { ...mockGameData, id: 'game-2' }]);

      const res = await request(app)
        .get('/api/v1/games/active')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.games).toHaveLength(2);
      expect(res.body.data.count).toBe(2);
    });

    it('should return 200 with empty list when no active games', async () => {
      Game.findActiveByUserId.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/games/active')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.data.games).toEqual([]);
      expect(res.body.data.count).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────
  //  GET /api/v1/games/recent
  // ──────────────────────────────────────────────────────
  describe('GET /api/v1/games/recent', () => {
    it('should return 200 with recent games (default limit 20)', async () => {
      Game.findRecentByUserId.mockResolvedValue([mockGameData]);

      const res = await request(app)
        .get('/api/v1/games/recent')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.count).toBe(1);
      expect(Game.findRecentByUserId).toHaveBeenCalledWith('user-uuid-789', 20);
    });

    it('should accept custom limit parameter', async () => {
      Game.findRecentByUserId.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/games/recent?limit=5')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(Game.findRecentByUserId).toHaveBeenCalledWith('user-uuid-789', 5);
    });
  });

  // ──────────────────────────────────────────────────────
  //  GET /api/v1/games/stats
  // ──────────────────────────────────────────────────────
  describe('GET /api/v1/games/stats', () => {
    it('should return 200 with user stats', async () => {
      const mockStats = {
        totalGames: 15,
        completedGames: 12,
        avgScore: '1850.75',
        bestScore: 5000,
        totalQuestionsAnswered: 120,
        totalCorrectAnswers: 95,
        overallAccuracy: 79,
      };
      Game.getUserStats.mockResolvedValue(mockStats);

      const res = await request(app)
        .get('/api/v1/games/stats')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(mockStats);
    });
  });

  // ──────────────────────────────────────────────────────
  //  GET /api/v1/games/:id
  // ──────────────────────────────────────────────────────
  describe('GET /api/v1/games/:id', () => {
    it('should return 200 with the requested game', async () => {
      Game.findById.mockResolvedValue(mockGameData);

      const res = await request(app)
        .get('/api/v1/games/550e8400-e29b-41d4-a716-446655440000')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.game.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should return 404 when game not found', async () => {
      Game.findById.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/games/nonexistent-id')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Game not found');
    });

    it('should return 403 when user does not own the game', async () => {
      const otherUserGame = { ...mockGameData, userId: 'other-user', user_id: 'other-user' };
      Game.findById.mockResolvedValue(otherUserGame);

      const res = await request(app)
        .get('/api/v1/games/550e8400-e29b-41d4-a716-446655440000')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Access denied');
    });
  });

  // ──────────────────────────────────────────────────────
  //  POST /api/v1/games/:id/submit
  // ──────────────────────────────────────────────────────
  describe('POST /api/v1/games/:id/submit', () => {
    it('should return 200 with correct answer result', async () => {
      Game.findById.mockResolvedValue(mockGameData);

      const res = await request(app)
        .post('/api/v1/games/550e8400-e29b-41d4-a716-446655440000/submit')
        .set('Authorization', 'Bearer valid-token')
        .send({
          questionId: 'q-1',
          answer: '42',
          timeSpent: 8,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('correct');
      expect(res.body.data).toHaveProperty('isGameOver');
      expect(res.body.data).toHaveProperty('game');
      // _checkAnswer always returns true in placeholder, so correct should be true
      expect(res.body.data.correct).toBe(true);
    });

    it('should return 400 when game is not in playing state', async () => {
      const pausedGame = { ...mockGameData, status: GameStatus.PAUSED };
      Game.findById.mockResolvedValue(pausedGame);

      const res = await request(app)
        .post('/api/v1/games/550e8400-e29b-41d4-a716-446655440000/submit')
        .set('Authorization', 'Bearer valid-token')
        .send({
          questionId: 'q-1',
          answer: '42',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('not in playing');
    });

    it('should return 404 when game not found', async () => {
      Game.findById.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/games/nonexistent/submit')
        .set('Authorization', 'Bearer valid-token')
        .send({ questionId: 'q-1', answer: '42' });

      expect(res.status).toBe(404);
    });
  });

  // ──────────────────────────────────────────────────────
  //  PATCH /api/v1/games/:id/state
  // ──────────────────────────────────────────────────────
  describe('PATCH /api/v1/games/:id/state', () => {
    it('should return 200 when pausing a game', async () => {
      Game.findById.mockResolvedValue(mockGameData);

      const res = await request(app)
        .patch('/api/v1/games/550e8400-e29b-41d4-a716-446655440000/state')
        .set('Authorization', 'Bearer valid-token')
        .send({ status: 'paused' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.game.status).toBe('paused');
    });

    it('should return 200 when abandoning a game', async () => {
      Game.findById.mockResolvedValue(mockGameData);

      const res = await request(app)
        .patch('/api/v1/games/550e8400-e29b-41d4-a716-446655440000/state')
        .set('Authorization', 'Bearer valid-token')
        .send({ status: 'abandoned' });

      expect(res.status).toBe(200);
      expect(res.body.data.game.status).toBe('abandoned');
    });

    it('should return 403 when user does not own the game', async () => {
      const otherUserGame = { ...mockGameData, userId: 'other-user', user_id: 'other-user' };
      Game.findById.mockResolvedValue(otherUserGame);

      const res = await request(app)
        .patch('/api/v1/games/550e8400-e29b-41d4-a716-446655440000/state')
        .set('Authorization', 'Bearer valid-token')
        .send({ status: 'paused' });

      expect(res.status).toBe(403);
    });
  });

  // ──────────────────────────────────────────────────────
  //  POST /api/v1/games/:id/complete
  // ──────────────────────────────────────────────────────
  describe('POST /api/v1/games/:id/complete', () => {
    it('should return 200 when completing a game manually', async () => {
      Game.findById.mockResolvedValue(mockGameData);

      const res = await request(app)
        .post('/api/v1/games/550e8400-e29b-41d4-a716-446655440000/complete')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.game.status).toBe('completed');
    });

    it('should return 400 when game is already completed', async () => {
      const completedGame = { ...mockGameData, status: GameStatus.COMPLETED };
      Game.findById.mockResolvedValue(completedGame);

      const res = await request(app)
        .post('/api/v1/games/550e8400-e29b-41d4-a716-446655440000/complete')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('already completed');
    });
  });

  // ──────────────────────────────────────────────────────
  //  404 for unknown routes
  // ──────────────────────────────────────────────────────
  describe('Unknown routes', () => {
    it('should return 404 for undefined routes', async () => {
      const res = await request(app).get('/api/v1/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Not Found');
    });
  });

  // ──────────────────────────────────────────────────────
  //  Complete flow: create -> submit -> complete
  // ──────────────────────────────────────────────────────
  describe('Full game flow', () => {
    it('should handle complete game lifecycle: create -> submit -> submit -> complete', async () => {
      // Step 1: Create game
      Game.create.mockResolvedValue(mockGameData);

      const createRes = await request(app)
        .post('/api/v1/games')
        .set('Authorization', 'Bearer valid-token');

      expect(createRes.status).toBe(201);
      expect(createRes.body.data.game.status).toBe('playing');

      // Step 2: Submit first answer
      Game.findById.mockResolvedValue(mockGameData);

      const submit1Res = await request(app)
        .post(`/api/v1/games/${mockGameData.id}/submit`)
        .set('Authorization', 'Bearer valid-token')
        .send({ questionId: 'q-1', answer: 'correct' });

      expect(submit1Res.status).toBe(200);
      expect(submit1Res.body.data.correct).toBe(true);
      expect(submit1Res.body.data.isGameOver).toBe(false);

      // Step 3: Complete the game manually
      Game.findById.mockResolvedValue(mockGameData);

      const completeRes = await request(app)
        .post(`/api/v1/games/${mockGameData.id}/complete`)
        .set('Authorization', 'Bearer valid-token');

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.data.game.status).toBe('completed');
    });
  });
});
