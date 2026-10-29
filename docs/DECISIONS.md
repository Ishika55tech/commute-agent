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

### D-011 Maps: react-native-maps (Apple Maps), not MapLibre
- Requirement: free map, no billing, exact pickup pin.
- Checked against Expo SDK 58 docs: `@maplibre/maplibre-react-native` and `expo-maps` are **not in Expo Go**
  (need a development build); `react-native-maps` is (`inExpoGo: true`) and uses **Apple Maps on iOS — no API key,
  no billing**. Decision: react-native-maps. MapLibre stays an option once we ship a dev build.

### D-012 Liquid Glass UI with graceful fallback
- iOS 26 "Liquid Glass" via `expo-glass-effect` (`GlassView`, in Expo Go). Guarded with
  `isLiquidGlassAvailable() && isGlassEffectAPIAvailable()` (some iOS 26 betas crash — expo/expo#40911).
  Fallback: `expo-blur` material + hairline border. Dark "night transit" theme, SF Symbols (`expo-symbols`), haptics.

### D-013 Precise pickup = pin, not text
- Problem (owner): "Vijay Nagar" is a whole neighbourhood — the geocoder returns its centre, not your gate.
- Decision: every place is confirmed on a map. Search → pin → drag/tap to the exact gate, or "Use my current
  location" (GPS). The exact lat/long is what goes to Uber. The agent asks for a building/landmark when the user
  only names an area (prompt v1.2.0).

### D-014 English-only agent
- Owner decision: the app and agent UI are English. The prompt still tolerates common Hindi words ("kal") but
  always replies in English.

### D-015 Two reminders + a demo test reminder
- "Book now" at bookAt (tap → Uber pre-filled) and "Leave now" at leaveBy; 14 days × 2 = 28 (< iOS limit 64).
- "Send me a test reminder" schedules the real reminder in 8 s so the flow can be shown live without waiting for 9 am.

### D-016 Positioning vs. "just open Uber"
- Uber books the ride; Commute Agent plans the commute: when to book (route + rush hour + rain + buffer + driver
  wait), proactive reminders, exact pre-filled pins, and plain-English exceptions ("I'm off tomorrow").
- Honest limit: the user still picks the vehicle and confirms in Uber (no public booking API). With an authorised
  provider API, `RideProvider.requestRide()` makes it one tap without touching planning or UI.

### D-017 Building / POI search via OpenStreetMap gazetteers
- Problem (owner, on device): searching "Apollo Premier" (her office building) found nothing. Apple's geocoder in
  expo-location only resolves postal-style addresses, not building/company names; Apple's POI search (MKLocalSearch)
  is not exposed in Expo Go.
- Decision: type-ahead suggestions from two free OSM-based sources, merged and de-duplicated, biased to the user's
  location (pickup) or to the pickup (office): Photon (no key, called from the app) and OpenRouteService
  autocomplete via a new `place-search` Edge Function (ORS key stays server-side). Apple geocoder remains the fallback.
- Honest limit: if a building is missing from OpenStreetMap, the user taps the map to drop the pin.

### D-018 Ride home (return trip)
- Owner asked for it; judges will ask "why only mornings?".
- Model: optional `returnTrip { enabled, departTime }`. The user picks when to LEAVE the office, so the maths runs
  forward: `bookAt = leave − driverWait`, `arrive ≈ leave + travel` (rush hour judged at leave time, no buffer).
  `upcomingLegs()` interleaves morning/evening legs by time; skips/pause apply to both; rain only to the next leg.
- Uber hand-off for the evening leg swaps pickup/drop-off. Reminders: up to 56 pending (iOS limit 64).
- Agent can set it: "I leave the office at 6:30 pm" → `returnDepartTime: "18:30"` (schema + prompt v1.3.0 + evals).

### D-019 Proactive agent = deterministic rules, not an LLM
- Goal: the agent speaks first ("Rain likely — I moved your booking 10 min earlier", "Book in 6 min", "Tomorrow is
  off", "Add a ride home?") with one-tap actions.
- Decision: pure rules in `src/domain/insights.ts` over data we already compute (plan, legs, weather, estimate
  source). No extra LLM calls (free-tier quota, latency) and every message is explainable and unit-tested.
  Max 2 insights at a time to avoid noise.
