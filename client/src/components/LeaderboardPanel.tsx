import type { LeaderboardEntry } from '@monopoly/shared';

interface Props {
  entries: LeaderboardEntry[];
  compact?: boolean;
}

export function LeaderboardPanel({ entries, compact = false }: Props) {
  if (entries.length === 0) {
    return (
      <div className="card text-center text-ink-dim text-sm">First game incoming — no standings yet.</div>
    );
  }
  return (
    <div className="card p-0 overflow-hidden">
      <div className="grid grid-cols-[28px_1fr_56px_56px] gap-2 px-3 py-2 text-[11px] uppercase tracking-wider text-ink-faint border-b border-white/5">
        <div>#</div>
        <div>Player</div>
        <div className="text-right">Wins</div>
        {!compact && <div className="text-right">Games</div>}
        {compact && <div className="text-right">G</div>}
      </div>
      {entries.map((e, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
        return (
          <div
            key={e.name}
            className="grid grid-cols-[28px_1fr_56px_56px] gap-2 px-3 py-2 items-center text-sm border-b border-white/5 last:border-b-0"
          >
            <div className="text-ink-dim">{medal ?? i + 1}</div>
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: e.color }}
                aria-hidden
              />
              <span className="truncate">{e.display_name}</span>
            </div>
            <div className="text-right font-semibold">{e.wins}</div>
            <div className="text-right text-ink-dim">{e.games_played}</div>
          </div>
        );
      })}
    </div>
  );
}
