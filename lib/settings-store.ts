import { create } from 'zustand';
import { Appearance } from 'react-native';
import { storage } from './storage';

export type ThemeMode = 'system' | 'light' | 'dark';
export type Locale = 'en' | 'de';

type SettingsState = {
  themeMode: ThemeMode;
  isDark: boolean;
  locale: Locale;
  hydrated: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  setSystemDark: (dark: boolean) => void;
  setLocale: (locale: Locale) => void;
  hydrate: () => Promise<void>;
};

const KEY = 'settings.v1';

function resolveDark(mode: ThemeMode, system: boolean) {
  return mode === 'dark' || (mode === 'system' && system);
}

let systemIsDark = Appearance.getColorScheme() === 'dark';

export const useSettings = create<SettingsState>((set, get) => ({
  themeMode: 'system',
  isDark: resolveDark('system', systemIsDark),
  locale: 'en',
  hydrated: false,
  setThemeMode: (mode) => {
    set({ themeMode: mode, isDark: resolveDark(mode, systemIsDark) });
    void storage.set(KEY, JSON.stringify({ ...pick(get()), themeMode: mode }));
  },
  setLocale: (locale) => {
    set({ locale });
    void storage.set(KEY, JSON.stringify({ ...pick(get()), locale }));
  },
  setSystemDark: (dark) => {
    systemIsDark = dark;
    const { themeMode } = get();
    set({ isDark: resolveDark(themeMode, dark) });
  },
  hydrate: async () => {
    try {
      const raw = await storage.get(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<{ themeMode: ThemeMode; locale: Locale }>;
        const themeMode =
          parsed.themeMode === 'light' || parsed.themeMode === 'dark' ? parsed.themeMode : 'system';
        const locale = parsed.locale === 'de' ? 'de' : 'en';
        set({ themeMode, locale, isDark: resolveDark(themeMode, systemIsDark) });
      }
    } catch {}
    set({ hydrated: true });
  },
}));

function pick(s: SettingsState) {
  return { themeMode: s.themeMode, locale: s.locale };
}
