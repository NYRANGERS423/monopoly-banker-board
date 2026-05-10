import { nanoid } from 'nanoid';
import type {
  ArchivedGameSummary,
  GameSettings,
  GameState,
  Player,
  Transaction,
} from '@monopoly/shared';
import { Repo } from '../db/repo.js';

export interface ApplyResult {
  state: GameState;
  transactions: Transaction[];
}

export class GameEngine {
  constructor(private repo: Repo) {}

  // ------- Read helpers -------
  state(): GameState {
    return this.repo.getFullState();
  }

  player(id: string): Player | null {
    return this.repo.getPlayer(id);
  }

  isNameTaken(name: string): boolean {
    return this.repo.getPlayerByName(name) !== null;
  }

  isColorTaken(color: string): boolean {
    return this.repo.getActivePlayers().some((p) => p.color === color);
  }

  // ------- Write helpers (all run inside a single SQLite transaction) -------

  joinPlayer(input: { name: string; color: string }): Player {
    return this.repo.tx(() => {
      const settings = this.repo.getSettings();
      if (this.isNameTaken(input.name)) {
        throw new EngineError('NAME_TAKEN', `The name "${input.name}" is already in use.`);
      }
      if (this.isColorTaken(input.color)) {
        throw new EngineError('COLOR_TAKEN', `That color is already in use.`);
      }
      const player = this.repo.insertPlayer({
        name: input.name,
        color: input.color,
        balance: settings.starting_balance,
      });
      this.repo.insertTransaction({
        from_kind: 'bank',
        from_id: null,
        to_kind: 'player',
        to_id: player.id,
        amount: settings.starting_balance,
        kind: 'player_joined',
        note: `Joined the game`,
        actor_id: 'system',
        group_id: null,
      });
      return player;
    });
  }

  bankPay(actorId: string, amount: number, note?: string): Transaction {
    this.requireAmount(amount);
    return this.repo.tx(() => {
      const player = this.requirePlayer(actorId);
      this.repo.updatePlayerBalance(player.id, player.balance - amount);
      return this.repo.insertTransaction({
        from_kind: 'player',
        from_id: player.id,
        to_kind: 'bank',
        to_id: null,
        amount,
        kind: 'bank_pay',
        note: note ?? null,
        actor_id: player.id,
        group_id: null,
      });
    });
  }

  bankCollect(actorId: string, amount: number, note?: string): Transaction {
    this.requireAmount(amount);
    return this.repo.tx(() => {
      const player = this.requirePlayer(actorId);
      this.repo.updatePlayerBalance(player.id, player.balance + amount);
      return this.repo.insertTransaction({
        from_kind: 'bank',
        from_id: null,
        to_kind: 'player',
        to_id: player.id,
        amount,
        kind: 'bank_collect',
        note: note ?? null,
        actor_id: player.id,
        group_id: null,
      });
    });
  }

  passGo(actorId: string): Transaction {
    return this.repo.tx(() => {
      const player = this.requirePlayer(actorId);
      const settings = this.repo.getSettings();
      this.repo.updatePlayerBalance(player.id, player.balance + settings.pass_go_amount);
      return this.repo.insertTransaction({
        from_kind: 'bank',
        from_id: null,
        to_kind: 'player',
        to_id: player.id,
        amount: settings.pass_go_amount,
        kind: 'pass_go',
        note: 'Pass GO',
        actor_id: player.id,
        group_id: null,
      });
    });
  }

  transfer(actorId: string, toId: string, amount: number, note?: string): Transaction {
    this.requireAmount(amount);
    return this.repo.tx(() => {
      const sender = this.requirePlayer(actorId);
      const recipient = this.repo.getPlayer(toId);
      if (!recipient || !recipient.is_active) {
        throw new EngineError('PLAYER_NOT_FOUND', 'Recipient is not in the game.');
      }
      if (recipient.id === sender.id) {
        throw new EngineError('SELF_TRANSFER', 'You cannot transfer to yourself.');
      }
      this.repo.updatePlayerBalance(sender.id, sender.balance - amount);
      this.repo.updatePlayerBalance(recipient.id, recipient.balance + amount);
      return this.repo.insertTransaction({
        from_kind: 'player',
        from_id: sender.id,
        to_kind: 'player',
        to_id: recipient.id,
        amount,
        kind: 'transfer',
        note: note ?? null,
        actor_id: sender.id,
        group_id: null,
      });
    });
  }

