export const colors = {
  bg: '#F4F2EE',
  card: '#FFFFFF',
  ink: '#16181D',
  muted: '#6B6F78',
  line: '#E4E1DA',
  accent: '#0F6E62',
  accentSoft: '#DDEFEA',
  warn: '#A15C00',
  warnSoft: '#FCEFD9',
  danger: '#B42318',
  dangerSoft: '#FDE7E5',
  info: '#2F4FB3',
  infoSoft: '#E5EBFB',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 };

export const type = {
  hero: { fontSize: 44, fontWeight: '700' as const, letterSpacing: -1, color: colors.ink },
  h1: { fontSize: 26, fontWeight: '700' as const, letterSpacing: -0.4, color: colors.ink },
  h2: { fontSize: 17, fontWeight: '600' as const, color: colors.ink },
  body: { fontSize: 15, color: colors.ink, lineHeight: 21 },
  small: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '600' as const, color: colors.muted, letterSpacing: 0.6, textTransform: 'uppercase' as const },
};
