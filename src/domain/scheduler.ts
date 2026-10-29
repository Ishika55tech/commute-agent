// Deterministic scheduling. NO LLM here — every number the user sees is
// computed by these pure functions and covered by unit tests.

import type { Adjustment, CommutePlan, DayPlan, IsoWeekday, TravelEstimate } from './types';

export const FALLBACK_TRAVEL_MINUTES = 30;
export const RUSH_HOUR_FACTOR = 1.3;
export const RAIN_EXTRA_MINUTES = 10;
export const RAIN_PROBABILITY_THRESHOLD = 60;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(hhmm: string): boolean {
  return TIME_RE.test(hhmm);
}

export function parseTime(hhmm: string): { hours: number; minutes: number } {
  const m = TIME_RE.exec(hhmm);
  if (!m) throw new Error(`Invalid time "${hhmm}", expected HH:MM`);
  return { hours: Number(m[1]), minutes: Number(m[2]) };
}

/** Local "YYYY-MM-DD" for a Date (device timezone). */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** JS getDay(): 0 = Sunday. ISO: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(d: Date): IsoWeekday {
  const js = d.getDay();
  return (js === 0 ? 7 : js) as IsoWeekday;
}

/** expo-notifications calendar triggers use 1 = Sunday ... 7 = Saturday. */
export function isoToExpoWeekday(iso: IsoWeekday): number {
  return iso === 7 ? 1 : iso + 1;
}

export function isRushHour(hhmm: string): boolean {
  const { hours } = parseTime(hhmm);
  return (hours >= 8 && hours < 11) || (hours >= 17 && hours < 21);
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

export function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export interface PlanInputs {
  estimate: TravelEstimate | null;
  /** Precipitation probability (0-100) around arrival, if known. */
  rainProbability?: number | null;
}

/** Is the commute active on this calendar date? */
export function isCommuteDay(plan: CommutePlan, date: Date): boolean {
  if (plan.paused) return false;
  if (!plan.workingDays.includes(isoWeekday(date))) return false;
  return !plan.skipDates.includes(toDateKey(date));
}

/** Arrival time for a date, honouring one-off overrides. */
export function arrivalTimeFor(plan: CommutePlan, date: Date): string {
  return plan.arrivalOverrides[toDateKey(date)] ?? plan.arrivalTime;
}

/**
 * Compute the plan for one date.
 *   travel  = base estimate (or fallback) [x rush-hour factor] [+ rain]
 *   leaveBy = arriveBy - travel - buffer
 *   bookAt  = leaveBy - driverWait
 */
export function planForDate(plan: CommutePlan, date: Date, inputs: PlanInputs): DayPlan {
  const arrival = arrivalTimeFor(plan, date);
  const { hours, minutes } = parseTime(arrival);
  const arriveBy = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);

  const adjustments: Adjustment[] = [];
  const source = inputs.estimate?.source ?? 'fallback';
  const base = inputs.estimate ? Math.max(1, Math.round(inputs.estimate.baseMinutes)) : FALLBACK_TRAVEL_MINUTES;
  let travel = base;

  if (isRushHour(arrival)) {
    const extra = Math.round(base * RUSH_HOUR_FACTOR) - base;
    if (extra > 0) {
      adjustments.push({ reason: `Rush hour (x${RUSH_HOUR_FACTOR})`, minutes: extra });
      travel += extra;
    }
  }
  if (inputs.rainProbability != null && inputs.rainProbability >= RAIN_PROBABILITY_THRESHOLD) {
    adjustments.push({ reason: `Rain likely (${Math.round(inputs.rainProbability)}%)`, minutes: RAIN_EXTRA_MINUTES });
    travel += RAIN_EXTRA_MINUTES;
  }

  const leaveBy = addMinutes(arriveBy, -(travel + plan.bufferMinutes));
  const bookAt = addMinutes(leaveBy, -plan.driverWaitMinutes);

  return {
    date: toDateKey(date),
    arriveBy,
    leaveBy,
    bookAt,
    travelMinutes: travel,
    adjustments,
    estimateSource: source,
  };
}

/**
 * Next `count` commute plans whose bookAt is still in the future.
 * Looks ahead at most `horizonDays` days (guards against infinite loops when
 * every day is skipped or no working days are set).
 */
export function upcomingPlans(
  plan: CommutePlan,
  now: Date,
  inputs: PlanInputs,
  count: number,
  horizonDays = 60,
): DayPlan[] {
  const result: DayPlan[] = [];
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i <= horizonDays && result.length < count; i++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (!isCommuteDay(plan, day)) continue;
    // Rain data only applies to the forecast day it was fetched for (today/tomorrow);
    // callers pass it, but we only use it for the first upcoming plan.
    const dayInputs = result.length === 0 ? inputs : { ...inputs, rainProbability: null };
    const p = planForDate(plan, day, dayInputs);
    if (p.bookAt.getTime() > now.getTime()) result.push(p);
  }
  return result;
}

/** Plain-language explanation of how a DayPlan was derived. */
export function explainPlan(plan: CommutePlan, day: DayPlan): string {
  const parts: string[] = [];
  const baseMinutes = day.travelMinutes - day.adjustments.reduce((s, a) => s + a.minutes, 0);
  parts.push(
    day.estimateSource === 'openrouteservice'
      ? `Route estimate is ${baseMinutes} min (OpenRouteService, no live traffic).`
      : `No route estimate available, so a default of ${baseMinutes} min is used.`,
  );
  for (const a of day.adjustments) parts.push(`${a.reason}: +${a.minutes} min.`);
  parts.push(`Safety buffer: +${plan.bufferMinutes} min.`);
  parts.push(
    `Leave by ${formatTime(day.leaveBy)} to arrive by ${formatTime(day.arriveBy)}. ` +
      `Open the ride app at ${formatTime(day.bookAt)} to allow ~${plan.driverWaitMinutes} min for a driver to reach you.`,
  );
  return parts.join(' ');
}
