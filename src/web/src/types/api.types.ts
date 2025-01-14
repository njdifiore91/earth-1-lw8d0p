// External imports - versions specified for dependency management
import { AxiosResponse } from 'axios'; // v1.x
import { Feature, FeatureCollection } from '@types/geojson'; // v7946.0.10

/**
 * Standard HTTP methods supported by the API
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

/**
 * Standardized API error codes with semantic meanings
 */
export type ApiErrorCode = 
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'NOT_FOUND'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'INVALID_REQUEST'
  | 'SERVICE_UNAVAILABLE'
  | 'TIMEOUT_ERROR';

/**
 * Available API service endpoints with versioning
 */
export enum ApiServiceEndpoint {
  AUTH_V1 = '/api/v1/auth',
  SEARCH_V1 = '/api/v1/search',
  PLANNING_V1 = '/api/v1/planning',
  VISUALIZATION_V1 = '/api/v1/visualization',
  EXPORT_V1 = '/api/v1/export',
  ADMIN_V1 = '/api/v1/admin'
}

/**
 * Enhanced configuration interface for API requests
 */
export interface ApiRequestConfig {
  baseURL: string;
  timeout: number;
  headers: Record<string, string>;
  retryConfig: RetryConfig;
  validateStatus: (status: number) => boolean;
  withCredentials: boolean;
  responseType: 'json' | 'blob' | 'text' | 'arraybuffer';
}

/**
 * Configuration for API retry behavior
 */
export interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  retryableStatuses: number[];
  exponentialBackoff: boolean;
  maxRetryDelay: number;
  shouldRetry: (error: ApiError) => boolean;
}

/**
 * Generic API response wrapper
 */
export interface ApiResponse<T> {
  data: T;
  status: number;
  message: string;
  timestamp: string;
  requestId: string;
}

/**
 * Enhanced API error interface
 */
export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details: Record<string, unknown>;
  stack?: string;
  timestamp: string;
}

/**
 * Generic paginated response wrapper
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
  sortBy: string | null;
  sortOrder: 'asc' | 'desc' | null;
}

/**
 * Search service type definitions
 */
export namespace SearchApiTypes {
  export interface SearchRequest {
    location: Feature | FeatureCollection;
    assetTypes: string[];
    parameters: SearchParameters;
    filters: SearchFilters;
    timeRange?: {
      start: string;
      end: string;
    };
  }

  export interface SearchResponse {
    results: Array<{
      id: string;
      score: number;
      confidence: number;
      assetType: string;
      metadata: Record<string, unknown>;
      geometry: Feature;
    }>;
    summary: {
      totalMatches: number;
      processingTime: number;
      coveragePercentage: number;
    };
  }

  export interface SearchParameters {
    minConfidence: number;
    maxResults: number;
    includeDrafts: boolean;
    priorityLevel: 'low' | 'medium' | 'high';
    optimizationCriteria: Array<'coverage' | 'time' | 'cost'>;
  }

  export interface SearchFilters {
    resolution?: {
      min: number;
      max: number;
      unit: 'meters' | 'feet';
    };
    cloudCover?: {
      max: number;
    };
    timeOfDay?: Array<'day' | 'night'>;
    seasons?: Array<'spring' | 'summer' | 'fall' | 'winter'>;
    customFilters?: Record<string, unknown>;
  }
}

/**
 * Type guard for checking if a response is paginated
 */
export function isPaginatedResponse<T>(response: unknown): response is PaginatedResponse<T> {
  return (
    typeof response === 'object' &&
    response !== null &&
    'items' in response &&
    'total' in response &&
    'page' in response
  );
}

/**
 * Type guard for checking if an error is an API error
 */
export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    'timestamp' in error
  );
}