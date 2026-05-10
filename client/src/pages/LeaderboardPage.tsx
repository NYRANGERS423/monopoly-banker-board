import { useEffect } from 'react';
import { Trophy } from 'lucide-react';
import type { ArchivedGameSummary, LeaderboardEntry } from '@monopoly/shared';
import { useGame } from '../store/gameStore';
import { emit } from '../socket';
import { LeaderboardPanel } from '../components/LeaderboardPanel';
import { formatMoney } from '../utils/currency';

export function LeaderboardPage() {
  const leaderboard = useGame((s) => s.leaderboard);
  const archived = useGame((s) => s.archived);
  const setLeaderboard = useGame((s) => s.setLeaderboard);
  const state = useGame((s) => s.state);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lb = (await emit('get_leaderboard', {})) as {
          leaderboard: LeaderboardEntry[];
          archived: ArchivedGameSummary[];
        };
        if (!cancelled) setLeaderboard(lb.leaderboard, lb.archived);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setLeaderboard]);

  return (
    <div className="px-4 pt-4">
      <header className="mb-4 flex items-center gap-2">
        <Trophy size={22} className="text-warn" />
        <h1 className="text-xl font-bold">Leaderboard</h1>
      </header>

      <section className="mb-4">
        <LeaderboardPanel entries={leaderboard} />
      </section>

      <section>
        <h2 className="text-sm font-semibold text-ink-dim mb-2 px-1">Past games</h2>
        {archived.length === 0 ? (
          <div className="card text-center text-ink-dim text-sm">No archived games yet.</div>
        ) : (
          <div className="space-y-2">
            {archived.map((g) => (
              <div key={g.game_number} className="card">
                <div className="flex items-center gap-2 mb-1">
                  <span className="pill bg-bg-elev text-ink-dim text-[11px]">#{g.game_number}</span>
                  <span className="font-semibold">
                    {g.winner_name ? `🏆 ${g.winner_name}` : 'No winner recorded'}
                  </span>
                  <span className="text-ink-dim text-xs ml-auto">
                    {new Date(g.ended_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="text-xs text-ink-dim flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>{g.player_count} players</span>
                  <span>{g.transaction_count} txs</span>
                  <span>
                    Top:{' '}
                    {formatMoney(
                      g.top_payment,
                      state?.settings.currency_scale ?? 'classic',
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
