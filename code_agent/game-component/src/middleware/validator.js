'use strict';

const Joi = require('joi');
const { AppError } = require('./errorHandler');

/**
 * Schema definitions for game-related request validation.
 */
const schemas = {
  createGame: Joi.object({
    userId: Joi.string().uuid().required(),
  }),

  submitAnswer: Joi.object({
    gameId: Joi.string().uuid().required(),
    questionId: Joi.string().required(),
    answer: Joi.alternatives().try(
      Joi.string(),
      Joi.number(),
      Joi.array().items(Joi.string()),
    ).required(),
    timeSpent: Joi.number().min(0).max(3600).optional(),
  }),

  updateGameState: Joi.object({
    status: Joi.string().valid('playing', 'paused', 'abandoned').optional(),
    gameState: Joi.object().optional(),
  }),

  getGameById: Joi.object({
    id: Joi.string().uuid().required(),
  }),

  getUserStats: Joi.object({
    userId: Joi.string().uuid().required(),
  }),
};

/**
 * Generic validation middleware factory.
 * @param {'body'|'params'|'query'} source - Which part of request to validate
 * @param {Joi.Schema} schema - Joi schema to validate against
 */
function validate(source, schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message,
      }));

      throw new AppError('Validation failed', 400, details);
    }

    // Replace with sanitized values
    req[source] = value;
    next();
  };
}

module.exports = { validate, schemas };
