import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { meSelector, useGame } from './store/gameStore';
import { emit, getSocket } from './socket';
import type {
  ErrorPayload,
  GameArchivedPayload,
  GameState,
  JoinResult,
  KickedPayload,
  LeaderboardPayload,
  ToastPayload,
} from '@monopoly/shared';
import { JoinScreen } from './pages/JoinScreen';
import { Dashboard } from './pages/Dashboard';
import { StatsPage } from './pages/StatsPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { SettingsPage } from './pages/SettingsPage';
import { AdminPage } from './pages/AdminPage';
import { BottomNav } from './components/BottomNav';
import { GameSummarySplash } from './components/GameSummarySplash';

export default function App() {
  const state = useGame((s) => s.state);
  const player_id = useGame((s) => s.player_id);
  const tab = useGame((s) => s.tab);
  const me = useGame(meSelector);
  const setState = useGame((s) => s.setState);
  const setConnected = useGame((s) => s.setConnected);
  const setPlayerId = useGame((s) => s.setPlayerId);
  const setIsAdmin = useGame((s) => s.setIsAdmin);
  const setLeaderboard = useGame((s) => s.setLeaderboard);
  const setArchivedSplash = useGame((s) => s.setArchivedSplash);
  const game_archived_splash = useGame((s) => s.game_archived_splash);
  const reset = useGame((s) => s.reset);

  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    const sock = getSocket();
    sock.on('connect', () => setConnected(true));
    sock.on('disconnect', () => setConnected(false));
    sock.on('state', (s: GameState) => setState(s));
    sock.on('toast', (t: ToastPayload) => {
      switch (t.kind) {
        case 'success':
          toast.success(t.message);
          break;
        case 'error':
          toast.error(t.message);
          break;
        case 'warning':
          toast(t.message, { icon: '⚠' });
          break;
        default:
          toast(t.message);
      }
    });
    sock.on('game_archived', (payload: GameArchivedPayload) => {
      setArchivedSplash(payload);
      // Clear the player_id since the server resets it.
      reset();
      // Auto-dismiss splash after 7s.
      setTimeout(() => setArchivedSplash(null), 7000);
    });
    sock.on('kicked', (payload: KickedPayload) => {
      // Another device claimed this player, or admin removed us.
      reset();
      toast.error(payload.reason || 'You were disconnected.');
    });
    sock.on('leaderboard', (payload: LeaderboardPayload) => {
      setLeaderboard(payload.leaderboard, payload.archived);
    });
    return () => {
      sock.off('connect');
      sock.off('disconnect');
      sock.off('state');
      sock.off('toast');
      sock.off('game_archived');
      sock.off('kicked');
      sock.off('leaderboard');
    };
  }, [setState, setConnected, setArchivedSplash, reset, setLeaderboard]);

  // Try to rejoin on mount if we have a stored player_id.
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      const stored = player_id;
      if (stored) {
        try {
          const result = (await emit('rejoin', { player_id: stored })) as JoinResult;
          if (!cancelled) {
            setPlayerId(result.player_id);
            setIsAdmin(Boolean(result.is_admin));
            setState(result.state);
          }
        } catch (e) {
          // Stored ID invalid (game reset, etc.) — clear it.
          if (!cancelled) {
            const err = e as ErrorPayload;
            console.warn('Rejoin failed:', err.message);
            reset();
          }
        }
      }
      // Also fetch leaderboard so the join screen has something to show.
      try {
        const lb = (await emit('get_leaderboard', {})) as {
          leaderboard: Parameters<typeof setLeaderboard>[0];
          archived: Parameters<typeof setLeaderboard>[1];
        };
        if (!cancelled) setLeaderboard(lb.leaderboard, lb.archived);
      } catch {
        // ignore — server may not be up yet.
      }
      if (!cancelled) setBootstrapped(true);
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!bootstrapped) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-dim">
        Connecting…
      </div>
    );
  }

  // Show splash if a game just ended.
  if (game_archived_splash) {
    return (
      <GameSummarySplash
        archived={game_archived_splash.archived}
        leaderboard={game_archived_splash.leaderboard}
        onDismiss={() => setArchivedSplash(null)}
      />
    );
  }

  // Not joined → join screen.
  if (!me) {
    return <JoinScreen />;
  }

  // Joined → main shell with bottom nav.
  return (
    <div className="min-h-screen flex flex-col bg-bg pb-24">
      <main className="flex-1 mx-auto w-full max-w-xl">
        {tab === 'home' && <Dashboard />}
        {tab === 'stats' && <StatsPage />}
        {tab === 'leaderboard' && <LeaderboardPage />}
        {tab === 'settings' && <SettingsPage />}
        {tab === 'admin' && <AdminPage />}
      </main>
      <BottomNav />
      {!state ? null : null}
    </div>
  );
}
