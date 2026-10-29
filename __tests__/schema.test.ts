import { applyIntent, validateAgentOutput } from '../src/domain/schema';
import type { CommutePlan } from '../src/domain/types';

const TODAY = new Date(2026, 9, 28);

const plan: CommutePlan = {
  id: 'p1',
  pickup: { label: 'Home', address: 'A', latitude: 1, longitude: 1 },
  dropoff: { label: 'Office', address: 'B', latitude: 2, longitude: 2 },
  arrivalTime: '09:30',
  workingDays: [1, 2, 3, 4, 5],
  bufferMinutes: 10,
  driverWaitMinutes: 8,
  budgetInr: null,
  provider: 'uber',
  paused: false,
  skipDates: [],
  arrivalOverrides: {},
  createdAt: 'x',
  updatedAt: 'x',
};

describe('validateAgentOutput', () => {
  it('accepts a well-formed skip intent', () => {
    const r = validateAgentOutput({ intent: 'skip_dates', skipDates: ['2026-10-29'], summary: 'Skip tomorrow' }, TODAY);
    expect(r.ok).toBe(true);
  });

  it('rejects non-JSON-shaped output', () => {
    expect(validateAgentOutput('Sure! I booked your ride.', TODAY).ok).toBe(false);
    expect(validateAgentOutput(null, TODAY).ok).toBe(false);
  });

  it('rejects unknown fields (no hidden actions like "booked": true)', () => {
    const r = validateAgentOutput({ intent: 'update', summary: 's', booked: true }, TODAY);
    expect(r.ok).toBe(false);
  });

  it('rejects invalid times and weekdays', () => {
    expect(validateAgentOutput({ intent: 'update', changes: { arrivalTime: '9.30' }, summary: 's' }, TODAY).ok).toBe(false);
    expect(validateAgentOutput({ intent: 'update', changes: { workingDays: [0, 8] }, summary: 's' }, TODAY).ok).toBe(false);
  });

  it('rejects past, fake and far-future dates', () => {
    const past = validateAgentOutput({ intent: 'skip_dates', skipDates: ['2026-10-27'], summary: 's' }, TODAY);
    const fake = validateAgentOutput({ intent: 'skip_dates', skipDates: ['2026-02-30'], summary: 's' }, TODAY);
    const far = validateAgentOutput({ intent: 'skip_dates', skipDates: ['2027-06-01'], summary: 's' }, TODAY);
    expect([past.ok, fake.ok, far.ok]).toEqual([false, false, false]);
  });

  it('rejects an intent that is missing its payload', () => {
    expect(validateAgentOutput({ intent: 'skip_dates', summary: 's' }, TODAY).ok).toBe(false);
    expect(validateAgentOutput({ intent: 'override_arrival', summary: 's' }, TODAY).ok).toBe(false);
  });

  it('warns when Rapido is chosen', () => {
    const r = validateAgentOutput({ intent: 'update', changes: { provider: 'rapido' }, summary: 's' }, TODAY);
    expect(r.ok && r.warnings.length).toBeTruthy();
  });
});

describe('applyIntent', () => {
  it('merges changes, dedupes and sorts weekdays', () => {
    const r = validateAgentOutput({ intent: 'update', changes: { workingDays: [5, 1, 1, 3], arrivalTime: '10:00' }, summary: 's' }, TODAY);
    if (!r.ok) throw new Error('expected ok');
    const next = applyIntent(plan, r.intent, 'now');
    expect(next.workingDays).toEqual([1, 3, 5]);
    expect(next.arrivalTime).toBe('10:00');
    expect(plan.arrivalTime).toBe('09:30'); // original untouched
  });

  it('adds skip dates without duplicates and handles pause/resume', () => {
    const r = validateAgentOutput({ intent: 'skip_dates', skipDates: ['2026-10-30', '2026-10-29'], summary: 's' }, TODAY);
    if (!r.ok) throw new Error('expected ok');
    const once = applyIntent({ ...plan, skipDates: ['2026-10-29'] }, r.intent, 'now');
    expect(once.skipDates).toEqual(['2026-10-29', '2026-10-30']);

    const p = validateAgentOutput({ intent: 'pause', summary: 's' }, TODAY);
    if (!p.ok) throw new Error('expected ok');
    expect(applyIntent(plan, p.intent, 'now').paused).toBe(true);
  });

  it('stores one-off arrival overrides', () => {
    const r = validateAgentOutput(
      { intent: 'override_arrival', arrivalOverride: { date: '2026-10-29', time: '10:00' }, summary: 's' },
      TODAY,
    );
    if (!r.ok) throw new Error('expected ok');
    expect(applyIntent(plan, r.intent, 'now').arrivalOverrides).toEqual({ '2026-10-29': '10:00' });
  });
});
