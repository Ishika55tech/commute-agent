import type { HandoffStatus, Place, ProviderId } from '../domain/types';

export type IntegrationLevel =
  /** Opens the provider app with pickup + drop-off pre-filled. User books there. */
  | 'prefill_handoff'
  /** No verified public integration. */
  | 'unsupported';

/**
 * A ride provider adapter. Today the only level is a hand-off; a future
 * authorised booking API would add a `requestRide` method behind the same
 * interface, without touching scheduling or UI code.
 */
export interface RideProvider {
  id: ProviderId;
  displayName: string;
  integration: IntegrationLevel;
  /** Shown in the UI so the user always knows what the app can and cannot do. */
  statusMessage: string;
  buildHandoffUrl(pickup: Place, dropoff: Place): string | null;
}

export interface HandoffResult {
  status: HandoffStatus;
  detail?: string;
}
