import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Repo } from '../db/repo.js';
import { GameEngine, EngineError } from './engine.js';

let tmpDir: string;
let repo: Repo;
let engine: GameEngine;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monopoly-test-'));
  const dbPath = path.join(tmpDir, 'test.db');
  repo = new Repo(dbPath);
  engine = new GameEngine(repo);
});

afterEach(() => {
  repo.close();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

describe('GameEngine', () => {
  it('joins players with starting balance', () => {
    const p = engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    assert.equal(p.balance, 1500);
    assert.equal(p.is_active, true);
  });

  it('rejects duplicate names', () => {
    engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    assert.throws(() => engine.joinPlayer({ name: 'Sam', color: '#D55E00' }), EngineError);
  });

  it('rejects duplicate colors', () => {
    engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    assert.throws(() => engine.joinPlayer({ name: 'Kim', color: '#0072B2' }), EngineError);
  });

  it('pay bank decrements balance', () => {
    const p = engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    engine.bankPay(p.id, 200, 'Income Tax');
    const fresh = engine.player(p.id)!;
    assert.equal(fresh.balance, 1300);
  });

  it('collect from bank increments balance', () => {
    const p = engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    engine.bankCollect(p.id, 50, 'mortgage Baltic');
    assert.equal(engine.player(p.id)!.balance, 1550);
  });

  it('pass GO uses configured amount', () => {
    const p = engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    engine.passGo(p.id);
    assert.equal(engine.player(p.id)!.balance, 1700);
  });

  it('transfer moves money between players', () => {
    const sam = engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    const kim = engine.joinPlayer({ name: 'Kim', color: '#D55E00' });
    engine.transfer(sam.id, kim.id, 300, 'Boardwalk rent');
    assert.equal(engine.player(sam.id)!.balance, 1200);
    assert.equal(engine.player(kim.id)!.balance, 1800);
  });

  it('allows negative balances', () => {
    const sam = engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    const kim = engine.joinPlayer({ name: 'Kim', color: '#D55E00' });
    engine.transfer(sam.id, kim.id, 2000, 'Boardwalk hotel rent');
    assert.equal(engine.player(sam.id)!.balance, -500);
    assert.equal(engine.player(kim.id)!.balance, 3500);
  });

  it('refuses self-transfer', () => {
    const sam = engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    assert.throws(() => engine.transfer(sam.id, sam.id, 100), EngineError);
  });

  it('Free Parking pay then collect', () => {
    const sam = engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    const kim = engine.joinPlayer({ name: 'Kim', color: '#D55E00' });
    engine.freeParkingPay(sam.id, 200, 'Income Tax');
    assert.equal(engine.state().free_parking_pot, 200);
    engine.freeParkingPay(kim.id, 75, 'Luxury Tax');
    assert.equal(engine.state().free_parking_pot, 275);
    const tx = engine.freeParkingCollect(sam.id);
    assert.equal(tx.amount, 275);
    assert.equal(engine.state().free_parking_pot, 0);
    assert.equal(engine.player(sam.id)!.balance, 1500 - 200 + 275);
  });

  it('charge each charges all other players', () => {
    const sam = engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    engine.joinPlayer({ name: 'Kim', color: '#D55E00' });
    engine.joinPlayer({ name: 'Pat', color: '#009E73' });
    const txs = engine.chargeEach(sam.id, 10, 'Birthday');
    assert.equal(txs.length, 2);
    assert.equal(engine.player(sam.id)!.balance, 1520);
  });

  it('pay each pays all other players', () => {
    const sam = engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    engine.joinPlayer({ name: 'Kim', color: '#D55E00' });
    engine.joinPlayer({ name: 'Pat', color: '#009E73' });
    const txs = engine.payEach(sam.id, 50, 'Chairman of the Board');
    assert.equal(txs.length, 2);
    assert.equal(engine.player(sam.id)!.balance, 1400);
  });

  it('admin override sets balance exactly', () => {
    const sam = engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    engine.adminOverrideBalance('admin-id', sam.id, 999, 'correction');
    assert.equal(engine.player(sam.id)!.balance, 999);
  });

  it('admin remove zeros and deactivates', () => {
    const sam = engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    engine.adminRemovePlayer('admin-id', sam.id);
    const fresh = repo.getPlayer(sam.id)!;
    assert.equal(fresh.is_active, false);
    assert.equal(fresh.balance, 0);
  });

  it('removed player frees their name (and color) for someone else', () => {
    const sam = engine.joinPlayer({ name: 'Morgan', color: '#0072B2' });
    engine.adminRemovePlayer('admin-id', sam.id);
    // Same name AND color should both be available again.
    const replacement = engine.joinPlayer({ name: 'Morgan', color: '#0072B2' });
    assert.notEqual(replacement.id, sam.id);
    assert.equal(replacement.name, 'Morgan');
    // Case-insensitive too.
    const sam2 = engine.joinPlayer({ name: 'Sam', color: '#D55E00' });
    engine.adminRemovePlayer('admin-id', sam2.id);
    const replacement2 = engine.joinPlayer({ name: 'sam', color: '#D55E00' });
    assert.equal(replacement2.name, 'sam');
  });

  it('admin new game with explicit winner_id records that winner', () => {
    const sam = engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    const kim = engine.joinPlayer({ name: 'Kim', color: '#D55E00' });
    engine.transfer(sam.id, kim.id, 500); // Kim now $2000, Sam $1000
    const summary = engine.adminNewGame('admin-id', kim.id);
    assert.equal(summary.winner_name, 'Kim');
    const state = engine.state();
    assert.equal(state.players.length, 0);
    assert.equal(state.game_number, 2);
    assert.equal(state.free_parking_pot, 0);
  });

  it('admin new game with null winner_id records no winner (does not auto-pick)', () => {
    const sam = engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    const kim = engine.joinPlayer({ name: 'Kim', color: '#D55E00' });
    engine.transfer(sam.id, kim.id, 500); // Kim has the highest balance now
    const summary = engine.adminNewGame('admin-id', null);
    assert.equal(summary.winner_name, null);
    assert.equal(summary.winner_id, null);
  });

  it('admin new game rejects invalid winner_id', () => {
    engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    assert.throws(() => engine.adminNewGame('admin-id', 'bogus-id-not-in-game'));
  });

  it('leaderboard aggregates wins case-insensitively', () => {
    const sam = engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    engine.joinPlayer({ name: 'Kim', color: '#D55E00' });
    engine.adminNewGame('admin-id', sam.id);
    const sam2 = engine.joinPlayer({ name: 'sam', color: '#0072B2' }); // lowercase
    engine.joinPlayer({ name: 'Pat', color: '#009E73' });
    engine.adminNewGame('admin-id', sam2.id);
    const lb = repo.getLeaderboard();
    const samEntry = lb.find((e) => e.name === 'sam');
    assert.equal(samEntry?.wins, 2);
    assert.equal(samEntry?.games_played, 2);
  });

  it('updates settings without retroactively changing balances', () => {
    const sam = engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    engine.adminUpdateSettings('admin-id', { starting_balance: 2500 });
    assert.equal(engine.player(sam.id)!.balance, 1500); // unchanged
    const kim = engine.joinPlayer({ name: 'Kim', color: '#D55E00' });
    assert.equal(kim.balance, 2500);
  });

  it('rejects bad amounts', () => {
    const sam = engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    assert.throws(() => engine.bankPay(sam.id, 0));
    assert.throws(() => engine.bankPay(sam.id, -10));
    assert.throws(() => engine.bankPay(sam.id, 1.5));
  });

  it('admin deletes a single archived game', () => {
    const sam = engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    engine.adminNewGame('admin-id', sam.id);
    const sam2 = engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    engine.adminNewGame('admin-id', sam2.id);
    assert.equal(repo.getArchivedGames().length, 2);
    engine.adminDeleteArchived('admin-id', 1);
    const archived = repo.getArchivedGames();
    assert.equal(archived.length, 1);
    assert.equal(archived[0]!.game_number, 2);
  });

  it('admin clear archived resets game number to 1', () => {
    const sam = engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    engine.adminNewGame('admin-id', sam.id);
    const sam2 = engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    engine.adminNewGame('admin-id', sam2.id);
    assert.equal(engine.state().game_number, 3);
    engine.adminClearArchived('admin-id');
    assert.equal(repo.getArchivedGames().length, 0);
    assert.equal(engine.state().game_number, 1);
    // Next archive will be #1.
    const sam3 = engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    engine.adminNewGame('admin-id', sam3.id);
    assert.equal(repo.getArchivedGames()[0]!.game_number, 1);
    assert.equal(engine.state().game_number, 2);
  });

  it('admin edits archived winner', () => {
    const sam = engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    const kim = engine.joinPlayer({ name: 'Kim', color: '#D55E00' });
    engine.transfer(sam.id, kim.id, 100);
    engine.adminNewGame('admin-id', sam.id);
    let archived = repo.getArchivedGames();
    assert.equal(archived[0]!.winner_name, 'Sam');
    engine.adminEditArchivedWinner('admin-id', 1, 'Kim');
    archived = repo.getArchivedGames();
    assert.equal(archived[0]!.winner_name, 'Kim');
    // Leaderboard reflects the change.
    const lb = repo.getLeaderboard();
    const kimEntry = lb.find((e) => e.name === 'kim');
    assert.equal(kimEntry?.wins, 1);
  });

  it('admin edit winner rejects player not in that game', () => {
    const sam = engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    engine.adminNewGame('admin-id', sam.id);
    assert.throws(() => engine.adminEditArchivedWinner('admin-id', 1, 'Stranger'));
  });

  it('admin can clear an archived winner by passing null', () => {
    const sam = engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    engine.joinPlayer({ name: 'Kim', color: '#D55E00' });
    engine.adminNewGame('admin-id', sam.id);
    assert.equal(repo.getArchivedGames()[0]!.winner_name, 'Sam');
    // Sam was in the leaderboard with 1 win.
    assert.equal(repo.getLeaderboard().find((e) => e.name === 'sam')?.wins, 1);

    engine.adminEditArchivedWinner('admin-id', 1, null);
    assert.equal(repo.getArchivedGames()[0]!.winner_name, null);
    // Sam now has 0 wins — but still 1 game played.
    const samEntry = repo.getLeaderboard().find((e) => e.name === 'sam');
    assert.equal(samEntry?.wins, 0);
    assert.equal(samEntry?.games_played, 1);
  });

  it('switching scale to millions multiplies balances and settings by 10,000', () => {
    const sam = engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    const kim = engine.joinPlayer({ name: 'Kim', color: '#D55E00' });
    engine.transfer(sam.id, kim.id, 300); // Sam: 1200, Kim: 1800
    engine.freeParkingPay(sam.id, 200); // pot: 200, sam: 1000
    engine.adminUpdateSettings('admin-id', { currency_scale: 'millions' });
    const state = engine.state();
    assert.equal(state.settings.currency_scale, 'millions');
    assert.equal(state.settings.starting_balance, 15_000_000);
    assert.equal(state.settings.pass_go_amount, 2_000_000);
    assert.equal(state.free_parking_pot, 2_000_000);
    const samNew = state.players.find((p) => p.id === sam.id)!;
    const kimNew = state.players.find((p) => p.id === kim.id)!;
    assert.equal(samNew.balance, 10_000_000);
    assert.equal(kimNew.balance, 18_000_000);
    // Historical transaction amounts also scaled.
    const transferTx = state.transactions.find((t) => t.kind === 'transfer');
    assert.equal(transferTx?.amount, 3_000_000);
  });

  it('switching scale back to classic divides by 10,000', () => {
    const sam = engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    engine.adminUpdateSettings('admin-id', { currency_scale: 'millions' });
    // Sam now has 15,000,000.
    engine.adminUpdateSettings('admin-id', { currency_scale: 'classic' });
    const state = engine.state();
    assert.equal(state.settings.currency_scale, 'classic');
    assert.equal(state.settings.starting_balance, 1500);
    assert.equal(state.settings.pass_go_amount, 200);
    assert.equal(state.players.find((p) => p.id === sam.id)?.balance, 1500);
  });

  it('admin sets current game number', () => {
    engine.joinPlayer({ name: 'Sam', color: '#0072B2' });
    assert.equal(engine.state().game_number, 1);
    engine.adminSetGameNumber('admin-id', 5);
    assert.equal(engine.state().game_number, 5);
    // The renumbered game still archives properly with the new number.
    engine.adminNewGame('admin-id', null);
    const archived = repo.getArchivedGames();
    assert.equal(archived[0]!.game_number, 5);
    assert.equal(engine.state().game_number, 6);
    // Reject zero / negative.
    assert.throws(() => engine.adminSetGameNumber('admin-id', 0));
    assert.throws(() => engine.adminSetGameNumber('admin-id', -1));
  });
});

// Marker exports so tsc treats this as a module under isolatedModules.
export { before, after };
