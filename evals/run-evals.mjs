// LLM eval runner for the deployed `parse-commute` Edge Function.
// Usage: node --env-file=.env evals/run-evals.mjs
// Needs EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.
// Note: evals run with a fixed TODAY (see cases file) so relative dates are deterministic.

import { readFileSync, writeFileSync } from 'node:fs';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anon) {
  console.error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const suite = JSON.parse(readFileSync(new URL('./parse-commute.cases.json', import.meta.url), 'utf8'));
const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ALLOWED = new Set(['intent', 'changes', 'skipDates', 'arrivalOverride', 'missing', 'clarifyingQuestion', 'summary']);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function structurallyValid(intent) {
  if (!intent || typeof intent !== 'object') return false;
  if (Object.keys(intent).some((k) => !ALLOWED.has(k))) return false;
  const t = intent.changes?.arrivalTime;
  return t === undefined || TIME.test(t);
}

// Free-tier LLMs allow only a few requests per minute. Pace calls and retry
// transient failures so the eval measures answer quality, not rate limits.
const DELAY_MS = Number(process.env.EVAL_DELAY_MS ?? 7000);
const RETRY_WAIT_MS = 30000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callOnce(c) {
  const res = await fetch(`${url}/functions/v1/parse-commute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anon}`, apikey: anon },
    body: JSON.stringify({ text: c.text, today: suite.today, weekday: suite.weekday, current: null }),
  });
  const body = await res.json();
  return { intent: body.intent ?? null, error: res.ok ? null : body.error ?? `http_${res.status}` };
}

const results = [];
let retries = 0;
for (const [i, c] of suite.cases.entries()) {
  if (i > 0) await sleep(DELAY_MS);
  const started = Date.now();
  let intent = null;
  let error = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      ({ intent, error } = await callOnce(c));
    } catch (e) {
      error = e.message;
    }
    if (error !== 'llm_failed') break;
    retries++;
    console.log(`  … ${c.id}: llm_failed, retrying in ${RETRY_WAIT_MS / 1000}s (likely rate limit)`);
    await sleep(RETRY_WAIT_MS);
  }

  const failures = [];
  const e = c.expect;
  const valid = structurallyValid(intent);
  if (e.validates === false) {
    if (valid && intent?.intent !== e.orIntent) failures.push('expected invalid output or intent=unknown');
  } else {
    if (!valid) failures.push('output failed structural validation');
    for (const [k, v] of Object.entries(e)) {
      if (k === 'clarifyingQuestionPresent') { if (!intent?.clarifyingQuestion) failures.push('expected a clarifying question (broad area)'); continue; }
      if (k === 'missingIncludes') { if (!(intent?.missing ?? []).includes(v)) failures.push(`missing should include ${v}`); continue; }
      if (k === 'summaryNotMatch') { if (new RegExp(v, 'i').test(intent?.summary ?? '')) failures.push(`summary must not mention "${v}"`); continue; }
      const actual = k === 'skipDates' || k === 'arrivalOverride' || k === 'intent' ? intent?.[k] : get(intent, k);
      if (!eq(actual, v)) failures.push(`${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(actual)}`);
    }
  }
  if (error) failures.unshift(`error: ${error}`);
  results.push({ id: c.id, pass: failures.length === 0, ms: Date.now() - started, failures, intent });
  console.log(`${failures.length ? '✗' : '✓'} ${c.id} (${Date.now() - started} ms)${failures.length ? '\n    ' + failures.join('\n    ') : ''}`);
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} passed (${retries} retries after transient LLM errors)`);
writeFileSync(new URL('./last-run.json', import.meta.url), JSON.stringify({ at: new Date().toISOString(), passed, total: results.length, retries, results }, null, 2));
process.exit(passed === results.length ? 0 : 1);
