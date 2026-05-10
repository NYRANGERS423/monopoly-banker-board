import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';
import type {
  ArchivedGame,
  ArchivedGameSummary,
  CurrencyScale,
  GameSettings,
  GameState,
  LeaderboardEntry,
  Player,
  Transaction,
  TransactionKind,
  EntityKind,
} from '@monopoly/shared';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PlayerRow {
  id: string;
  name: string;
  color: string;
  balance: number;
  is_active: number;
  joined_at: number;
}

interface TransactionRow {
  id: string;
  ts: number;
  from_kind: EntityKind;
  from_id: string | null;
  to_kind: EntityKind;
  to_id: string | null;
  amount: number;
  kind: TransactionKind;
  note: string | null;
  actor_id: string;
  group_id: string | null;
}

interface GameStateRow {
  id: number;
  starting_balance: number;
  pass_go_amount: number;
  currency_scale: CurrencyScale;
  free_parking_enabled: number;
  free_parking_pot: number;
  game_started_at: number;
  game_number: number;
}

interface GameHistoryRow {
  game_number: number;
  started_at: number;
  ended_at: number;
  player_count: number;
  transaction_count: number;
  winner_id: string | null;
  winner_name: string | null;
  data: string;
}

function rowToPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    balance: Number(row.balance),
    is_active: Number(row.is_active) === 1,
    joined_at: Number(row.joined_at),
  };
}

function rowToTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    ts: Number(row.ts),
    from_kind: row.from_kind,
    from_id: row.from_id,
    to_kind: row.to_kind,
    to_id: row.to_id,
    amount: Number(row.amount),
    kind: row.kind,
    note: row.note,
    actor_id: row.actor_id,
    group_id: row.group_id,
  };
}

export class Repo {
  private db: DatabaseSync;

  constructor(dbPath = config.dbPath) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');

    const schemaPath = path.resolve(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    this.db.exec(schema);

    this.runMigrations();
    this.ensureGameState();
  }

  /**
   * One-shot, idempotent schema migrations for databases created by older
   * versions. Each migration must be safe to skip if already applied.
   */
  private runMigrations() {
    // 2026-05: drop the UNIQUE constraint on players.name so that removed
    // players (is_active=0) don't permanently burn a name.
    const row = this.db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='players'")
      .get() as { sql?: string } | undefined;
    if (row?.sql && /\bUNIQUE\b/i.test(row.sql)) {
      this.db.exec(`
        BEGIN;
        CREATE TABLE players_new (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          color TEXT NOT NULL,
          balance INTEGER NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1,
          joined_at INTEGER NOT NULL
        );
        INSERT INTO players_new (id, name, color, balance, is_active, joined_at)
          SELECT id, name, color, balance, is_active, joined_at FROM players;
        DROP TABLE players;
        ALTER TABLE players_new RENAME TO players;
        COMMIT;
      `);
    }
  }

  close() {
    this.db.close();
  }

  private ensureGameState() {
    const row = this.db.prepare('SELECT id FROM game_state WHERE id = 1').get() as unknown as
      | { id: number }
      | undefined;
    if (!row) {
      this.db
        .prepare(
          `INSERT INTO game_state
           (id, starting_balance, pass_go_amount, currency_scale, free_parking_enabled, free_parking_pot, game_started_at, game_number)
           VALUES (1, ?, ?, ?, ?, 0, ?, 1)`
        )
        .run(
          config.defaultStartingBalance,
          config.defaultPassGoAmount,
          config.defaultCurrency,
          config.defaultFreeParkingEnabled ? 1 : 0,
          Date.now()
        );
    }
  }

  // ---------- Game state ----------

  getGameStateRow(): GameStateRow {
    const row = this.db.prepare('SELECT * FROM game_state WHERE id = 1').get() as unknown as GameStateRow;
    return {
      id: Number(row.id),
      starting_balance: Number(row.starting_balance),
      pass_go_amount: Number(row.pass_go_amount),
      currency_scale: row.currency_scale,
      free_parking_enabled: Number(row.free_parking_enabled),
      free_parking_pot: Number(row.free_parking_pot),
      game_started_at: Number(row.game_started_at),
      game_number: Number(row.game_number),
    };
  }

