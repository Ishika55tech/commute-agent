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

## 2026-10-29 — SDK 58 upgrade (per-project Node)
- Owner's iPhone had Expo Go for SDK 58 → upgraded. SDK 58 needs Node ≥ 22.13; owner required that other projects
  keep Node 20 → `nvm install 24` + `.nvmrc` in this repo only; `nvm alias default` left at v20.19.4.
- `expo install --fix` hit a peer-dep conflict (jest-expo 58 needs `@react-native/jest-preset`) → installed it.
  `expo-doctor` 20/20.

## 2026-10-29 — Owner feedback on the first device run → redesign (done by AI while the owner was away)
Owner asked four questions; each became a change:
1. *"Vijay Nagar is a big area — how do we know the exact pickup?"* → map pin confirmation (search, GPS, drag/tap),
   prompt v1.2.0 asks for a building/landmark when only an area is given (D-013).
2. *"How is this different if I still pick the vehicle in Uber?"* → honest positioning table in PRD (D-016).
3. *"The UI/theme isn't good; make it rich, latest Apple look"* → dark map-first redesign with iOS 26 Liquid Glass,
   SF Symbols, haptics, 4-step onboarding, countdown hero, visual timeline, agent chips, week strip, app icon (D-012).
4. *"How do you remind me at 9?"* → two reminders per day + live "test reminder" (D-015).
- Library choice was verified, not guessed: AI cloned Expo's `sdk-58` branch and react-native-maps v1.29.11, read the
  versioned docs (`inExpoGo`) and type definitions, and type-checked the new UI against those real types on the
  owner's Mac (0 errors in app code). MapLibre rejected because it is not in Expo Go (D-011).
- English-only agent (owner decision, D-014); 4 English eval cases added (19 total).
- Domain logic unchanged → 33/33 unit tests still pass.
- Not yet verified on device (owner away): visual result, glass fallback, map gestures inside the scroll view.

## 2026-10-29 — Device feedback: building names not found
- Owner: "Apollo Premier" (office building) not accepted in the destination search.
- Root cause (AI): `Location.geocodeAsync` = Apple postal geocoder; no POI search in Expo Go.
- Fix: debounced autocomplete (350 ms, ≥3 chars) from Photon + ORS (`place-search` Edge Function), merged,
  de-duplicated within 150 m, biased to the pickup/user location, distance shown; first result auto-selected on
  submit with the rest offered as alternatives; "tap the map" fallback. D-017. Typecheck: 0 errors.
- AI also caught its own bug before shipping: passing `near` as a new object each render would have looped the
  bias effect → effect now depends on latitude/longitude numbers.

## 2026-10-29 — Owner: "Is the UI too complex?" → dashboard simplified + Share ETA
- AI's own review: dashboard had 9 sections with duplicates (week strip + upcoming list, route card + map chip,
  long hand-off list, 3 footer buttons).
- Now 4 blocks: map hero → next ride → agent → week. Week strip is tappable (shows that day's book/leave/arrive,
  or "skipped" with one-tap **Undo**). Edit / Pause / Delete moved to a native action sheet (⋯). Hand-offs reduced
  to one "Last: Opened Uber · Thu 08:56" line. Reminder count became a pill.
- New: **Share ETA** (iOS share sheet, text only — no location shared): "On my way to Office — leaving at 09:04,
  reaching by 09:30."
- Typecheck: 0 errors.

## 2026-10-29 (evening) — Ride home + proactive agent
- Owner chose both from a ranked list (AI recommended only the proactive agent due to the deadline; owner overruled).
- AI wrote the domain logic test-first: `planReturnForDate`, `upcomingLegs`, `buildInsights` + 15 new tests
  (return maths, interleaving, skip both legs, rain on next leg only, 6 insight rules, max-2 cap, paused = silent,
  agent schema for `returnDepartTime` / `returnEnabled`). Unit tests: **48/48**. Typecheck on the Mac: 0 errors.
- Wired through: agent schema + prompt v1.3.0 (+2 eval cases → 21), notifications per leg, reversed Uber link for
  the evening, onboarding toggle + time, dashboard insight cards with actions, week detail showing both legs.
- Design call recorded as D-019: insights are rules, not LLM calls — explainable, testable, no quota.

## 2026-10-29 — Owner: "+/− time buttons feel hectic"
- Replaced the stepper with a big glass time display that reveals the native iOS wheel
  (`@react-native-community/datetimepicker` 9.2.1 — the SDK 58 bundled version, in Expo Go), 5-minute steps,
  dark theme. Same component name/props, so onboarding needed no change. API checked against the v9.2.1 source;
  typecheck 0 errors.
