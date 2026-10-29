// Time picker: a big glass time display; tap it to reveal the native iOS wheel
// (same control as the Clock app). 5-minute steps. Ships in Expo Go.
// File keeps its old name so existing imports keep working.

import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Glass } from '../ui/Glass';
import { Icon, tap } from '../ui/components';
import { colors, radius, space, type } from '../ui/theme';

function toDate(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function toHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function to12h(hhmm: string): { time: string; ampm: string } {
  const [h, m] = hhmm.split(':').map(Number);
  return { time: `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}`, ampm: h < 12 ? 'AM' : 'PM' };
}

export default function TimeStepper({ value, onChange, label = 'Arrive by' }: { value: string; onChange: (v: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const { time, ampm } = to12h(value);

  const handle = (e: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS === 'android') setOpen(false); // Android shows a dialog
    if (e.type === 'set' && d) onChange(toHHMM(d));
  };

  return (
    <Glass radius={radius.lg} style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} ${time} ${ampm}. ${open ? 'Close' : 'Change'} time`}
        onPress={() => {
          tap();
          setOpen((o) => !o);
        }}
        style={styles.header}
      >
        <View>
          <Text style={type.caption}>{label}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            <Text style={[type.display, { fontSize: 52 }]}>{time}</Text>
            <Text style={[type.h2, { color: colors.accent, marginLeft: 6, marginBottom: 11 }]}>{ampm}</Text>
          </View>
        </View>
        <View style={[styles.editPill, open && { backgroundColor: colors.accent }]}>
          <Icon name={open ? 'checkmark' : 'clock'} size={14} color={open ? colors.accentInk : colors.ink} />
          <Text style={{ color: open ? colors.accentInk : colors.ink, fontWeight: '700', fontSize: 14 }}>{open ? 'Done' : 'Change'}</Text>
        </View>
      </Pressable>

      {open ? (
        <View style={styles.wheel}>
          <DateTimePicker
            value={toDate(value)}
            mode="time"
            display="spinner"
            minuteInterval={5}
            themeVariant="dark"
            textColor={colors.ink}
            onChange={handle}
            style={{ height: 180 }}
          />
        </View>
      ) : null}
    </Glass>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.lg, paddingVertical: space.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 72 },
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  wheel: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline, marginTop: space.sm },
});
