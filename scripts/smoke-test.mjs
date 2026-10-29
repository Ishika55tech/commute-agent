// Quick check that both Edge Functions work end to end.
// Usage: node --env-file=.env scripts/smoke-test.mjs   (never prints keys)
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anon) { console.error('Missing EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY in .env'); process.exit(1); }

async function call(name, body) {
  const t = Date.now();
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anon}`, apikey: anon },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`\n${name}: HTTP ${res.status} in ${Date.now() - t} ms`);
  try { console.log(JSON.stringify(JSON.parse(text), null, 2)); } catch { console.log(text.slice(0, 500)); }
  return res.ok;
}

const today = new Date();
const pad = (n) => String(n).padStart(2, '0');
const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

const a = await call('travel-estimate', {
  from: { latitude: 22.7533, longitude: 75.8937 }, // Vijay Nagar, Indore
  to: { latitude: 22.7196, longitude: 75.8577 },   // Palasia area, Indore
});
const b = await call('parse-commute', {
  text: 'Roz Mon se Fri Vijay Nagar se Crystal IT Park jaana hai, 9:30 tak pahunchna hai',
  today: todayKey, weekday: today.getDay(), current: null,
});
console.log(`\n${a && b ? '✅ both functions OK' : '❌ something failed — paste this output'}`);
process.exit(a && b ? 0 : 1);