  freeParkingPay(actorId: string, amount: number, note?: string): Transaction {
    this.requireAmount(amount);
    return this.repo.tx(() => {
      this.requireFreeParkingEnabled();
      const player = this.requirePlayer(actorId);
      this.repo.updatePlayerBalance(player.id, player.balance - amount);
      const pot = this.repo.getFreeParkingPot();
      this.repo.setFreeParkingPot(pot + amount);
      return this.repo.insertTransaction({
        from_kind: 'player',
        from_id: player.id,
        to_kind: 'free_parking',
        to_id: null,
        amount,
        kind: 'free_parking_pay',
        note: note ?? null,
        actor_id: player.id,
        group_id: null,
      });
    });
  }

  freeParkingCollect(actorId: string): Transaction {
    return this.repo.tx(() => {
      this.requireFreeParkingEnabled();
      const player = this.requirePlayer(actorId);
      const pot = this.repo.getFreeParkingPot();
      if (pot <= 0) {
        throw new EngineError('EMPTY_POT', 'Free Parking pot is empty.');
      }
      this.repo.updatePlayerBalance(player.id, player.balance + pot);
      this.repo.setFreeParkingPot(0);
      return this.repo.insertTransaction({
        from_kind: 'free_parking',
        from_id: null,
        to_kind: 'player',
        to_id: player.id,
        amount: pot,
        kind: 'free_parking_collect',
        note: 'Claimed Free Parking',
        actor_id: player.id,
        group_id: null,
      });
    });
  }

  /** Charge each other active player `amountPerPlayer`. */
  chargeEach(actorId: string, amountPerPlayer: number, note?: string): Transaction[] {
    this.requireAmount(amountPerPlayer);
    return this.repo.tx(() => {
      const actor = this.requirePlayer(actorId);
      const others = this.repo.getActivePlayers().filter((p) => p.id !== actor.id);
      if (others.length === 0) {
        throw new EngineError('NO_OTHER_PLAYERS', 'No other players to charge.');
      }
      const groupId = nanoid(10);
      const txs: Transaction[] = [];
      let totalReceived = 0;
      for (const other of others) {
        this.repo.updatePlayerBalance(other.id, other.balance - amountPerPlayer);
        totalReceived += amountPerPlayer;
        txs.push(
          this.repo.insertTransaction({
            from_kind: 'player',
            from_id: other.id,
            to_kind: 'player',
            to_id: actor.id,
            amount: amountPerPlayer,
            kind: 'charge_each',
            note: note ?? null,
            actor_id: actor.id,
            group_id: groupId,
          })
        );
      }
      // Sum into the actor's balance in a single update.
      const refreshedActor = this.repo.getPlayer(actor.id);
      if (refreshedActor) {
        this.repo.updatePlayerBalance(refreshedActor.id, refreshedActor.balance + totalReceived);
      }
      return txs;
    });
  }

  /** Pay each other active player `amountPerPlayer`. */
  payEach(actorId: string, amountPerPlayer: number, note?: string): Transaction[] {
    this.requireAmount(amountPerPlayer);
    return this.repo.tx(() => {
      const actor = this.requirePlayer(actorId);
      const others = this.repo.getActivePlayers().filter((p) => p.id !== actor.id);
      if (others.length === 0) {
        throw new EngineError('NO_OTHER_PLAYERS', 'No other players to pay.');
      }
      const groupId = nanoid(10);
      const txs: Transaction[] = [];
      let totalPaid = 0;
      for (const other of others) {
        this.repo.updatePlayerBalance(other.id, other.balance + amountPerPlayer);
        totalPaid += amountPerPlayer;
        txs.push(
          this.repo.insertTransaction({
            from_kind: 'player',
            from_id: actor.id,
            to_kind: 'player',
            to_id: other.id,
            amount: amountPerPlayer,
            kind: 'pay_each',
            note: note ?? null,
            actor_id: actor.id,
            group_id: groupId,
          })
        );
      }
      const refreshedActor = this.repo.getPlayer(actor.id);
      if (refreshedActor) {
        this.repo.updatePlayerBalance(refreshedActor.id, refreshedActor.balance - totalPaid);
      }
      return txs;
    });
  }

  // ------- Admin actions -------

