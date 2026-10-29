// Pick an exact point: search an address, or use GPS, then fine-tune by
// dragging the pin (or tapping the map) to the exact gate/building.
// Map: react-native-maps → Apple Maps on iOS (free, no API key, works in Expo Go).

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import type { Place } from '../domain/types';
import { currentPlace, geocodePlace, lastKnownPoint, reverseGeocode } from '../services/geocode';
import { formatDistance, searchPlaces, type PlaceSuggestion } from '../services/placeSearch';
import { Glass } from '../ui/Glass';
import { Button, Chip, Field, Icon, Notice, tap } from '../ui/components';
import { colors, radius, space, type } from '../ui/theme';

const INDIA: Region = { latitude: 22.5, longitude: 78.9, latitudeDelta: 18, longitudeDelta: 18 };
const CLOSE = { latitudeDelta: 0.006, longitudeDelta: 0.006 };

type Props = {
  role: 'pickup' | 'dropoff';
  value: Place | null;
  /** Address text suggested by the AI (searched once automatically). */
  suggestedAddress?: string;
  nameOptions: string[];
  /** Bias search results towards this point (e.g. the pickup when choosing the office). */
  near?: { latitude: number; longitude: number };
  onChange: (place: Place) => void;
};

export default function PlacePicker({ role, value, suggestedAddress, nameOptions, near, onChange }: Props) {
  const mapRef = useRef<MapView>(null);
  const [name, setName] = useState(value?.label ?? nameOptions[0]);
  const [query, setQuery] = useState(value?.address ?? suggestedAddress ?? '');
  const [busy, setBusy] = useState<'search' | 'gps' | 'pin' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoSearched = useRef(false);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [typed, setTyped] = useState(false); // only autocomplete what the user typed
  const [bias, setBias] = useState(near);
  const reqId = useRef(0);

  // Depend on the numbers, not the object (a new object each render would loop).
  useEffect(() => {
    if (near) setBias({ latitude: near.latitude, longitude: near.longitude });
    else lastKnownPoint().then((p) => p && setBias(p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near?.latitude, near?.longitude]);

  // Debounced building / place autocomplete.
  useEffect(() => {
    const q = query.trim();
    if (!typed || q.length < 3) {
      setSuggestions([]);
      return;
    }
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      setSearching(true);
      const res = await searchPlaces(q, bias);
      if (id === reqId.current) {
        setSuggestions(res);
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query, typed, bias]);

  const pick = (s: PlaceSuggestion) => {
    tap();
    setTyped(false);
    setSuggestions([]);
    setError(null);
    const address = s.detail ? `${s.name}, ${s.detail}` : s.name;
    apply({ label: name.trim() || nameOptions[0], address, latitude: s.latitude, longitude: s.longitude });
  };

  const pinColor = role === 'pickup' ? colors.accent : colors.sky;

  const focus = (p: { latitude: number; longitude: number }) =>
    mapRef.current?.animateToRegion({ latitude: p.latitude, longitude: p.longitude, ...CLOSE }, 600);

  const apply = (p: Place) => {
    onChange({ ...p, label: name.trim() || nameOptions[0] });
    setQuery(p.address);
    focus(p);
  };

  const search = async (text = query) => {
    setError(null);
    setBusy('search');
    setTyped(false);
    setSuggestions([]);
    // Buildings / POIs first (OSM gazetteers), then Apple's postal-address geocoder.
    const places = await searchPlaces(text, bias);
    if (places.length) {
      setBusy(null);
      const s = places[0];
      apply({ label: name.trim() || nameOptions[0], address: s.detail ? `${s.name}, ${s.detail}` : s.name, latitude: s.latitude, longitude: s.longitude });
      if (places.length > 1) setSuggestions(places.slice(1)); // let the user switch if the first guess is wrong
      return;
    }
    const r = await geocodePlace(name, text);
    setBusy(null);
    if (r.ok) apply(r.place);
    else setError(`Couldn't find "${text.trim()}". Try the building name with area and city, or tap the map to drop a pin.`);
  };

  const useGps = async () => {
    setError(null);
    setBusy('gps');
    const r = await currentPlace(name);
    setBusy(null);
    if (r.ok) apply(r.place);
    else setError(r.message);
  };

  const movePin = async (latitude: number, longitude: number) => {
    tap();
    setBusy('pin');
    const address = await reverseGeocode(latitude, longitude);
    setBusy(null);
    onChange({ label: name.trim() || nameOptions[0], address, latitude, longitude });
    setQuery(address);
  };

  // AI gave us an address → look it up once so the user only has to fine-tune the pin.
  useEffect(() => {
    if (!value && suggestedAddress && !autoSearched.current) {
      autoSearched.current = true;
      search(suggestedAddress);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedAddress]);

  // Keep the label in sync when the user renames the place.
  useEffect(() => {
    if (value && name.trim() && value.label !== name.trim()) onChange({ ...value, label: name.trim() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: space.md }}>
        {nameOptions.map((n) => (
          <Chip key={n} label={n} selected={name === n} onPress={() => setName(n)} icon={iconFor(n)} />
        ))}
      </View>

      <Field
        icon="magnifyingglass"
        placeholder={role === 'pickup' ? 'Building, street, area, city' : 'Office name, area, city'}
        value={query}
        onChangeText={(t) => {
          setQuery(t);
          setTyped(true);
        }}
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={() => search()}
        right={
          busy === 'search' || searching ? (
            <ActivityIndicator color={colors.accent} />
          ) : query.trim().length > 2 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Search" onPress={() => search()} hitSlop={10}>
              <Icon name="arrow.right.circle.fill" size={26} color={colors.accent} />
            </Pressable>
          ) : null
        }
      />

      {suggestions.length ? (
        <View style={styles.suggestions}>
          {suggestions.map((s, i) => (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              accessibilityLabel={`${s.name}, ${s.detail}`}
              onPress={() => pick(s)}
              style={({ pressed }) => [styles.suggestion, i > 0 && styles.suggestionBorder, pressed && { backgroundColor: 'rgba(255,255,255,0.06)' }]}
            >
              <Icon name="mappin.and.ellipse" size={18} color={pinColor} />
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { fontWeight: '600' }]} numberOfLines={1}>{s.name}</Text>
                {s.detail ? <Text style={type.caption} numberOfLines={1}>{s.detail}</Text> : null}
              </View>
              {formatDistance(bias, s) ? <Text style={type.caption}>{formatDistance(bias, s)}</Text> : null}
            </Pressable>
          ))}
          <Text style={[type.caption, { padding: 10, opacity: 0.7 }]}>Not listed? Tap the map to drop a pin. Search data © OpenStreetMap</Text>
        </View>
      ) : null}

      {role === 'pickup' ? (
        <Button title="Use my current location" icon="location.fill" variant="glass" onPress={useGps} loading={busy === 'gps'} style={{ marginBottom: space.md }} />
      ) : null}

      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={value ? { latitude: value.latitude, longitude: value.longitude, ...CLOSE } : INDIA}
          userInterfaceStyle="dark"
          showsUserLocation
          showsPointsOfInterests
          showsBuildings
          pitchEnabled={false}
          onPress={(e) => movePin(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}
        >
          {value ? (
            <Marker
              coordinate={{ latitude: value.latitude, longitude: value.longitude }}
              draggable
              pinColor={pinColor}
              onDragEnd={(e) => movePin(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}
            />
          ) : null}
        </MapView>

        <Glass radius={radius.pill} variant="clear" style={styles.hint}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {busy === 'pin' ? <ActivityIndicator size="small" color={colors.ink} /> : <Icon name="hand.point.up.left.fill" size={13} color={colors.ink} />}
            <Text style={{ color: colors.ink, fontSize: 12.5, fontWeight: '600' }}>
              {value ? 'Drag the pin or tap the map to your exact gate' : 'Search or tap the map to drop a pin'}
            </Text>
          </View>
        </Glass>
      </View>

      {value ? (
        <View style={styles.addressRow}>
          <Icon name="mappin.circle.fill" size={20} color={pinColor} />
          <View style={{ flex: 1 }}>
            <Text style={type.body} numberOfLines={2}>{value.address}</Text>
            <Text style={type.caption}>
              {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)} · this exact point is sent to Uber
            </Text>
          </View>
        </View>
      ) : null}

      {error ? <View style={{ marginTop: space.md }}><Notice tone="warn">{error}</Notice></View> : null}
    </View>
  );
}

function iconFor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('home')) return 'house.fill';
  if (n.includes('pg') || n.includes('hostel')) return 'bed.double.fill';
  if (n.includes('office') || n.includes('work')) return 'building.2.fill';
  if (n.includes('college')) return 'graduationcap.fill';
  return 'mappin';
}

const styles = StyleSheet.create({
  mapWrap: { height: 280, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.bgElevated },
  hint: { position: 'absolute', top: 10, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 7 },
  addressRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: space.md },
  suggestions: { backgroundColor: colors.bgElevated, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.hairline, marginTop: -4, marginBottom: space.md, overflow: 'hidden' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 56 },
  suggestionBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
});
