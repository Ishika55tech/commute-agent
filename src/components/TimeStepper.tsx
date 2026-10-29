import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Glass } from '../ui/Glass';
import { Icon, tap } from '../ui/components';
import { colors, radius, type } from '../ui/theme';

function shift(hhmm: string, delta: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (((h * 60 + m + delta) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function to12h(hhmm: string): { time: string; ampm: string } {
  const [h, m] = hhmm.split(':').map(Number);
  return { time: `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}`, ampm: h < 12 ? 'AM' : 'PM' };
}

/** Big glass time control: −/+ 5 min (long-press: 30 min). */
export default function TimeStepper({ value, onChange, label = 'Arrive by' }: { value: string; onChange: (v: string) => void; label?: string }) {
  const { time, ampm } = to12h(value);
  const step = (d: number) => {
    tap();
    onChange(shift(value, d));
  };
  return (
    <Glass radius={radius.lg} style={styles.wrap}>
      <StepButton icon="minus" label="5 minutes earlier" onPress={() => step(-5)} onLong={() => step(-30)} />
      <View style={{ alignItems: 'center' }} accessibilityLabel={`${label} ${time} ${ampm}`}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          <Text style={[type.display, { fontSize: 56 }]}>{time}</Text>
          <Text style={[type.h2, { color: colors.accent, marginLeft: 6, marginBottom: 12 }]}>{ampm}</Text>
        </View>
        <Text style={type.caption}>{label} · hold − / + to jump 30 min</Text>
      </View>
      <StepButton icon="plus" label="5 minutes later" onPress={() => step(5)} onLong={() => step(30)} />
    </Glass>
  );
}

function StepButton({ icon, label, onPress, onLong }: { icon: string; label: string; onPress: () => void; onLong: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLong}
      style={({ pressed }) => [styles.step, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Icon name={icon} size={20} color={colors.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 16 },
  step: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
});
