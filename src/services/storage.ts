// Commute plan + hand-off history are stored on-device only (privacy by default).
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CommutePlan, HandoffRecord } from '../domain/types';

const PLAN_KEY = 'commute.plan.v1';
const HISTORY_KEY = 'commute.handoffs.v1';
const MAX_HISTORY = 30;

export async function loadPlan(): Promise<CommutePlan | null> {
  try {
    const raw = await AsyncStorage.getItem(PLAN_KEY);
    return raw ? (JSON.parse(raw) as CommutePlan) : null;
  } catch {
    return null;
  }
}

export async function savePlan(plan: CommutePlan): Promise<void> {
  await AsyncStorage.setItem(PLAN_KEY, JSON.stringify(plan));
}

export async function deletePlan(): Promise<void> {
  await AsyncStorage.multiRemove([PLAN_KEY, HISTORY_KEY]);
}

export async function loadHistory(): Promise<HandoffRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HandoffRecord[]) : [];
  } catch {
    return [];
  }
}

export async function addHistory(record: HandoffRecord): Promise<HandoffRecord[]> {
  const next = [record, ...(await loadHistory())].slice(0, MAX_HISTORY);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}
