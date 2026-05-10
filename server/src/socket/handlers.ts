import type { Server } from 'socket.io';
import { z } from 'zod';
import type {
  ErrorPayload,
  GameArchivedPayload,
  GameState,
  JoinResult,
  ToastPayload,
} from '@monopoly/shared';
import { GameEngine, EngineError } from '../game/engine.js';
import { Repo } from '../db/repo.js';
import { config } from '../config.js';
import {
  adminDeleteArchivedSchema,
  adminEditArchivedWinnerSchema,
  adminNewGameSchema,
  adminOverrideSchema,
  adminRemoveSchema,
  adminSetGameNumberSchema,
  adminSetPotSchema,
  adminSettingsSchema,
  adminUnlockSchema,
  amountSchema,
  joinSchema,
  multiSchema,
  rejoinSchema,
  transferSchema,
} from './events.js';

interface SocketData {
  player_id?: string;
  is_admin: boolean;
}

// Loose socket type — Zod validates payloads at runtime, so the strict
// event-name typing from socket.io adds no safety here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSocket = any;

type Ack<T> = (response: { ok: true; data: T } | { ok: false; error: ErrorPayload }) => void;

function emitError<T>(ack: Ack<T> | undefined, code: string, message: string) {
  if (ack) ack({ ok: false, error: { code, message } });
}

function ok<T>(ack: Ack<T> | undefined, data: T) {
  if (ack) ack({ ok: true, data });
}

function emitToast(io: Server, toast: ToastPayload) {
  if (toast.target_id) {
    for (const [, sock] of io.sockets.sockets) {
      const s = sock as LooseSocket;
      if (s.data.player_id === toast.target_id) {
        s.emit('toast', toast);
      }
    }
  } else {
    io.emit('toast', toast);
  }
}

