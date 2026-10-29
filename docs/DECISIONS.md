# Decision log

Each entry: context → decision → consequences. AI proposed options; the owner chose.

### D-001 Problem choice: recurring commute, not a generic chatbot
- Context: 30-day hackathon, joined with ~2.5 days left. Many ideas explored with AI (tiffin, carpool,
  clinic, timesheet…). Owner lives away from home without a vehicle and books the same ride daily.
- Decision: build for a pain the owner has every day.
- Consequence: realistic demo and honest story; scope must be cut hard.

### D-002 No auto-booking; documented Uber hand-off only
- Context: Uber/Rapido give no public ride-request API to individual developers. Scraping or automating
  private APIs violates terms and could charge the user without consent.
- Decision: open Uber via the documented universal link with pickup/drop-off pre-filled. User confirms in Uber.
- Consequence: dependency on Uber for the final step; mitigated by the `RideProvider` adapter.

### D-003 Rapido = unsupported
- Context: no publicly documented deep link or booking API could be verified.
- Decision: do not guess URL schemes. Rapido users get reminders and a clear "open Rapido yourself" message.

### D-004 LLM only for language → JSON
- Decision: times, weekdays, buffers, skips and permissions are plain, unit-tested code. LLM output passes a
  strict Zod schema + business rules, then a human Apply/Save.
- Consequence: the AI can be wrong without the app being wrong; every number is reproducible.

### D-005 Expo Go, SDK 57
- Context: no paid Apple developer account; Expo Go from the App Store supports SDK 57 (SDK 58 is newer).
- Decision: stay on SDK 57, only Expo SDK modules, local (not push) notifications.

### D-006 Reminders as pre-computed DATE notifications
- Context: iOS does not run app JS at an exact time in the background.
- Decision: schedule one-off notifications for the next 14 commute days; re-sync on app open and on change.
- Consequence: a rain/traffic change after scheduling is not reflected until the app is opened. Future: server cron + push.

### D-007 Free data sources
- ORS for route time (Google Routes needs billing); deterministic rush-hour factor ×1.3 since free routing has no live traffic;
  Open-Meteo for rain (no key); Apple geocoder via expo-location (no key); Gemini free tier.

### D-008 On-device data, minimal LLM context
- Decision: plan + history in AsyncStorage; LLM gets text and labels only; audit log server-side with RLS.

### D-010 No Expo Router for the MVP
- Context: the template's AGENTS.md recommends Expo Router; the MVP has only two screens (editor, dashboard).
- Decision: a state switch in `App.tsx`. Fewer moving parts in 2.5 days; easy to migrate later.

### D-009 Percent-encode the bracket keys in the Uber link (revised)
- First version: kept literal `pickup[latitude]` brackets to match Uber's documentation examples
  (AI decision, unit-tested).
- Device test on the iOS 26 Simulator: Safari showed "cannot open the page because the address is invalid" —
  iOS's RFC 3986 parser rejects raw `[`/`]` in a query.
- Decision: percent-encode keys too (`pickup%5Blatitude%5D`); servers decode this to the documented form.
  New test asserts no raw brackets AND that `URLSearchParams` decodes back to the documented keys.
- Lesson: unit tests proved the URL matched the docs, not that the OS would open it — device testing caught it.
