# Testing strategy

| Level | What | How | Status |
|---|---|---|---|
| Unit | `src/domain/scheduler.ts` — time maths, weekday mapping, skips, overrides, pause, midnight, rain-only-first-day | Jest, fixed dates | 15 tests ✅ |
| Unit | `src/domain/schema.ts` — LLM output validation and `applyIntent` | Jest | 10 tests ✅ |
| Unit | `src/providers` — Uber link format/encoding/validation, Rapido never builds a URL | Jest | 8 tests ✅ |
| LLM eval | `parse-commute` behaviour: English, Hinglish, relative dates, one-day vs permanent, missing info, off-topic, prompt injection | `npm run eval` against the deployed function | **15/15 pass** (2026-10-29, prompt v1.1.0) |
| Guardrail audit | 8 hard rules from `CLAUDE.md` | `guardrail-auditor` agent | per commit |
| Manual (device) | Setup, reminders firing, notification tap → Uber pre-filled, permission denied, offline | Physical iPhone + Expo Go | checklist below |

## Run
```bash
npm test                                   # unit tests
node --env-file=.env evals/run-evals.mjs   # LLM evals (needs deployed function); writes evals/last-run.json
```

## Device checklist (fill in during testing)
- [ ] Fresh install → setup by sentence → fields pre-filled → Save → dashboard
- [ ] Location permission denied → clear message, nothing saved
- [ ] Notification permission denied → warning banner on dashboard
- [ ] Reminder fires at bookAt (set arrival ~40 min ahead to test)
- [ ] Tap reminder → Uber opens with pickup + drop-off filled
- [ ] Uber not installed → Uber mobile web opens
- [ ] "kal chhutti hai" → preview → Apply → tomorrow removed from Upcoming
- [ ] Airplane mode → default estimate badge, AI shows "unavailable", form still works
- [ ] Injection text → rejected / "unknown", nothing changed

## How results are validated
- Unit tests assert exact computed times by hand-calculated expectations (written in the test comments).
- LLM evals compare structured fields, not wording; failures are logged in `evals/last-run.json`.
- AI-written tests are reviewed by the owner; at least one assertion per test was hand-checked.

## Results log
| Date | Suite | Result | Notes |
|---|---|---|---|
| 2026-10-28 | Jest unit | 32/32 | On the Mac after SDK 57 install |
| 2026-10-28 | LLM eval (no pacing) | 5/15 | 9× HTTP 429, 1× 503 — rate limits, not wrong answers (from `agent_runs`) |
| 2026-10-28 | LLM eval (paced + retry) | 10/15 | Remaining 5 = daily free quota exhausted |
| 2026-10-29 | LLM eval (model fallback, prompt v1.1.0) | **15/15** | 1 transient retry |
