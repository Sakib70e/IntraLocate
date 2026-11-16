import { Platform } from 'react-native';

// Monochrome Black & White Theme Tokens
// Clean, high-contrast, functional design system

export const theme = {
  colors: {
    surface: '#ffffff',
    surfaceDim: '#f5f5f5',
    surfaceBright: '#ffffff',
    surfaceContainerLowest: '#ffffff',
    surfaceContainerLow: '#fafafa',
    surfaceContainer: '#f4f4f4',
    surfaceContainerHigh: '#e5e5e5',
    surfaceContainerHighest: '#d4d4d4',
    onSurface: '#000000',
    onSurfaceVariant: '#444444',
    inverseSurface: '#000000',
    inverseOnSurface: '#ffffff',
    outline: '#000000',
    outlineVariant: '#cccccc',
    surfaceTint: '#000000',

    primary: '#000000',
    onPrimary: '#ffffff',
    primaryContainer: '#000000',
    onPrimaryContainer: '#ffffff',
    inversePrimary: '#ffffff',

    secondary: '#333333',
    onSecondary: '#ffffff',
    secondaryContainer: '#eeeeee',
    onSecondaryContainer: '#000000',

    tertiary: '#555555',
    onTertiary: '#ffffff',
    tertiaryContainer: '#f0f0f0',
    onTertiaryContainer: '#000000',

    error: '#000000',
    onError: '#ffffff',
    errorContainer: '#f0f0f0',
    onErrorContainer: '#000000',

    primaryFixed: '#000000',
    primaryFixedDim: '#222222',
    onPrimaryFixed: '#ffffff',

    background: '#ffffff',
    onBackground: '#000000',
    surfaceVariant: '#f0f0f0',
  },
  radius: {
    xs: 2,
    sm: 4,
    md: 6,
    lg: 8,
    xl: 12,
    full: 9999,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  typography: {
    codeFont: Platform?.OS === 'ios' ? 'Menlo' : 'monospace',
  },
};

export const stitchTheme = theme;
export default theme;
