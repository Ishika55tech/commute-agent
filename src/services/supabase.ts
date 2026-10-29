import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

// Only PUBLIC values live in the app (EXPO_PUBLIC_*). Secret keys (LLM, ORS)
// live in Supabase Edge Function secrets and never ship in the bundle.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isBackendConfigured = Boolean(url && anonKey);

export const supabase = isBackendConfigured
  ? createClient(url as string, anonKey as string, { auth: { persistSession: false } })
  : null;
