import {
  FALLBACK_TRAVEL_MINUTES,
  explainPlan,
  formatTime,
  isCommuteDay,
  isRushHour,
  isValidTime,
  isoToExpoWeekday,
  isoWeekday,
  planForDate,
  toDateKey,
  upcomingPlans,
} from '../src/domain/scheduler';
import type { CommutePlan } from '../src/domain/types';

const basePlan = (over: Partial<CommutePlan> = {}): CommutePlan => ({
  id: 'p1',
  pickup: { label: 'Home', address: 'Vijay Nagar, Indore', latitude: 22.75, longitude: 75.89 },
  dropoff: { label: 'Office', address: 'Crystal IT Park, Indore', latitude: 22.72, longitude: 75.87 },
  arrivalTime: '09:30',
  workingDays: [1, 2, 3, 4, 5],
  bufferMinutes: 10,
  driverWaitMinutes: 8,
  budgetInr: 150,
  provider: 'uber',
  paused: false,
  skipDates: [],
  arrivalOverrides: {},
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...over,
});

// 2026-10-28 is a Wednesday.
const WED = new Date(2026, 9, 28);
const SAT = new Date(2026, 9, 31);
const SUN = new Date(2026, 10, 1);

describe('time helpers', () => {
  it('validates HH:MM', () => {
    expect(isValidTime('09:30')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('9:30')).toBe(false);
    expect(isValidTime('09:60')).toBe(false);
  });

  it('maps JS days to ISO weekdays', () => {
    expect(isoWeekday(WED)).toBe(3);
    expect(isoWeekday(SUN)).toBe(7);
  });

  it('maps ISO weekdays to expo-notifications weekdays (1 = Sunday)', () => {
    expect(isoToExpoWeekday(1)).toBe(2); // Monday
    expect(isoToExpoWeekday(6)).toBe(7); // Saturday
    expect(isoToExpoWeekday(7)).toBe(1); // Sunday
  });

  it('detects rush hour', () => {
    expect(isRushHour('09:30')).toBe(true);
    expect(isRushHour('13:00')).toBe(false);
    expect(isRushHour('18:15')).toBe(true);
    expect(isRushHour('21:00')).toBe(false);
  });
});

describe('planForDate', () => {
  it('computes leave/book times with route estimate + rush hour + buffer', () => {
    const p = planForDate(basePlan(), WED, { estimate: { baseMinutes: 20, distanceKm: 7, source: 'openrouteservice' } });
    // travel = 20 + round(20*1.3)-20 = 26; leave = 9:30 - 26 - 10 = 8:54; book = 8:46
    expect(p.travelMinutes).toBe(26);
    expect(formatTime(p.leaveBy)).toBe('08:54');
    expect(formatTime(p.bookAt)).toBe('08:46');
    expect(p.estimateSource).toBe('openrouteservice');
  });

  it('falls back to a default estimate when none is available', () => {
    const p = planForDate(basePlan({ arrivalTime: '13:00' }), WED, { estimate: null });
    expect(p.travelMinutes).toBe(FALLBACK_TRAVEL_MINUTES);
    expect(p.estimateSource).toBe('fallback');
    expect(formatTime(p.leaveBy)).toBe('12:20');
  });

  it('adds rain time only above the threshold', () => {
    const est = { baseMinutes: 20, distanceKm: 7, source: 'openrouteservice' as const };
    const dry = planForDate(basePlan(), WED, { estimate: est, rainProbability: 40 });
    const wet = planForDate(basePlan(), WED, { estimate: est, rainProbability: 80 });
    expect(wet.travelMinutes - dry.travelMinutes).toBe(10);
    expect(wet.adjustments.map((a) => a.reason).join()).toContain('Rain');
  });

  it('uses a one-off arrival override', () => {
    const plan = basePlan({ arrivalOverrides: { '2026-10-28': '10:30' } });
    const p = planForDate(plan, WED, { estimate: { baseMinutes: 20, distanceKm: null, source: 'openrouteservice' } });
    expect(formatTime(p.arriveBy)).toBe('10:30');
  });

  it('handles commutes that cross midnight backwards', () => {
    const p = planForDate(basePlan({ arrivalTime: '00:15' }), WED, { estimate: { baseMinutes: 20, distanceKm: null, source: 'openrouteservice' } });
    expect(toDateKey(p.bookAt)).toBe('2026-10-27');
  });

  it('explains the plan in plain language', () => {
    const plan = basePlan();
    const p = planForDate(plan, WED, { estimate: { baseMinutes: 20, distanceKm: 7, source: 'openrouteservice' } });
    const text = explainPlan(plan, p);
    expect(text).toContain('20 min');
    expect(text).toContain('Rush hour');
    expect(text).toContain('08:46');
  });
});

describe('commute days and upcoming plans', () => {
  it('respects working days, skip dates and pause', () => {
    expect(isCommuteDay(basePlan(), WED)).toBe(true);
    expect(isCommuteDay(basePlan(), SAT)).toBe(false);
    expect(isCommuteDay(basePlan({ skipDates: ['2026-10-28'] }), WED)).toBe(false);
    expect(isCommuteDay(basePlan({ paused: true }), WED)).toBe(false);
  });

  it('skips today once the booking time has passed', () => {
    const now = new Date(2026, 9, 28, 9, 0); // after 08:46
    const list = upcomingPlans(basePlan(), now, { estimate: { baseMinutes: 20, distanceKm: null, source: 'openrouteservice' } }, 3);
    expect(list.map((d) => d.date)).toEqual(['2026-10-29', '2026-10-30', '2026-11-02']);
  });

  it('includes today if booking time is still ahead', () => {
    const now = new Date(2026, 9, 28, 7, 0);
    const list = upcomingPlans(basePlan(), now, { estimate: null }, 1);
    expect(list[0].date).toBe('2026-10-28');
  });

  it('returns nothing (not an infinite loop) when paused', () => {
    expect(upcomingPlans(basePlan({ paused: true }), WED, { estimate: null }, 5)).toEqual([]);
  });

  it('applies rain only to the first upcoming plan', () => {
    const now = new Date(2026, 9, 28, 6, 0);
    const list = upcomingPlans(basePlan(), now, { estimate: null, rainProbability: 90 }, 2);
    expect(list[0].adjustments.some((a) => a.reason.startsWith('Rain'))).toBe(true);
    expect(list[1].adjustments.some((a) => a.reason.startsWith('Rain'))).toBe(false);
  });
});
