// Edge Function: driving time between two points via OpenRouteService.
// Free tier, no live traffic (the app adds a deterministic rush-hour factor).
// Secret: ORS_API_KEY. Docs: https://openrouteservice.org/dev/#/api-docs/v2/directions

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Pt = { latitude: number; longitude: number };
const isPt = (p: unknown): p is Pt => {
  const o = p as Pt;
  return !!o && Number.isFinite(o.latitude) && Number.isFinite(o.longitude) &&
    Math.abs(o.latitude) <= 90 && Math.abs(o.longitude) <= 180;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: { from?: unknown; to?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (!isPt(body.from) || !isPt(body.to)) return json({ error: 'invalid_coordinates' }, 400);

  const key = Deno.env.get('ORS_API_KEY');
  if (!key) return json({ error: 'routing_not_configured' }, 503);

  try {
    const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
      method: 'POST',
      headers: { Authorization: key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        // ORS expects [longitude, latitude]
        coordinates: [
          [body.from.longitude, body.from.latitude],
          [body.to.longitude, body.to.latitude],
        ],
      }),
    });
    if (!res.ok) return json({ error: `routing_http_${res.status}` }, 502);
    const data = await res.json();
    const summary = data?.routes?.[0]?.summary;
    if (typeof summary?.duration !== 'number') return json({ error: 'no_route' }, 502);
    return json({
      minutes: Math.round(summary.duration / 60),
      distanceKm: typeof summary.distance === 'number' ? Math.round(summary.distance / 100) / 10 : null,
      source: 'openrouteservice',
    });
  } catch {
    return json({ error: 'routing_failed' }, 502);
  }
});
