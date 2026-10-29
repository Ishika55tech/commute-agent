import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { colors, radius, space, type } from './theme';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={[type.label, { marginBottom: space.sm }]}>{children}</Text>;
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
};

export function Button({ title, onPress, variant = 'primary', disabled, loading, accessibilityHint }: ButtonProps) {
  const v = buttonVariants[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.button, v.box, (disabled || loading) && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}
    >
      {loading ? <ActivityIndicator color={v.text.color} /> : <Text style={[styles.buttonText, v.text]}>{title}</Text>}
    </Pressable>
  );
}

const buttonVariants = {
  primary: { box: { backgroundColor: colors.accent }, text: { color: '#fff' } },
  secondary: { box: { backgroundColor: colors.accentSoft }, text: { color: colors.accent } },
  danger: { box: { backgroundColor: colors.dangerSoft }, text: { color: colors.danger } },
  ghost: { box: { backgroundColor: 'transparent' }, text: { color: colors.muted } },
};

export function Field(props: TextInputProps & { label: string; error?: string | null }) {
  const { label, error, style, ...rest } = props;
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={[type.small, { marginBottom: space.xs, color: colors.ink, fontWeight: '500' }]}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        accessibilityLabel={label}
        style={[styles.input, error ? { borderColor: colors.danger } : null, style]}
        {...rest}
      />
      {error ? <Text style={[type.small, { color: colors.danger, marginTop: space.xs }]}>{error}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.chip, selected && { backgroundColor: colors.ink, borderColor: colors.ink }]}
    >
      <Text style={{ color: selected ? '#fff' : colors.ink, fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

type Tone = 'info' | 'warn' | 'danger' | 'ok';
const tones: Record<Tone, { bg: string; fg: string }> = {
  info: { bg: colors.infoSoft, fg: colors.info },
  warn: { bg: colors.warnSoft, fg: colors.warn },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  ok: { bg: colors.accentSoft, fg: colors.accent },
};

export function Notice({ tone = 'info', title, children }: { tone?: Tone; title?: string; children: React.ReactNode }) {
  const t = tones[tone];
  return (
    <View style={[styles.notice, { backgroundColor: t.bg }]} accessibilityRole="alert">
      {title ? <Text style={{ color: t.fg, fontWeight: '700', marginBottom: 2 }}>{title}</Text> : null}
      <Text style={{ color: t.fg, fontSize: 13, lineHeight: 18 }}>{children}</Text>
    </View>
  );
}

export function Badge({ text, tone = 'info' }: { text: string; tone?: Tone }) {
  const t = tones[tone];
  return (
    <View style={{ backgroundColor: t.bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ color: t.fg, fontSize: 12, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.lg,
    marginBottom: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  button: { borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  input: {
    backgroundColor: '#FAF9F7',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: space.sm,
    marginBottom: space.sm,
    minWidth: 44,
    alignItems: 'center',
  },
  notice: { borderRadius: radius.md, padding: space.md, marginBottom: space.md },
});
