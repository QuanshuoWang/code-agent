'use strict';

const scoringService = require('../../src/services/scoringService');

// ─── Mocks ────────────────────────────────────────────────
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
}));

describe('ScoringService', () => {
  // ──────────────────────────────────────────────────────
  //  calculateQuestionScore
  // ──────────────────────────────────────────────────────
  describe('calculateQuestionScore', () => {
    it('should return zero score and zero breakdown when answer is incorrect', () => {
      const result = scoringService.calculateQuestionScore({
        correct: false,
        timeSpent: 10,
        difficulty: 1,
        streak: 0,
      });

      expect(result).toEqual({
        score: 0,
        breakdown: {
          base: 0,
          timeBonus: 0,
          streakMultiplier: 0,
          difficultyMultiplier: 0,
        },
      });
    });

    it('should calculate base score with default params when only correct=true', () => {
      // base=100, timeBonus=(30-10)*5=100, streakMult=1, diffMult=1
      // (100+100)*1*1 = 200
      const result = scoringService.calculateQuestionScore({
        correct: true,
      });

      expect(result.score).toBe(200);
      expect(result.breakdown.base).toBe(100);
      expect(result.breakdown.timeBonus).toBe(100); // default timeSpent=10
      expect(result.breakdown.streakMultiplier).toBe(1);
      expect(result.breakdown.difficultyMultiplier).toBe(1);
    });

    it('should reward faster answers with higher time bonus', () => {
      const fastResult = scoringService.calculateQuestionScore({
        correct: true,
        timeSpent: 2,
        difficulty: 1,
        streak: 0,
      });

      // base=100, timeBonus=(30-2)*5=140, (100+140)*1*1=240
      expect(fastResult.score).toBe(240);

      const slowResult = scoringService.calculateQuestionScore({
        correct: true,
        timeSpent: 25,
        difficulty: 1,
        streak: 0,
      });

      // base=100, timeBonus=(30-25)*5=25, (100+25)*1*1=125
      expect(slowResult.score).toBe(125);
    });

    it('should give zero time bonus when timeSpent exceeds 30 seconds', () => {
      const result = scoringService.calculateQuestionScore({
        correct: true,
        timeSpent: 35,
        difficulty: 1,
        streak: 0,
      });

      // base=100, timeBonus=max(0, -5)*5=0, (100+0)*1*1=100
      expect(result.score).toBe(100);
      expect(result.breakdown.timeBonus).toBe(0);
    });

    it('should apply streak multiplier correctly', () => {
      // streak=5 => multiplier=1+(5*0.1)=1.5
      const result = scoringService.calculateQuestionScore({
        correct: true,
        timeSpent: 10,
        difficulty: 1,
        streak: 5,
      });

      // base=100, timeBonus=100, (100+100)*1.5*1=300
      expect(result.score).toBe(300);
      expect(result.breakdown.streakMultiplier).toBe(1.5);
    });

    it('should apply difficulty multiplier correctly', () => {
      // difficulty=4 => multiplier=1+((4-1)*0.25)=1.75
      const result = scoringService.calculateQuestionScore({
        correct: true,
        timeSpent: 10,
        difficulty: 4,
        streak: 0,
      });

      // base=100, timeBonus=100, (100+100)*1*1.75=350
      expect(result.score).toBe(350);
      expect(result.breakdown.difficultyMultiplier).toBe(1.75);
    });

    it('should combine streak and difficulty multipliers', () => {
      // streak=3 => mult=1.3, difficulty=5 => mult=1+((5-1)*0.25)=2.0
      const result = scoringService.calculateQuestionScore({
        correct: true,
        timeSpent: 5,
        difficulty: 5,
        streak: 3,
      });

      // base=100, timeBonus=(30-5)*5=125, (100+125)*1.3*2.0=585
      expect(result.score).toBe(585);
      expect(result.breakdown.streakMultiplier).toBe(1.3);
      expect(result.breakdown.difficultyMultiplier).toBe(2.0);
    });

    it('should handle difficulty level 1 with no extra multiplier', () => {
      const result = scoringService.calculateQuestionScore({
        correct: true,
        timeSpent: 10,
        difficulty: 1,
        streak: 0,
      });

      expect(result.breakdown.difficultyMultiplier).toBe(1);
    });

    it('should handle zero streak correctly', () => {
      const result = scoringService.calculateQuestionScore({
        correct: true,
        timeSpent: 10,
        difficulty: 1,
        streak: 0,
      });

      expect(result.breakdown.streakMultiplier).toBe(1);
    });
  });

  // ──────────────────────────────────────────────────────
  //  calculateFinalScore
  // ──────────────────────────────────────────────────────
  describe('calculateFinalScore', () => {
    it('should return 0 for zero questions', () => {
      const result = scoringService.calculateFinalScore(1000, 0, 0);

      expect(result).toEqual({ finalScore: 0, accuracyBonus: 0 });
    });

    it('should give 20% accuracy bonus for 90%+ accuracy', () => {
      // 9/10 = 90% accuracy
      const result = scoringService.calculateFinalScore(1000, 10, 9);

      expect(result.accuracyBonus).toBe(200); // 1000 * 0.2 = 200
      expect(result.finalScore).toBe(1200);
    });

    it('should give 20% accuracy bonus for 100% accuracy', () => {
      const result = scoringService.calculateFinalScore(800, 8, 8);

      expect(result.accuracyBonus).toBe(160); // 800 * 0.2 = 160
      expect(result.finalScore).toBe(960);
    });

    it('should give 10% accuracy bonus for 75%-89.99% accuracy', () => {
      // 8/10 = 80% accuracy (>= 75%)
      const result = scoringService.calculateFinalScore(1000, 10, 8);

      expect(result.accuracyBonus).toBe(100); // 1000 * 0.1 = 100
      expect(result.finalScore).toBe(1100);
    });

    it('should give exactly 10% bonus at exactly 75% threshold', () => {
      // 3/4 = 75% accuracy
      const result = scoringService.calculateFinalScore(500, 4, 3);

      expect(result.accuracyBonus).toBe(50); // 500 * 0.1 = 50
      expect(result.finalScore).toBe(550);
    });

    it('should give no accuracy bonus for accuracy below 75%', () => {
      // 7/10 = 70% accuracy
      const result = scoringService.calculateFinalScore(1000, 10, 7);

      expect(result.accuracyBonus).toBe(0);
      expect(result.finalScore).toBe(1000);
    });

    it('should give no accuracy bonus for very low accuracy', () => {
      const result = scoringService.calculateFinalScore(500, 20, 5); // 25%

      expect(result.accuracyBonus).toBe(0);
      expect(result.finalScore).toBe(500);
    });

    it('should correctly round accuracy bonus to integer', () => {
      // 9/10 = 90% => 20% of 333 = 66.6 -> Math.round = 67
      const result = scoringService.calculateFinalScore(333, 10, 9);

      expect(result.accuracyBonus).toBe(67);
      expect(result.finalScore).toBe(400);
    });
  });

  // ──────────────────────────────────────────────────────
  //  calculateRank
  // ──────────────────────────────────────────────────────
  describe('calculateRank', () => {
    it('should return S rank with 5 stars for ratio >= 0.95', () => {
      // maxPossible = 10 * 150 = 1500, score=1450 => ratio=0.967
      const result = scoringService.calculateRank(1450, 10);

      expect(result).toEqual({ rank: 'S', stars: 5 });
    });

    it('should return A rank with 4 stars for ratio >= 0.85', () => {
      // maxPossible = 10 * 150 = 1500, score=1300 => ratio=0.867
      const result = scoringService.calculateRank(1300, 10);

      expect(result).toEqual({ rank: 'A', stars: 4 });
    });

    it('should return B rank with 3 stars for ratio >= 0.70', () => {
      // maxPossible = 10 * 150 = 1500, score=1100 => ratio=0.733
      const result = scoringService.calculateRank(1100, 10);

      expect(result).toEqual({ rank: 'B', stars: 3 });
    });

    it('should return C rank with 2 stars for ratio >= 0.50', () => {
      // maxPossible = 10 * 150 = 1500, score=800 => ratio=0.533
      const result = scoringService.calculateRank(800, 10);

      expect(result).toEqual({ rank: 'C', stars: 2 });
    });

    it('should return D rank with 1 star for ratio >= 0.30', () => {
      // maxPossible = 10 * 150 = 1500, score=500 => ratio=0.333
      const result = scoringService.calculateRank(500, 10);

      expect(result).toEqual({ rank: 'D', stars: 1 });
    });

    it('should return F rank with 0 stars for ratio < 0.30', () => {
      // maxPossible = 10 * 150 = 1500, score=200 => ratio=0.133
      const result = scoringService.calculateRank(200, 10);

      expect(result).toEqual({ rank: 'F', stars: 0 });
    });

    it('should handle zero totalQuestions gracefully', () => {
      const result = scoringService.calculateRank(0, 0);

      // maxPossible = 0 => ratio = 0 => falls to F
      expect(result).toEqual({ rank: 'F', stars: 0 });
    });

    it('should handle edge case exactly at rank boundary (0.95)', () => {
      // maxPossible = 20*150=3000, 0.95*3000=2850
      const result = scoringService.calculateRank(2850, 20);

      expect(result.rank).toBe('S');
    });

    it('should handle edge case just below rank boundary', () => {
      // maxPossible = 20*150=3000, 0.949*3000=2847
      const result = scoringService.calculateRank(2847, 20);

      expect(result.rank).toBe('A');
    });
  });

  // ──────────────────────────────────────────────────────
  //  checkAchievements
  // ──────────────────────────────────────────────────────
  describe('checkAchievements', () => {
    it('should unlock speed_demon when game duration < 120 seconds', () => {
      const achievements = scoringService.checkAchievements({
        duration: 90,
        totalQuestions: 10,
        accuracy: 80,
        totalGames: 5,
      });

      expect(achievements).toContain('speed_demon');
    });

    it('should NOT unlock speed_demon when duration >= 120 seconds', () => {
      const achievements = scoringService.checkAchievements({
        duration: 120,
        totalQuestions: 10,
        accuracy: 100,
        totalGames: 5,
      });

      expect(achievements).not.toContain('speed_demon');
    });

    it('should unlock perfect_game when accuracy is 100% and questions > 0', () => {
      const achievements = scoringService.checkAchievements({
        totalQuestions: 10,
        accuracy: 100,
        totalGames: 5,
      });

      expect(achievements).toContain('perfect_game');
    });

    it('should NOT unlock perfect_game when accuracy is less than 100%', () => {
      const achievements = scoringService.checkAchievements({
        totalQuestions: 10,
        accuracy: 99,
        totalGames: 5,
      });

      expect(achievements).not.toContain('perfect_game');
    });

    it('should NOT unlock perfect_game when totalQuestions is 0', () => {
      const achievements = scoringService.checkAchievements({
        totalQuestions: 0,
        accuracy: 100,
        totalGames: 5,
      });

      expect(achievements).not.toContain('perfect_game');
    });

    it('should unlock streak_master when maxStreak >= 10', () => {
      const achievements = scoringService.checkAchievements({
        maxStreak: 10,
        totalGames: 5,
      });

      expect(achievements).toContain('streak_master');
    });

    it('should unlock streak_master for higher streaks', () => {
      const achievements = scoringService.checkAchievements({
        maxStreak: 15,
        totalGames: 5,
      });

      expect(achievements).toContain('streak_master');
    });

    it('should NOT unlock streak_master when maxStreak < 10', () => {
      const achievements = scoringService.checkAchievements({
        maxStreak: 9,
        totalGames: 5,
      });

      expect(achievements).not.toContain('streak_master');
    });

    it('should unlock first_game when totalGames is exactly 1', () => {
      const achievements = scoringService.checkAchievements({
        totalGames: 1,
      });

      expect(achievements).toContain('first_game');
    });

    it('should NOT unlock first_game when totalGames > 1', () => {
      const achievements = scoringService.checkAchievements({
        totalGames: 2,
      });

      expect(achievements).not.toContain('first_game');
    });

    it('should unlock veteran when totalGames >= 100', () => {
      const achievements = scoringService.checkAchievements({
        totalGames: 100,
      });

      expect(achievements).toContain('veteran');
    });

    it('should NOT unlock veteran when totalGames < 100', () => {
      const achievements = scoringService.checkAchievements({
        totalGames: 99,
      });

      expect(achievements).not.toContain('veteran');
    });

    it('should return multiple achievements when multiple conditions are met', () => {
      const achievements = scoringService.checkAchievements({
        duration: 60,
        totalQuestions: 10,
        accuracy: 100,
        maxStreak: 12,
        totalGames: 1,
      });

      expect(achievements).toContain('speed_demon');
      expect(achievements).toContain('perfect_game');
      expect(achievements).toContain('streak_master');
      expect(achievements).toContain('first_game');
      expect(achievements).not.toContain('veteran');
    });

    it('should return empty array when no conditions are met', () => {
      const achievements = scoringService.checkAchievements({
        duration: 200,
        totalQuestions: 5,
        accuracy: 60,
        maxStreak: 3,
        totalGames: 50,
      });

      expect(achievements).toEqual([]);
    });

    it('should handle missing optional stats gracefully', () => {
      const achievements = scoringService.checkAchievements({
        totalGames: 5,
      });

      // duration undefined, accuracy undefined, maxStreak undefined
      expect(achievements).toEqual([]);
    });
  });
});
