/**
 * API Constants for Matter Satellite Data Product Matching Platform
 * @version 1.0.0
 * Defines comprehensive API endpoints, error codes, and HTTP status codes
 * with type safety and immutability for all microservices
 */

// Type definitions for API endpoints with path parameters
type PathParams<T extends string> = T extends `${infer Start}:${infer Param}/${infer Rest}`
  ? { [K in Param]: string } & PathParams<Rest>
  : T extends `${infer Start}:${infer Param}`
  ? { [K in Param]: string }
  : {};

// API Endpoints interface definitions
interface IAuthEndpoints {
  readonly LOGIN: '/auth/login';
  readonly LOGOUT: '/auth/logout';
  readonly REFRESH: '/auth/refresh';
  readonly PROFILE: '/auth/profile';
  readonly MFA: '/auth/mfa';
  readonly SSO: '/auth/sso';
}

interface ISearchEndpoints {
  readonly CREATE: '/search';
  readonly GET_BY_ID: '/search/:id';
  readonly LIST: '/search/list';
  readonly DELETE: '/search/:id';
  readonly SAVE: '/search/:id/save';
  readonly HISTORY: '/search/history';
  readonly FAVORITES: '/search/favorites';
}

interface IPlanningEndpoints {
  readonly OPTIMIZE: '/planning/optimize';
  readonly SIMULATE: '/planning/simulate';
  readonly REQUIREMENTS: '/planning/requirements';
  readonly CAPABILITIES: '/planning/capabilities';
  readonly CONSTRAINTS: '/planning/constraints';
  readonly SCHEDULE: '/planning/schedule';
}

interface IVisualizationEndpoints {
  readonly RENDER: '/visualization/render';
  readonly EXPORT: '/visualization/export';
  readonly TIMELINE: '/visualization/timeline';
  readonly MATRIX: '/visualization/matrix';
  readonly HEATMAP: '/visualization/heatmap';
  readonly COVERAGE: '/visualization/coverage';
}

interface IEarthNEndpoints {
  readonly SIMULATE: '/earth-n/simulate';
  readonly OPTIMIZE: '/earth-n/optimize';
  readonly STATUS: '/earth-n/status';
  readonly RESULTS: '/earth-n/results/:id';
}

interface IMapsEndpoints {
  readonly GEOCODE: '/maps/geocode';
  readonly REVERSE_GEOCODE: '/maps/reverse-geocode';
  readonly TILES: '/maps/tiles/:z/:x/:y';
  readonly FEATURES: '/maps/features/:id';
}

// Error code interface definitions
interface IApiError {
  readonly code: string;
  readonly message: string;
  readonly details: string;
}

// API endpoints constant with type safety
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    PROFILE: '/auth/profile',
    MFA: '/auth/mfa',
    SSO: '/auth/sso'
  } as const satisfies IAuthEndpoints,

  SEARCH: {
    CREATE: '/search',
    GET_BY_ID: '/search/:id',
    LIST: '/search/list',
    DELETE: '/search/:id',
    SAVE: '/search/:id/save',
    HISTORY: '/search/history',
    FAVORITES: '/search/favorites'
  } as const satisfies ISearchEndpoints,

  PLANNING: {
    OPTIMIZE: '/planning/optimize',
    SIMULATE: '/planning/simulate',
    REQUIREMENTS: '/planning/requirements',
    CAPABILITIES: '/planning/capabilities',
    CONSTRAINTS: '/planning/constraints',
    SCHEDULE: '/planning/schedule'
  } as const satisfies IPlanningEndpoints,

  VISUALIZATION: {
    RENDER: '/visualization/render',
    EXPORT: '/visualization/export',
    TIMELINE: '/visualization/timeline',
    MATRIX: '/visualization/matrix',
    HEATMAP: '/visualization/heatmap',
    COVERAGE: '/visualization/coverage'
  } as const satisfies IVisualizationEndpoints,

  EARTH_N: {
    SIMULATE: '/earth-n/simulate',
    OPTIMIZE: '/earth-n/optimize',
    STATUS: '/earth-n/status',
    RESULTS: '/earth-n/results/:id'
  } as const satisfies IEarthNEndpoints,

  MAPS: {
    GEOCODE: '/maps/geocode',
    REVERSE_GEOCODE: '/maps/reverse-geocode',
    TILES: '/maps/tiles/:z/:x/:y',
    FEATURES: '/maps/features/:id'
  } as const satisfies IMapsEndpoints
} as const;

// API error codes with type safety
export const API_ERROR_CODES = {
  VALIDATION_ERROR: {
    code: 'VALIDATION_ERROR',
    message: 'Invalid input parameters',
    details: 'Validation failed for the provided input'
  },
  AUTHENTICATION_ERROR: {
    code: 'AUTHENTICATION_ERROR',
    message: 'Authentication failed',
    details: 'Invalid credentials or session expired'
  },
  AUTHORIZATION_ERROR: {
    code: 'AUTHORIZATION_ERROR',
    message: 'Insufficient permissions',
    details: 'User does not have required access rights'
  },
  NOT_FOUND: {
    code: 'NOT_FOUND',
    message: 'Resource not found',
    details: 'The requested resource does not exist'
  },
  SERVER_ERROR: {
    code: 'SERVER_ERROR',
    message: 'Internal server error',
    details: 'An unexpected error occurred'
  },
  NETWORK_ERROR: {
    code: 'NETWORK_ERROR',
    message: 'Network communication error',
    details: 'Failed to communicate with the server'
  },
  SATELLITE_ERROR: {
    code: 'SATELLITE_ERROR',
    message: 'Satellite operation error',
    details: 'Error in satellite data processing'
  },
  OPTIMIZATION_ERROR: {
    code: 'OPTIMIZATION_ERROR',
    message: 'Optimization failed',
    details: 'Failed to optimize collection parameters'
  },
  SIMULATION_ERROR: {
    code: 'SIMULATION_ERROR',
    message: 'Simulation failed',
    details: 'Error in EARTH-n simulation'
  }
} as const satisfies Record<string, IApiError>;

// HTTP status codes with type safety
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
} as const;

// Type exports for path parameter extraction
export type ExtractPathParams<T extends string> = PathParams<T>;

// Type exports for endpoint paths
export type AuthEndpoints = typeof API_ENDPOINTS.AUTH;
export type SearchEndpoints = typeof API_ENDPOINTS.SEARCH;
export type PlanningEndpoints = typeof API_ENDPOINTS.PLANNING;
export type VisualizationEndpoints = typeof API_ENDPOINTS.VISUALIZATION;
export type EarthNEndpoints = typeof API_ENDPOINTS.EARTH_N;
export type MapsEndpoints = typeof API_ENDPOINTS.MAPS;

// Type exports for error codes
export type ApiErrorCode = keyof typeof API_ERROR_CODES;
export type ApiError = typeof API_ERROR_CODES[ApiErrorCode];

// Type exports for HTTP status codes
export type HttpStatus = typeof HTTP_STATUS[keyof typeof HTTP_STATUS];