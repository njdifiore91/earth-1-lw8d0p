/**
 * API Configuration for Matter Satellite Data Product Matching Platform
 * @version 1.0.0
 * Implements enterprise-grade API configuration with enhanced error handling,
 * circuit breaker patterns, and retry policies
 */

// External imports
import axios, { AxiosInstance, AxiosError } from 'axios'; // v1.x

// Internal imports
import { 
  ApiRequestConfig, 
  RetryConfig, 
  ServiceConfig,
  CircuitBreakerConfig,
  ApiError,
  isApiError
} from '../types/api.types';
import { 
  API_ENDPOINTS, 
  API_ERROR_CODES, 
  HTTP_STATUS 
} from '../constants/api.constants';

/**
 * Base API configuration with security headers and validation
 */
const BASE_CONFIG: ApiRequestConfig = {
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Client-Version': import.meta.env.VITE_APP_VERSION,
    'X-Request-ID': crypto.randomUUID(),
  },
  validateStatus: (status: number) => status >= 200 && status < 300,
  withCredentials: true,
  responseType: 'json'
};

/**
 * Enhanced retry configuration with exponential backoff
 */
const RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  retryDelay: 1000,
  maxRetryDelay: 10000,
  exponentialBackoff: true,
  retryableStatuses: [
    HTTP_STATUS.SERVICE_UNAVAILABLE,
    HTTP_STATUS.SERVER_ERROR,
    429 // Too Many Requests
  ],
  shouldRetry: (error: ApiError) => {
    if (!error.code) return false;
    return ['NETWORK_ERROR', 'SERVER_ERROR', 'SERVICE_UNAVAILABLE'].includes(error.code);
  }
};

/**
 * Circuit breaker configuration for service health monitoring
 */
const CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeout: 60000,
  monitorInterval: 30000,
  healthCheckEndpoint: '/health'
};

/**
 * Service-specific configurations
 */
const SERVICE_CONFIGS: Record<string, ServiceConfig> = {
  auth: {
    baseURL: `${BASE_CONFIG.baseURL}${API_ENDPOINTS.AUTH.LOGIN}`,
    endpoints: API_ENDPOINTS.AUTH,
    timeout: 10000,
    retryPolicy: { ...RETRY_CONFIG, maxRetries: 1 },
    circuitBreaker: CIRCUIT_BREAKER_CONFIG,
    headers: { ...BASE_CONFIG.headers },
    rateLimit: { maxRequests: 100, perInterval: 60000 }
  },
  search: {
    baseURL: `${BASE_CONFIG.baseURL}${API_ENDPOINTS.SEARCH.CREATE}`,
    endpoints: API_ENDPOINTS.SEARCH,
    timeout: 45000,
    retryPolicy: RETRY_CONFIG,
    circuitBreaker: CIRCUIT_BREAKER_CONFIG,
    headers: { ...BASE_CONFIG.headers },
    rateLimit: { maxRequests: 200, perInterval: 60000 }
  },
  planning: {
    baseURL: `${BASE_CONFIG.baseURL}${API_ENDPOINTS.PLANNING.OPTIMIZE}`,
    endpoints: API_ENDPOINTS.PLANNING,
    timeout: 60000,
    retryPolicy: { ...RETRY_CONFIG, maxRetries: 5 },
    circuitBreaker: CIRCUIT_BREAKER_CONFIG,
    headers: { ...BASE_CONFIG.headers },
    rateLimit: { maxRequests: 150, perInterval: 60000 }
  },
  visualization: {
    baseURL: `${BASE_CONFIG.baseURL}${API_ENDPOINTS.VISUALIZATION.RENDER}`,
    endpoints: API_ENDPOINTS.VISUALIZATION,
    timeout: 30000,
    retryPolicy: RETRY_CONFIG,
    circuitBreaker: CIRCUIT_BREAKER_CONFIG,
    headers: { ...BASE_CONFIG.headers },
    rateLimit: { maxRequests: 300, perInterval: 60000 }
  }
};

/**
 * Creates an axios instance with enhanced error handling and retry capabilities
 */
export const createApiClient = (config: Partial<ApiRequestConfig> = {}): AxiosInstance => {
  const instance = axios.create({
    ...BASE_CONFIG,
    ...config
  });

  // Request interceptor for authentication and logging
  instance.interceptors.request.use(
    (config) => {
      config.headers['X-Request-Time'] = new Date().toISOString();
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Response interceptor for error handling and monitoring
  instance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config;
      
      if (!originalRequest) {
        return Promise.reject(error);
      }

      // Extract API error details
      const apiError = isApiError(error.response?.data) 
        ? error.response.data 
        : API_ERROR_CODES.SERVER_ERROR;

      // Retry logic with exponential backoff
      const retryCount = (originalRequest as any)._retryCount || 0;
      if (
        retryCount < RETRY_CONFIG.maxRetries && 
        RETRY_CONFIG.shouldRetry(apiError)
      ) {
        (originalRequest as any)._retryCount = retryCount + 1;
        const delay = Math.min(
          RETRY_CONFIG.retryDelay * Math.pow(2, retryCount),
          RETRY_CONFIG.maxRetryDelay
        );
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return instance(originalRequest);
      }

      return Promise.reject(apiError);
    }
  );

  return instance;
};

/**
 * Export configured API client instances for each service
 */
export const apiConfig = {
  baseConfig: BASE_CONFIG,
  retryConfig: RETRY_CONFIG,
  circuitBreakerConfig: CIRCUIT_BREAKER_CONFIG,
  serviceConfigs: SERVICE_CONFIGS,
  createClient: createApiClient
};

export default apiConfig;