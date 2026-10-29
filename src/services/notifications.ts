// Local notifications only (work in Expo Go). iOS will not run our JS at an
// exact time in the background, so reminders are pre-computed one-off DATE
// triggers for the next N commutes and re-synced every time the app opens
// or the plan changes. iOS caps pending local notifications at 64.

import * as Notifications from 'expo-notifications';
import { formatTime } from '../domain/scheduler';
import type { CommutePlan, DayPlan } from '../domain/types';
import { getProvider } from '../providers';

export const MAX_SCHEDULED = 14;

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

/** Replace all scheduled reminders with the given upcoming plans. */
export async function syncReminders(plan: CommutePlan, upcoming: DayPlan[]): Promise<number> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (plan.paused) return 0;
  const provider = getProvider(plan.provider);
  const items = upcoming.slice(0, MAX_SCHEDULED);
  for (const day of items) {
    const budget = plan.budgetInr ? ` Budget ₹${plan.budgetInr} — check the fare before confirming.` : '';
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Time to get a ride to ${plan.dropoff.label}`,
        body:
          `Leave by ${formatTime(day.leaveBy)} to reach by ${formatTime(day.arriveBy)}. ` +
          (provider.integration === 'prefill_handoff' ? `Tap to open ${provider.displayName}.` : `Open ${provider.displayName} to book.`) +
          budget,
        data: { kind: 'commute-reminder', date: day.date },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: day.bookAt },
    });
  }
  return items.length;
}

export async function cancelReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
