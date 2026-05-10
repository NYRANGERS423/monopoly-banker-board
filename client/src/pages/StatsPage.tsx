import { useMemo } from 'react';
import type { GameState, Player, Transaction } from '@monopoly/shared';
import { useGame } from '../store/gameStore';
import { BalanceChart } from '../components/BalanceChart';
import { formatMoney, formatSigned } from '../utils/currency';

export function StatsPage() {
  const state = useGame((s) => s.state)!;

  const perPlayer = useMemo(() => buildPerPlayer(state), [state]);
  const game = useMemo(() => buildGame(state), [state]);

  return (
    <div className="px-4 pt-4">
      <header className="mb-4">
        <h1 className="text-xl font-bold">Stats — Game #{state.game_number}</h1>
        <p className="text-sm text-ink-dim">{state.transactions.length} transactions</p>
      </header>

      <div className="mb-4">
        <h2 className="text-sm font-semibold text-ink-dim mb-2 px-1">Balance trend</h2>
        <BalanceChart state={state} />
      </div>

      <div className="mb-4">
        <h2 className="text-sm font-semibold text-ink-dim mb-2 px-1">Per-player</h2>
        <div className="space-y-2">
          {perPlayer.map((row) => (
            <div key={row.player.id} className="card">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: row.player.color }}
                />
                <span className="font-semibold">{row.player.name}</span>
                <span className="ml-auto tabular-nums font-bold">
                  {formatMoney(row.player.balance, state.settings.currency_scale)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-ink-dim">
                <Stat label="Net change">
                  <span className={row.net >= 0 ? 'text-good' : 'text-bad'}>
                    {formatSigned(row.net, state.settings.currency_scale)}
                  </span>
                </Stat>
                <Stat label="Transactions">{row.count}</Stat>
                <Stat label="Total received">
                  {formatMoney(row.totalReceived, state.settings.currency_scale)}
                </Stat>
                <Stat label="Total spent">
                  {formatMoney(row.totalSpent, state.settings.currency_scale)}
                </Stat>
                <Stat label="Biggest received">
                  {formatMoney(row.biggestIn, state.settings.currency_scale)}
                </Stat>
                <Stat label="Biggest sent">
                  {formatMoney(row.biggestOut, state.settings.currency_scale)}
                </Stat>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <h2 className="text-sm font-semibold text-ink-dim mb-2 px-1">Game-wide</h2>
        <div className="card grid grid-cols-2 gap-3 text-sm">
          <Stat label="Duration">{game.durationLabel}</Stat>
          <Stat label="Transactions">{game.txCount}</Stat>
          <Stat label="Money moved">
            {formatMoney(game.totalMoved, state.settings.currency_scale)}
          </Stat>
          <Stat label="Free Parking peak">
            {formatMoney(game.parkingPeak, state.settings.currency_scale)}
          </Stat>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-ink-faint text-[10px] uppercase tracking-wider">{label}</div>
      <div className="text-ink font-semibold">{children}</div>
    </div>
  );
}

interface PerPlayerRow {
  player: Player;
  totalReceived: number;
  totalSpent: number;
  biggestIn: number;
  biggestOut: number;
  count: number;
  net: number;
}

function buildPerPlayer(state: GameState): PerPlayerRow[] {
  const rows = new Map<string, PerPlayerRow>();
  for (const p of state.players) {
    rows.set(p.id, {
      player: p,
      totalReceived: 0,
      totalSpent: 0,
      biggestIn: 0,
      biggestOut: 0,
      count: 0,
      net: p.balance - state.settings.starting_balance,
    });
  }
  for (const t of state.transactions) {
    if (t.from_kind === 'player' && t.from_id) {
      const r = rows.get(t.from_id);
      if (r) {
        r.totalSpent += t.amount;
        r.biggestOut = Math.max(r.biggestOut, t.amount);
        r.count += 1;
      }
    }
    if (t.to_kind === 'player' && t.to_id) {
      const r = rows.get(t.to_id);
      if (r) {
        r.totalReceived += t.amount;
        r.biggestIn = Math.max(r.biggestIn, t.amount);
        r.count += 1;
      }
    }
  }
  return Array.from(rows.values()).sort((a, b) => b.player.balance - a.player.balance);
}

function buildGame(state: GameState) {
  const txCount = state.transactions.length;
  const totalMoved = state.transactions.reduce((s, t) => s + t.amount, 0);
  const parkingPeak = computeParkingPeak(state.transactions);
  const durationMs = Math.max(0, Date.now() - state.game_started_at);
  const durationLabel = formatDuration(durationMs);
  return { txCount, totalMoved, parkingPeak, durationLabel };
}

function computeParkingPeak(txs: Transaction[]): number {
  let peak = 0;
  let pot = 0;
  const ordered = [...txs].sort((a, b) => a.ts - b.ts);
  for (const t of ordered) {
    if (t.to_kind === 'free_parking') pot += t.amount;
    if (t.from_kind === 'free_parking' && t.kind === 'free_parking_collect') pot = 0;
    peak = Math.max(peak, pot);
  }
  return peak;
}

function formatDuration(ms: number): string {
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}
