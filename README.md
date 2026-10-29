# Commute Agent 🚕

An iOS AI agent for people who commute every day without their own vehicle.
Tell it your routine once — in English, Hindi or Hinglish — and it works out **when to open the ride
app and when to leave**, reminds you every working day, and opens **Uber with the trip pre-filled**.
You always see the real fare and confirm in Uber. It never pretends a ride is booked.

> Built for **Build With AI Hackathon 2026 (Hack at FiftyFive)**.
> How AI was used: [`AI_LOG.md`](AI_LOG.md) · Rules for AI agents: [`CLAUDE.md`](CLAUDE.md)

## Features
- **Setup by sentence** → AI fills the form → you review → Save
- **Explained plan**: route time + rush hour + rain + buffer + driver wait = "open Uber at 08:46"
- **Daily reminders** (next 14 commute days), tap → Uber opens with pickup & drop-off filled
- **Chat changes**: "kal chhutti hai", "Friday 10 baje pahunchna hai", "pause" → preview → Apply
- **Honest states**: default-estimate badge, notifications-off banner, Rapido "reminders only"

## Run it
```bash
npm install
cp .env.example .env        # add Supabase URL + anon key (public values only)
npx expo start              # scan the QR with the iPhone camera → Expo Go (SDK 57)
npm test                    # unit tests
```
Backend (once): `supabase link`, apply `supabase/migrations/*`, then
`supabase secrets set GEMINI_API_KEY=… ORS_API_KEY=…` and
`supabase functions deploy parse-commute travel-estimate`.

## Docs
- [`docs/PRD.md`](docs/PRD.md) — problem, users, scope, non-goals
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — components, data flow, stack
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — decision log
- [`docs/TESTING.md`](docs/TESTING.md) — unit tests, LLM evals, device checklist
- [`.claude/agents/`](.claude/agents) — reviewer, guardrail auditor, test writer
