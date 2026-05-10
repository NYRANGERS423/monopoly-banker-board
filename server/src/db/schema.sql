-- Monopoly Banker schema. Money is stored as INTEGER.
-- In classic mode 1 = $1; in millions mode 1 = $1M.

CREATE TABLE IF NOT EXISTS game_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  starting_balance INTEGER NOT NULL,
  pass_go_amount INTEGER NOT NULL,
  currency_scale TEXT NOT NULL CHECK (currency_scale IN ('classic', 'millions')),
  free_parking_enabled INTEGER NOT NULL DEFAULT 1,
  free_parking_pot INTEGER NOT NULL DEFAULT 0,
  game_started_at INTEGER NOT NULL,
  game_number INTEGER NOT NULL DEFAULT 1
);

-- name is intentionally NOT UNIQUE: when a player is admin-removed the row is
-- kept (is_active=0) so historical transactions still resolve, but the name
-- should be free for someone new to join with. Active uniqueness is enforced
-- in the engine's isNameTaken check.
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  balance INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  joined_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  from_kind TEXT NOT NULL CHECK (from_kind IN ('player', 'bank', 'free_parking')),
  from_id TEXT,
  to_kind TEXT NOT NULL CHECK (to_kind IN ('player', 'bank', 'free_parking')),
  to_id TEXT,
  amount INTEGER NOT NULL,
  kind TEXT NOT NULL,
  note TEXT,
  actor_id TEXT NOT NULL,
  group_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_transactions_ts ON transactions(ts DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_group ON transactions(group_id);

CREATE TABLE IF NOT EXISTS game_history (
  game_number INTEGER PRIMARY KEY,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  player_count INTEGER NOT NULL,
  transaction_count INTEGER NOT NULL,
  winner_id TEXT,
  winner_name TEXT,
  data TEXT NOT NULL
);
