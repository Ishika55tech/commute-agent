// Local notifications only (work in Expo Go). iOS will not run our JS at an
// exact time in the background, so reminders are pre-computed one-off DATE
// triggers for the next N commutes and re-synced every time the app opens or
// the plan changes. Two per commute day:
//   1. "book"  at bookAt  — open the ride app now (tap opens Uber pre-filled)
//   2. "leave" at leaveBy — head out now
// With the ride home: + "book home" (+ "leave now"). iOS caps pending local
// notifications at 64, so we schedule at most MAX_PENDING in time order.

import * as Notifications from 'expo-notifications';
import { formatTime, legOf } from '../domain/scheduler';
import type { CommutePlan, DayPlan } from '../domain/types';
import { getProvider } from '../providers';

export const MAX_PENDING = 56;
export type ReminderStage = 'book' | 'leave';
export type ReminderData = { kind: 'commute-reminder'; stage: ReminderStage; leg: 'to' | 'back'; date: string; test?: boolean };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export async function ensurePermission(): Promise<PermissionState> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return 'granted';
  if (!current.canAskAgain) return 'denied';
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted ? 'granted' : 'denied';
}

export function reminderContent(plan: CommutePlan, day: DayPlan, stage: ReminderStage, test = false) {
  const provider = getProvider(plan.provider);
  const prefix = test ? '[Test] ' : '';
  const leg = legOf(day);
  const to = leg === 'back' ? plan.pickup : plan.dropoff;
  const from = leg === 'back' ? plan.dropoff : plan.pickup;
  const data: ReminderData = { kind: 'commute-reminder', stage, leg, date: day.date, test };
  if (stage === 'book') {
    const budget = plan.budgetInr ? ` Budget ₹${plan.budgetInr}.` : '';
    return {
      title: `${prefix}Book your ride ${leg === 'back' ? 'home' : `to ${to.label}`}`,
      body:
        `${day.travelMinutes} min trip · leave ${from.label} at ${formatTime(day.leaveBy)}, reach ${to.label} ~${formatTime(day.arriveBy)}. ` +
        (provider.integration === 'prefill_handoff' ? `Tap to open ${provider.displayName} with your trip filled in.` : `Open ${provider.displayName} to book.`) +
        budget,
      data,
    };
  }
  return {
    title: `${prefix}Time to leave 🚶`,
    body: `Head out of ${from.label} now to reach ${to.label} ${leg === 'back' ? `around ${formatTime(day.arriveBy)}` : `by ${formatTime(day.arriveBy)}`}. Your driver should be close.`,
    data,
  };
}

/** Replace all scheduled reminders with the given upcoming plans. */
export async function syncReminders(plan: CommutePlan, upcoming: DayPlan[]): Promise<number> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (plan.paused) return 0;
  const now = Date.now();
  const items = upcoming
    .flatMap((day) => [
      { day, stage: 'book' as const, at: day.bookAt },
      { day, stage: 'leave' as const, at: day.leaveBy },
    ])
    .filter((x) => x.at.getTime() > now)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, MAX_PENDING);
  for (const { day, stage, at } of items) {
    await Notifications.scheduleNotificationAsync({
      content: reminderContent(plan, day, stage),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
  }
  return items.length;
}

/** Demo helper: fire the real "book" reminder in a few seconds. */
export async function sendTestReminder(plan: CommutePlan, day: DayPlan, seconds = 8): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: reminderContent(plan, day, 'book', true),
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
  });
}

export async function cancelReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
