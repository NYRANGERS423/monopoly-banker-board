import { create } from 'zustand';
import type { ArchivedGameSummary, GameState, LeaderboardEntry } from '@monopoly/shared';

const PLAYER_ID_KEY = 'monopoly.player_id';

export type Tab = 'home' | 'stats' | 'leaderboard' | 'settings' | 'admin';

interface GameStore {
  state: GameState | null;
  player_id: string | null;
  is_admin: boolean;
  tab: Tab;
  connected: boolean;
  leaderboard: LeaderboardEntry[];
  archived: ArchivedGameSummary[];
  // Latest archived summary to show on the New Game splash screen.
  game_archived_splash: { archived: ArchivedGameSummary; leaderboard: LeaderboardEntry[] } | null;

  setState: (state: GameState) => void;
  setConnected: (c: boolean) => void;
  setPlayerId: (id: string | null) => void;
  setIsAdmin: (a: boolean) => void;
  setTab: (t: Tab) => void;
  setLeaderboard: (lb: LeaderboardEntry[], archived: ArchivedGameSummary[]) => void;
  setArchivedSplash: (
    s: { archived: ArchivedGameSummary; leaderboard: LeaderboardEntry[] } | null,
  ) => void;
  reset: () => void;
}

export const useGame = create<GameStore>((set) => ({
  state: null,
  player_id: typeof window !== 'undefined' ? localStorage.getItem(PLAYER_ID_KEY) : null,
  is_admin: false,
  tab: 'home',
  connected: false,
  leaderboard: [],
  archived: [],
  game_archived_splash: null,

  setState: (state) => set({ state }),
  setConnected: (connected) => set({ connected }),
  setPlayerId: (id) => {
    if (typeof window !== 'undefined') {
      if (id) localStorage.setItem(PLAYER_ID_KEY, id);
      else localStorage.removeItem(PLAYER_ID_KEY);
    }
    set({ player_id: id });
  },
  setIsAdmin: (a) => set({ is_admin: a }),
  setTab: (tab) => set({ tab }),
  setLeaderboard: (leaderboard, archived) => set({ leaderboard, archived }),
  setArchivedSplash: (s) => set({ game_archived_splash: s }),
  reset: () => {
    if (typeof window !== 'undefined') localStorage.removeItem(PLAYER_ID_KEY);
    set({ player_id: null, is_admin: false, tab: 'home' });
  },
}));

export function meSelector(state: GameStore) {
  if (!state.player_id || !state.state) return null;
  return state.state.players.find((p) => p.id === state.player_id) ?? null;
}
