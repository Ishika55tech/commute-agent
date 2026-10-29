// Uber hand-off via the officially documented universal link.
// Source: https://developer.uber.com/docs/deep-linking
//   base:      https://m.uber.com/ul/
//   action:    setPickup
//   pickup[latitude|longitude|nickname|formatted_address]
//   dropoff[latitude|longitude|nickname|formatted_address]
//   client_id: optional, identifies the requesting app
// Either nickname or formatted_address is required for each end.
// This only OPENS Uber with the trip pre-filled. The user confirms and books
// inside Uber; we never receive a booking confirmation.

import type { Place } from '../domain/types';
import type { RideProvider } from './types';

export const UBER_UNIVERSAL_LINK_BASE = 'https://m.uber.com/ul/';

function isValidCoord(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export function buildUberLink(pickup: Place, dropoff: Place, clientId?: string): string {
  for (const [name, p] of [['pickup', pickup], ['dropoff', dropoff]] as const) {
    if (!isValidCoord(p.latitude, p.longitude)) throw new Error(`Invalid ${name} coordinates`);
    if (!p.label.trim() && !p.address.trim()) throw new Error(`${name} needs a nickname or address`);
  }

  // Keys AND values are percent-encoded: iOS's RFC 3986 URL parser rejects raw
  // "[" / "]" in a query ("Safari cannot open the page because the address is
  // invalid" — found on the iOS 26 Simulator). Uber's server decodes %5B/%5D to
  // the documented pickup[latitude] form. See docs/DECISIONS.md D-009.
  const params: [string, string][] = [];
  if (clientId) params.push(['client_id', clientId]);
  params.push(['action', 'setPickup']);
  for (const [prefix, p] of [['pickup', pickup], ['dropoff', dropoff]] as const) {
    params.push([`${prefix}[latitude]`, p.latitude.toFixed(6)]);
    params.push([`${prefix}[longitude]`, p.longitude.toFixed(6)]);
    if (p.label.trim()) params.push([`${prefix}[nickname]`, p.label.trim()]);
    if (p.address.trim()) params.push([`${prefix}[formatted_address]`, p.address.trim()]);
  }
  return UBER_UNIVERSAL_LINK_BASE + '?' + params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

export function createUberProvider(clientId?: string): RideProvider {
  return {
    id: 'uber',
    displayName: 'Uber',
    integration: 'prefill_handoff',
    statusMessage: 'Opens Uber with pickup and drop-off filled in. You review the fare and confirm the ride in Uber.',
    buildHandoffUrl: (pickup, dropoff) => buildUberLink(pickup, dropoff, clientId),
  };
}