  adminOverrideBalance(
    adminPlayerId: string,
    targetId: string,
    newBalance: number,
    note?: string
  ): Transaction {
    if (!Number.isFinite(newBalance) || !Number.isInteger(newBalance)) {
      throw new EngineError('BAD_AMOUNT', 'Balance must be an integer.');
    }
    return this.repo.tx(() => {
      const target = this.repo.getPlayer(targetId);
      if (!target) {
        throw new EngineError('PLAYER_NOT_FOUND', 'Player not found.');
      }
      const delta = newBalance - target.balance;
      this.repo.updatePlayerBalance(target.id, newBalance);
      return this.repo.insertTransaction({
        from_kind: 'bank',
        from_id: null,
        to_kind: 'player',
        to_id: target.id,
        amount: Math.abs(delta),
        kind: 'admin_override',
        note: note ?? `Set balance to ${newBalance}`,
        actor_id: `admin:${adminPlayerId}`,
        group_id: null,
      });
    });
  }

  adminRemovePlayer(adminPlayerId: string, targetId: string): Transaction {
    return this.repo.tx(() => {
      const target = this.repo.getPlayer(targetId);
      if (!target) {
        throw new EngineError('PLAYER_NOT_FOUND', 'Player not found.');
      }
      const finalBalance = target.balance;
      this.repo.setPlayerActive(target.id, false);
      this.repo.updatePlayerBalance(target.id, 0);
      return this.repo.insertTransaction({
        from_kind: 'player',
        from_id: target.id,
        to_kind: 'bank',
        to_id: null,
        amount: Math.max(0, finalBalance),
        kind: 'admin_remove',
        note: `Removed (final balance: ${finalBalance})`,
        actor_id: `admin:${adminPlayerId}`,
        group_id: null,
      });
    });
  }

  adminNewGame(adminPlayerId: string, winnerId: string | null): ArchivedGameSummary {
    // Honor the caller's choice. The client pre-selects the top-balance player
    // in the dialog, so "default" behavior is preserved at the UI layer; null
    // here means the admin explicitly chose "No winner".
    if (winnerId !== null) {
      const player = this.repo.getPlayer(winnerId);
      if (!player || !player.is_active) {
        throw new EngineError(
          'PLAYER_NOT_FOUND',
          'Selected winner is not in the current game.'
        );
      }
    }
    const summary = this.repo.archiveAndReset({ winnerId });
    // Log into the (now-empty) new game's transactions so the audit chain is preserved.
    this.repo.insertTransaction({
      from_kind: 'bank',
      from_id: null,
      to_kind: 'bank',
      to_id: null,
      amount: 0,
      kind: 'admin_new_game',
      note: `New game started (previous winner: ${summary.winner_name ?? 'none'})`,
      actor_id: `admin:${adminPlayerId}`,
      group_id: null,
    });
    return summary;
  }

  adminUpdateSettings(adminPlayerId: string, partial: Partial<GameSettings>): GameSettings {
    return this.repo.tx(() => {
      const before = this.repo.getSettings();

      // Detect a scale change. classic <-> millions uses Hasbro's 10,000x scaling.
      let appliedPartial: Partial<GameSettings> = { ...partial };
      let scaleNote: string | null = null;
      if (
        partial.currency_scale !== undefined &&
        partial.currency_scale !== before.currency_scale
      ) {
        const factor = partial.currency_scale === 'millions' ? 10_000 : 1 / 10_000;
        // Convert all balances and the pot.
        this.repo.scaleAllBalances(factor);
        this.repo.setFreeParkingPot(
          Math.round(this.repo.getFreeParkingPot() * factor)
        );
        // Convert historical transaction amounts so the activity log displays
        // sensibly under the new scale.
        this.repo.scaleTransactionAmounts(factor);
        // Auto-scale starting_balance and pass_go_amount unless the admin
        // explicitly overrode them in the same call.
        if (appliedPartial.starting_balance === undefined) {
          appliedPartial.starting_balance = Math.round(before.starting_balance * factor);
        }
        if (appliedPartial.pass_go_amount === undefined) {
          appliedPartial.pass_go_amount = Math.round(before.pass_go_amount * factor);
        }
        scaleNote = `Scale → ${partial.currency_scale} (existing amounts ×${factor})`;
      }

      const next = this.repo.updateSettings(appliedPartial);
      const noteParts: string[] = [];
      for (const k of Object.keys(appliedPartial) as Array<keyof GameSettings>) {
        noteParts.push(`${k}=${appliedPartial[k]}`);
      }
      this.repo.insertTransaction({
        from_kind: 'bank',
        from_id: null,
        to_kind: 'bank',
        to_id: null,
        amount: 0,
        kind: 'admin_settings',
        note: scaleNote ?? `Settings: ${noteParts.join(', ')}`,
        actor_id: `admin:${adminPlayerId}`,
        group_id: null,
      });
      return next;
    });
  }

