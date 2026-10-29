// Core domain types. Pure data — no React Native imports here, so this
// layer can be unit-tested in plain Node.

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ProviderId = 'uber' | 'rapido';

export interface Place {
  /** Short name the user gave, e.g. "Home", "Office". */
  label: string;
  /** Address as the geocoder / user wrote it. */
  address: string;
  latitude: number;
  longitude: number;
}

export interface CommutePlan {
  id: string;
  pickup: Place;
  dropoff: Place;
  /** Required arrival time, 24h "HH:MM", device local time. */
  arrivalTime: string;
  workingDays: IsoWeekday[];
  /** Extra safety margin on top of travel time. */
  bufferMinutes: number;
  /** Typical time for a driver to reach the pickup after booking. */
  driverWaitMinutes: number;
  /** User-defined maximum fare (INR). Shown as a reminder only — we never see real fares. */
  budgetInr: number | null;
  provider: ProviderId;
  paused: boolean;
  /** Dates ("YYYY-MM-DD") on which this commute is skipped (holiday, WFH...). */
  skipDates: string[];
  /** One-off arrival-time overrides, keyed by "YYYY-MM-DD". */
  arrivalOverrides: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export type EstimateSource = 'openrouteservice' | 'fallback';

export interface TravelEstimate {
  /** Raw route duration in minutes (no traffic). */
  baseMinutes: number;
  distanceKm: number | null;
  source: EstimateSource;
}

/** Factors applied deterministically on top of the base estimate. */
export interface Adjustment {
  reason: string;
  minutes: number;
}

export interface DayPlan {
  /** "YYYY-MM-DD" */
  date: string;
  arriveBy: Date;
  leaveBy: Date;
  /** When the reminder fires and the user should open the ride app. */
  bookAt: Date;
  travelMinutes: number;
  adjustments: Adjustment[];
  estimateSource: EstimateSource;
}

/** What actually happened when the user tapped "Open Uber". Never "booked". */
export type HandoffStatus = 'opened_in_app' | 'opened_in_browser' | 'failed' | 'unsupported';

export interface HandoffRecord {
  at: string;
  provider: ProviderId;
  status: HandoffStatus;
  detail?: string;
}
