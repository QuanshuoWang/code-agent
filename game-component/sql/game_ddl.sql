-- ──────────────────────────────────────────────────────────
-- Space Fractions - Game Component Database Schema
-- ──────────────────────────────────────────────────────────
-- This file defines the core tables for the GameComponent.
-- Manages game sessions and state persistence.
-- ──────────────────────────────────────────────────────────

-- ─── Extensions ──────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Enum: Game Status ───────────────────────────────────
CREATE TYPE game_status AS ENUM (
  'created',
  'playing',
  'paused',
  'completed',
  'abandoned'
);

-- ─── Table: games ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS games (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         VARCHAR(255) NOT NULL,
  status          game_status NOT NULL DEFAULT 'created',
  score           INTEGER NOT NULL DEFAULT 0,
  total_questions INTEGER NOT NULL DEFAULT 0,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  game_state      JSONB NOT NULL DEFAULT '{}'::jsonb,

  started_at      TIMESTAMP WITH TIME ZONE,
  completed_at    TIMESTAMP WITH TIME ZONE,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_games_user_id ON games (user_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games (status);
CREATE INDEX IF NOT EXISTS idx_games_user_status ON games (user_id, status);
CREATE INDEX IF NOT EXISTS idx_games_created_at ON games (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_game_state_gin ON games USING GIN (game_state);

-- ─── Trigger: auto-update updated_at ─────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_games_updated_at ON games;
CREATE TRIGGER trg_games_updated_at
  BEFORE UPDATE ON games
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ─── Table: game_events (audit log) ──────────────────────
CREATE TABLE IF NOT EXISTS game_events (
  id          BIGSERIAL PRIMARY KEY,
  game_id     UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  event_type  VARCHAR(100) NOT NULL,
  event_data  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_events_game_id ON game_events (game_id);
CREATE INDEX IF NOT EXISTS idx_game_events_created_at ON game_events (created_at DESC);