export function registerHandlers(io: Server, repo: Repo, engine: GameEngine) {
  // ---- Presence tracking: which sockets are bound to which player_id ----
  const liveByPlayer = new Map<string, Set<string>>();

  function bindSocket(socketId: string, playerId: string) {
    let set = liveByPlayer.get(playerId);
    if (!set) {
      set = new Set();
      liveByPlayer.set(playerId, set);
    }
    set.add(socketId);
  }

  function unbindSocket(socketId: string, playerId: string | undefined) {
    if (!playerId) return;
    const set = liveByPlayer.get(playerId);
    if (!set) return;
    set.delete(socketId);
    if (set.size === 0) liveByPlayer.delete(playerId);
  }

  function connectedIds(): string[] {
    return Array.from(liveByPlayer.keys());
  }

  /** Boot any other sockets currently bound to playerId off of it. */
  function kickOthers(playerId: string, exceptSocketId: string, reason: string) {
    const set = liveByPlayer.get(playerId);
    if (!set) return;
    for (const sid of Array.from(set)) {
      if (sid === exceptSocketId) continue;
      const sock = io.sockets.sockets.get(sid);
      if (sock) {
        const ss = sock as LooseSocket;
        ss.data.player_id = undefined;
        ss.emit('kicked', { reason });
      }
      set.delete(sid);
    }
    if (set.size === 0) liveByPlayer.delete(playerId);
  }

  function stateWithPresence(): GameState {
    return { ...engine.state(), connected_player_ids: connectedIds() };
  }

  function broadcastState() {
    io.emit('state', stateWithPresence());
  }

  function broadcastLeaderboard() {
    io.emit('leaderboard', {
      leaderboard: repo.getLeaderboard(),
      archived: repo.getArchivedGames(),
    });
  }

  io.on('connection', (socket) => {
    const s = socket as LooseSocket;
    s.data.is_admin = false;

    // Send initial state on connect (anonymous; client decides whether to rejoin).
    s.emit('state', stateWithPresence());

    // ---------- join ----------
    s.on('join', (raw: unknown, ack: Ack<JoinResult>) => {
      const parsed = joinSchema.safeParse(raw);
      if (!parsed.success) {
        emitError(ack, 'BAD_PAYLOAD', flatten(parsed.error));
        return;
      }
      try {
        const player = engine.joinPlayer(parsed.data);
        unbindSocket(s.id, s.data.player_id);
        s.data.player_id = player.id;
        bindSocket(s.id, player.id);
        const state = stateWithPresence();
        ok(ack, { player_id: player.id, state, is_admin: false });
        broadcastState();
        emitToast(io, {
          message: `${player.name} joined the game.`,
          kind: 'info',
        });
      } catch (e) {
        handleError(ack, e);
      }
    });

    // ---------- rejoin (also used to "claim" an existing player from the join screen) ----------
    s.on('rejoin', (raw: unknown, ack: Ack<JoinResult>) => {
      const parsed = rejoinSchema.safeParse(raw);
      if (!parsed.success) {
        emitError(ack, 'BAD_PAYLOAD', flatten(parsed.error));
        return;
      }
      const player = engine.player(parsed.data.player_id);
      if (!player || !player.is_active) {
        emitError(ack, 'PLAYER_NOT_FOUND', 'Your previous session is no longer valid.');
        return;
      }
      // If this socket was previously bound to a different player, release that.
      if (s.data.player_id && s.data.player_id !== player.id) {
        unbindSocket(s.id, s.data.player_id);
      }
      // Boot any other sockets currently using this player_id.
      kickOthers(player.id, s.id, `${player.name} was claimed by another device.`);
      s.data.player_id = player.id;
      bindSocket(s.id, player.id);
      ok(ack, {
        player_id: player.id,
        state: stateWithPresence(),
        is_admin: s.data.is_admin,
      });
      // Other clients see updated presence.
      broadcastState();
    });

    // ---------- bank_pay ----------
    s.on('bank_pay', (raw: unknown, ack: Ack<{ ok: true }>) => {
      withActor(s, ack, () => {
        const parsed = amountSchema.safeParse(raw);
        if (!parsed.success) {
          emitError(ack, 'BAD_PAYLOAD', flatten(parsed.error));
          return;
        }
        try {
          engine.bankPay(s.data.player_id!, parsed.data.amount, parsed.data.note);
          ok(ack, { ok: true });
          broadcastState();
        } catch (e) {
          handleError(ack, e);
        }
      });
    });

    // ---------- bank_collect ----------
    s.on('bank_collect', (raw: unknown, ack: Ack<{ ok: true }>) => {
      withActor(s, ack, () => {
        const parsed = amountSchema.safeParse(raw);
        if (!parsed.success) {
          emitError(ack, 'BAD_PAYLOAD', flatten(parsed.error));
          return;
        }
        try {
          engine.bankCollect(s.data.player_id!, parsed.data.amount, parsed.data.note);
          ok(ack, { ok: true });
          broadcastState();
        } catch (e) {
          handleError(ack, e);
        }
      });
    });

    // ---------- pass_go ----------
    s.on('pass_go', (_raw: unknown, ack: Ack<{ ok: true }>) => {
      withActor(s, ack, () => {
        try {
          engine.passGo(s.data.player_id!);
          ok(ack, { ok: true });
          broadcastState();
        } catch (e) {
          handleError(ack, e);
        }
      });
    });

    // ---------- transfer ----------
    s.on('transfer', (raw: unknown, ack: Ack<{ ok: true }>) => {
      withActor(s, ack, () => {
        const parsed = transferSchema.safeParse(raw);
        if (!parsed.success) {
          emitError(ack, 'BAD_PAYLOAD', flatten(parsed.error));
          return;
        }
        try {
          const sender = engine.player(s.data.player_id!);
          const tx = engine.transfer(
            s.data.player_id!,
            parsed.data.to_id,
            parsed.data.amount,
            parsed.data.note
          );
          ok(ack, { ok: true });
          broadcastState();
          // Targeted toast to the recipient.
          const recipient = engine.player(parsed.data.to_id);
          if (sender && recipient) {
            emitToast(io, {
              message: `${sender.name} sent you $${tx.amount}${tx.note ? ` (${tx.note})` : ''}`,
              kind: 'success',
              target_id: recipient.id,
            });
          }
        } catch (e) {
          handleError(ack, e);
        }
      });
    });

    // ---------- free_parking_pay ----------
    s.on('free_parking_pay', (raw: unknown, ack: Ack<{ ok: true }>) => {
      withActor(s, ack, () => {
        const parsed = amountSchema.safeParse(raw);
        if (!parsed.success) {
          emitError(ack, 'BAD_PAYLOAD', flatten(parsed.error));
          return;
        }
        try {
          engine.freeParkingPay(s.data.player_id!, parsed.data.amount, parsed.data.note);
          ok(ack, { ok: true });
          broadcastState();
        } catch (e) {
          handleError(ack, e);
        }
      });
    });

    // ---------- free_parking_collect ----------
    s.on('free_parking_collect', (_raw: unknown, ack: Ack<{ ok: true }>) => {
      withActor(s, ack, () => {
        try {
          const tx = engine.freeParkingCollect(s.data.player_id!);
          ok(ack, { ok: true });
          broadcastState();
          const player = engine.player(s.data.player_id!);
          if (player) {
            emitToast(io, {
              message: `${player.name} claimed the Free Parking pot ($${tx.amount})`,
              kind: 'info',
            });
          }
        } catch (e) {
          handleError(ack, e);
        }
      });
    });

    // ---------- charge_each ----------
    s.on('charge_each', (raw: unknown, ack: Ack<{ ok: true }>) => {
      withActor(s, ack, () => {
        const parsed = multiSchema.safeParse(raw);
        if (!parsed.success) {
          emitError(ack, 'BAD_PAYLOAD', flatten(parsed.error));
          return;
        }
        try {
          engine.chargeEach(s.data.player_id!, parsed.data.amount_per_player, parsed.data.note);
          ok(ack, { ok: true });
          broadcastState();
          const actor = engine.player(s.data.player_id!);
          if (actor) {
            emitToast(io, {
              message: `${actor.name} charged each player $${parsed.data.amount_per_player}${
                parsed.data.note ? ` (${parsed.data.note})` : ''
              }`,
              kind: 'warning',
            });
          }
        } catch (e) {
          handleError(ack, e);
        }
      });
    });

    // ---------- pay_each ----------
    s.on('pay_each', (raw: unknown, ack: Ack<{ ok: true }>) => {
      withActor(s, ack, () => {
        const parsed = multiSchema.safeParse(raw);
        if (!parsed.success) {
          emitError(ack, 'BAD_PAYLOAD', flatten(parsed.error));
          return;
        }
        try {
          engine.payEach(s.data.player_id!, parsed.data.amount_per_player, parsed.data.note);
          ok(ack, { ok: true });
          broadcastState();
          const actor = engine.player(s.data.player_id!);
          if (actor) {
            emitToast(io, {
              message: `${actor.name} paid each player $${parsed.data.amount_per_player}${
                parsed.data.note ? ` (${parsed.data.note})` : ''
              }`,
              kind: 'success',
            });
          }
        } catch (e) {
          handleError(ack, e);
        }
      });
    });

    // ---------- admin_unlock ----------
    s.on('admin_unlock', (raw: unknown, ack: Ack<{ ok: true }>) => {
      const parsed = adminUnlockSchema.safeParse(raw);
      if (!parsed.success) {
        emitError(ack, 'BAD_PAYLOAD', flatten(parsed.error));
        return;
      }
      if (parsed.data.code !== config.adminCode) {
        emitError(ack, 'BAD_CODE', 'Incorrect admin code.');
        return;
      }
      s.data.is_admin = true;
      ok(ack, { ok: true });
    });

    // ---------- admin_override ----------
    s.on('admin_override', (raw: unknown, ack: Ack<{ ok: true }>) => {
      withAdmin(s, ack, () => {
        const parsed = adminOverrideSchema.safeParse(raw);
        if (!parsed.success) {
          emitError(ack, 'BAD_PAYLOAD', flatten(parsed.error));
          return;
        }
        try {
          engine.adminOverrideBalance(
            s.data.player_id ?? 'unknown',
            parsed.data.player_id,
            parsed.data.new_balance,
            parsed.data.note
          );
          ok(ack, { ok: true });
          broadcastState();
        } catch (e) {
          handleError(ack, e);
        }
      });
    });

    // ---------- admin_remove_player ----------
    s.on('admin_remove_player', (raw: unknown, ack: Ack<{ ok: true }>) => {
      withAdmin(s, ack, () => {
        const parsed = adminRemoveSchema.safeParse(raw);
        if (!parsed.success) {
          emitError(ack, 'BAD_PAYLOAD', flatten(parsed.error));
          return;
        }
        try {
          engine.adminRemovePlayer(s.data.player_id ?? 'unknown', parsed.data.player_id);
          // Boot any sockets bound to that player.
          kickOthers(parsed.data.player_id, '__none__', 'You were removed from the game.');
          // Also clean up if the admin themselves had bound to it (unlikely).
          unbindSocket(s.id, parsed.data.player_id);
          ok(ack, { ok: true });
          broadcastState();
        } catch (e) {
          handleError(ack, e);
        }
      });
    });

    // ---------- admin_new_game ----------
    s.on('admin_new_game', (raw: unknown, ack: Ack<{ ok: true }>) => {
      withAdmin(s, ack, () => {
        const parsed = adminNewGameSchema.safeParse(raw ?? {});
        if (!parsed.success) {
          emitError(ack, 'BAD_PAYLOAD', flatten(parsed.error));
          return;
        }
        try {
          const summary = engine.adminNewGame(
            s.data.player_id ?? 'unknown',
            parsed.data.winner_id ?? null
          );
          const leaderboard = repo.getLeaderboard();
          const archivedPayload: GameArchivedPayload = { archived: summary, leaderboard };
          // Tell every client the game ended (so they can show summary screen)…
          io.emit('game_archived', archivedPayload);
          // …then clear all bound player_ids on sockets and broadcast fresh state.
          for (const [, sock] of io.sockets.sockets) {
            const ss = sock as LooseSocket;
            ss.data.player_id = undefined;
          }
          liveByPlayer.clear();
          broadcastState();
          ok(ack, { ok: true });
        } catch (e) {
          handleError(ack, e);
        }
      });
    });

    // ---------- admin_update_settings ----------
    s.on('admin_update_settings', (raw: unknown, ack: Ack<{ ok: true }>) => {
      withAdmin(s, ack, () => {
        const parsed = adminSettingsSchema.safeParse(raw);
        if (!parsed.success) {
          emitError(ack, 'BAD_PAYLOAD', flatten(parsed.error));
          return;
        }
        try {
          engine.adminUpdateSettings(s.data.player_id ?? 'unknown', parsed.data);
          ok(ack, { ok: true });
          broadcastState();
        } catch (e) {
          handleError(ack, e);
        }
      });
    });

    // ---------- admin_set_pot ----------
    s.on('admin_set_pot', (raw: unknown, ack: Ack<{ ok: true }>) => {
      withAdmin(s, ack, () => {
        const parsed = adminSetPotSchema.safeParse(raw);
        if (!parsed.success) {
          emitError(ack, 'BAD_PAYLOAD', flatten(parsed.error));
          return;
        }
        try {
          engine.adminSetFreeParkingPot(s.data.player_id ?? 'unknown', parsed.data.amount);
          ok(ack, { ok: true });
          broadcastState();
        } catch (e) {
          handleError(ack, e);
        }
      });
    });

    // ---------- admin_set_game_number ----------
    s.on('admin_set_game_number', (raw: unknown, ack: Ack<{ ok: true }>) => {
      withAdmin(s, ack, () => {
        const parsed = adminSetGameNumberSchema.safeParse(raw);
        if (!parsed.success) {
          emitError(ack, 'BAD_PAYLOAD', flatten(parsed.error));
          return;
        }
        try {
          engine.adminSetGameNumber(s.data.player_id ?? 'unknown', parsed.data.game_number);
          ok(ack, { ok: true });
          broadcastState();
        } catch (e) {
          handleError(ack, e);
        }
      });
    });

    // ---------- admin_delete_archived ----------
    s.on('admin_delete_archived', (raw: unknown, ack: Ack<{ ok: true }>) => {
      withAdmin(s, ack, () => {
        const parsed = adminDeleteArchivedSchema.safeParse(raw);
        if (!parsed.success) {
          emitError(ack, 'BAD_PAYLOAD', flatten(parsed.error));
          return;
        }
        try {
          engine.adminDeleteArchived(s.data.player_id ?? 'unknown', parsed.data.game_number);
          ok(ack, { ok: true });
          broadcastLeaderboard();
        } catch (e) {
          handleError(ack, e);
        }
      });
    });

    // ---------- admin_clear_archived ----------
    s.on('admin_clear_archived', (_raw: unknown, ack: Ack<{ ok: true }>) => {
      withAdmin(s, ack, () => {
        try {
          engine.adminClearArchived(s.data.player_id ?? 'unknown');
          ok(ack, { ok: true });
          broadcastState(); // game_number changed
          broadcastLeaderboard();
        } catch (e) {
          handleError(ack, e);
        }
      });
    });

    // ---------- admin_edit_archived_winner ----------
    s.on('admin_edit_archived_winner', (raw: unknown, ack: Ack<{ ok: true }>) => {
      withAdmin(s, ack, () => {
        const parsed = adminEditArchivedWinnerSchema.safeParse(raw);
        if (!parsed.success) {
          emitError(ack, 'BAD_PAYLOAD', flatten(parsed.error));
          return;
        }
        try {
          engine.adminEditArchivedWinner(
            s.data.player_id ?? 'unknown',
            parsed.data.game_number,
            parsed.data.winner_name
          );
          ok(ack, { ok: true });
          broadcastLeaderboard();
        } catch (e) {
          handleError(ack, e);
        }
      });
    });

    // ---------- get_leaderboard ----------
    s.on('get_leaderboard', (_raw: unknown, ack: Ack<{ leaderboard: ReturnType<typeof repo.getLeaderboard>; archived: ReturnType<typeof repo.getArchivedGames> }>) => {
      ok(ack, {
        leaderboard: repo.getLeaderboard(),
        archived: repo.getArchivedGames(),
      });
    });

    s.on('disconnect', () => {
      // Free up the live binding so other devices can claim this player and
      // the join screen shows them as available again.
      const pid = s.data.player_id;
      if (pid) {
        unbindSocket(s.id, pid);
        broadcastState();
      }
    });
  });
}

function withActor<T>(
  s: LooseSocket,
  ack: Ack<T> | undefined,
  fn: () => void
) {
  if (!s.data.player_id) {
    emitError(ack, 'NOT_JOINED', 'You must join the game first.');
    return;
  }
  fn();
}

function withAdmin<T>(
  s: LooseSocket,
  ack: Ack<T> | undefined,
  fn: () => void
) {
  if (!s.data.is_admin) {
    emitError(ack, 'NOT_ADMIN', 'Admin privileges required.');
    return;
  }
  fn();
}

function flatten(err: z.ZodError): string {
  const issues = err.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`);
  return issues.join('; ') || 'Invalid payload';
}

function handleError<T>(ack: Ack<T> | undefined, e: unknown) {
  if (e instanceof EngineError) {
    emitError(ack, e.code, e.message);
  } else if (e instanceof Error) {
    emitError(ack, 'INTERNAL', e.message);
  } else {
    emitError(ack, 'INTERNAL', 'Unknown error');
  }
}
