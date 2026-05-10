import { useMemo, useState } from 'react';
import type { GameState, Transaction } from '@monopoly/shared';
import { formatMoney, relativeTime } from '../utils/currency';

type Filter = 'all' | 'bank' | 'park' | 'transfer' | 'multi' | 'admin';

interface Props {
  state: GameState;
  meId?: string;
  limit?: number;
  showFilters?: boolean;
}

export function ActivityLog({ state, meId, limit = 10, showFilters = false }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    return state.transactions.filter((t) => {
      switch (filter) {
        case 'all':
          return true;
        case 'bank':
          return t.kind === 'bank_pay' || t.kind === 'bank_collect' || t.kind === 'pass_go' || t.kind === 'player_joined';
        case 'park':
          return t.kind === 'free_parking_pay' || t.kind === 'free_parking_collect';
        case 'transfer':
          return t.kind === 'transfer';
        case 'multi':
          return t.kind === 'charge_each' || t.kind === 'pay_each';
        case 'admin':
          return t.kind.startsWith('admin_');
      }
    });
  }, [state.transactions, filter]);

  const visible = showAll ? filtered : filtered.slice(0, limit);

  return (
    <div>
      {showFilters && (
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 mb-3 pb-1">
          {(['all', 'bank', 'park', 'transfer', 'multi', 'admin'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`pill shrink-0 capitalize ${
                filter === f ? 'bg-accent text-white' : 'bg-bg-card text-ink-dim'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      )}
      <ul className="space-y-1.5">
        {visible.map((t) => (
          <ActivityItem key={t.id} t={t} state={state} meId={meId} />
        ))}
        {visible.length === 0 && (
          <li className="card text-center text-ink-dim text-sm">No activity yet.</li>
        )}
      </ul>
      {!showAll && filtered.length > limit && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-3 w-full btn-ghost text-sm"
        >
          Show all ({filtered.length})
        </button>
      )}
    </div>
  );
}

function ActivityItem({ t, state, meId }: { t: Transaction; state: GameState; meId?: string }) {
  const scale = state.settings.currency_scale;
  const playerName = (id: string | null): string => {
    if (!id) return '';
    return state.players.find((p) => p.id === id)?.name ?? 'Removed';
  };
  const fromName =
    t.from_kind === 'player' ? playerName(t.from_id) : t.from_kind === 'bank' ? 'Bank' : 'Free Parking';
  const toName =
    t.to_kind === 'player' ? playerName(t.to_id) : t.to_kind === 'bank' ? 'Bank' : 'Free Parking';

  const isMine =
    meId !== undefined && (t.from_id === meId || t.to_id === meId);

  // Color tag
  let chipClass = 'bg-bg-elev text-ink-dim';
  let label = '';
  switch (t.kind) {
    case 'transfer':
      chipClass = 'bg-bg-elev text-ink-dim';
      label = 'transfer';
      break;
    case 'bank_pay':
      chipClass = 'bg-bank/20 text-blue-300';
      label = 'pay bank';
      break;
    case 'bank_collect':
      chipClass = 'bg-bank/20 text-blue-300';
      label = 'collect';
      break;
    case 'pass_go':
      chipClass = 'bg-good/20 text-good';
      label = 'GO';
      break;
    case 'free_parking_pay':
    case 'free_parking_collect':
      chipClass = 'bg-park/20 text-yellow-300';
      label = 'parking';
      break;
    case 'charge_each':
      chipClass = 'bg-purple-500/20 text-purple-300';
      label = 'charge each';
      break;
    case 'pay_each':
      chipClass = 'bg-purple-500/20 text-purple-300';
      label = 'pay each';
      break;
    case 'admin_override':
    case 'admin_remove':
    case 'admin_new_game':
    case 'admin_settings':
      chipClass = 'bg-admin/20 text-orange-300';
      label = 'ADMIN';
      break;
    case 'player_joined':
      chipClass = 'bg-bg-elev text-ink-dim';
      label = 'joined';
      break;
  }

  const signed = (() => {
    if (!isMine || !meId) return formatMoney(t.amount, scale);
    if (t.from_id === meId && t.to_id !== meId) return `-${formatMoney(t.amount, scale)}`;
    if (t.to_id === meId && t.from_id !== meId) return `+${formatMoney(t.amount, scale)}`;
    return formatMoney(t.amount, scale);
  })();

  const signClass = (() => {
    if (!isMine || !meId) return 'text-ink';
    if (t.to_id === meId && t.from_id !== meId) return 'text-good';
    if (t.from_id === meId && t.to_id !== meId) return 'text-bad';
    return 'text-ink';
  })();

  return (
    <li className="bg-bg-card rounded-xl px-3 py-2 flex items-center gap-2 text-sm border border-white/5">
      <span className={`pill ${chipClass} text-[10px]`}>{label}</span>
      <span className="flex-1 truncate">
        <span className="text-ink-dim">{fromName}</span>
        <span className="text-ink-faint mx-1">→</span>
        <span>{toName}</span>
        {t.note && <span className="text-ink-faint"> · {t.note}</span>}
      </span>
      <span className={`tabular-nums font-semibold ${signClass}`}>{signed}</span>
      <span className="text-ink-faint text-xs tabular-nums">{relativeTime(t.ts)}</span>
    </li>
  );
}
