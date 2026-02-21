/** Theme configuration and types */

export type ThemeMode = 'light' | 'dark' | 'auto';

export interface Theme {
  mode: ThemeMode;
  primaryColor: string;
  borderRadius: number;
  fontFamily: string;
}

export const defaultTheme: Theme = {
  mode: 'light',
  primaryColor: '#1890ff',
  borderRadius: 6,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial',
};

export const darkThemeColors = {
  primary: '#177ddc',
  text: '#d9d9d9',
  textSecondary: '#8c8c8c',
  background: '#141414',
  backgroundLighter: '#1f1f1f',
  border: '#303030',
  success: '#49aa19',
  warning: '#d89614',
  error: '#cf1322',
};

export const lightThemeColors = {
  primary: '#1890ff',
  text: '#000000d9',
  textSecondary: '#00000073',
  background: '#ffffff',
  backgroundLighter: '#f5f5f5',
  border: '#d9d9d9',
  success: '#52c41a',
  warning: '#faad14',
  error: '#ff4d4f',
};

export function getThemeColors(mode: ThemeMode): typeof darkThemeColors {
  return mode === 'dark' ? darkThemeColors : lightThemeColors;
}
