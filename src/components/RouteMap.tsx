import React, { useRef } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import type { Place } from '../domain/types';
import { colors } from '../ui/theme';

/** Dark Apple Map framing pickup → drop-off (free, no API key, Expo Go). */
export default function RouteMap({ pickup, dropoff, topInset }: { pickup: Place; dropoff: Place; topInset: number }) {
  const ref = useRef<MapView>(null);
  const coords = [
    { latitude: pickup.latitude, longitude: pickup.longitude },
    { latitude: dropoff.latitude, longitude: dropoff.longitude },
  ];
  const fit = () =>
    ref.current?.fitToCoordinates(coords, {
      edgePadding: { top: topInset + 70, right: 70, bottom: 120, left: 70 },
      animated: false,
    });

  return (
    <MapView
      ref={ref}
      style={StyleSheet.absoluteFill}
      userInterfaceStyle="dark"
      onMapReady={fit}
      onLayout={fit}
      pitchEnabled={false}
      rotateEnabled={false}
      showsPointsOfInterests={false}
      showsCompass={false}
      toolbarEnabled={false}
      accessibilityLabel={`Map from ${pickup.label} to ${dropoff.label}`}
    >
      <Polyline coordinates={coords} strokeColor={colors.accent} strokeWidth={4} lineDashPattern={[2, 8]} lineCap="round" />
      <Marker coordinate={coords[0]} title={pickup.label} description={pickup.address} pinColor={colors.accent} />
      <Marker coordinate={coords[1]} title={dropoff.label} description={dropoff.address} pinColor={colors.sky} />
    </MapView>
  );
}
