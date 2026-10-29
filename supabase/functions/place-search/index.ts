// Edge Function: building / POI autocomplete via OpenRouteService (Pelias, OSM data).
// Keeps ORS_API_KEY server-side. Input is validated; output is a small, flat list.
// Docs: https://openrouteservice.org/dev/#/api-docs/geocode/autocomplete/get

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Pt = { latitude: number; longitude: number };
const isPt = (p: unknown): p is Pt => {
  const o = p as Pt;
  return !!o && Number.isFinite(o.latitude) && Number.isFinite(o.longitude) && Math.abs(o.latitude) <= 90 && Math.abs(o.longitude) <= 180;
};

type Feature = {
  geometry?: { coordinates?: [number, number] };
  properties?: { id?: string; gid?: string; name?: string; label?: string; locality?: string; county?: string; region?: string; neighbourhood?: string };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: { text?: unknown; near?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (text.length < 3 || text.length > 120) return json({ error: 'invalid_input' }, 400);

  const key = Deno.env.get('ORS_API_KEY');
  if (!key) return json({ error: 'search_not_configured' }, 503);

  const params = new URLSearchParams({ text, 'boundary.country': 'IN', size: '6' });
  if (isPt(body.near)) {
    params.set('focus.point.lat', String(body.near.latitude));
    params.set('focus.point.lon', String(body.near.longitude));
  }

  try {
    const res = await fetch(`https://api.openrouteservice.org/geocode/autocomplete?${params}`, {
      headers: { Authorization: key, Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error(`[place-search] ORS HTTP ${res.status}`);
      return json({ error: `search_http_${res.status}` }, 502);
    }
    const data = (await res.json()) as { features?: Feature[] };
    const results = (data.features ?? []).flatMap((f, i) => {
      const [lon, lat] = f.geometry?.coordinates ?? [];
      const p = f.properties ?? {};
      if (!isPt({ latitude: lat, longitude: lon }) || !p.name) return [];
      const detail = [p.neighbourhood, p.locality ?? p.county, p.region].filter((x) => x && x !== p.name).join(', ');
      return [{ id: `ors-${p.gid ?? p.id ?? i}`, name: p.name, detail, latitude: lat, longitude: lon, source: 'ors' }];
    });
    return json({ results });
  } catch {
    return json({ error: 'search_failed' }, 502);
  }
});
