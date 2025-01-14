/// <reference types="vite/client" />

/**
 * Type definitions for Matter Platform environment variables
 * Extends Vite's base environment interface with application-specific configuration
 * @version 4.0.0
 */
interface ImportMetaEnv {
  /**
   * Application deployment mode
   * @example 'development' | 'staging' | 'production'
   */
  readonly VITE_MODE: string;

  /**
   * Base URL for Matter Platform API endpoints
   * @example 'https://api.matter.com/v1'
   */
  readonly VITE_API_BASE_URL: string;

  /**
   * Auth0 tenant domain for authentication
   * @example 'matter.auth0.com'
   */
  readonly VITE_AUTH0_DOMAIN: string;

  /**
   * Auth0 client ID for application authentication
   * @example 'abcdef123456'
   */
  readonly VITE_AUTH0_CLIENT_ID: string;

  /**
   * Auth0 API audience identifier
   * @example 'https://api.matter.com'
   */
  readonly VITE_AUTH0_AUDIENCE: string;

  /**
   * Mapbox access token for map visualization
   * @example 'pk.eyJ1IjoibWF0dGVyIiwiYSI6...'
   */
  readonly VITE_MAPBOX_ACCESS_TOKEN: string;

  /**
   * WebSocket server URL for real-time updates
   * @example 'wss://ws.matter.com'
   */
  readonly VITE_WEBSOCKET_URL: string;

  /**
   * Application logging level
   * @example 'debug' | 'info' | 'warn' | 'error'
   */
  readonly VITE_LOG_LEVEL: string;

  /**
   * Flag to enable mock API responses for development
   * @example 'true' | 'false'
   */
  readonly VITE_ENABLE_MOCK_API: string;

  /**
   * Flag to enable development debug tools
   * @example 'true' | 'false'
   */
  readonly VITE_ENABLE_DEBUG_TOOLS: string;
}

/**
 * Extended ImportMeta interface with Matter Platform environment type support
 * Provides type checking for environment variable access
 */
interface ImportMeta {
  readonly env: ImportMetaEnv;
}