  getSettings(): GameSettings {
    const row = this.getGameStateRow();
    return {
      starting_balance: row.starting_balance,
      pass_go_amount: row.pass_go_amount,
      currency_scale: row.currency_scale,
      free_parking_enabled: row.free_parking_enabled === 1,
    };
  }

  getFreeParkingPot(): number {
    return this.getGameStateRow().free_parking_pot;
  }

  setFreeParkingPot(amount: number) {
    this.db.prepare('UPDATE game_state SET free_parking_pot = ? WHERE id = 1').run(amount);
  }

  /** Multiply every transaction's amount by `factor` (rounded to nearest integer). */
  scaleTransactionAmounts(factor: number) {
    this.db
      .prepare('UPDATE transactions SET amount = CAST(ROUND(amount * ?) AS INTEGER)')
      .run(factor);
  }

  /** Multiply every active+inactive player's balance by `factor`. */
  scaleAllBalances(factor: number) {
    this.db
      .prepare('UPDATE players SET balance = CAST(ROUND(balance * ?) AS INTEGER)')
      .run(factor);
  }

  updateSettings(partial: Partial<GameSettings>): GameSettings {
    const current = this.getSettings();
    const next: GameSettings = { ...current, ...partial };
    this.db
      .prepare(
        `UPDATE game_state
         SET starting_balance = ?, pass_go_amount = ?, currency_scale = ?, free_parking_enabled = ?
         WHERE id = 1`
      )
      .run(
        next.starting_balance,
        next.pass_go_amount,
        next.currency_scale,
        next.free_parking_enabled ? 1 : 0
      );
    return next;
  }

  // ---------- Players ----------

  getActivePlayers(): Player[] {
    const rows = this.db
      .prepare('SELECT * FROM players WHERE is_active = 1 ORDER BY joined_at ASC')
      .all() as unknown as PlayerRow[];
    return rows.map(rowToPlayer);
  }

  getAllPlayers(): Player[] {
    const rows = this.db.prepare('SELECT * FROM players ORDER BY joined_at ASC').all() as unknown as PlayerRow[];
    return rows.map(rowToPlayer);
  }

  getPlayer(id: string): Player | null {
    const row = this.db.prepare('SELECT * FROM players WHERE id = ?').get(id) as unknown as
      | PlayerRow
      | undefined;
    return row ? rowToPlayer(row) : null;
  }

  /**
   * Returns the *active* player with this name, or null. Removed players
   * (is_active=0) are intentionally ignored so their name can be reused.
   */
  getPlayerByName(name: string): Player | null {
    const row = this.db
      .prepare('SELECT * FROM players WHERE LOWER(name) = LOWER(?) AND is_active = 1')
      .get(name) as unknown as PlayerRow | undefined;
    return row ? rowToPlayer(row) : null;
  }

  insertPlayer(input: { name: string; color: string; balance: number }): Player {
    const id = nanoid(12);
    const joined_at = Date.now();
    this.db
      .prepare(
        `INSERT INTO players (id, name, color, balance, is_active, joined_at)
         VALUES (?, ?, ?, ?, 1, ?)`
      )
      .run(id, input.name, input.color, input.balance, joined_at);
    return {
      id,
      name: input.name,
      color: input.color,
      balance: input.balance,
      is_active: true,
      joined_at,
    };
  }

  updatePlayerBalance(id: string, newBalance: number) {
    this.db.prepare('UPDATE players SET balance = ? WHERE id = ?').run(newBalance, id);
  }

