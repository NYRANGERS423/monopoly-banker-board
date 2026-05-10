import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import type { CurrencyScale, ErrorPayload, Player } from '@monopoly/shared';
import {
  classicEntryDisplay,
  formatMoney,
  parseInputAmount,
} from '../utils/currency';
import { emit } from '../socket';

type Unit = 'K' | 'M';

interface Props {
  open: boolean;
  players: Player[];
  meId: string;
  preselectId?: string | null;
  scale: CurrencyScale;
  onClose: () => void;
}

const CHIPS_CLASSIC = [50, 100, 200, 500];
const CHIPS_MILLIONS = [500_000, 1_000_000, 2_000_000, 5_000_000];

function trimZero(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

export function TransferSheet({ open, players, meId, preselectId, scale, onClose }: Props) {
  const [toId, setToId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<Unit>('M');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setToId(preselectId ?? null);
      setAmount('');
      setUnit('M');
      setNote('');
      setSubmitting(false);
    }
  }, [open, preselectId]);

  const isMillions = scale === 'millions';
  const chips = isMillions ? CHIPS_MILLIONS : CHIPS_CLASSIC;
  const multiplier = isMillions ? (unit === 'M' ? 1_000_000 : 1_000) : 1;

  function pressKey(k: string) {
    if (submitting) return;
    if (k === '⌫') return setAmount((a) => a.slice(0, -1));
    if (k === 'C') return setAmount('');
    if (k === '.') {
      return setAmount((a) => (a.includes('.') ? a : a.length === 0 ? '0.' : a + '.'));
    }
    setAmount((a) => (a + k).replace(/^0+(\d)/, '$1').slice(0, 10));
  }

  function applyChip(value: number) {
    if (!isMillions) {
      setAmount(String(value));
      return;
    }
    if (value >= 1_000_000) {
      setUnit('M');
      setAmount(trimZero(value / 1_000_000));
    } else {
      setUnit('K');
      setAmount(trimZero(value / 1_000));
    }
  }

  async function handleSubmit() {
    if (!toId) {
      toast.error('Pick a recipient first');
      return;
    }
    const n = parseInputAmount(amount, multiplier);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error('Enter an amount');
      return;
    }
    setSubmitting(true);
    try {
      await emit('transfer', { to_id: toId, amount: n, note: note.trim() || undefined });
      onClose();
    } catch (e) {
      const err = e as ErrorPayload;
      toast.error(err.message ?? 'Transfer failed');
    } finally {
      setSubmitting(false);
    }
  }

  const others = players.filter((p) => p.id !== meId && p.is_active);
  const literal = isMillions
    ? `$${amount === '' ? '0' : amount}${unit}`
    : classicEntryDisplay(amount);
  const stored = parseInputAmount(amount, multiplier);
  const verification =
    isMillions && amount !== '' && stored > 0
      ? `= ${formatMoney(stored, 'millions')}`
      : null;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 bg-bg-elev rounded-t-3xl border-t border-white/5 max-h-[92vh] overflow-auto"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 32 }}
          >
            <div className="p-5 pb-[max(env(safe-area-inset-bottom),20px)] mx-auto max-w-xl">
              <div className="flex items-start justify-between mb-3">
                <h2 className="text-lg font-bold">Transfer to player</h2>
                <button onClick={onClose} className="p-2 -m-2 text-ink-dim" aria-label="Close">
                  <X size={22} />
                </button>
              </div>

              <div className="space-y-2 mb-4">
                {others.map((p) => {
                  const selected = toId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setToId(p.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                        selected
                          ? 'border-accent bg-accent/10'
                          : 'border-white/5 bg-bg-card hover:bg-bg'
                      }`}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full shrink-0"
                        style={{ backgroundColor: p.color }}
                        aria-hidden
                      />
                      <span className="font-semibold flex-1 text-left">{p.name}</span>
                      <span className="text-ink-dim tabular-nums text-sm">
                        {formatMoney(p.balance, scale)}
                      </span>
                    </button>
                  );
                })}
                {others.length === 0 && (
                  <div className="card text-center text-ink-dim text-sm">
                    No other players to send to.
                  </div>
                )}
              </div>

              <div className="text-center my-3">
                <div className="text-4xl font-bold tabular-nums">{literal}</div>
                {verification && (
                  <div className="text-xs text-ink-dim mt-1 tabular-nums">{verification}</div>
                )}
              </div>

              {isMillions && (
                <div className="flex justify-center mb-3">
                  <div className="inline-flex bg-bg-card rounded-xl border border-white/5 p-1">
                    {(['K', 'M'] as Unit[]).map((u) => {
                      const active = unit === u;
                      return (
                        <button
                          key={u}
                          type="button"
                          onClick={() => setUnit(u)}
                          className={`px-5 py-1.5 rounded-lg text-sm font-bold tabular-nums transition-colors ${
                            active ? 'bg-accent text-white' : 'text-ink-dim'
                          }`}
                        >
                          {u}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 mb-3 justify-center">
                {chips.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => applyChip(c)}
                    className="pill bg-bg-card text-ink border border-white/5"
                  >
                    {formatMoney(c, scale, { compact: true })}
                  </button>
                ))}
              </div>

              <input
                className="input mb-3"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={120}
                placeholder="Optional note (e.g. Boardwalk rent)"
              />

              <div className="grid grid-cols-3 gap-2 mb-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
                  <Key key={k} k={k} onPress={pressKey} />
                ))}
                {isMillions ? (
                  <Key k="." onPress={pressKey} />
                ) : (
                  <Key k="C" onPress={pressKey} variant="ghost" />
                )}
                <Key k="0" onPress={pressKey} />
                <Key k="⌫" onPress={pressKey} variant="ghost" />
              </div>
              {isMillions && (
                <button
                  type="button"
                  onClick={() => pressKey('C')}
                  className="w-full text-xs text-ink-dim mb-3 py-1"
                >
                  Clear
                </button>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting || !amount || stored <= 0 || !toId}
                className="btn-primary w-full text-lg"
              >
                {submitting ? 'Sending…' : 'Send'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Key({
  k,
  onPress,
  variant = 'default',
}: {
  k: string;
  onPress: (k: string) => void;
  variant?: 'default' | 'ghost';
}) {
  return (
    <button
      type="button"
      onClick={() => onPress(k)}
      className={`h-14 rounded-xl text-xl font-bold tabular-nums flex items-center justify-center active:scale-[0.97] ${
        variant === 'ghost' ? 'bg-bg-card text-ink-dim' : 'bg-bg-card'
      }`}
    >
      {k}
    </button>
  );
}
