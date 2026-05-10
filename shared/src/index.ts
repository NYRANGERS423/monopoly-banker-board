// Types shared between server and client.

export type CurrencyScale = 'classic' | 'millions';

export type EntityKind = 'player' | 'bank' | 'free_parking';

export type TransactionKind =
  | 'transfer'
  | 'bank_pay'
  | 'bank_collect'
  | 'pass_go'
  | 'free_parking_pay'
  | 'free_parking_collect'
  | 'charge_each'
  | 'pay_each'
  | 'admin_override'
  | 'admin_remove'
  | 'admin_new_game'
  | 'admin_settings'
  | 'player_joined';

export interface Player {
  id: string;
  name: string;
  color: string;
  balance: number;
  is_active: boolean;
  joined_at: number;
}

export interface Transaction {
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

export interface GameSettings {
  starting_balance: number;
  pass_go_amount: number;
  currency_scale: CurrencyScale;
  free_parking_enabled: boolean;
}

export interface GameState {
  game_number: number;
  game_started_at: number;
  free_parking_pot: number;
  settings: GameSettings;
  players: Player[];
  transactions: Transaction[];
  /** Player IDs currently bound to a live socket. */
  connected_player_ids: string[];
}

export interface KickedPayload {
  reason: string;
}

export interface ArchivedGameSummary {
  game_number: number;
  started_at: number;
  ended_at: number;
  player_count: number;
  transaction_count: number;
  winner_id: string | null;
  winner_name: string | null;
  final_balances: Array<{ name: string; color: string; balance: number }>;
  top_payment: number;
  total_money_moved: number;
}

export interface ArchivedGame extends ArchivedGameSummary {
  // Full snapshot data (players, transactions) is also stored but not
  // shipped to clients by default — they can request it for replay.
  data?: {
    players: Player[];
    transactions: Transaction[];
    settings: GameSettings;
  };
}

export interface LeaderboardEntry {
  name: string;           // case-insensitive matched
  display_name: string;   // most recent capitalization
  color: string;          // most recent appearance
  wins: number;
  games_played: number;
  win_rate: number;       // 0..1
  highest_balance: number;
  average_balance: number;
}

// Available player colors (Okabe-Ito-inspired colorblind-safe palette).
export const PLAYER_COLORS = [
  '#0072B2', // blue
  '#D55E00', // vermilion (red-orange)
  '#009E73', // bluish green
  '#E69F00', // orange
  '#CC79A7', // reddish purple
  '#9D4EDD', // violet
  '#F0E442', // yellow
  '#8B4513', // saddle brown
] as const;

// ---- Socket payload shapes (also re-validated on server with Zod). ----

export interface JoinPayload {
  name: string;
  color: string;
}

export interface RejoinPayload {
  player_id: string;
}

export interface TransferPayload {
  to_id: string;
  amount: number;
  note?: string;
}

export interface AmountPayload {
  amount: number;
  note?: string;
}

export interface MultiRecipientPayload {
  amount_per_player: number;
  note?: string;
}

export interface AdminUnlockPayload {
  code: string;
}

export interface AdminOverridePayload {
  player_id: string;
  new_balance: number;
  note?: string;
}

export interface AdminRemovePayload {
  player_id: string;
}

export interface AdminNewGamePayload {
  winner_id?: string | null;
}

export interface AdminUpdateSettingsPayload {
  starting_balance?: number;
  pass_go_amount?: number;
  currency_scale?: CurrencyScale;
  free_parking_enabled?: boolean;
}

export interface AdminSetPotPayload {
  amount: number;
}

// ---- Server -> client events ----

export interface JoinResult {
  player_id: string;
  state: GameState;
  is_admin?: boolean;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export interface ToastPayload {
  message: string;
  kind: 'info' | 'success' | 'warning' | 'error';
  target_id?: string; // if set, only deliver to this player_id
}

export interface GameArchivedPayload {
  archived: ArchivedGameSummary;
  leaderboard: LeaderboardEntry[];
}

export interface LeaderboardPayload {
  leaderboard: LeaderboardEntry[];
  archived: ArchivedGameSummary[];
}
