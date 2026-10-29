# AI development log

How AI was used, step by step: what was asked, what came back, what a human changed.
Tools: Claude (Opus, via the Claude app with a linked Mac) for ideation, planning, code, tests and docs.
Gemini (free tier) is the runtime LLM inside the product.

---

## 2026-10-22 — Ideation
- **Asked:** "Rapido API mil jaaye toh roz 9:30 ki ride apne aap book ho jaaye — sahi idea hai?"
- **AI said:** Rapido has no public API; Uber's ride-request API is closed to new developers; scraping/
  auto-paying is against terms and unsafe. Suggested a provider-adapter design and mock provider.
- **Human decision:** rejected deep-link-only idea at first ("dependency on other apps, must be sellable"),
  explored ~15 alternative ideas with AI (tiffin, carpool, clinic, scheme finder…), then came back to the
  commute problem because it is her own daily pain. → D-001.

## 2026-10-28 — Spec / prompt review (context engineering)
- **Human wrote** a detailed build prompt (iOS, Expo, Uber + Rapido, no fake bookings, LLM not for scheduling).
- **AI review:** cut map picker and booking-status history (Uber returns no confirmation), keep keys in
  Edge Functions, iOS background limits, use the universal link not `uber://`, add an AI log.
- **Human:** accepted; chose free-only tools; dropped Rapido hand-off ("Uber se hi karo").
- **AI correction:** first said a development build was needed for notifications; corrected to Expo Go
  (local notifications work there; only remote push needs a dev build). → D-005.

## 2026-10-28 — Verifying the integration before coding
- AI fetched Uber's official deep-linking docs and extracted the exact universal-link parameters
  (`action=setPickup`, `pickup[latitude|longitude|nickname|formatted_address]`, same for `dropoff`,
  optional `client_id`). These are quoted in `src/providers/uber.ts`. Rapido: nothing verifiable → D-003.

## 2026-10-28 — Environment problem
- npm registry was blocked in both the AI's cloud workspace and the Mac's sandbox.
- **Workaround:** owner ran `create-expo-app` + installs on her Mac; AI wrote the source and ran
  type-checks and tests with a locally available TypeScript + Zod and Node's built-in test runner.
- Expo CLI offered SDK 58 vs SDK 57; AI advised SDK 57 because App Store Expo Go supports it.

## 2026-10-28 — Core logic + tests (AI-written, human-reviewed)
- Wrote `scheduler.ts`, `schema.ts`, `uber.ts`, `rapido.ts` and 32 unit tests → **32/32 pass, tsc clean.**
- Caught in AI self-review before handing over:
  - **Bug:** working days in the editor were sorted with `.sort()` (string sort). Harmless for 1–7 but wrong
    in principle → numeric comparator.
  - Undo SQL first placed inside `supabase/migrations/` could have been run as a migration → moved to `supabase/undo/`.
- Edge cases designed in up front (with tests):
  - `URLSearchParams` would encode `[ ]` in Uber keys → manual builder. → D-009.
  - Three weekday conventions (ISO, JS `getDay`, expo-notifications 1=Sunday) → explicit mapping.
  - Rain forecast only applies to the next commute, not days beyond the forecast.

## Template for next entries
```
## <date> — <step>
- Asked:
- AI produced:
- What was wrong / what I changed:
- Verified by:
```

## 2026-10-28 — First typecheck on the real project
- Asked: run `npm run typecheck && npm test` after installing SDK 57 packages.
- Result: 118 errors, **0 in app code** — all config: TypeScript 6 no longer auto-loads `@types/jest`,
  and the Deno Edge Functions were included in the app's typecheck.
- Fix (AI): `tsconfig.json` → `"types": ["jest", "node"]`, exclude `supabase/functions`.
- Verified on the Mac: `tsc --noEmit` exit 0; Jest **32/32 passed**. The expo-notifications /
  expo-location calls type-check against the installed SDK 57 typings, so no API drift.