  setPlayerActive(id: string, isActive: boolean) {
    this.db.prepare('UPDATE players SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, id);
  }

  // ---------- Transactions ----------

  insertTransaction(tx: Omit<Transaction, 'id' | 'ts'> & { id?: string; ts?: number }): Transaction {
    const id = tx.id ?? nanoid(14);
    const ts = tx.ts ?? Date.now();
    this.db
      .prepare(
        `INSERT INTO transactions
         (id, ts, from_kind, from_id, to_kind, to_id, amount, kind, note, actor_id, group_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        ts,
        tx.from_kind,
        tx.from_id,
        tx.to_kind,
        tx.to_id,
        tx.amount,
        tx.kind,
        tx.note,
        tx.actor_id,
        tx.group_id
      );
    return { id, ts, ...tx };
  }

  getRecentTransactions(limit = 200): Transaction[] {
    const rows = this.db
      .prepare('SELECT * FROM transactions ORDER BY ts DESC LIMIT ?')
      .all(limit) as unknown as TransactionRow[];
    return rows.map(rowToTransaction);
  }

  getAllTransactions(): Transaction[] {
    const rows = this.db
      .prepare('SELECT * FROM transactions ORDER BY ts ASC')
      .all() as unknown as TransactionRow[];
    return rows.map(rowToTransaction);
  }

  // ---------- State assembly ----------

  getFullState(): GameState {
    const gs = this.getGameStateRow();
    return {
      game_number: gs.game_number,
      game_started_at: gs.game_started_at,
      free_parking_pot: gs.free_parking_pot,
      settings: {
        starting_balance: gs.starting_balance,
        pass_go_amount: gs.pass_go_amount,
        currency_scale: gs.currency_scale,
        free_parking_enabled: gs.free_parking_enabled === 1,
      },
      players: this.getActivePlayers(),
      transactions: this.getRecentTransactions(500),
      // Default empty; the socket layer overlays current presence before broadcasting.
      connected_player_ids: [],
    };
  }

  // ---------- Atomic helpers ----------

  /** Run callback inside a single SQLite transaction; rolls back on throw. */
  tx<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // best-effort
      }
      throw err;
    }
  }

  // ---------- Game history / new game ----------

  archiveAndReset(opts: { winnerId: string | null }): ArchivedGameSummary {
    return this.tx(() => {
      const gs = this.getGameStateRow();
      const players = this.getAllPlayers();
      const transactions = this.getAllTransactions();
      const settings = this.getSettings();

      const winner = opts.winnerId ? players.find((p) => p.id === opts.winnerId) ?? null : null;
      const finalBalances = players
        .map((p) => ({ name: p.name, color: p.color, balance: p.balance }))
        .sort((a, b) => b.balance - a.balance);
      const topPayment = transactions.reduce((max, t) => Math.max(max, t.amount), 0);
      const totalMoneyMoved = transactions.reduce((sum, t) => sum + t.amount, 0);

      const summary: ArchivedGameSummary = {
        game_number: gs.game_number,
        started_at: gs.game_started_at,
        ended_at: Date.now(),
        player_count: players.length,
        transaction_count: transactions.length,
        winner_id: winner?.id ?? null,
        winner_name: winner?.name ?? null,
        final_balances: finalBalances,
        top_payment: topPayment,
        total_money_moved: totalMoneyMoved,
      };

      const blob: ArchivedGame['data'] = {
        players,
        transactions,
        settings,
      };

      this.db
        .prepare(
          `INSERT OR REPLACE INTO game_history
           (game_number, started_at, ended_at, player_count, transaction_count, winner_id, winner_name, data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          summary.game_number,
          summary.started_at,
          summary.ended_at,
          summary.player_count,
          summary.transaction_count,
          summary.winner_id,
          summary.winner_name,
          JSON.stringify({ summary, blob })
        );

      // Reset for new game; settings preserved.
      this.db.prepare('DELETE FROM transactions').run();
      this.db.prepare('DELETE FROM players').run();
      this.db
        .prepare(
          `UPDATE game_state
           SET free_parking_pot = 0,
               game_number = game_number + 1,
               game_started_at = ?
           WHERE id = 1`
        )
        .run(Date.now());

      return summary;
    });
  }

  resetEverything() {
    this.tx(() => {
      this.db.prepare('DELETE FROM transactions').run();
      this.db.prepare('DELETE FROM players').run();
      this.db.prepare('DELETE FROM game_history').run();
      this.db
        .prepare(
          `UPDATE game_state
           SET starting_balance = ?, pass_go_amount = ?, currency_scale = ?,
               free_parking_enabled = ?, free_parking_pot = 0,
               game_number = 1, game_started_at = ?
           WHERE id = 1`
        )
        .run(
          config.defaultStartingBalance,
          config.defaultPassGoAmount,
          config.defaultCurrency,
          config.defaultFreeParkingEnabled ? 1 : 0,
          Date.now()
        );
    });
  }

