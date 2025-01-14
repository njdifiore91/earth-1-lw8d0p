// External imports with version specifications
import type { Map } from 'mapbox-gl'; // v2.x
import type { Feature, FeatureCollection } from '@types/geojson'; // v7946.0.10

// Internal imports
import type { ApiResponse } from './api.types';
import type { MapConfig } from './map.types';

/**
 * Extended Window interface with global properties and environment configuration
 */
declare global {
  interface Window {
    MAPBOX_ACCESS_TOKEN: string;
    API_BASE_URL: string;
    ENVIRONMENT: EnvironmentType;
    APP_VERSION: string;
    DEPLOYMENT_REGION: string;
    FEATURE_FLAGS: Record<FeatureFlag, boolean>;
  }
}

/**
 * Environment type definition
 */
export type EnvironmentType = 'development' | 'staging' | 'production' | 'test';

/**
 * Feature flag type definition
 */
export type FeatureFlag = 
  | 'enableBetaFeatures'
  | 'enableNewSearch'
  | 'enableAdvancedVisualization'
  | 'enablePerformanceMetrics'
  | 'enableDebugMode';

/**
 * Breakpoint type definition
 */
export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/**
 * Theme mode type definition with system preference support
 */
export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * Environment enumeration with staging support
 */
export enum Environment {
  DEVELOPMENT = 'development',
  STAGING = 'staging',
  PRODUCTION = 'production',
  TEST = 'test'
}

/**
 * Enhanced global application configuration interface
 */
export interface GlobalConfig {
  version: string;
  buildNumber: string;
  environment: EnvironmentType;
  features: Record<FeatureFlag, boolean>;
  region: string;
  debug: boolean;
  analytics: AnalyticsConfig;
  performance: PerformanceConfig;
}

/**
 * Analytics configuration interface
 */
interface AnalyticsConfig {
  enabled: boolean;
  trackingId: string;
  sampleRate: number;
  anonymizeIp: boolean;
  customDimensions: Record<string, string>;
}

/**
 * Performance configuration interface
 */
interface PerformanceConfig {
  enableMetrics: boolean;
  sampleRate: number;
  reportingEndpoint: string;
  bufferSize: number;
  flushInterval: number;
}

/**
 * Comprehensive theme configuration interface
 */
export interface ThemeConfig {
  mode: ThemeMode;
  colors: DeepReadonly<ColorPalette>;
  typography: TypographySystem;
  spacing: SpacingSystem;
  breakpoints: Record<Breakpoint, number>;
  animations: AnimationConfig;
  shadows: ShadowSystem;
}

/**
 * Color palette interface with semantic naming
 */
interface ColorPalette {
  primary: ColorShades;
  secondary: ColorShades;
  accent: ColorShades;
  neutral: ColorShades;
  success: ColorShades;
  warning: ColorShades;
  error: ColorShades;
  info: ColorShades;
}

/**
 * Color shades interface
 */
interface ColorShades {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
}

/**
 * Typography system interface
 */
interface TypographySystem {
  fontFamily: {
    sans: string;
    serif: string;
    mono: string;
  };
  fontSize: Record<string, string>;
  fontWeight: Record<string, number>;
  lineHeight: Record<string, number>;
  letterSpacing: Record<string, string>;
}

/**
 * Spacing system interface
 */
interface SpacingSystem {
  unit: number;
  scale: Record<number, string>;
  custom: Record<string, string>;
}

/**
 * Animation configuration interface
 */
interface AnimationConfig {
  duration: Record<string, number>;
  easing: Record<string, string>;
  transition: Record<string, string>;
}

/**
 * Shadow system interface
 */
interface ShadowSystem {
  sm: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
  inner: string;
  none: string;
}

/**
 * Deep readonly type utility
 */
type DeepReadonly<T> = {
  readonly [P in keyof T]: DeepReadonly<T[P]>;
};

/**
 * Module declarations for various file types
 */
declare module '*.svg' {
  const content: string;
  export default content;
}

declare module '*.png' {
  const content: string;
  export default content;
}

declare module '*.jpg' {
  const content: string;
  export default content;
}

declare module '*.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

/**
 * WebGL context attributes with performance preferences
 */
declare module 'webgl' {
  interface WebGLContextAttributes {
    powerPreference?: 'high-performance' | 'low-power' | 'default';
  }
}