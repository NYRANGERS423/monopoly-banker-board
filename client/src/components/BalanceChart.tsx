import { useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { GameState, Transaction } from '@monopoly/shared';

interface Props {
  state: GameState;
}

export function BalanceChart({ state }: Props) {
  const data = useMemo(() => buildSeries(state), [state]);
  const playerById = useMemo(() => {
    const m = new Map(state.players.map((p) => [p.id, p]));
    return m;
  }, [state.players]);

  if (state.players.length === 0 || data.length === 0) {
    return (
      <div className="card text-center text-ink-dim text-sm">No transactions yet — chart will appear once play begins.</div>
    );
  }

  return (
    <div className="card p-2">
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="#1f2638" strokeDasharray="3 3" />
            <XAxis dataKey="step" stroke="#5b6577" fontSize={11} />
            <YAxis stroke="#5b6577" fontSize={11} width={48} />
            <Tooltip
              contentStyle={{
                background: '#131826',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: '#9aa3b2' }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {state.players.map((p) => (
              <Line
                key={p.id}
                type="monotone"
                dataKey={p.id}
                name={p.name}
                stroke={p.color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 text-[11px] text-ink-faint text-right">
        {playerById.size} player{playerById.size === 1 ? '' : 's'}
      </div>
    </div>
  );
}

interface SeriesPoint {
  step: number;
  [playerId: string]: number;
}

function buildSeries(state: GameState): SeriesPoint[] {
  // Replay transactions in chronological order to compute per-player balances.
  const ordered = [...state.transactions].sort((a, b) => a.ts - b.ts);
  const balances: Record<string, number> = {};
  for (const p of state.players) balances[p.id] = state.settings.starting_balance;

  const series: SeriesPoint[] = [];
  // Step 0 = starting balances.
  series.push({ step: 0, ...balances });

  let step = 1;
  for (const tx of ordered) {
    applyTx(balances, tx);
    series.push({ step, ...balances });
    step += 1;
  }
  return series;
}

function applyTx(balances: Record<string, number>, t: Transaction) {
  if (t.kind === 'admin_override' && t.to_kind === 'player' && t.to_id) {
    // Override is delta-encoded as |amount| with +/- direction unknown from the row alone;
    // for the trend chart we approximate by using amount as an additive change in either direction.
    // To keep it simple, treat admin_override as a set-to-final-balance no-op here — chart shows transfers.
    // (The dashboard balance is authoritative; chart is illustrative.)
    return;
  }
  if (t.kind === 'admin_remove' && t.from_kind === 'player' && t.from_id) {
    balances[t.from_id] = 0;
    return;
  }
  if (t.kind === 'player_joined' && t.to_id) {
    // already initialized; ignore.
    return;
  }
  if (t.from_kind === 'player' && t.from_id) {
    balances[t.from_id] = (balances[t.from_id] ?? 0) - t.amount;
  }
  if (t.to_kind === 'player' && t.to_id) {
    balances[t.to_id] = (balances[t.to_id] ?? 0) + t.amount;
  }
}
