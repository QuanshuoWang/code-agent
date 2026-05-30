'use strict';

const logger = require('../utils/logger');

/**
 * ─── ScoringService ──────────────────────────────────────
 * Handles score calculation, leaderboard logic, and
 * achievement/streak tracking for the GameComponent.
 */
class ScoringService {
  /**
   * Calculate score for a single answered question.
   *
   * @param {object} params
   * @param {boolean} params.correct - Whether the answer was correct
   * @param {number} params.timeSpent - Time spent in seconds
   * @param {number} params.difficulty - Question difficulty (1-5)
   * @param {number} params.streak - Current correct answer streak
   * @returns {{ score: number, breakdown: object }}
   */
  calculateQuestionScore({ correct, timeSpent = 10, difficulty = 1, streak = 0 }) {
    if (!correct) {
      return { score: 0, breakdown: { base: 0, timeBonus: 0, streakMultiplier: 0, difficultyMultiplier: 0 } };
    }

    const baseScore = 100;
    const timeBonus = Math.max(0, 30 - timeSpent) * 5;
    const streakMultiplier = 1 + (streak * 0.1);
    const difficultyMultiplier = 1 + ((difficulty - 1) * 0.25);

    const score = Math.round((baseScore + timeBonus) * streakMultiplier * difficultyMultiplier);

    return {
      score,
      breakdown: {
        base: baseScore,
        timeBonus,
        streakMultiplier,
        difficultyMultiplier,
      },
    };
  }

  /**
   * Calculate the final score for a completed game.
   * Includes accuracy bonus.
   *
   * @param {number} totalScore - Sum of all question scores
   * @param {number} totalQuestions
   * @param {number} correctAnswers
   * @returns {{ finalScore: number, accuracyBonus: number }}
   */
  calculateFinalScore(totalScore, totalQuestions, correctAnswers) {
    if (totalQuestions === 0) {
      return { finalScore: 0, accuracyBonus: 0 };
    }

    const accuracy = correctAnswers / totalQuestions;
    const accuracyBonus = accuracy >= 0.9
      ? Math.round(totalScore * 0.2)  // 20% bonus for 90%+ accuracy
      : accuracy >= 0.75
        ? Math.round(totalScore * 0.1) // 10% bonus for 75%+ accuracy
        : 0;

    return {
      finalScore: totalScore + accuracyBonus,
      accuracyBonus,
    };
  }

  /**
   * Determine rank/grade based on score.
   *
   * @param {number} score
   * @param {number} totalQuestions
   * @returns {{ rank: string, stars: number }}
   */
  calculateRank(score, totalQuestions) {
    const maxPossible = totalQuestions * 150; // rough max per question
    const ratio = maxPossible > 0 ? score / maxPossible : 0;

    if (ratio >= 0.95) return { rank: 'S', stars: 5 };
    if (ratio >= 0.85) return { rank: 'A', stars: 4 };
    if (ratio >= 0.70) return { rank: 'B', stars: 3 };
    if (ratio >= 0.50) return { rank: 'C', stars: 2 };
    if (ratio >= 0.30) return { rank: 'D', stars: 1 };
    return { rank: 'F', stars: 0 };
  }

  /**
   * Check and award achievements based on game stats.
   *
   * @param {object} stats - Game statistics
   * @returns {string[]} List of newly unlocked achievements
   */
  checkAchievements(stats) {
    const achievements = [];

    // Speed demon: completed game under 2 minutes
    if (stats.duration && stats.duration < 120) {
      achievements.push('speed_demon');
    }

    // Perfect game: 100% accuracy
    if (stats.totalQuestions > 0 && stats.accuracy === 100) {
      achievements.push('perfect_game');
    }

    // Streak master: 10+ correct answers in a row
    if (stats.maxStreak && stats.maxStreak >= 10) {
      achievements.push('streak_master');
    }

    // First game
    if (stats.totalGames === 1) {
      achievements.push('first_game');
    }

    // Veteran: 100 games completed
    if (stats.totalGames >= 100) {
      achievements.push('veteran');
    }

    logger.debug('Achievements checked', { userId: stats.userId, achievements });
    return achievements;
  }
}

module.exports = new ScoringService();