  getArchivedGames(): ArchivedGameSummary[] {
    const rows = this.db
      .prepare('SELECT * FROM game_history ORDER BY game_number DESC')
      .all() as unknown as GameHistoryRow[];
    return rows.map((row) => {
      const parsed = JSON.parse(row.data) as { summary: ArchivedGameSummary };
      return parsed.summary;
    });
  }

  getArchivedGame(gameNumber: number): GameHistoryRow | null {
    const row = this.db
      .prepare('SELECT * FROM game_history WHERE game_number = ?')
      .get(gameNumber) as unknown as GameHistoryRow | undefined;
    return row ?? null;
  }

  deleteArchived(gameNumber: number): boolean {
    const res = this.db
      .prepare('DELETE FROM game_history WHERE game_number = ?')
      .run(gameNumber);
    return Number(res.changes) > 0;
  }

  /** Wipe game_history and reset the current game's number to 1 so the next archive is #1 again. */
  clearArchived(): void {
    this.tx(() => {
      this.db.prepare('DELETE FROM game_history').run();
      this.db.prepare('UPDATE game_state SET game_number = 1 WHERE id = 1').run();
    });
  }

  setGameNumber(n: number): void {
    this.db.prepare('UPDATE game_state SET game_number = ? WHERE id = 1').run(n);
  }

  /**
   * Update an archived game's winner. Both the row columns and the embedded
   * JSON `summary.winner_*` fields are updated so leaderboard and history views agree.
   */
  updateArchivedWinner(gameNumber: number, winnerName: string | null): boolean {
    return this.tx(() => {
      const row = this.getArchivedGame(gameNumber);
      if (!row) return false;
      const parsed = JSON.parse(row.data) as {
        summary: ArchivedGameSummary;
        blob?: ArchivedGame['data'];
      };
      // Validate winner is in the game's final_balances (or null to clear).
      if (winnerName !== null) {
        const needle = winnerName.toLowerCase();
        const target = parsed.summary.final_balances.find(
          (fb) => fb.name.toLowerCase() === needle
        );
        if (!target) return false;
        winnerName = target.name; // canonical capitalization from the snapshot
      }
      parsed.summary.winner_id = null; // We don't track stable IDs across games.
      parsed.summary.winner_name = winnerName;
      this.db
        .prepare(
          `UPDATE game_history
           SET winner_id = NULL, winner_name = ?, data = ?
           WHERE game_number = ?`
        )
        .run(winnerName, JSON.stringify(parsed), gameNumber);
      return true;
    });
  }

  getLeaderboard(): LeaderboardEntry[] {
    const archived = this.getArchivedGames();
    type Agg = {
      display_name: string;
      color: string;
      wins: number;
      games_played: number;
      highest_balance: number;
      sum_balance: number;
      latest_ts: number;
    };
    const map = new Map<string, Agg>();

    for (const g of archived) {
      for (const fb of g.final_balances) {
        const key = fb.name.toLowerCase();
        const existing = map.get(key);
        const isWinner =
          g.winner_name !== null && g.winner_name.toLowerCase() === key ? 1 : 0;
        if (existing) {
          existing.games_played += 1;
          existing.wins += isWinner;
          existing.highest_balance = Math.max(existing.highest_balance, fb.balance);
          existing.sum_balance += fb.balance;
          if (g.ended_at >= existing.latest_ts) {
            existing.latest_ts = g.ended_at;
            existing.display_name = fb.name;
            existing.color = fb.color;
          }
        } else {
          map.set(key, {
            display_name: fb.name,
            color: fb.color,
            wins: isWinner,
            games_played: 1,
            highest_balance: fb.balance,
            sum_balance: fb.balance,
            latest_ts: g.ended_at,
          });
        }
      }
    }

    const entries: LeaderboardEntry[] = [];
    for (const [key, agg] of map.entries()) {
      entries.push({
        name: key,
        display_name: agg.display_name,
        color: agg.color,
        wins: agg.wins,
        games_played: agg.games_played,
        win_rate: agg.games_played > 0 ? agg.wins / agg.games_played : 0,
        highest_balance: agg.highest_balance,
        average_balance:
          agg.games_played > 0 ? Math.round(agg.sum_balance / agg.games_played) : 0,
      });
    }

    entries.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.win_rate !== a.win_rate) return b.win_rate - a.win_rate;
      return b.highest_balance - a.highest_balance;
    });
    return entries;
  }
}
