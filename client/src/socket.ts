import { io, type Socket } from 'socket.io-client';
import type {
  ErrorPayload,
  GameArchivedPayload,
  GameState,
  JoinResult,
  KickedPayload,
  LeaderboardEntry,
  LeaderboardPayload,
  ArchivedGameSummary,
  ToastPayload,
} from '@monopoly/shared';

interface ServerToClient {
  state: (state: GameState) => void;
  toast: (toast: ToastPayload) => void;
  game_archived: (payload: GameArchivedPayload) => void;
  leaderboard: (payload: LeaderboardPayload) => void;
  kicked: (payload: KickedPayload) => void;
  error: (err: ErrorPayload) => void;
}

interface ClientToServer {
  join: (
    payload: { name: string; color: string },
    ack: (res: { ok: true; data: JoinResult } | { ok: false; error: ErrorPayload }) => void,
  ) => void;
  rejoin: (
    payload: { player_id: string },
    ack: (res: { ok: true; data: JoinResult } | { ok: false; error: ErrorPayload }) => void,
  ) => void;
  bank_pay: (payload: { amount: number; note?: string }, ack: AckOk) => void;
  bank_collect: (payload: { amount: number; note?: string }, ack: AckOk) => void;
  pass_go: (payload: Record<string, never>, ack: AckOk) => void;
  transfer: (
    payload: { to_id: string; amount: number; note?: string },
    ack: AckOk,
  ) => void;
  free_parking_pay: (payload: { amount: number; note?: string }, ack: AckOk) => void;
  free_parking_collect: (payload: Record<string, never>, ack: AckOk) => void;
  charge_each: (payload: { amount_per_player: number; note?: string }, ack: AckOk) => void;
  pay_each: (payload: { amount_per_player: number; note?: string }, ack: AckOk) => void;
  admin_unlock: (payload: { code: string }, ack: AckOk) => void;
  admin_override: (
    payload: { player_id: string; new_balance: number; note?: string },
    ack: AckOk,
  ) => void;
  admin_remove_player: (payload: { player_id: string }, ack: AckOk) => void;
  admin_new_game: (payload: { winner_id?: string | null }, ack: AckOk) => void;
  admin_update_settings: (
    payload: Partial<{
      starting_balance: number;
      pass_go_amount: number;
      currency_scale: 'classic' | 'millions';
      free_parking_enabled: boolean;
    }>,
    ack: AckOk,
  ) => void;
  admin_set_pot: (payload: { amount: number }, ack: AckOk) => void;
  admin_delete_archived: (payload: { game_number: number }, ack: AckOk) => void;
  admin_clear_archived: (payload: Record<string, never>, ack: AckOk) => void;
  admin_edit_archived_winner: (
    payload: { game_number: number; winner_name: string | null },
    ack: AckOk,
  ) => void;
  admin_set_game_number: (payload: { game_number: number }, ack: AckOk) => void;
  get_leaderboard: (
    payload: Record<string, never>,
    ack: (
      res:
        | { ok: true; data: { leaderboard: LeaderboardEntry[]; archived: ArchivedGameSummary[] } }
        | { ok: false; error: ErrorPayload },
    ) => void,
  ) => void;
}

type AckOk = (
  res: { ok: true; data: { ok: true } } | { ok: false; error: ErrorPayload },
) => void;

export type AppSocket = Socket<ServerToClient, ClientToServer>;

let socketInstance: AppSocket | null = null;

export function getSocket(): AppSocket {
  if (!socketInstance) {
    socketInstance = io({
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      transports: ['websocket', 'polling'],
    });
  }
  return socketInstance;
}

/** Promise-based emit with ack. */
export function emit<E extends keyof ClientToServer>(
  event: E,
  payload: Parameters<ClientToServer[E]>[0],
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const sock = getSocket();
    (sock.emit as unknown as (
      ev: E,
      payload: Parameters<ClientToServer[E]>[0],
      ack: (res: { ok: true; data: unknown } | { ok: false; error: ErrorPayload }) => void,
    ) => void)(event, payload, (res) => {
      if (res.ok) resolve(res.data);
      else reject(res.error);
    });
  });
}
