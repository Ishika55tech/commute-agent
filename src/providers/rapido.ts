// Rapido: no publicly documented deep link or ride-booking API could be
// verified (see docs/DECISIONS.md, D-003). We do NOT guess URL schemes.
// Reminders still work; the hand-off button is disabled with this message.

import type { RideProvider } from './types';

export const rapidoProvider: RideProvider = {
  id: 'rapido',
  displayName: 'Rapido',
  integration: 'unsupported',
  statusMessage:
    'Rapido has no verified public integration yet. You will still get reminders on time — open Rapido yourself to book.',
  buildHandoffUrl: () => null,
};
