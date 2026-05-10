import { useState } from 'react';
import toast from 'react-hot-toast';
import { LogOut } from 'lucide-react';
import type { ErrorPayload } from '@monopoly/shared';
import { useGame } from '../store/gameStore';
import { emit } from '../socket';
import { formatMoney } from '../utils/currency';

export function SettingsPage() {
  const state = useGame((s) => s.state)!;
  const isAdmin = useGame((s) => s.is_admin);
  const setIsAdmin = useGame((s) => s.setIsAdmin);
  const setTab = useGame((s) => s.setTab);
  const reset = useGame((s) => s.reset);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await emit('admin_unlock', { code });
      setIsAdmin(true);
      setCode('');
      toast.success('Admin unlocked');
      setTab('admin');
    } catch (e) {
      toast.error((e as ErrorPayload).message ?? 'Wrong code');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-4 pt-4">
      <header className="mb-4">
        <h1 className="text-xl font-bold">Settings</h1>
      </header>

      <section className="card mb-3 space-y-2">
        <Row label="Currency scale" value={state.settings.currency_scale === 'classic' ? 'Classic ($)' : 'Millions ($M)'} />
        <Row
          label="Starting balance"
          value={formatMoney(state.settings.starting_balance, state.settings.currency_scale)}
        />
        <Row
          label="Pass GO amount"
          value={formatMoney(state.settings.pass_go_amount, state.settings.currency_scale)}
        />
        <Row
          label="Free Parking"
          value={state.settings.free_parking_enabled ? 'Enabled' : 'Disabled'}
        />
        <Row label="Game number" value={`#${state.game_number}`} />
        <p className="text-xs text-ink-faint pt-2">
          Admins can change these values mid-game from the Admin tab.
        </p>
      </section>

      {!isAdmin && (
        <section className="card mb-3">
          <h2 className="font-semibold mb-2">Unlock admin</h2>
          <form onSubmit={unlock} className="flex gap-2">
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              className="input flex-1"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Code"
              maxLength={20}
            />
            <button type="submit" disabled={submitting || !code} className="btn-admin">
              Unlock
            </button>
          </form>
          <p className="text-xs text-ink-faint mt-2">
            Need to override a balance, remove a player, or start a new game? Enter the admin code.
          </p>
        </section>
      )}

      <section className="card">
        <h2 className="font-semibold mb-2 text-bad">Leave this device</h2>
        <p className="text-xs text-ink-dim mb-2">
          Clears your saved session on this phone. Your player stays in the game — you'll see them
          on the join screen as "free" and can tap to resume.
        </p>
        <button
          onClick={() => {
            reset();
            toast('Session cleared');
          }}
          className="btn-danger w-full"
        >
          <LogOut size={16} /> Clear my session
        </button>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink-dim">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
