import { lightTheme, darkTheme, type Theme } from './theme';
import { useSettings } from './settings-store';

export function useTheme(): Theme {
  const isDark = useSettings((s) => s.isDark);
  return isDark ? darkTheme : lightTheme;
}

export { darkTheme, lightTheme };
export type { Theme };
