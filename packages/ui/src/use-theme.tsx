import React from 'react';
import { useColorScheme } from 'react-native';
import { lightTheme, darkTheme, type Theme } from './theme';

const ThemeContext = React.createContext<Theme>(lightTheme);

export function UiThemeProvider({ children, theme }: { children: React.ReactNode; theme?: Theme }) {
  const system = useColorScheme();
  const value = theme ?? (system === 'dark' ? darkTheme : lightTheme);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return React.useContext(ThemeContext);
}
