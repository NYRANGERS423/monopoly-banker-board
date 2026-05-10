import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function envBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true' || value === '1';
}

function envInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: envInt(process.env.PORT, 3030),
  host: process.env.HOST ?? '0.0.0.0',
  adminCode: process.env.ADMIN_CODE ?? '1413',
  defaultCurrency: (process.env.DEFAULT_CURRENCY === 'millions' ? 'millions' : 'classic') as
    | 'classic'
    | 'millions',
  defaultFreeParkingEnabled: envBool(process.env.DEFAULT_FREE_PARKING_ENABLED, true),
  defaultStartingBalance: envInt(process.env.DEFAULT_STARTING_BALANCE, 1500),
  defaultPassGoAmount: envInt(process.env.DEFAULT_PASS_GO_AMOUNT, 200),
  dbPath: process.env.DB_PATH ?? path.resolve(__dirname, '..', '..', 'data', 'banker.db'),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  // Path to the built client. In dev, the Vite server handles client serving,
  // so this is only used when NODE_ENV=production.
  clientDist: path.resolve(__dirname, '..', '..', 'client', 'dist'),
} as const;
