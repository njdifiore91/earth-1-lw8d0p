// @mui/material v5.x
import { createTheme, ThemeOptions } from '@mui/material';
import { useMediaQuery } from '@mui/material';

// Internal imports
import { ThemeConfig } from '../types/global';

/**
 * Typography scale following Material Design 3.0 guidelines
 * Implements responsive scaling for different screen sizes
 */
const TYPOGRAPHY_SCALE = {
  h1: {
    fontSize: '32px',
    lineHeight: 1.2,
    fontWeight: 700,
    mobileSize: '28px',
  },
  h2: {
    fontSize: '24px',
    lineHeight: 1.3,
    fontWeight: 600,
    mobileSize: '22px',
  },
  h3: {
    fontSize: '20px',
    lineHeight: 1.4,
    fontWeight: 600,
    mobileSize: '18px',
  },
  h4: {
    fontSize: '16px',
    lineHeight: 1.5,
    fontWeight: 500,
    mobileSize: '16px',
  },
  body1: {
    fontSize: '14px',
    lineHeight: 1.6,
    fontWeight: 400,
    mobileSize: '14px',
  },
  body2: {
    fontSize: '12px',
    lineHeight: 1.6,
    fontWeight: 400,
    mobileSize: '12px',
  },
} as const;

/**
 * Base spacing unit following 8px grid system
 */
const SPACING_UNIT = 8;

/**
 * Color palette with WCAG 2.1 Level AA compliant contrast ratios
 */
const COLOR_PALETTE = {
  light: {
    primary: {
      main: '#1976d2',
      light: '#42a5f5',
      dark: '#1565c0',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#9c27b0',
      light: '#ba68c8',
      dark: '#7b1fa2',
      contrastText: '#ffffff',
    },
    error: {
      main: '#d32f2f',
      light: '#ef5350',
      dark: '#c62828',
      contrastText: '#ffffff',
    },
    warning: {
      main: '#ed6c02',
      light: '#ff9800',
      dark: '#e65100',
      contrastText: '#ffffff',
    },
    info: {
      main: '#0288d1',
      light: '#03a9f4',
      dark: '#01579b',
      contrastText: '#ffffff',
    },
    success: {
      main: '#2e7d32',
      light: '#4caf50',
      dark: '#1b5e20',
      contrastText: '#ffffff',
    },
    background: {
      default: '#ffffff',
      paper: '#f5f5f5',
    },
    text: {
      primary: 'rgba(0, 0, 0, 0.87)',
      secondary: 'rgba(0, 0, 0, 0.6)',
      disabled: 'rgba(0, 0, 0, 0.38)',
    },
  },
  dark: {
    primary: {
      main: '#42a5f5',
      light: '#90caf9',
      dark: '#1565c0',
      contrastText: '#000000',
    },
    secondary: {
      main: '#ba68c8',
      light: '#e1bee7',
      dark: '#7b1fa2',
      contrastText: '#000000',
    },
    error: {
      main: '#ef5350',
      light: '#ff8a80',
      dark: '#c62828',
      contrastText: '#000000',
    },
    warning: {
      main: '#ff9800',
      light: '#ffb74d',
      dark: '#f57c00',
      contrastText: '#000000',
    },
    info: {
      main: '#03a9f4',
      light: '#4fc3f7',
      dark: '#0288d1',
      contrastText: '#000000',
    },
    success: {
      main: '#4caf50',
      light: '#81c784',
      dark: '#388e3c',
      contrastText: '#000000',
    },
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
    text: {
      primary: 'rgba(255, 255, 255, 0.87)',
      secondary: 'rgba(255, 255, 255, 0.6)',
      disabled: 'rgba(255, 255, 255, 0.38)',
    },
  },
} as const;

/**
 * Responsive breakpoints following Material Design guidelines
 */
const BREAKPOINTS = {
  xs: '0px',
  sm: '576px',
  md: '768px',
  lg: '992px',
  xl: '1200px',
} as const;

/**
 * Creates a Material UI theme with WCAG 2.1 Level AA compliance
 * @param config Theme configuration options
 * @returns Material UI theme object
 */
export const createAppTheme = (config: ThemeConfig) => {
  // Detect system color scheme preference
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  
  // Get active theme mode
  const activeMode = config.mode === 'system' 
    ? (prefersDarkMode ? 'dark' : 'light')
    : config.mode;

  // Create theme options
  const themeOptions: ThemeOptions = {
    palette: {
      mode: activeMode,
      ...COLOR_PALETTE[activeMode],
    },
    typography: {
      fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
      ...Object.entries(TYPOGRAPHY_SCALE).reduce((acc, [key, value]) => ({
        ...acc,
        [key]: {
          fontSize: value.fontSize,
          lineHeight: value.lineHeight,
          fontWeight: value.fontWeight,
          '@media (max-width:768px)': {
            fontSize: value.mobileSize,
          },
        },
      }), {}),
    },
    spacing: SPACING_UNIT,
    breakpoints: {
      values: Object.entries(BREAKPOINTS).reduce((acc, [key, value]) => ({
        ...acc,
        [key]: parseInt(value),
      }), {}),
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            minHeight: 48, // Ensures touch target size for accessibility
            fontWeight: 500,
          },
        },
      },
      MuiTextField: {
        defaultProps: {
          variant: 'outlined',
          fullWidth: true,
        },
        styleOverrides: {
          root: {
            '& label': {
              lineHeight: 1.4,
            },
          },
        },
      },
      MuiLink: {
        defaultProps: {
          underline: 'hover',
        },
        styleOverrides: {
          root: {
            fontWeight: 500,
          },
        },
      },
    },
  };

  return createTheme(themeOptions);
};

/**
 * Default theme configuration with accessibility compliance
 */
export const defaultTheme = createAppTheme({
  mode: 'system',
  colors: COLOR_PALETTE,
  typography: TYPOGRAPHY_SCALE,
  spacing: SPACING_UNIT,
  breakpoints: BREAKPOINTS,
});