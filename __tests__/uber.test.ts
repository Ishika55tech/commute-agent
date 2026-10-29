import { buildUberLink, UBER_UNIVERSAL_LINK_BASE } from '../src/providers/uber';
import { rapidoProvider } from '../src/providers/rapido';
import type { Place } from '../src/domain/types';

const home: Place = { label: 'Home', address: 'Vijay Nagar, Indore', latitude: 22.7533, longitude: 75.8937 };
const office: Place = { label: 'Office', address: 'Crystal IT Park, Indore', latitude: 22.7196, longitude: 75.8577 };

describe('buildUberLink', () => {
  it('uses the documented universal link and setPickup action', () => {
    const url = buildUberLink(home, office);
    expect(url.startsWith(UBER_UNIVERSAL_LINK_BASE + '?')).toBe(true);
    expect(url).toContain('action=setPickup');
  });

  it('includes pickup and dropoff coordinates (bracket keys percent-encoded)', () => {
    const url = buildUberLink(home, office);
    expect(url).toContain('pickup%5Blatitude%5D=22.753300');
    expect(url).toContain('pickup%5Blongitude%5D=75.893700');
    expect(url).toContain('dropoff%5Blatitude%5D=22.719600');
    expect(url).toContain('dropoff%5Blongitude%5D=75.857700');
  });

  it('produces a URL with no raw brackets (iOS rejects them) that decodes to the documented keys', () => {
    const url = buildUberLink(home, office);
    expect(/[\[\]]/.test(url)).toBe(false);
    const params = new URL(url).searchParams;
    expect(params.get('pickup[latitude]')).toBe('22.753300');
    expect(params.get('dropoff[formatted_address]')).toBe('Crystal IT Park, Indore');
    expect(params.get('action')).toBe('setPickup');
  });

  it('URL-encodes nickname and formatted address', () => {
    const url = buildUberLink(home, office);
    expect(url).toContain('pickup%5Bformatted_address%5D=Vijay%20Nagar%2C%20Indore');
    expect(url).toContain('dropoff%5Bnickname%5D=Office');
  });

  it('adds client_id only when provided', () => {
    expect(buildUberLink(home, office)).not.toContain('client_id');
    expect(buildUberLink(home, office, 'abc')).toContain('client_id=abc');
  });

  it('rejects invalid coordinates', () => {
    expect(() => buildUberLink({ ...home, latitude: 200 }, office)).toThrow('pickup');
    expect(() => buildUberLink(home, { ...office, longitude: NaN })).toThrow('dropoff');
  });

  it('requires a nickname or address', () => {
    expect(() => buildUberLink({ ...home, label: ' ', address: '' }, office)).toThrow('nickname or address');
  });
});

describe('rapido', () => {
  it('is explicitly unsupported and never builds a guessed URL', () => {
    expect(rapidoProvider.integration).toBe('unsupported');
    expect(rapidoProvider.buildHandoffUrl(home, office)).toBeNull();
  });
});
