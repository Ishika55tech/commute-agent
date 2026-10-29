// Proactive agent: plain-code rules that look at today's plan and speak up first.
// Deterministic (no LLM) so every message is explainable and unit-tested.

import { addMinutes, formatTime, isCommuteDay, isoWeekday, legOf, toDateKey } from './scheduler';
import type { CommutePlan, DayPlan } from './types';

export type InsightTone = 'ok' | 'info' | 'warn';
export type InsightAction = 'open_ride' | 'edit' | 'undo_skip_tomorrow';

export interface Insight {
  id: string;
  tone: InsightTone;
  icon: string;
  title: string;
  body?: string;
  action?: InsightAction;
  actionLabel?: string;
}

export interface InsightInput {
  plan: CommutePlan;
  now: Date;
  /** Upcoming legs in time order (from upcomingLegs). */
  upcoming: DayPlan[];
  providerName: string;
  canOpenProvider: boolean;
}

const SOON_MINUTES = 30;

export function buildInsights({ plan, now, upcoming, providerName, canOpenProvider }: InsightInput): Insight[] {
  if (plan.paused) return [];
  const out: Insight[] = [];
  const next = upcoming[0];
  const destName = (d: DayPlan) => (legOf(d) === 'back' ? plan.pickup.label : plan.dropoff.label);

  if (next) {
    const mins = Math.round((next.bookAt.getTime() - now.getTime()) / 60_000);
    if (mins >= 0 && mins <= SOON_MINUTES) {
      out.push({
        id: 'book-soon',
        tone: 'ok',
        icon: 'car.fill',
        title: mins <= 1 ? `Book your ride to ${destName(next)} now` : `Book your ride to ${destName(next)} in ${mins} min`,
        body: `Leave at ${formatTime(next.leaveBy)} to reach around ${formatTime(next.arriveBy)}.`,
        ...(canOpenProvider ? { action: 'open_ride' as const, actionLabel: `Open ${providerName}` } : {}),
      });
    }

    const rain = next.adjustments.find((a) => a.reason.startsWith('Rain'));
    if (rain) {
      out.push({
        id: 'rain',
        tone: 'warn',
        icon: 'cloud.rain.fill',
        title: `Rain likely — I moved your booking ${rain.minutes} min earlier`,
        body: `Open ${providerName} at ${formatTime(next.bookAt)} instead of ${formatTime(addMinutes(next.bookAt, rain.minutes))}. Rides are slower to find in the rain.`,
      });
    }

    if (next.estimateSource === 'fallback') {
      out.push({
        id: 'fallback',
        tone: 'info',
        icon: 'antenna.radiowaves.left.and.right.slash',
        title: 'No live route right now',
        body: `I'm using a ${next.travelMinutes}-minute default. Pull down to retry.`,
      });
    }

    if (legOf(next) === 'back' && !out.some((i) => i.id === 'book-soon')) {
      out.push({
        id: 'heading-home',
        tone: 'info',
        icon: 'house.fill',
        title: `Next up: your ride home at ${formatTime(next.leaveBy)}`,
        body: `I'll remind you at ${formatTime(next.bookAt)} to book from ${plan.dropoff.label}.`,
      });
    }
  }

  // Tomorrow
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tKey = toDateKey(t);
  if (plan.skipDates.includes(tKey) && plan.workingDays.includes(isoWeekday(t))) {
    out.push({
      id: 'tomorrow-off',
      tone: 'info',
      icon: 'beach.umbrella.fill',
      title: 'Tomorrow is marked off',
      body: 'No reminders tomorrow. Enjoy the day.',
      action: 'undo_skip_tomorrow',
      actionLabel: 'I am going after all',
    });
  } else if (plan.arrivalOverrides[tKey] && isCommuteDay(plan, t)) {
    out.push({
      id: 'tomorrow-custom',
      tone: 'info',
      icon: 'clock.badge.checkmark.fill',
      title: `Tomorrow you need to arrive by ${plan.arrivalOverrides[tKey]}`,
      body: 'Your reminders for tomorrow are already adjusted.',
    });
  }

  // Nudge: no ride back set up, it's afternoon on a commute day.
  if (!plan.returnTrip?.enabled && now.getHours() >= 15 && isCommuteDay(plan, now)) {
    out.push({
      id: 'suggest-return',
      tone: 'info',
      icon: 'arrow.uturn.backward.circle.fill',
      title: 'Want a reminder for the ride home too?',
      body: `Add the time you usually leave ${plan.dropoff.label}.`,
      action: 'edit',
      actionLabel: 'Add ride home',
    });
  }

  return out.slice(0, 2);
}
