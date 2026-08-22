export const palette = {
  brand50: '#eef4ff',
  brand100: '#dbe7fe',
  brand200: '#bfd3fe',
  brand300: '#93b4fd',
  brand400: '#6090fa',
  brand500: '#3b6ef6',
  brand600: '#2551eb',
  brand700: '#1d40d8',
  brand800: '#1e36af',
  brand900: '#1e328a',
  gray0: '#ffffff',
  gray50: '#f8fafc',
  gray100: '#f1f5f9',
  gray200: '#e2e8f0',
  gray300: '#cbd5e1',
  gray400: '#94a3b8',
  gray500: '#64748b',
  gray600: '#475569',
  gray700: '#334155',
  gray800: '#1e293b',
  gray900: '#0f172a',
  gray950: '#080c15',
  green100: '#dcfce7',
  green700: '#15803d',
  red100: '#fee2e2',
  red700: '#b91c1c',
  amber100: '#fef3c7',
  amber800: '#92400e',
};

export const spacing = (n: number) => n * 4;

export type Theme = {
  dark: boolean;
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryForeground: string;
  danger: string;
  success: string;
  tabBar: string;
};

export const lightTheme: Theme = {
  dark: false,
  background: palette.gray50,
  surface: palette.gray0,
  surfaceAlt: palette.gray100,
  border: palette.gray200,
  text: palette.gray900,
  textMuted: palette.gray500,
  primary: palette.brand600,
  primaryForeground: palette.gray0,
  danger: palette.red700,
  success: palette.green700,
  tabBar: palette.gray0,
};

export const darkTheme: Theme = {
  dark: true,
  background: palette.gray950,
  surface: palette.gray900,
  surfaceAlt: palette.gray800,
  border: palette.gray800,
  text: palette.gray50,
  textMuted: palette.gray400,
  primary: palette.brand500,
  primaryForeground: palette.gray0,
  danger: '#f87171',
  success: '#4ade80',
  tabBar: palette.gray900,
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 999 };

export const typography = {
  display: { fontSize: 32, fontWeight: '800' as const },
  h1: { fontSize: 26, fontWeight: '700' as const },
  h2: { fontSize: 20, fontWeight: '700' as const },
  h3: { fontSize: 16, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  small: { fontSize: 13, fontWeight: '400' as const },
};
