import { buildInsights } from '../src/domain/insights';
import { explainPlan, formatTime, planReturnForDate, upcomingLegs } from '../src/domain/scheduler';
import type { CommutePlan } from '../src/domain/types';

const plan = (over: Partial<CommutePlan> = {}): CommutePlan => ({
  id: 'p1',
  pickup: { label: 'Home', address: 'Vijay Nagar', latitude: 22.75, longitude: 75.89 },
  dropoff: { label: 'Office', address: 'Apollo Premier', latitude: 22.75, longitude: 75.9 },
  arrivalTime: '09:30',
  workingDays: [1, 2, 3, 4, 5],
  bufferMinutes: 10,
  driverWaitMinutes: 8,
  budgetInr: null,
  provider: 'uber',
  paused: false,
  skipDates: [],
  arrivalOverrides: {},
  returnTrip: { enabled: true, departTime: '18:30' },
  createdAt: 'x',
  updatedAt: 'x',
  ...over,
});

const est = { baseMinutes: 20, distanceKm: 6, source: 'openrouteservice' as const };
const WED = new Date(2026, 9, 28);

describe('return trip', () => {
  it('works forward from the time you leave the office', () => {
    const p = planReturnForDate(plan(), WED, { estimate: est })!;
    // 18:30 is rush hour: 20 -> 26 min. Book 8 min before leaving. No buffer.
    expect(p.leg).toBe('back');
    expect(formatTime(p.leaveBy)).toBe('18:30');
    expect(formatTime(p.bookAt)).toBe('18:22');
    expect(formatTime(p.arriveBy)).toBe('18:56');
  });

  it('is null when disabled or missing', () => {
    expect(planReturnForDate(plan({ returnTrip: null }), WED, { estimate: est })).toBeNull();
    expect(planReturnForDate(plan({ returnTrip: { enabled: false, departTime: '18:30' } }), WED, { estimate: est })).toBeNull();
  });

  it('interleaves morning and evening legs in time order', () => {
    const now = new Date(2026, 9, 28, 12, 0); // Wed noon: morning gone, evening ahead
    const legs = upcomingLegs(plan(), now, { estimate: est }, 4);
    expect(legs.map((l) => `${l.date} ${l.leg}`)).toEqual([
      '2026-10-28 back',
      '2026-10-29 to',
      '2026-10-29 back',
      '2026-10-30 to',
    ]);
  });

  it('skipped days drop both legs', () => {
    const now = new Date(2026, 9, 28, 20, 0);
    const legs = upcomingLegs(plan({ skipDates: ['2026-10-29'] }), now, { estimate: est }, 2);
    expect(legs.map((l) => l.date)).toEqual(['2026-10-30', '2026-10-30']);
  });

  it('applies rain only to the very next leg', () => {
    const now = new Date(2026, 9, 28, 12, 0);
    const legs = upcomingLegs(plan(), now, { estimate: est, rainProbability: 90 }, 2);
    expect(legs[0].adjustments.some((a) => a.reason.startsWith('Rain'))).toBe(true);
    expect(legs[1].adjustments.some((a) => a.reason.startsWith('Rain'))).toBe(false);
  });

  it('explains the ride home', () => {
    const p = plan();
    const text = explainPlan(p, planReturnForDate(p, WED, { estimate: est })!);
    expect(text).toContain('You leave Office at 18:30');
    expect(text).toContain('18:22');
  });
});

describe('proactive insights', () => {
  const base = { providerName: 'Uber', canOpenProvider: true };

  it('says "book soon" within 30 minutes with an open action', () => {
    const now = new Date(2026, 9, 28, 8, 40); // morning bookAt 08:46
    const p = plan({ returnTrip: null });
    const ins = buildInsights({ ...base, plan: p, now, upcoming: upcomingLegs(p, now, { estimate: est }, 3) });
    expect(ins[0].id).toBe('book-soon');
    expect(ins[0].title).toContain('in 6 min');
    expect(ins[0].action).toBe('open_ride');
  });

  it('explains a rain adjustment', () => {
    const now = new Date(2026, 9, 28, 6, 0);
    const p = plan({ returnTrip: null });
    const ins = buildInsights({ ...base, plan: p, now, upcoming: upcomingLegs(p, now, { estimate: est, rainProbability: 80 }, 3) });
    expect(ins.some((i) => i.id === 'rain' && i.title.includes('10 min earlier'))).toBe(true);
  });

  it('warns when using the fallback estimate', () => {
    const now = new Date(2026, 9, 28, 6, 0);
    const p = plan({ returnTrip: null });
    const ins = buildInsights({ ...base, plan: p, now, upcoming: upcomingLegs(p, now, { estimate: null }, 3) });
    expect(ins.some((i) => i.id === 'fallback')).toBe(true);
  });

  it('mentions tomorrow being off, with an undo action', () => {
    const now = new Date(2026, 9, 28, 6, 0);
    const p = plan({ returnTrip: null, skipDates: ['2026-10-29'] });
    const ins = buildInsights({ ...base, plan: p, now, upcoming: upcomingLegs(p, now, { estimate: est }, 3) });
    expect(ins.find((i) => i.id === 'tomorrow-off')?.action).toBe('undo_skip_tomorrow');
  });

  it('suggests adding a ride home in the afternoon if none is set', () => {
    const now = new Date(2026, 9, 28, 16, 0);
    const p = plan({ returnTrip: null });
    const ins = buildInsights({ ...base, plan: p, now, upcoming: upcomingLegs(p, now, { estimate: est }, 3) });
    expect(ins.some((i) => i.id === 'suggest-return')).toBe(true);
  });

  it('stays quiet when paused and never shows more than two', () => {
    const now = new Date(2026, 9, 28, 8, 40);
    expect(buildInsights({ ...base, plan: plan({ paused: true }), now, upcoming: [] })).toEqual([]);
    const p = plan({ returnTrip: null, skipDates: ['2026-10-29'] });
    const ins = buildInsights({ ...base, plan: p, now, upcoming: upcomingLegs(p, now, { estimate: null, rainProbability: 90 }, 3) });
    expect(ins.length).toBeLessThanOrEqual(2);
  });
});
