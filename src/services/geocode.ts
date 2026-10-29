import * as Location from 'expo-location';
import type { Place } from '../domain/types';

const TIMEOUT_MS = 10_000;

/** Reject if a native call hangs (seen on the iOS Simulator). */
function withTimeout<T>(promise: Promise<T>, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what} timed out`)), TIMEOUT_MS);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export type GeocodeResult = { ok: true; place: Place } | { ok: false; message: string };

/**
 * Address -> coordinates using the OS geocoder (Apple on iOS, no API key).
 * We keep the user's own address text; the formatted address from reverse
 * geocoding is shown so they can confirm the pin is right.
 */
export async function geocodePlace(label: string, address: string): Promise<GeocodeResult> {
  const trimmed = address.trim();
  if (trimmed.length < 3) return { ok: false, message: `Enter an address for ${label}.` };

  let perm: Location.LocationPermissionResponse;
  try {
    perm = await withTimeout(Location.requestForegroundPermissionsAsync(), 'Location permission');
  } catch {
    return { ok: false, message: 'Location permission prompt did not respond. Check for a popup, or enable Location for Expo Go in Settings.' };
  }
  if (perm.status !== 'granted') {
    return { ok: false, message: 'Location permission is needed to look up addresses. Enable it in Settings > Privacy > Location.' };
  }
  try {
    const results = await withTimeout(Location.geocodeAsync(trimmed), 'Address lookup');
    if (!results.length) return { ok: false, message: `Couldn't find "${trimmed}". Try adding the area and city.` };
    const { latitude, longitude } = results[0];
    let formatted = trimmed;
    try {
      const [rev] = await withTimeout(Location.reverseGeocodeAsync({ latitude, longitude }), 'Reverse lookup');
      if (rev) {
        formatted = [rev.name, rev.street, rev.district, rev.city].filter(Boolean).join(', ') || trimmed;
      }
    } catch {
      // keep the user's text
    }
    return { ok: true, place: { label, address: formatted, latitude, longitude } };
  } catch (e) {
    const timedOut = (e as Error).message.includes('timed out');
    return {
      ok: false,
      message: timedOut
        ? `Looking up "${trimmed}" took too long. Check your internet and try again.`
        : 'Address lookup failed. Check your connection and try again.',
    };
  }
}
