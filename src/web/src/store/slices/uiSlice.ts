// External imports with version specifications
import { createSlice, PayloadAction } from '@reduxjs/toolkit'; // v1.9.5

// Internal imports
import { ThemeMode, Breakpoint } from '../../types/global';

/**
 * Interface for alert action configuration
 */
interface AlertAction {
  label: string;
  onClick: () => void;
}

/**
 * Interface for alert notifications
 */
interface Alert {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  autoClose: boolean;
  duration: number;
  action: AlertAction | null;
}

/**
 * Interface for user interface preferences
 */
interface UserPreferences {
  sidebarCollapsed: boolean;
  denseMode: boolean;
  tablesDensity: 'comfortable' | 'compact' | 'standard';
  mapStyle: string;
  alertsDuration: number;
}

/**
 * Interface for UI state
 */
interface UIState {
  theme: ThemeMode;
  sidebarOpen: boolean;
  activeModal: string | null;
  alerts: Alert[];
  loadingStates: Record<string, boolean>;
  breakpoint: Breakpoint;
  preferences: UserPreferences;
}

/**
 * Breakpoint configuration following Material Design 3.0
 */
export const BREAKPOINTS = {
  xs: 576,
  sm: 768,
  md: 992,
  lg: 1200,
  xl: 1536,
  '2xl': 1920
} as const;

/**
 * Alert duration presets in milliseconds
 */
export const ALERT_DURATIONS = {
  short: 3000,
  medium: 5000,
  long: 8000
} as const;

/**
 * Initial UI state configuration
 */
const initialState: UIState = {
  theme: 'system',
  sidebarOpen: true,
  activeModal: null,
  alerts: [],
  loadingStates: {},
  breakpoint: 'lg',
  preferences: {
    sidebarCollapsed: false,
    denseMode: false,
    tablesDensity: 'standard',
    mapStyle: 'light',
    alertsDuration: ALERT_DURATIONS.medium
  }
};

/**
 * UI slice with reducers for managing global UI state
 */
const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setTheme: (state, action: PayloadAction<ThemeMode>) => {
      state.theme = action.payload;
      localStorage.setItem('theme', action.payload);
      document.documentElement.setAttribute('data-theme', action.payload);
    },

    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
      if (state.breakpoint !== 'xs' && state.breakpoint !== 'sm') {
        state.preferences.sidebarCollapsed = !state.sidebarOpen;
      }
    },

    setActiveModal: (state, action: PayloadAction<string | null>) => {
      state.activeModal = action.payload;
      document.body.style.overflow = action.payload ? 'hidden' : 'auto';
    },

    addAlert: (state, action: PayloadAction<Omit<Alert, 'id'>>) => {
      const id = crypto.randomUUID();
      state.alerts.push({
        ...action.payload,
        id,
        duration: action.payload.duration || state.preferences.alertsDuration
      });
    },

    removeAlert: (state, action: PayloadAction<string>) => {
      state.alerts = state.alerts.filter(alert => alert.id !== action.payload);
    },

    setLoadingState: (state, action: PayloadAction<{ key: string; isLoading: boolean }>) => {
      const { key, isLoading } = action.payload;
      if (isLoading) {
        state.loadingStates[key] = true;
      } else {
        delete state.loadingStates[key];
      }
    },

    setBreakpoint: (state, action: PayloadAction<Breakpoint>) => {
      state.breakpoint = action.payload;
      // Automatically close sidebar on mobile breakpoints
      if (action.payload === 'xs' || action.payload === 'sm') {
        state.sidebarOpen = false;
      } else {
        state.sidebarOpen = !state.preferences.sidebarCollapsed;
      }
    },

    updatePreferences: (state, action: PayloadAction<Partial<UserPreferences>>) => {
      state.preferences = {
        ...state.preferences,
        ...action.payload
      };
      localStorage.setItem('uiPreferences', JSON.stringify(state.preferences));
    },

    clearAlerts: (state) => {
      state.alerts = [];
    },

    resetUI: (state) => {
      return {
        ...initialState,
        theme: state.theme, // Preserve theme setting
        preferences: state.preferences // Preserve user preferences
      };
    }
  }
});

// Export actions and reducer
export const {
  setTheme,
  toggleSidebar,
  setActiveModal,
  addAlert,
  removeAlert,
  setLoadingState,
  setBreakpoint,
  updatePreferences,
  clearAlerts,
  resetUI
} = uiSlice.actions;

export default uiSlice.reducer;

// Memoized selectors
export const selectTheme = (state: { ui: UIState }) => state.ui.theme;
export const selectSidebarOpen = (state: { ui: UIState }) => state.ui.sidebarOpen;
export const selectActiveModal = (state: { ui: UIState }) => state.ui.activeModal;
export const selectAlerts = (state: { ui: UIState }) => state.ui.alerts;
export const selectLoadingStates = (state: { ui: UIState }) => state.ui.loadingStates;
export const selectBreakpoint = (state: { ui: UIState }) => state.ui.breakpoint;
export const selectPreferences = (state: { ui: UIState }) => state.ui.preferences;