import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tap } from '../ui/components';
import { colors, radius } from '../ui/theme';

type Option<T> = { value: T; label: string; sub?: string };

export default function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            style={[styles.item, on && styles.on]}
          >
            <Text style={{ color: on ? colors.accentInk : colors.ink, fontWeight: '700', fontSize: 14.5 }}>{o.label}</Text>
            {o.sub ? <Text style={{ color: on ? colors.accentInk : colors.muted, fontSize: 11, marginTop: 1 }}>{o.sub}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: radius.sm, padding: 4, gap: 4, borderWidth: 1, borderColor: colors.hairline },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: radius.sm - 3, minHeight: 44 },
  on: { backgroundColor: colors.accent },
});
