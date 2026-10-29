// Calls the Supabase Edge Functions. Every response is re-validated on the
// device (defence in depth) — the app never trusts the network or the LLM.

import { validateAgentOutput, type ValidationResult } from '../domain/schema';
import { toDateKey } from '../domain/scheduler';
import type { CommutePlan, TravelEstimate } from '../domain/types';
import { supabase } from './supabase';

export const MAX_COMMAND_LENGTH = 500;
const CLIENT_TIMEOUT_MS = 30_000;

function timeout<T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return Promise.race([p, new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), ms))]);
}

export type AgentResponse =
  | { kind: 'ok'; result: Extract<ValidationResult, { ok: true }> }
  | { kind: 'invalid'; errors: string[] }
  | { kind: 'unavailable'; message: string };

export async function parseCommand(text: string, current: CommutePlan | null, now = new Date()): Promise<AgentResponse> {
  const trimmed = text.trim();
  if (!trimmed) return { kind: 'invalid', errors: ['Please type something first.'] };
  if (trimmed.length > MAX_COMMAND_LENGTH) return { kind: 'invalid', errors: [`Keep it under ${MAX_COMMAND_LENGTH} characters.`] };
  if (!supabase) return { kind: 'unavailable', message: 'AI backend is not configured. Use the form instead.' };

  // Only non-identifying context is sent to the LLM: no coordinates, no addresses.
  const context = current
    ? {
        arrivalTime: current.arrivalTime,
        workingDays: current.workingDays,
        bufferMinutes: current.bufferMinutes,
        provider: current.provider,
        paused: current.paused,
        pickupLabel: current.pickup.label,
        dropoffLabel: current.dropoff.label,
      }
    : null;

  const res = await timeout(
    supabase.functions.invoke('parse-commute', {
      body: { text: trimmed, today: toDateKey(now), weekday: now.getDay(), current: context },
    }),
    CLIENT_TIMEOUT_MS,
  );
  if (res === 'timeout') return { kind: 'unavailable', message: 'The AI assistant is taking too long. Try again, or use the form.' };
  const { data, error } = res;
  if (error) return { kind: 'unavailable', message: await describeFunctionError(error) };

  const result = validateAgentOutput(data?.intent, now);
  return result.ok ? { kind: 'ok', result } : { kind: 'invalid', errors: result.errors };
}

export async function fetchTravelEstimate(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): Promise<TravelEstimate | null> {
  if (!supabase) return null;
  try {
    const res = await timeout(supabase.functions.invoke('travel-estimate', { body: { from, to } }), CLIENT_TIMEOUT_MS);
    if (res === 'timeout') return null;
    const { data, error } = res;
    if (error || typeof data?.minutes !== 'number' || data.minutes <= 0 || data.minutes > 600) return null;
    return {
      baseMinutes: data.minutes,
      distanceKm: typeof data.distanceKm === 'number' ? data.distanceKm : null,
      source: 'openrouteservice',
    };
  } catch {
    return null;
  }
}

/** Turn a functions.invoke error into an honest, specific message. */
async function describeFunctionError(error: unknown): Promise<string> {
  const e = error as { name?: string; context?: { status?: number; json?: () => Promise<{ error?: string }> } };
  if (e?.name === 'FunctionsHttpError' && e.context) {
    let code: string | undefined;
    try {
      code = (await e.context.json?.())?.error;
    } catch {
      // body not JSON
    }
    if (code === 'llm_failed') return 'The AI is busy or has hit its free limit. Try again in a minute, or use the form.';
    if (code === 'llm_not_configured') return 'AI is not configured on the server yet. Use the form.';
    if (code === 'invalid_input') return 'That message could not be sent. Keep it under 500 characters.';
    return `The AI service returned an error (${e.context.status ?? 'unknown'}). Use the form for now.`;
  }
  return 'Could not reach the AI service. Check your internet, or use the form.';
}
