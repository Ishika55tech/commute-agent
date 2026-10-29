// "Night Transit" theme — dark, map-first, Liquid Glass surfaces with one
// luminous mint accent (route / go) and amber for warnings (rain, unsupported).

export const colors = {
  bg: '#07090D',
  bgElevated: '#0E1219',
  ink: '#F5F7FA',
  inkSoft: 'rgba(245,247,250,0.72)',
  muted: 'rgba(245,247,250,0.48)',
  faint: 'rgba(245,247,250,0.14)',
  hairline: 'rgba(255,255,255,0.12)',
  fieldBg: 'rgba(255,255,255,0.06)',

  accent: '#6BF2C5', // mint — "go", route, primary actions
  accentInk: '#04140E', // text on accent
  accentSoft: 'rgba(107,242,197,0.16)',
  accentGlow: 'rgba(107,242,197,0.35)',

  sky: '#7AA7FF', // travel time
  skySoft: 'rgba(122,167,255,0.18)',
  violet: '#B49BFF', // agent / AI
  violetSoft: 'rgba(180,155,255,0.18)',
  amber: '#FFC15E', // warnings, rain, buffer
  amberSoft: 'rgba(255,193,94,0.16)',
  danger: '#FF7A7A',
  dangerSoft: 'rgba(255,122,122,0.16)',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 12, md: 18, lg: 26, xl: 34, pill: 999 };

const tabular = { fontVariant: ['tabular-nums' as const] };

export const type = {
  display: { fontSize: 64, fontWeight: '800' as const, letterSpacing: -2.5, color: colors.ink, ...tabular },
  hero: { fontSize: 34, fontWeight: '800' as const, letterSpacing: -1, color: colors.ink },
  h1: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.6, color: colors.ink },
  h2: { fontSize: 19, fontWeight: '700' as const, letterSpacing: -0.3, color: colors.ink },
  stat: { fontSize: 22, fontWeight: '700' as const, color: colors.ink, ...tabular },
  body: { fontSize: 16, color: colors.ink, lineHeight: 22 },
  small: { fontSize: 13.5, color: colors.inkSoft, lineHeight: 19 },
  caption: { fontSize: 12, color: colors.muted },
  label: { fontSize: 11.5, fontWeight: '700' as const, color: colors.muted, letterSpacing: 1.2, textTransform: 'uppercase' as const },
};