  adminDeleteArchived(adminPlayerId: string, gameNumber: number): void {
    const ok = this.repo.deleteArchived(gameNumber);
    if (!ok) {
      throw new EngineError('NOT_FOUND', `No archived game #${gameNumber}.`);
    }
    this.repo.insertTransaction({
      from_kind: 'bank',
      from_id: null,
      to_kind: 'bank',
      to_id: null,
      amount: 0,
      kind: 'admin_settings',
      note: `Deleted archived game #${gameNumber}`,
      actor_id: `admin:${adminPlayerId}`,
      group_id: null,
    });
  }

  adminSetGameNumber(adminPlayerId: string, n: number): void {
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
      throw new EngineError('BAD_AMOUNT', 'Game number must be a positive integer.');
    }
    const prev = this.repo.getGameStateRow().game_number;
    this.repo.setGameNumber(n);
    this.repo.insertTransaction({
      from_kind: 'bank',
      from_id: null,
      to_kind: 'bank',
      to_id: null,
      amount: 0,
      kind: 'admin_settings',
      note: `Game number changed: #${prev} → #${n}`,
      actor_id: `admin:${adminPlayerId}`,
      group_id: null,
    });
  }

  adminClearArchived(adminPlayerId: string): void {
    this.repo.clearArchived();
    this.repo.insertTransaction({
      from_kind: 'bank',
      from_id: null,
      to_kind: 'bank',
      to_id: null,
      amount: 0,
      kind: 'admin_settings',
      note: 'Cleared all archived games (game number reset to 1)',
      actor_id: `admin:${adminPlayerId}`,
      group_id: null,
    });
  }

  adminEditArchivedWinner(
    adminPlayerId: string,
    gameNumber: number,
    winnerName: string | null
  ): void {
    const ok = this.repo.updateArchivedWinner(gameNumber, winnerName);
    if (!ok) {
      throw new EngineError(
        'NOT_FOUND',
        `Could not update game #${gameNumber} — game not found or winner not in that game's player list.`
      );
    }
    this.repo.insertTransaction({
      from_kind: 'bank',
      from_id: null,
      to_kind: 'bank',
      to_id: null,
      amount: 0,
      kind: 'admin_settings',
      note: `Set winner of game #${gameNumber} to ${winnerName ?? '(none)'}`,
      actor_id: `admin:${adminPlayerId}`,
      group_id: null,
    });
  }

  adminSetFreeParkingPot(adminPlayerId: string, amount: number): void {
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
      throw new EngineError('BAD_AMOUNT', 'Pot value must be a non-negative integer.');
    }
    this.repo.tx(() => {
      this.repo.setFreeParkingPot(amount);
      this.repo.insertTransaction({
        from_kind: 'free_parking',
        from_id: null,
        to_kind: 'free_parking',
        to_id: null,
        amount,
        kind: 'admin_settings',
        note: `Free Parking pot set to ${amount}`,
        actor_id: `admin:${adminPlayerId}`,
        group_id: null,
      });
    });
  }

  // ------- Internal -------

  private requirePlayer(id: string): Player {
    const p = this.repo.getPlayer(id);
    if (!p || !p.is_active) {
      throw new EngineError('PLAYER_NOT_FOUND', 'Player not found in this game.');
    }
    return p;
  }

  private requireFreeParkingEnabled() {
    const settings = this.repo.getSettings();
    if (!settings.free_parking_enabled) {
      throw new EngineError('FREE_PARKING_DISABLED', 'Free Parking is disabled in settings.');
    }
  }

  private requireAmount(amount: number) {
    if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
      throw new EngineError('BAD_AMOUNT', 'Amount must be an integer.');
    }
    if (amount <= 0) {
      throw new EngineError('BAD_AMOUNT', 'Amount must be positive.');
    }
  }
}

export class EngineError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'EngineError';
  }
}
