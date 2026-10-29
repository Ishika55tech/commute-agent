// Place / building / POI autocomplete ("Apollo Premier", "Phoenix Citadel").
// Apple's geocoder (expo-location) only understands postal-style addresses, so we
// search OpenStreetMap-based gazetteers instead — both free:
//   1. Photon (komoot) — no key, called directly. https://photon.komoot.io
//   2. OpenRouteService autocomplete (Pelias) — via our `place-search` Edge Function
//      so the ORS key stays server-side.
// Results are merged, de-duplicated (same name within ~150 m) and biased to `near`.
// If a building isn't in OpenStreetMap, the user can still tap the map to drop a pin.

import { supabase } from './supabase';

export type PlaceSuggestion = {
  id: string;
  name: string;
  detail: string;
  latitude: number;
  longitude: number;
  source: 'photon' | 'ors';
};

type LatLng = { latitude: number; longitude: number };

const INDIA_BBOX = '68.1,6.5,97.4,35.7'; // minLon,minLat,maxLon,maxLat
const TIMEOUT_MS = 6000;

function timeout<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

function distanceM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function isValid(lat: unknown, lon: unknown): boolean {
  return typeof lat === 'number' && typeof lon === 'number' && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, string | undefined> & { osm_id?: number | string; osm_type?: string };
};

async function photon(query: string, near?: LatLng): Promise<PlaceSuggestion[]> {
  const params = [`q=${encodeURIComponent(query)}`, 'limit=7', 'lang=en', `bbox=${INDIA_BBOX}`];
  if (near) params.push(`lat=${near.latitude.toFixed(5)}`, `lon=${near.longitude.toFixed(5)}`);
  try {
    const res = await timeout(fetch(`https://photon.komoot.io/api/?${params.join('&')}`));
    if (!res || !res.ok) return [];
    const json = (await res.json()) as { features?: PhotonFeature[] };
    return (json.features ?? []).flatMap((f, i) => {
      const [lon, lat] = f.geometry?.coordinates ?? [];
      const p = f.properties ?? {};
      if (!isValid(lat, lon)) return [];
      const street = [p.housenumber, p.street].filter(Boolean).join(' ');
      const name = p.name || street || p.district || p.city;
      if (!name) return [];
      const detail = [street !== name ? street : null, p.district ?? p.locality, p.city, p.state].filter(Boolean).join(', ');
      return [{ id: `photon-${p.osm_type ?? ''}${p.osm_id ?? i}`, name, detail, latitude: lat as number, longitude: lon as number, source: 'photon' as const }];
    });
  } catch {
    return [];
  }
}

async function ors(query: string, near?: LatLng): Promise<PlaceSuggestion[]> {
  if (!supabase) return [];
  try {
    const res = await timeout(supabase.functions.invoke('place-search', { body: { text: query, near: near ?? null } }));
    if (!res || res.error || !Array.isArray(res.data?.results)) return [];
    return (res.data.results as PlaceSuggestion[]).filter((r) => isValid(r.latitude, r.longitude) && typeof r.name === 'string');
  } catch {
    return [];
  }
}

export async function searchPlaces(query: string, near?: LatLng): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const [a, b] = await Promise.all([ors(q, near), photon(q, near)]);
  // Interleave so both sources are represented, then de-duplicate.
  const merged: PlaceSuggestion[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) merged.push(a[i]);
    if (b[i]) merged.push(b[i]);
  }
  const out: PlaceSuggestion[] = [];
  for (const s of merged) {
    const dup = out.some((o) => o.name.toLowerCase() === s.name.toLowerCase() && distanceM(o, s) < 150);
    if (!dup) out.push(s);
  }
  if (near) {
    // Prefer nearby results, but keep name relevance: stable sort only by 25 km bands.
    const band = (s: PlaceSuggestion) => Math.floor(distanceM(near, s) / 25_000);
    out.sort((x, y) => band(x) - band(y));
  }
  return out.slice(0, 8);
}

export function formatDistance(near: LatLng | undefined, s: PlaceSuggestion): string | null {
  if (!near) return null;
  const m = distanceM(near, s);
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}