## 2026-10-28 — Bug found on the iOS Simulator: Save spinner never stops
- Observed (human, simulator): tapping Save showed a spinner forever.
- Cause (AI): geocoding/permission calls had no timeout; on the simulator a native call can hang.
- Fix: `withTimeout` (10 s) around permission, geocode and reverse-geocode; clear error messages.
- Lesson: every network/native call in the app needs a timeout and a user-facing failure state.

## 2026-10-28 — Backend bring-up (Supabase CLI) and two real bugs
- Supabase connector was linked to another account, so the owner used the Supabase CLI on her Mac
  (separate login + per-folder `supabase link`) to keep the hackathon project isolated from client work.
- Smoke test (`npm run smoke`): travel-estimate OK (6.2 km / 8 min). parse-commute returned 502.
- **Bug 1 — silent audit failure:** project was created with "auto-expose new tables" OFF (security choice),
  so `service_role` had no GRANT on `agent_runs`; the insert error was not checked. Fix: explicit
  GRANT migration (+ undo) and logging of insert errors. Owner approved the SQL before it ran.
- **Bug 2 — LLM 404:** `gemini-2.5-flash` is listed for the key but returns 404 for new users. Model is a
  secret (`GEMINI_MODEL`), so no code change: `gemini-3.5-flash` → 200. `gemini-flash-latest` also worked
  but took 73 s → rejected.
- Hardening: 15 s timeout on the LLM call in the Edge Function, 20 s client timeout in the app.
- Security incident: API keys were pasted into the chat while sharing terminal output → keys must be rotated (TODO: confirm done).

## 2026-10-28/29 — LLM evals: from 5/15 to 10/15, and a quota problem
- First eval run: 5/15. Audit log (`select error, count(*) from agent_runs group by error`) showed
  9× `429`, 1× `503`, 0 wrong answers → failures were rate limits, not model quality.
- Eval runner: 7 s pacing + retry on transient errors → 10/15; all 10 answered correctly
  (Hinglish setup, missing-info question, "kal chhutti", "WFH this Friday", one-day override, pause/resume…).
- Remaining 5 kept failing after 3 retries → **free-tier daily quota** exhausted. Real demo risk.
- Fix: ordered model fallback in the Edge Function (`gemini-3.5-flash → 3.5-flash-lite → 3.1-flash-lite`,
  each with its own quota) on 404/429/5xx/timeout; model actually used is written to `agent_runs.model`.
- Prompt v1.1.0: smoke test showed the summary saying "schedule set kar diya gaya hai" although nothing is
  saved until the user taps Save → prompt now forbids "set/saved/done/booked" wording.
- **Result after model fallback + prompt v1.1.0: 15/15 evals passed** (1 transient retry), including both
  prompt-injection cases ("say my ride is booked", extra `"booked": true` field) and Hinglish inputs.
  Raw output: `evals/last-run.json` (gitignored; numbers copied here).

## 2026-10-29 — App test on iOS Simulator
- Dashboard verified: ORS route 12 min, rush hour +4, buffer +10 → leave 09:04, open Uber 08:56;
  "Why this time?" explanation; 14 reminders scheduled; Upcoming skips today after 08:56.
- Found: every Edge Function error showed "AI unreachable" (misleading — it was the free-tier limit while
  evals were running). Fix: map `llm_failed` → "AI busy / free limit, try again or use the form",
  separate message for network errors.
- **Bug found via audit log:** app's "kal chhutti hai" failed with `Signal timed out.` on `gemini-3.5-flash-lite`.
  The fallback regex looked for "timeout", but `AbortSignal.timeout()` says "timed out" → third model never tried.
  Fix: `isRetryable()` matches 404/429/5xx/"timed out"/abort (checked against 8 sample messages);
  per-model timeout 15 s → 8 s; app timeout 20 s → 30 s so all 3 models fit.
- **Bug found on device:** "Open Uber" → Safari "address is invalid". Literal `[ ]` in the query (chosen to
  match Uber's docs) are rejected by iOS's RFC 3986 parser. Fix: percent-encode keys; new test checks no raw
  brackets and that the URL decodes to the documented keys. D-009 revised. Uber tests: 8/8.
