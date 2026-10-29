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

async function ensureLocationPermission(): Promise<string | null> {
  try {
    const perm = await withTimeout(Location.requestForegroundPermissionsAsync(), 'Location permission');
    return perm.status === 'granted'
      ? null
      : 'Location permission is needed. Enable it for Expo Go in Settings > Privacy > Location Services.';
  } catch {
    return 'Location permission prompt did not respond. Check for a popup, or enable Location for Expo Go in Settings.';
  }
}

function formatAddress(rev: Location.LocationGeocodedAddress | undefined, fallback: string): string {
  if (!rev) return fallback;
  return [rev.name, rev.street !== rev.name ? rev.street : null, rev.district, rev.city].filter(Boolean).join(', ') || fallback;
}

/** Coordinates -> human address (used after the user drags the pin). */
export async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  const fallback = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  try {
    const [rev] = await withTimeout(Location.reverseGeocodeAsync({ latitude, longitude }), 'Reverse lookup');
    return formatAddress(rev, fallback);
  } catch {
    return fallback;
  }
}

/** Exact pickup from GPS — the most precise option when the user is at home. */
export async function currentPlace(label: string): Promise<GeocodeResult> {
  const denied = await ensureLocationPermission();
  if (denied) return { ok: false, message: denied };
  try {
    const pos = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      'Current location',
    );
    const { latitude, longitude } = pos.coords;
    return { ok: true, place: { label, address: await reverseGeocode(latitude, longitude), latitude, longitude } };
  } catch {
    return { ok: false, message: 'Could not get your location. Try again outdoors or search for the address.' };
  }
}

/**
 * Address -> coordinates using the OS geocoder (Apple on iOS, no API key).
 * We keep the user's own address text; the formatted address from reverse
 * geocoding is shown so they can confirm the pin is right.
 */
export async function geocodePlace(label: string, address: string): Promise<GeocodeResult> {
  const trimmed = address.trim();
  if (trimmed.length < 3) return { ok: false, message: `Enter an address for ${label}.` };

  const denied = await ensureLocationPermission();
  if (denied) return { ok: false, message: denied };
  try {
    const results = await withTimeout(Location.geocodeAsync(trimmed), 'Address lookup');
    if (!results.length) return { ok: false, message: `Couldn't find "${trimmed}". Try adding the area and city.` };
    const { latitude, longitude } = results[0];
    const formatted = await reverseGeocode(latitude, longitude).then((a) => (/^-?\d/.test(a) ? trimmed : a));
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

/** Last known position, only if permission was already granted (never prompts). Used to bias search. */
export async function lastKnownPoint(): Promise<{ latitude: number; longitude: number } | undefined> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') return undefined;
    const pos = await withTimeout(Location.getLastKnownPositionAsync(), 'Last known location');
    return pos ? { latitude: pos.coords.latitude, longitude: pos.coords.longitude } : undefined;
  } catch {
    return undefined;
  }
}
