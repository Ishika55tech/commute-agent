// Liquid Glass surface. iOS 26+: native `GlassView` (expo-glass-effect).
// Older iOS / Android: `BlurView` (expo-blur) with a hairline border, so the
// app looks consistent everywhere. Both modules ship in Expo Go.

import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius as R } from './theme';

let liquid: boolean | null = null;
/** Guarded: some iOS 26 betas lack the API and crash (expo/expo#40911). */
export function hasLiquidGlass(): boolean {
  if (liquid === null) {
    try {
      liquid = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
    } catch {
      liquid = false;
    }
  }
  return liquid;
}

type Props = {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  tint?: string;
  interactive?: boolean;
  /** 'clear' is more transparent — good over maps. */
  variant?: 'regular' | 'clear';
};

export function Glass({ children, style, radius = R.lg, tint, interactive, variant = 'regular' }: Props) {
  if (hasLiquidGlass()) {
    return (
      <GlassView
        glassEffectStyle={variant}
        colorScheme="dark"
        tintColor={tint}
        isInteractive={interactive}
        style={[{ borderRadius: radius, overflow: 'hidden' }, style]}
      >
        {children}
      </GlassView>
    );
  }
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden' }, style]}>
      <BlurView
        intensity={variant === 'clear' ? 35 : 60}
        tint="systemChromeMaterialDark"
        style={StyleSheet.absoluteFill}
      />
      {tint ? <View style={[StyleSheet.absoluteFill, { backgroundColor: tint, opacity: 0.25 }]} /> : null}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline }]}
      />
      {children}
    </View>
  );
}
