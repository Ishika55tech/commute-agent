# CLAUDE.md — project context for AI coding agents

@AGENTS.md

Read this file before changing anything. It is the single source of truth for
how AI assistants work in this repo. Where it differs from the generic Expo guidance in
`AGENTS.md`, this file wins:
- **Navigation:** this MVP has two screens and uses a simple state switch in `App.tsx`, not Expo Router (D-010).
- **Builds:** Expo Go only (no EAS / dev build) — see D-005. Only Expo-Go-bundled modules may be added.

## Product in one line
**Commute Agent** — an iOS app that learns your daily commute once, works out
when you must leave, reminds you every working day, and opens Uber with the trip
pre-filled. The user always confirms the ride inside Uber.

## Stack
- Expo SDK 57 (Expo Go compatible), React Native, TypeScript (strict)
- Supabase Edge Functions (Deno): `parse-commute` (LLM), `travel-estimate` (OpenRouteService)
- Supabase Postgres: `agent_runs` audit table only. User data stays on the device (AsyncStorage).
- LLM: Google Gemini (free tier) via REST, JSON mode, temperature 0
- Tests: Jest (`jest-expo`) for domain logic; `evals/` for LLM behaviour

## Folder map
```
App.tsx                      screen switcher + notification tap handler
src/domain/                  PURE logic, no React Native imports (unit-tested)
  types.ts  scheduler.ts  schema.ts
src/providers/               ride provider adapters (uber = verified link, rapido = unsupported)
src/services/                side effects: storage, notifications, geocode, weather, edge-function calls
src/screens/                 PlanEditorScreen, DashboardScreen
src/ui/                      theme + shared components
supabase/functions/          Edge Functions (secrets live here, never in the app)
supabase/migrations/ + supabase/undo/   SQL and its rollback
__tests__/  evals/  docs/
```

## Hard rules (guardrails) — never break these
1. **No fake bookings.** The app never says a ride is "booked" or "confirmed". Status values are
   only `opened_in_app | opened_in_browser | failed | unsupported`.
2. **LLM only translates language → JSON.** All times, weekdays, buffers, permissions and state
   changes are computed in `src/domain/` with plain code.
3. **Every LLM output is validated** by `AgentIntentSchema` (Zod, `.strict()`), plus business rules in
   `validateAgentOutput` (dates must be real, not past, ≤ 60 days ahead). Invalid → reject + ask the user.
   Never "repair" bad LLM output silently.
4. **Human in the loop.** AI suggestions are shown as a preview; nothing is saved until the user taps
   Save / Apply.
5. **No invented integrations.** Only the documented Uber universal link
   (`https://m.uber.com/ul/?action=setPickup&pickup[...]&dropoff[...]`, source:
   https://developer.uber.com/docs/deep-linking). Rapido has no verified public integration → show
   "reminders only". Do not guess URL schemes or call private APIs.
6. **No secrets in the app or in chat.** Only `EXPO_PUBLIC_*` values (Supabase URL + anon key, optional
   Uber client_id) go in `.env`. `GEMINI_API_KEY`, `ORS_API_KEY` go in Supabase secrets.
7. **Minimum data to the LLM.** Send the user's text and plan labels/times only — never coordinates or
   full addresses unless the user typed them in that message.
8. **iOS reality.** Do not assume JS runs in the background at an exact time. Reminders are
   pre-scheduled local DATE notifications (max 14, iOS limit 64), re-synced on app open.

## Human approval gates
- Any Supabase change (migration, function deploy, secret): show the SQL/command **and the undo** first,
  apply only after the owner says "haan".
- `git push`, merge, delete: owner does it herself.

## Workflow for every change
1. Update the relevant doc first if behaviour changes (`docs/PRD.md`, `docs/DECISIONS.md`).
2. Write/adjust tests in `__tests__/` for any change in `src/domain/` or `src/providers/`.
3. `npm test` must pass. If the prompt in `supabase/functions/parse-commute/prompt.ts` changes, bump
   `PROMPT_VERSION` and run `npm run eval`.
4. Run the `code-reviewer` and `guardrail-auditor` agents (`.claude/agents/`) on the diff.
5. Add an entry to `AI_LOG.md`: what was asked, what the AI produced, what a human changed and why.

## Style
- Functional components, hooks, no class components. Pure functions in `src/domain/`.
- User-facing copy: short, honest, no hype. Errors say what happened and what to do next.
- Accessibility: every pressable has a role; touch targets ≥ 44pt.
