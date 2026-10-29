// Guardrail layer: everything that comes back from the LLM is validated here
// before it can touch app state. Invalid output is rejected, never "repaired".

import { z } from 'zod';
import { fromDateKey, isValidTime, toDateKey } from './scheduler';
import type { CommutePlan, IsoWeekday } from './types';

const time = z.string().refine(isValidTime, 'Time must be HH:MM (24h)');
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
const weekday = z.number().int().min(1).max(7);

export const AgentChangesSchema = z
  .object({
    pickupLabel: z.string().min(1).max(40).optional(),
    pickupAddress: z.string().min(3).max(200).optional(),
    dropoffLabel: z.string().min(1).max(40).optional(),
    dropoffAddress: z.string().min(3).max(200).optional(),
    arrivalTime: time.optional(),
    workingDays: z.array(weekday).min(1).max(7).optional(),
    bufferMinutes: z.number().int().min(0).max(60).optional(),
    budgetInr: z.number().int().min(0).max(5000).optional(),
    provider: z.enum(['uber', 'rapido']).optional(),
    /** Evening ride home: when the user leaves the destination. */
    returnDepartTime: time.optional(),
    returnEnabled: z.boolean().optional(),
  })
  .strict();

export const AgentIntentSchema = z
  .object({
    intent: z.enum(['set_schedule', 'update', 'skip_dates', 'override_arrival', 'pause', 'resume', 'unknown']),
    changes: AgentChangesSchema.default({}),
    skipDates: z.array(dateKey).max(31).default([]),
    /** One-off arrival change: { date, time }. */
    arrivalOverride: z.object({ date: dateKey, time }).nullable().default(null),
    missing: z.array(z.string().max(40)).max(10).default([]),
    clarifyingQuestion: z.string().max(300).nullable().default(null),
    summary: z.string().min(1).max(300),
  })
  .strict();

export type AgentIntent = z.infer<typeof AgentIntentSchema>;
export type AgentChanges = z.infer<typeof AgentChangesSchema>;

export type ValidationResult =
  | { ok: true; intent: AgentIntent; warnings: string[] }
  | { ok: false; errors: string[] };

const MAX_FUTURE_DAYS = 60;

/**
 * Validate raw LLM JSON, then apply business rules the schema can't express
 * (dates must be today..+60 days, etc.). `today` is injected for testability.
 */
export function validateAgentOutput(raw: unknown, today: Date): ValidationResult {
  const parsed = AgentIntentSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
  }
  const intent = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  const todayKey = toDateKey(today);
  const limit = new Date(today.getFullYear(), today.getMonth(), today.getDate() + MAX_FUTURE_DAYS);

  const checkDate = (key: string, field: string) => {
    const d = fromDateKey(key);
    if (Number.isNaN(d.getTime()) || toDateKey(d) !== key) errors.push(`${field}: ${key} is not a real date`);
    else if (key < todayKey) errors.push(`${field}: ${key} is in the past`);
    else if (d > limit) errors.push(`${field}: ${key} is more than ${MAX_FUTURE_DAYS} days ahead`);
  };

  intent.skipDates.forEach((d) => checkDate(d, 'skipDates'));
  if (intent.arrivalOverride) checkDate(intent.arrivalOverride.date, 'arrivalOverride.date');

  if (intent.intent === 'skip_dates' && intent.skipDates.length === 0) errors.push('skip_dates intent without any dates');
  if (intent.intent === 'override_arrival' && !intent.arrivalOverride) errors.push('override_arrival intent without arrivalOverride');
  if (intent.changes.workingDays) {
    const unique = new Set(intent.changes.workingDays);
    if (unique.size !== intent.changes.workingDays.length) warnings.push('Duplicate working days were removed');
  }
  if (intent.changes.provider === 'rapido') warnings.push('Rapido has no verified public integration; reminders will work but app handoff is unavailable.');

  return errors.length ? { ok: false, errors } : { ok: true, intent, warnings };
}

/** Pure reducer: apply a validated intent to a plan (address/geocode fields are handled by the caller). */
export function applyIntent(plan: CommutePlan, intent: AgentIntent, nowIso: string): CommutePlan {
  const c = intent.changes;
  const next: CommutePlan = {
    ...plan,
    pickup: { ...plan.pickup, label: c.pickupLabel ?? plan.pickup.label },
    dropoff: { ...plan.dropoff, label: c.dropoffLabel ?? plan.dropoff.label },
    arrivalTime: c.arrivalTime ?? plan.arrivalTime,
    workingDays: c.workingDays
      ? ([...new Set(c.workingDays)].sort((a, b) => a - b) as IsoWeekday[])
      : plan.workingDays,
    bufferMinutes: c.bufferMinutes ?? plan.bufferMinutes,
    budgetInr: c.budgetInr ?? plan.budgetInr,
    provider: c.provider ?? plan.provider,
    returnTrip:
      c.returnDepartTime || c.returnEnabled != null
        ? {
            enabled: c.returnEnabled ?? true,
            departTime: c.returnDepartTime ?? plan.returnTrip?.departTime ?? '18:30',
          }
        : plan.returnTrip ?? null,
    skipDates: [...plan.skipDates],
    arrivalOverrides: { ...plan.arrivalOverrides },
    updatedAt: nowIso,
  };
  if (intent.intent === 'pause') next.paused = true;
  if (intent.intent === 'resume') next.paused = false;
  for (const d of intent.skipDates) if (!next.skipDates.includes(d)) next.skipDates.push(d);
  next.skipDates.sort();
  if (intent.arrivalOverride) next.arrivalOverrides[intent.arrivalOverride.date] = intent.arrivalOverride.time;
  return next;
}
