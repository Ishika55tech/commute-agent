// Edge Function: natural language -> structured commute intent.
// The LLM ONLY translates language into JSON. It never computes times,
// never decides permissions and never "books" anything.
//
// Secrets (set with `supabase secrets set`): GEMINI_API_KEY, optional GEMINI_MODEL.
// Optional (for the audit log): SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt.ts';

const MAX_TEXT = 500;
// Per-model timeout: 3 models x 8 s stays under the app's 30 s client timeout.
const LLM_TIMEOUT_MS = 8_000;
const DEFAULT_MODELS = 'gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite';

/** Exported for clarity/testing: which LLM errors should fall through to the next model. */
export function isRetryable(message: string): boolean {
  // AbortSignal.timeout() rejects with "Signal timed out." — note "timed out", not "timeout".
  return /llm_http_(404|429|500|502|503|504)|time(d)? ?out|abort/i.test(message);
}

async function callGemini(model: string, apiKey: string, text: string, today: string, weekday: number, current: unknown) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: buildUserPrompt(text, today, weekday, current) }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) {
    // Provider error body is logged server-side only (never returned to the app).
    console.error(`[parse-commute] LLM HTTP ${res.status} (${model}): ${(await res.text()).slice(0, 300)}`);
    throw new Error(`llm_http_${res.status}`);
  }
  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof raw !== 'string') throw new Error('llm_empty_response');
  return JSON.parse(raw);
}
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: { text?: unknown; today?: unknown; weekday?: unknown; current?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const today = typeof body.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : null;
  if (!text || text.length > MAX_TEXT || !today) return json({ error: 'invalid_input' }, 400);

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return json({ error: 'llm_not_configured' }, 503);
  // Ordered fallback list: if a model is rate-limited (429), overloaded (503) or
  // retired (404), try the next one. Each model has its own free-tier quota.
  const models = (Deno.env.get('GEMINI_MODELS') ?? Deno.env.get('GEMINI_MODEL') ?? DEFAULT_MODELS)
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

  const started = Date.now();
  let intent: unknown = null;
  let llmError: string | null = null;
  let model = models[0];
  const attempts: string[] = [];
  for (const m of models) {
    model = m;
    try {
      intent = await callGemini(m, apiKey, text, today, Number(body.weekday), body.current);
      llmError = null;
      break;
    } catch (e) {
      llmError = (e as Error).message.slice(0, 120);
      attempts.push(`${m}:${llmError}`);
      console.error(`[parse-commute] model=${m} error=${llmError}`);
      if (!isRetryable(llmError)) break; // e.g. bad JSON from the model: don't burn more quota
    }
  }
  if (attempts.length && !llmError) console.log(`[parse-commute] fell back after: ${attempts.join(' | ')}`);

  await audit({ text, intent, llmError, model, latencyMs: Date.now() - started });

  if (llmError) return json({ error: 'llm_failed' }, 502);
  // The app validates `intent` with its Zod schema before using it.
  return json({ intent });
});

/** Best-effort audit log (agent_runs table). Failures never break the request. */
async function audit(row: { text: string; intent: unknown; llmError: string | null; model: string; latencyMs: number }) {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return;
  try {
    const { error } = await createClient(url, key).from('agent_runs').insert({
      function_name: 'parse-commute',
      input_text: row.text,
      output_json: row.intent,
      error: row.llmError,
      model: row.model,
      latency_ms: row.latencyMs,
    });
    if (error) console.error(`[parse-commute] audit insert failed: ${error.message}`);
  } catch (e) {
    console.error(`[parse-commute] audit insert threw: ${(e as Error).message}`);
  }
}
