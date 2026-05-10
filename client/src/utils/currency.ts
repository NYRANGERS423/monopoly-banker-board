import type { CurrencyScale } from '@monopoly/shared';

const classicFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export interface FormatOptions {
  /** When true, trim trailing zeros from the M display ("$1M" instead of "$1.000M"). */
  compact?: boolean;
}

export function formatMoney(
  amount: number,
  scale: CurrencyScale = 'classic',
  options: FormatOptions = {},
): string {
  if (scale === 'millions') return formatMillions(amount, options.compact ?? false);
  const sign = amount < 0 ? '-' : '';
  return `${sign}$${classicFmt.format(Math.abs(amount))}`;
}

function formatMillions(amount: number, compact: boolean): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    const str = compact ? trimDecimals(m, 3) : m.toFixed(3);
    return `${sign}$${str}M`;
  }
  if (abs >= 1_000) {
    const k = abs / 1_000;
    return `${sign}$${trimDecimals(k, 3)}K`;
  }
  // Sub-thousand in millions mode — rare, show as raw dollars.
  return `${sign}$${classicFmt.format(abs)}`;
}

/** Trim trailing zeros after the decimal point, capped at `maxDecimals`. */
function trimDecimals(n: number, maxDecimals: number): string {
  if (Number.isInteger(n)) return n.toString();
  const fixed = n.toFixed(maxDecimals);
  return fixed.replace(/0+$/, '').replace(/\.$/, '');
}

export function formatSigned(amount: number, scale: CurrencyScale = 'classic'): string {
  if (amount === 0) return formatMoney(0, scale);
  if (amount > 0) return `+${formatMoney(amount, scale)}`;
  return formatMoney(amount, scale);
}

export function relativeTime(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return 'now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

/**
 * Parse the user's typed numpad input to a stored real-dollar value.
 * `multiplier` is 1 for classic, 1000 for K, 1_000_000 for M.
 */
export function parseInputAmount(raw: string, multiplier = 1): number {
  if (!raw) return 0;
  const f = Number.parseFloat(raw);
  if (!Number.isFinite(f)) return 0;
  return Math.round(f * multiplier);
}

/** Render the numpad input with a thousands-separator on the integer part (classic mode). */
export function classicEntryDisplay(raw: string): string {
  if (!raw) return '$0';
  const negative = raw.startsWith('-');
  const r = negative ? raw.slice(1) : raw;
  const [intPart, decPart] = r.split('.');
  const n = Number.parseInt(intPart || '0', 10);
  const intStr = Number.isFinite(n) ? classicFmt.format(n) : (intPart || '0');
  const sign = negative ? '-' : '';
  return decPart !== undefined ? `${sign}$${intStr}.${decPart}` : `${sign}$${intStr}`;
}
