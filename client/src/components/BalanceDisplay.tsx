import { motion, AnimatePresence } from 'framer-motion';
import type { CurrencyScale } from '@monopoly/shared';
import { formatMoney } from '../utils/currency';

interface Props {
  amount: number;
  scale: CurrencyScale;
  label?: string;
  size?: 'lg' | 'md';
}

export function BalanceDisplay({ amount, scale, label, size = 'lg' }: Props) {
  const negative = amount < 0;
  return (
    <div className="text-center">
      {label && <div className="text-sm text-ink-dim mb-1">{label}</div>}
      <AnimatePresence mode="popLayout">
        <motion.div
          key={amount}
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -8, opacity: 0 }}
          transition={{ duration: 0.2 }}
          aria-live="polite"
          className={`font-bold tabular-nums ${
            size === 'lg' ? 'text-5xl' : 'text-2xl'
          } ${negative ? 'text-bad animate-pulse-bad' : 'text-ink'}`}
        >
          {formatMoney(amount, scale)}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
