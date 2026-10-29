import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Glass } from './Glass';
import { colors, radius, space, type } from './theme';

export const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
export const success = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

/** SF Symbol with a safe fallback (Android/web). */
export function Icon({ name, size = 18, color = colors.ink }: { name: string; size?: number; color?: string }) {
  return (
    <SymbolView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      name={name as any}
      size={size}
      tintColor={color}
      type="hierarchical"
      fallback={<View style={{ width: size, height: size }} />}
    />
  );
}

/** Full-screen night backdrop with soft colour glows — gives Glass something to refract. */
export function Backdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={['#0B1018', '#07090D', '#050608']} style={StyleSheet.absoluteFill} />
      <View style={[styles.glow, { top: -120, right: -80, backgroundColor: colors.accentGlow }]} />
      <View style={[styles.glow, { top: 260, left: -140, backgroundColor: 'rgba(122,167,255,0.22)' }]} />
      <View style={[styles.glow, { bottom: -160, right: -60, backgroundColor: 'rgba(180,155,255,0.20)' }]} />
      {/* Heavy blur turns the solid circles into soft light glows. */}
      <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
    </View>
  );
}

export function Card({ children, style, tint }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; tint?: string }) {
  return (
    <Glass style={[{ padding: space.lg, marginBottom: space.md }, style]} tint={tint}>
      {children}
    </Glass>
  );
}

export function SectionLabel({ children, icon }: { children: React.ReactNode; icon?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: space.md }}>
      {icon ? <Icon name={icon} size={13} color={colors.muted} /> : null}
      <Text style={type.label}>{children}</Text>
    </View>
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'glass' | 'ghost' | 'danger';
  icon?: string;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, onPress, variant = 'primary', icon, disabled, loading, accessibilityHint, style }: ButtonProps) {
  const fg =
    variant === 'primary' ? colors.accentInk : variant === 'danger' ? colors.danger : variant === 'ghost' ? colors.inkSoft : colors.ink;
  const content = loading ? (
    <ActivityIndicator color={fg} />
  ) : (
    <View style={styles.row}>
      {icon ? <Icon name={icon} size={17} color={fg} /> : null}
      <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
    </View>
  );
  const press = () => {
    tap();
    onPress();
  };
  const a11y = {
    accessibilityRole: 'button' as const,
    accessibilityLabel: title,
    accessibilityHint,
    accessibilityState: { disabled: !!(disabled || loading) },
  };

  if (variant === 'primary') {
    return (
      <Pressable {...a11y} onPress={press} disabled={disabled || loading} style={({ pressed }) => [{ opacity: disabled ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }, style]}>
        <LinearGradient colors={['#8BFFD7', colors.accent, '#3FD6A6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.button}>
          {content}
        </LinearGradient>
      </Pressable>
    );
  }
  if (variant === 'glass') {
    return (
      <Pressable {...a11y} onPress={press} disabled={disabled || loading} style={({ pressed }) => [{ opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }, style]}>
        <Glass radius={radius.md} interactive style={styles.button}>
          {content}
        </Glass>
      </Pressable>
    );
  }
  return (
    <Pressable
      {...a11y}
      onPress={press}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        variant === 'danger' && { backgroundColor: colors.dangerSoft },
        { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 },
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
  tone = 'accent',
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: string;
  tone?: 'accent' | 'violet';
}) {
  const on = tone === 'violet' ? colors.violet : colors.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.chip,
        selected ? { backgroundColor: on, borderColor: on } : null,
        { opacity: pressed ? 0.75 : 1 },
      ]}
    >
      {icon ? <Icon name={icon} size={13} color={selected ? colors.accentInk : on} /> : null}
      <Text style={{ color: selected ? colors.accentInk : colors.ink, fontWeight: '600', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label?: string; error?: string | null; icon?: string; right?: React.ReactNode }) {
  const { label, error, icon, right, style, ...rest } = props;
  return (
    <View style={{ marginBottom: space.md }}>
      {label ? <Text style={[type.caption, { marginBottom: 6 }]}>{label}</Text> : null}
      <View style={[styles.field, error ? { borderColor: colors.danger } : null]}>
        {icon ? <Icon name={icon} size={16} color={colors.muted} /> : null}
        <TextInput
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          keyboardAppearance="dark"
          accessibilityLabel={label ?? rest.placeholder}
          style={[styles.input, style]}
          {...rest}
        />
        {right}
      </View>
      {error ? <Text style={[type.caption, { color: colors.danger, marginTop: 6 }]}>{error}</Text> : null}
    </View>
  );
}

type Tone = 'info' | 'warn' | 'danger' | 'ok' | 'ai';
const tones: Record<Tone, { bg: string; fg: string; icon: string }> = {
  info: { bg: colors.skySoft, fg: colors.sky, icon: 'info.circle.fill' },
  warn: { bg: colors.amberSoft, fg: colors.amber, icon: 'exclamationmark.triangle.fill' },
  danger: { bg: colors.dangerSoft, fg: colors.danger, icon: 'xmark.octagon.fill' },
  ok: { bg: colors.accentSoft, fg: colors.accent, icon: 'checkmark.circle.fill' },
  ai: { bg: colors.violetSoft, fg: colors.violet, icon: 'sparkles' },
};

export function Notice({ tone = 'info', title, children }: { tone?: Tone; title?: string; children?: React.ReactNode }) {
  const t = tones[tone];
  return (
    <View style={[styles.notice, { backgroundColor: t.bg }]} accessibilityRole="alert">
      <Icon name={t.icon} size={16} color={t.fg} />
      <View style={{ flex: 1 }}>
        {title ? <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 14.5, marginBottom: children ? 2 : 0 }}>{title}</Text> : null}
        {children ? <Text style={{ color: colors.inkSoft, fontSize: 13.5, lineHeight: 19 }}>{children}</Text> : null}
      </View>
    </View>
  );
}

export function Pill({ text, tone = 'info', icon }: { text: string; tone?: Tone; icon?: string }) {
  const t = tones[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      {icon ? <Icon name={icon} size={11} color={t.fg} /> : null}
      <Text style={{ color: t.fg, fontSize: 12, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

/** Small rounded icon square used in list rows. */
export function IconTile({ name, color = colors.accent, bg = colors.accentSoft }: { name: string; color?: string; bg?: string }) {
  return (
    <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={17} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', width: 360, height: 360, borderRadius: 360, opacity: 0.6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  button: { borderRadius: radius.md, minHeight: 54, paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16.5, fontWeight: '700', letterSpacing: -0.2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minHeight: 40,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.fieldBg,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  input: { flex: 1, fontSize: 16.5, color: colors.ink, paddingVertical: 14 },
  notice: { flexDirection: 'row', gap: 10, borderRadius: radius.sm, padding: space.md, marginBottom: space.md, alignItems: 'flex-start' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4, alignSelf: 'flex-start' },
});
