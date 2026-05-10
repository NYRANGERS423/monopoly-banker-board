import { Crown, Trophy } from 'lucide-react';
import type { ArchivedGameSummary, LeaderboardEntry } from '@monopoly/shared';
import { formatMoney } from '../utils/currency';
import { LeaderboardPanel } from './LeaderboardPanel';

interface Props {
  archived: ArchivedGameSummary;
  leaderboard: LeaderboardEntry[];
  onDismiss: () => void;
}

export function GameSummarySplash({ archived, leaderboard, onDismiss }: Props) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-8 text-center">
      <div className="text-6xl mb-2">🏆</div>
      <h1 className="text-2xl font-bold mb-1">Game #{archived.game_number} complete!</h1>
      {archived.winner_name ? (
        <div className="text-lg mb-3">
          <Crown className="inline -mt-1 mr-1 text-warn" size={18} />
          <span className="font-bold">{archived.winner_name}</span> wins
        </div>
      ) : (
        <div className="text-ink-dim mb-3">No winner recorded</div>
      )}

      <div className="card w-full max-w-md grid grid-cols-2 gap-3 mb-4 text-left">
        <Stat label="Players" value={String(archived.player_count)} />
        <Stat label="Transactions" value={String(archived.transaction_count)} />
        <Stat label="Top payment" value={formatMoney(archived.top_payment)} />
        <Stat label="Money moved" value={formatMoney(archived.total_money_moved)} />
      </div>

      {leaderboard.length > 0 && (
        <div className="w-full max-w-md mb-4">
          <div className="flex items-center gap-2 mb-2 px-1 justify-center">
            <Trophy size={16} className="text-warn" />
            <span className="text-sm font-semibold text-ink-dim">Updated standings</span>
          </div>
          <LeaderboardPanel entries={leaderboard.slice(0, 5)} compact />
        </div>
      )}

      <button onClick={onDismiss} className="btn-primary px-8">
        Continue
      </button>
      <p className="text-xs text-ink-faint mt-2">Auto-dismisses shortly. Re-join to play again.</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-faint">{label}</div>
      <div className="font-bold tabular-nums">{value}</div>
    </div>
  );
}
