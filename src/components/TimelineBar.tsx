// Visual breakdown of the morning: driver wait → ride (base + adjustments) → buffer.
// Pure presentation of numbers computed in src/domain/scheduler.ts.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatTime } from '../domain/scheduler';
import type { CommutePlan, DayPlan } from '../domain/types';
import { colors, type } from '../ui/theme';

export default function TimelineBar({ plan, day }: { plan: CommutePlan; day: DayPlan }) {
  const buffer = (day.leg ?? 'to') === 'back' ? 0 : plan.bufferMinutes;
  const extra = day.adjustments.reduce((s, a) => s + a.minutes, 0);
  const base = day.travelMinutes - extra;
  const segments = [
    { key: 'wait', minutes: plan.driverWaitMinutes, color: colors.violet, label: 'Driver' },
    { key: 'ride', minutes: base, color: colors.sky, label: 'Ride' },
    ...(extra > 0 ? [{ key: 'extra', minutes: extra, color: '#9DB9FF', label: 'Traffic' }] : []),
    { key: 'buffer', minutes: buffer, color: colors.amber, label: 'Buffer' },
  ].filter((s) => s.minutes > 0);
  const total = segments.reduce((s, x) => s + x.minutes, 0);

  return (
    <View accessibilityLabel={`Book at ${formatTime(day.bookAt)}, leave at ${formatTime(day.leaveBy)}, arrive by ${formatTime(day.arriveBy)}`}>
      <View style={styles.track}>
        {segments.map((s, i) => (
          <View
            key={s.key}
            style={{
              flex: s.minutes,
              backgroundColor: s.color,
              marginLeft: i === 0 ? 0 : 3,
              borderTopLeftRadius: i === 0 ? 6 : 2,
              borderBottomLeftRadius: i === 0 ? 6 : 2,
              borderTopRightRadius: i === segments.length - 1 ? 6 : 2,
              borderBottomRightRadius: i === segments.length - 1 ? 6 : 2,
            }}
          />
        ))}
      </View>
      <View style={styles.legend}>
        {segments.map((s) => (
          <View key={s.key} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <Text style={type.caption}>
              {s.label} <Text style={{ color: colors.ink, fontWeight: '700' }}>{s.minutes}m</Text>
            </Text>
          </View>
        ))}
        <Text style={[type.caption, { marginLeft: 'auto' }]}>{total} min from booking to arrival</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', height: 12 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
