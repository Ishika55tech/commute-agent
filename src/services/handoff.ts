import { Linking } from 'react-native';
import type { CommutePlan, HandoffRecord } from '../domain/types';
import { getProvider } from '../providers';

/**
 * Open the provider with the trip pre-filled. The result is only ever
 * "opened" or "failed" — we have no way to know whether a ride was booked,
 * so we never claim it was.
 */
export async function openRideApp(plan: CommutePlan): Promise<HandoffRecord> {
  const provider = getProvider(plan.provider);
  const at = new Date().toISOString();
  if (provider.integration === 'unsupported') {
    return { at, provider: provider.id, status: 'unsupported', detail: provider.statusMessage };
  }
  let url: string | null;
  try {
    url = provider.buildHandoffUrl(plan.pickup, plan.dropoff);
  } catch (e) {
    return { at, provider: provider.id, status: 'failed', detail: (e as Error).message };
  }
  if (!url) return { at, provider: provider.id, status: 'failed', detail: 'No hand-off link available.' };

  try {
    // Universal link: iOS opens the Uber app if installed, otherwise Safari
    // shows Uber's mobile web flow. Linking can't tell us which happened.
    await Linking.openURL(url);
    return { at, provider: provider.id, status: 'opened_in_app', detail: 'Opened Uber (app or mobile web). Confirm the ride there.' };
  } catch {
    return { at, provider: provider.id, status: 'failed', detail: 'Could not open Uber. Is a browser or the Uber app available?' };
  }
}
