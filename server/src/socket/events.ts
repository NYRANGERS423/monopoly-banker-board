import { z } from 'zod';

const colorRe = /^#[0-9A-Fa-f]{6}$/;

export const joinSchema = z.object({
  name: z.string().trim().min(1).max(20),
  color: z.string().regex(colorRe),
});

export const rejoinSchema = z.object({
  player_id: z.string().min(1),
});

export const transferSchema = z.object({
  to_id: z.string().min(1),
  amount: z.number().int().positive(),
  note: z.string().max(120).optional(),
});

export const amountSchema = z.object({
  amount: z.number().int().positive(),
  note: z.string().max(120).optional(),
});

export const multiSchema = z.object({
  amount_per_player: z.number().int().positive(),
  note: z.string().max(120).optional(),
});

export const adminUnlockSchema = z.object({
  code: z.string().min(1),
});

export const adminOverrideSchema = z.object({
  player_id: z.string().min(1),
  new_balance: z.number().int(),
  note: z.string().max(120).optional(),
});

export const adminRemoveSchema = z.object({
  player_id: z.string().min(1),
});

export const adminNewGameSchema = z.object({
  winner_id: z.string().min(1).nullable().optional(),
});

export const adminSettingsSchema = z
  .object({
    starting_balance: z.number().int().positive().optional(),
    pass_go_amount: z.number().int().positive().optional(),
    currency_scale: z.enum(['classic', 'millions']).optional(),
    free_parking_enabled: z.boolean().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'No settings provided.' });

export const adminSetPotSchema = z.object({
  amount: z.number().int().nonnegative(),
});

export const adminDeleteArchivedSchema = z.object({
  game_number: z.number().int().positive(),
});

export const adminEditArchivedWinnerSchema = z.object({
  game_number: z.number().int().positive(),
  winner_name: z.string().min(1).max(40).nullable(),
});

export const adminSetGameNumberSchema = z.object({
  game_number: z.number().int().positive().max(9999),
});
