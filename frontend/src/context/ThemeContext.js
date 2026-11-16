import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_THEME = '@intralocate_theme_v1';

export const lightTheme = {
  isDark: false,
  bg: '#f5f5f5',
  bgCard: '#ffffff',
  bgInput: '#fafafa',
  bgHeader: '#ffffff',
  bgAlt: '#f0f0f0',
  bgBadgeActive: '#111111',
  bgBadgeInactive: '#ffffff',
  bgBuffer: '#f8f8f8',
  bgBuilding: '#f4f4f4',
  bgPreview: '#f8f8f8',
  bgEmpty: '#f8f8f8',
  bgModal: '#ffffff',
  bgPill: '#ffffff',
  bgPillActive: '#000000',
  bgBtnPrimary: '#111111',
  bgBtnSecondary: '#ffffff',
  bgBtnSmall: '#eeeeee',
  border: '#000000',
  borderMuted: '#cccccc',
  borderLight: '#dddddd',
  borderFaint: '#f0f0f0',
  text: '#000000',
  textSub: '#333333',
  textMuted: '#555555',
  textFaint: '#777777',
  textTiny: '#888888',
  textPlaceholder: '#999999',
  textLink: '#000000',
  textBtnPrimary: '#ffffff',
  textBtnSecondary: '#000000',
  textPillActive: '#ffffff',
  statusBar: 'dark-content',
  statusBarBg: '#ffffff',
  spinner: '#000000',
  spinnerOnDark: '#ffffff',
  tabBarBorderBottom: '#000000',
  splashBg: '#ffffff',
  splashText: '#000000',
  splashSub: '#666666',
};

export const darkTheme = {
  isDark: true,
  bg: '#0d0d0d',
  bgCard: '#1a1a1a',
  bgInput: '#242424',
  bgHeader: '#111111',
  bgAlt: '#222222',
  bgBadgeActive: '#e0e0e0',
  bgBadgeInactive: '#1a1a1a',
  bgBuffer: '#1e1e1e',
  bgBuilding: '#1f1f1f',
  bgPreview: '#1e1e1e',
  bgEmpty: '#1e1e1e',
  bgModal: '#1a1a1a',
  bgPill: '#1a1a1a',
  bgPillActive: '#e5e5e5',
  bgBtnPrimary: '#e5e5e5',
  bgBtnSecondary: '#1a1a1a',
  bgBtnSmall: '#2a2a2a',
  border: '#3a3a3a',
  borderMuted: '#2e2e2e',
  borderLight: '#2a2a2a',
  borderFaint: '#1e1e1e',
  text: '#f0f0f0',
  textSub: '#cccccc',
  textMuted: '#aaaaaa',
  textFaint: '#888888',
  textTiny: '#777777',
  textPlaceholder: '#666666',
  textLink: '#c0c0c0',
  textBtnPrimary: '#111111',
  textBtnSecondary: '#e0e0e0',
  textPillActive: '#111111',
  statusBar: 'light-content',
  statusBarBg: '#111111',
  spinner: '#e0e0e0',
  spinnerOnDark: '#111111',
  tabBarBorderBottom: '#3a3a3a',
  splashBg: '#0d0d0d',
  splashText: '#f0f0f0',
  splashSub: '#888888',
};

export const ThemeContext = createContext({ theme: darkTheme, isDark: true, toggleTheme: () => {} });

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_THEME).then((val) => {
      if (val !== null) {
        setIsDark(val === 'dark');
      }
    }).catch(() => {});
  }, []);

  const toggleTheme = async () => {
    const next = !isDark;
    setIsDark(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_THEME, next ? 'dark' : 'light');
    } catch (e) {}
  };

  const theme = isDark ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
