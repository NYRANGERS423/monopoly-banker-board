import { useState } from 'react';
import toast from 'react-hot-toast';
import { Banknote, BarChart3, Coins, Crown, Settings as SettingsIcon, Shield } from 'lucide-react';
import type { CurrencyScale, ErrorPayload, Player } from '@monopoly/shared';
import { meSelector, useGame } from '../store/gameStore';
import { emit } from '../socket';
import { formatMoney } from '../utils/currency';
import { BalanceDisplay } from '../components/BalanceDisplay';
import { NumpadSheet } from '../components/NumpadSheet';
import { TransferSheet } from '../components/TransferSheet';
import { ActivityLog } from '../components/ActivityLog';

type Sheet =
  | { kind: 'bank_pay' }
  | { kind: 'bank_collect' }
  | { kind: 'free_parking_pay' }
  | { kind: 'transfer'; preselectId?: string }
  | { kind: 'charge_each' }
  | { kind: 'pay_each' }
  | null;

export function Dashboard() {
  const state = useGame((s) => s.state)!;
  const me = useGame(meSelector)!;
  const setTab = useGame((s) => s.setTab);
  const isAdmin = useGame((s) => s.is_admin);
  const [sheet, setSheet] = useState<Sheet>(null);

  const scale: CurrencyScale = state.settings.currency_scale;
  const others: Player[] = state.players.filter((p) => p.id !== me.id);

  // Quick-amount chips, in real-dollar storage units, picked per scale.
  const isMillions = scale === 'millions';
  const chips = {
    bank_pay: isMillions ? [500_000, 1_000_000, 2_000_000, 5_000_000] : [50, 100, 200, 500],
    bank_collect: isMillions ? [500_000, 1_000_000, 2_000_000] : [50, 100, 200],
    free_parking_pay: isMillions ? [500_000, 1_000_000, 2_000_000, 5_000_000] : [50, 75, 100, 200],
    charge_each: isMillions ? [100_000, 500_000, 1_000_000] : [10, 25, 50],
    pay_each: isMillions ? [500_000, 1_000_000, 2_000_000] : [25, 50, 100],
  };

  async function passGo() {
    try {
      await emit('pass_go', {});
      toast.success(`Pass GO! +${formatMoney(state.settings.pass_go_amount, scale)}`);
    } catch (e) {
      toast.error((e as ErrorPayload).message ?? 'Failed');
    }
  }

  async function collectFreeParking() {
    try {
      await emit('free_parking_collect', {});
    } catch (e) {
      toast.error((e as ErrorPayload).message ?? 'Failed');
    }
  }

  return (
    <div className="px-4 pt-4">
      {/* Header */}
      <header className="flex items-center justify-between mb-4">
        <button
          onClick={() => setTab('settings')}
          className="p-2 -m-2 text-ink-dim"
          aria-label="Settings"
        >
          <SettingsIcon size={22} />
        </button>
        <div className="text-center">
          <div className="text-xs text-ink-faint uppercase tracking-wider">Game #{state.game_number}</div>
          <div className="font-semibold">Monopoly Banker</div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => setTab('admin')}
              className="p-2 -m-2 text-admin"
              aria-label="Admin"
            >
              <Shield size={20} />
            </button>
          )}
          <button
            onClick={() => setTab('stats')}
            className="p-2 -m-2 text-ink-dim"
            aria-label="Stats"
          >
            <BarChart3 size={22} />
          </button>
        </div>
      </header>

      {/* My balance */}
      <section className="card text-center mb-4">
        <div className="flex items-center justify-center gap-2 mb-1">
          <span
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: me.color }}
            aria-hidden
          />
          <span className="font-semibold">{me.name}</span>
        </div>
        <BalanceDisplay amount={me.balance} scale={scale} />
        {me.balance < 0 && (
          <p className="text-xs text-bad mt-2">
            Negative balance — mortgage a property and tap "Collect" to recover.
          </p>
        )}
      </section>

      {/* Primary actions */}
      <section className="space-y-2 mb-4">
        <button onClick={passGo} className="btn-good w-full text-base">
          <Crown size={18} /> Pass GO &nbsp;
          <span className="opacity-90">+{formatMoney(state.settings.pass_go_amount, scale)}</span>
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setSheet({ kind: 'bank_pay' })} className="btn-bank">
            <Banknote size={18} /> Pay Bank
          </button>
          <button onClick={() => setSheet({ kind: 'bank_collect' })} className="btn-ghost">
            <Coins size={18} /> Collect
          </button>
        </div>

        <button onClick={() => setSheet({ kind: 'transfer' })} className="btn-primary w-full">
          Transfer to Player
        </button>

        {state.settings.free_parking_enabled && (
          <>
            <button onClick={() => setSheet({ kind: 'free_parking_pay' })} className="btn-park w-full">
              Pay → Free Parking
            </button>
            <div className="text-center text-sm text-ink-dim">
              Free Parking pot:{' '}
              <span className="font-semibold text-park">
                {formatMoney(state.free_parking_pot, scale)}
              </span>
            </div>
            {state.free_parking_pot > 0 && (
              <button onClick={collectFreeParking} className="btn-good w-full">
                Collect Free Parking ({formatMoney(state.free_parking_pot, scale)})
              </button>
            )}
          </>
        )}
      </section>

      {/* Players list */}
      <section className="mb-4">
        <h2 className="text-sm font-semibold text-ink-dim mb-2 px-1">Players</h2>
        <div className="space-y-1.5">
          {others.length === 0 && (
            <div className="card text-center text-ink-dim text-sm">No other players yet.</div>
          )}
          {others.map((p) => (
            <button
              key={p.id}
              onClick={() => setSheet({ kind: 'transfer', preselectId: p.id })}
              className="w-full bg-bg-card rounded-xl px-3 py-2.5 flex items-center gap-3 border border-white/5 hover:bg-bg-elev"
            >
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: p.color }}
                aria-hidden
              />
              <span className="font-semibold flex-1 text-left">{p.name}</span>
              <span
                className={`tabular-nums text-sm ${p.balance < 0 ? 'text-bad' : 'text-ink-dim'}`}
              >
                {formatMoney(p.balance, scale)}
              </span>
            </button>
          ))}
        </div>
        {others.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button onClick={() => setSheet({ kind: 'pay_each' })} className="btn-ghost text-sm">
              Pay Each
            </button>
            <button onClick={() => setSheet({ kind: 'charge_each' })} className="btn-ghost text-sm">
              Charge Each
            </button>
          </div>
        )}
      </section>

      {/* Activity log */}
      <section className="mb-4">
        <h2 className="text-sm font-semibold text-ink-dim mb-2 px-1">Activity</h2>
        <ActivityLog state={state} meId={me.id} limit={10} />
      </section>

      {/* Sheets */}
      <NumpadSheet
        open={sheet?.kind === 'bank_pay'}
        title="Pay the Bank"
        chips={chips.bank_pay}
        accent="bank"
        scale={scale}
        onClose={() => setSheet(null)}
        onSubmit={async (amount, note) => {
          try {
            await emit('bank_pay', { amount, note });
          } catch (e) {
            toast.error((e as ErrorPayload).message ?? 'Failed');
          }
        }}
      />

      <NumpadSheet
        open={sheet?.kind === 'bank_collect'}
        title="Collect from Bank"
        subtitle="Mortgage, sell houses, refunds…"
        chips={chips.bank_collect}
        accent="good"
        scale={scale}
        onClose={() => setSheet(null)}
        onSubmit={async (amount, note) => {
          try {
            await emit('bank_collect', { amount, note });
          } catch (e) {
            toast.error((e as ErrorPayload).message ?? 'Failed');
          }
        }}
      />

      <NumpadSheet
        open={sheet?.kind === 'free_parking_pay'}
        title="Pay → Free Parking"
        chips={chips.free_parking_pay}
        accent="park"
        scale={scale}
        onClose={() => setSheet(null)}
        onSubmit={async (amount, note) => {
          try {
            await emit('free_parking_pay', { amount, note });
          } catch (e) {
            toast.error((e as ErrorPayload).message ?? 'Failed');
          }
        }}
      />

      <NumpadSheet
        open={sheet?.kind === 'charge_each'}
        title="Charge each player"
        subtitle={`${others.length} players will pay`}
        chips={chips.charge_each}
        accent="primary"
        submitLabel="Charge"
        scale={scale}
        onClose={() => setSheet(null)}
        onSubmit={async (amount, note) => {
          try {
            await emit('charge_each', { amount_per_player: amount, note });
          } catch (e) {
            toast.error((e as ErrorPayload).message ?? 'Failed');
          }
        }}
      />

      <NumpadSheet
        open={sheet?.kind === 'pay_each'}
        title="Pay each player"
        subtitle={`${others.length} players will receive`}
        chips={chips.pay_each}
        accent="primary"
        submitLabel="Pay"
        scale={scale}
        onClose={() => setSheet(null)}
        onSubmit={async (amount, note) => {
          try {
            await emit('pay_each', { amount_per_player: amount, note });
          } catch (e) {
            toast.error((e as ErrorPayload).message ?? 'Failed');
          }
        }}
      />

      <TransferSheet
        open={sheet?.kind === 'transfer'}
        players={state.players}
        meId={me.id}
        preselectId={sheet?.kind === 'transfer' ? sheet.preselectId : null}
        scale={scale}
        onClose={() => setSheet(null)}
      />
    </div>
  );
}
