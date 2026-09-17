export const palette = {
  bg: '#f6f7fb',
  surface: '#ffffff',
  surfaceAlt: '#f1f5f9',
  border: '#e2e8f0',
  text: '#0f172a',
  muted: '#64748b',
  faint: '#94a3b8',
  brand: '#4f46e5',
  brandSoft: '#eef2ff',
  gain: '#16a34a',
  gainSoft: '#f0fdf4',
  loss: '#dc2626',
  lossSoft: '#fef2f2',
  warn: '#d97706',
  warnSoft: '#fffbeb',
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 22 } as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

import { Platform, type ViewStyle } from 'react-native';

// react-native-web has deprecated the shadow* props in favour of boxShadow.
export const shadow: ViewStyle = Platform.select({
  web: { boxShadow: '0 4px 12px rgba(15, 23, 42, 0.06)' },
  default: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
}) as ViewStyle;
