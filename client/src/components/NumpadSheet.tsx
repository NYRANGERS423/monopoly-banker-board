import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Delete, X } from 'lucide-react';
import type { CurrencyScale } from '@monopoly/shared';
import {
  classicEntryDisplay,
  formatMoney,
  parseInputAmount,
} from '../utils/currency';

type Unit = 'K' | 'M';

interface Props {
  open: boolean;
  title: string;
  subtitle?: string;
  /** Quick-amount chips (in stored real-dollar values). */
  chips?: number[];
  showNote?: boolean;
  submitLabel?: string;
  accent?: 'primary' | 'bank' | 'park' | 'good' | 'admin' | 'danger';
  scale?: CurrencyScale;
  onClose: () => void;
  onSubmit: (amount: number, note?: string) => Promise<void> | void;
}

export function NumpadSheet({
  open,
  title,
  subtitle,
  chips = [],
  showNote = true,
  submitLabel = 'Send',
  accent = 'primary',
  scale = 'classic',
  onClose,
  onSubmit,
}: Props) {
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<Unit>('M');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount('');
      setUnit('M');
      setNote('');
      setSubmitting(false);
    }
  }, [open]);

  const isMillions = scale === 'millions';
  const multiplier = isMillions ? (unit === 'M' ? 1_000_000 : 1_000) : 1;

  function pressKey(k: string) {
    if (submitting) return;
    if (k === '⌫') return setAmount((a) => a.slice(0, -1));
    if (k === 'C') return setAmount('');
    if (k === '.') {
      return setAmount((a) =>
        a.includes('.') ? a : a.length === 0 ? '0.' : a + '.',
      );
    }
    setAmount((a) => {
      const next = a + k;
      const cleaned = next.replace(/^0+(\d)/, '$1');
      return cleaned.slice(0, 10);
    });
  }

  /** When a chip is tapped, set both the input and the unit it implies. */
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
    const n = parseInputAmount(amount, multiplier);
    if (!Number.isFinite(n) || n <= 0) return;
    setSubmitting(true);
    try {
      await onSubmit(n, note.trim() || undefined);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  // Big display: literal input + unit (so decimal & trailing zeros are visible).
  const literal = (() => {
    if (isMillions) {
      const visible = amount === '' ? '0' : amount;
      return `$${visible}${unit}`;
    }
    return classicEntryDisplay(amount);
  })();
  // Verification line: actual value that will be sent, formatted.
  const stored = parseInputAmount(amount, multiplier);
  const verification = isMillions && amount !== '' && stored > 0
    ? `= ${formatMoney(stored, 'millions')}`
    : null;

  const submitClass = `btn-${accent} w-full text-lg`;

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
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h2 className="text-lg font-bold">{title}</h2>
                  {subtitle && <p className="text-sm text-ink-dim">{subtitle}</p>}
                </div>
                <button
                  onClick={onClose}
                  className="p-2 -m-2 text-ink-dim"
                  aria-label="Close"
                >
                  <X size={22} />
                </button>
              </div>

              <div className="text-center my-3">
                <div className="text-4xl font-bold tabular-nums">{literal}</div>
                {verification && (
                  <div className="text-xs text-ink-dim mt-1 tabular-nums">
                    {verification}
                  </div>
                )}
              </div>

              {isMillions && (
                <UnitToggle unit={unit} onChange={setUnit} />
              )}

              {chips.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3 justify-center">
                  {chips.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => applyChip(c)}
                      className="pill bg-bg-card text-ink hover:bg-bg-elev border border-white/5"
                    >
                      {formatMoney(c, scale, { compact: true })}
                    </button>
                  ))}
                </div>
              )}

              {showNote && (
                <input
                  className="input mb-3"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={120}
                  placeholder="Optional note (e.g. Boardwalk rent)"
                />
              )}

              <div className="grid grid-cols-3 gap-2 mb-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
                  <NumKey key={k} k={k} onPress={pressKey} />
                ))}
                {isMillions ? (
                  <NumKey k="." onPress={pressKey} />
                ) : (
                  <NumKey k="C" onPress={pressKey} variant="ghost" />
                )}
                <NumKey k="0" onPress={pressKey} />
                <NumKey k="⌫" onPress={pressKey} variant="ghost">
                  <Delete size={20} />
                </NumKey>
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
                disabled={submitting || !amount || stored <= 0}
                className={submitClass}
              >
                {submitting ? 'Working…' : submitLabel}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function UnitToggle({
  unit,
  onChange,
}: {
  unit: Unit;
  onChange: (u: Unit) => void;
}) {
  return (
    <div className="flex justify-center mb-3">
      <div className="inline-flex bg-bg-card rounded-xl border border-white/5 p-1">
        {(['K', 'M'] as Unit[]).map((u) => {
          const active = unit === u;
          return (
            <button
              key={u}
              type="button"
              onClick={() => onChange(u)}
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
  );
}

/** Compact decimal rendering for chip → input round-trip. */
function trimZero(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function NumKey({
  k,
  onPress,
  variant = 'default',
  children,
}: {
  k: string;
  onPress: (k: string) => void;
  variant?: 'default' | 'ghost';
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onPress(k)}
      className={`h-14 rounded-xl text-xl font-bold tabular-nums flex items-center justify-center transition-colors active:scale-[0.97] ${
        variant === 'ghost'
          ? 'bg-bg-card text-ink-dim'
          : 'bg-bg-card hover:bg-white/5'
      }`}
    >
      {children ?? k}
    </button>
  );
}
