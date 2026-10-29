import type { ProviderId } from '../domain/types';
import { rapidoProvider } from './rapido';
import type { RideProvider } from './types';
import { createUberProvider } from './uber';

const uber = createUberProvider(process.env.EXPO_PUBLIC_UBER_CLIENT_ID || undefined);

export function getProvider(id: ProviderId): RideProvider {
  return id === 'uber' ? uber : rapidoProvider;
}

export type { RideProvider } from './types';
