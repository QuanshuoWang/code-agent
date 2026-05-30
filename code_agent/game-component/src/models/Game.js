'use strict';

const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../config/database');
const logger = require('../utils/logger');

/**
 * ─── Game Status Enum ────────────────────────────────────
 */
const GameStatus = Object.freeze({
  CREATED: 'created',
  PLAYING: 'playing',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ABANDONED: 'abandoned',
});

/**
 * ─── Game Model ──────────────────────────────────────────
 * Business entity representing a single game session.
 * Manages game state, scoring, and lifecycle.
 */
class Game {
  constructor(data = {}) {
    this.id = data.id || null;
    this.userId = data.user_id || data.userId || null;
    this.status = data.status || GameStatus.CREATED;
    this.score = data.score || 0;
    this.totalQuestions = data.total_questions || data.totalQuestions || 0;
    this.correctAnswers = data.correct_answers || data.correctAnswers || 0;
    this.gameState = data.game_state || data.gameState || {};
    this.startedAt = data.started_at || data.startedAt || null;
    this.completedAt = data.completed_at || data.completedAt || null;
    this.createdAt = data.created_at || data.createdAt || null;
    this.updatedAt = data.updated_at || data.updatedAt || null;
  }

  // ─── Computed Properties ───────────────────────────────

  get accuracy() {
    if (this.totalQuestions === 0) return 0;
    return Math.round((this.correctAnswers / this.totalQuestions) * 100);
  }

  get isActive() {
    return this.status === GameStatus.PLAYING || this.status === GameStatus.PAUSED;
  }

  get duration() {
    if (!this.startedAt) return 0;
    const end = this.completedAt || new Date();
    return Math.floor((new Date(end) - new Date(this.startedAt)) / 1000);
  }

  // ─── Database Operations ───────────────────────────────

  /**
   * Create a new game record in the database.
   * @param {string} userId - The user who starts the game
   * @returns {Promise<Game>} The created game instance
   */
  static async create(userId) {
    const id = uuidv4();
    const gameState = {
      currentQuestionIndex: 0,
      answeredQuestions: [],
      score: 0,
      lives: 3,
      streak: 0,
    };

    const sql = `
      INSERT INTO games (id, user_id, status, score, total_questions, correct_answers, game_state, started_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *;
    `;

    const params = [id, userId, GameStatus.PLAYING, 0, 0, 0, JSON.stringify(gameState)];
    const result = await query(sql, params);

    logger.info('Game created', { gameId: id, userId });
    return new Game(result.rows[0]);
  }

  /**
   * Find a game by its ID.
   * @param {string} id - Game UUID
   * @returns {Promise<Game|null>}
   */
  static async findById(id) {
    const sql = 'SELECT * FROM games WHERE id = $1;';
    const result = await query(sql, [id]);

    if (result.rows.length === 0) return null;
    return new Game(result.rows[0]);
  }

  /**
   * Find all active games for a specific user.
   * @param {string} userId
   * @returns {Promise<Game[]>}
   */
  static async findActiveByUserId(userId) {
    const sql = `
      SELECT * FROM games
      WHERE user_id = $1 AND status IN ('playing', 'paused')
      ORDER BY started_at DESC;
    `;
    const result = await query(sql, [userId]);
    return result.rows.map((row) => new Game(row));
  }

  /**
   * Find recent games for a user (completed).
   * @param {string} userId
   * @param {number} [limit=20]
   * @returns {Promise<Game[]>}
   */
  static async findRecentByUserId(userId, limit = 20) {
    const sql = `
      SELECT * FROM games
      WHERE user_id = $1 AND status = 'completed'
      ORDER BY completed_at DESC
      LIMIT $2;
    `;
    const result = await query(sql, [userId, limit]);
    return result.rows.map((row) => new Game(row));
  }

  /**
   * Persist updated game state to the database.
   * @returns {Promise<Game>}
   */
  async save() {
    const sql = `
      UPDATE games
      SET status = $1,
          score = $2,
          total_questions = $3,
          correct_answers = $4,
          game_state = $5,
          completed_at = $6,
          updated_at = NOW()
      WHERE id = $7
      RETURNING *;
    `;

    const params = [
      this.status,
      this.score,
      this.totalQuestions,
      this.correctAnswers,
      JSON.stringify(this.gameState),
      this.completedAt,
      this.id,
    ];

    const result = await query(sql, params);
    Object.assign(this, new Game(result.rows[0]));
    return this;
  }

  /**
   * Update only the game_state JSONB field.
   * @param {object} gameState
   * @returns {Promise<Game>}
   */
  async updateState(gameState) {
    this.gameState = { ...this.gameState, ...gameState };

    const sql = `
      UPDATE games
      SET game_state = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *;
    `;

    const result = await query(sql, [JSON.stringify(this.gameState), this.id]);
    Object.assign(this, new Game(result.rows[0]));
    return this;
  }

  /**
   * Mark game as completed with final score.
   * @returns {Promise<Game>}
   */
  async complete() {
    this.status = GameStatus.COMPLETED;
    this.completedAt = new Date();

    const sql = `
      UPDATE games
      SET status = $1, score = $2, total_questions = $3, correct_answers = $4,
          game_state = $5, completed_at = $6, updated_at = NOW()
      WHERE id = $7
      RETURNING *;
    `;

    const params = [
      this.status,
      this.score,
      this.totalQuestions,
      this.correctAnswers,
      JSON.stringify(this.gameState),
      this.completedAt,
      this.id,
    ];

    const result = await query(sql, params);
    Object.assign(this, new Game(result.rows[0]));
    return this;
  }

  /**
   * Delete a game record.
   * @returns {Promise<boolean>}
   */
  async delete() {
    const sql = 'DELETE FROM games WHERE id = $1;';
    const result = await query(sql, [this.id]);
    return result.rowCount > 0;
  }

  // ─── Static Aggregation Queries ────────────────────────

  /**
   * Get game statistics for a user.
   * @param {string} userId
   * @returns {Promise<object>}
   */
  static async getUserStats(userId) {
    const sql = `
      SELECT
        COUNT(*) AS total_games,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed_games,
        COALESCE(AVG(score) FILTER (WHERE status = 'completed'), 0) AS avg_score,
        COALESCE(MAX(score) FILTER (WHERE status = 'completed'), 0) AS best_score,
        COALESCE(SUM(total_questions) FILTER (WHERE status = 'completed'), 0) AS total_questions_answered,
        COALESCE(SUM(correct_answers) FILTER (WHERE status = 'completed'), 0) AS total_correct_answers
      FROM games
      WHERE user_id = $1;
    `;

    const result = await query(sql, [userId]);
    const stats = result.rows[0];

    return {
      totalGames: parseInt(stats.total_games, 10),
      completedGames: parseInt(stats.completed_games, 10),
      avgScore: parseFloat(stats.avg_score).toFixed(2),
      bestScore: parseInt(stats.best_score, 10),
      totalQuestionsAnswered: parseInt(stats.total_questions_answered, 10),
      totalCorrectAnswers: parseInt(stats.total_correct_answers, 10),
      overallAccuracy: stats.total_questions_answered > 0
        ? Math.round((stats.total_correct_answers / stats.total_questions_answered) * 100)
        : 0,
    };
  }
}

module.exports = { Game, GameStatus };
