/**
 * Core API Service for Matter Satellite Data Product Matching Platform
 * @version 1.0.0
 * Implements enterprise-grade API communication with enhanced satellite operation support,
 * circuit breaker patterns, and standardized error handling
 */

// External imports
import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios'; // v1.x
import CircuitBreaker from 'opossum'; // v6.x

// Internal imports
import { 
  ApiResponse, 
  ApiError, 
  ApiRequestConfig, 
  HttpMethod, 
  ApiServiceEndpoint,
  SearchApiTypes
} from '../types/api.types';
import { 
  apiConfig, 
  createApiClient, 
  circuitBreakerConfig 
} from '../config/api.config';
import { 
  handleApiError, 
  transformResponse, 
  createApiRequest, 
  isSatelliteError 
} from '../utils/api.utils';
import { API_ERROR_CODES, HTTP_STATUS } from '../constants/api.constants';

/**
 * Cache configuration interface
 */
interface CacheConfig {
  ttl: number;
  maxSize: number;
  enabled: boolean;
}

/**
 * Core API service class for handling all HTTP communication
 */
export class ApiService {
  private readonly apiClient: AxiosInstance;
  private readonly config: ApiRequestConfig;
  private readonly circuitBreakers: Map<string, CircuitBreaker>;
  private readonly requestCache: Map<string, { data: any; timestamp: number }>;
  private readonly cacheConfig: CacheConfig;

  constructor(config: Partial<ApiRequestConfig> = {}) {
    // Initialize configuration
    this.config = {
      ...apiConfig.baseConfig,
      ...config
    };

    // Initialize API client with enhanced configuration
    this.apiClient = createApiClient(this.config);

    // Initialize circuit breakers map
    this.circuitBreakers = new Map();

    // Initialize request cache with configuration
    this.cacheConfig = {
      ttl: 300000, // 5 minutes
      maxSize: 1000,
      enabled: true
    };
    this.requestCache = new Map();

    // Configure request interceptors
    this.setupRequestInterceptors();

    // Configure response interceptors
    this.setupResponseInterceptors();
  }

  /**
   * Generic request method with circuit breaker and satellite operation support
   */
  public async request<T>(
    method: HttpMethod,
    endpoint: string,
    config: Partial<ApiRequestConfig> = {}
  ): Promise<ApiResponse<T>> {
    const requestKey = this.generateCacheKey(method, endpoint, config);

    // Check cache for GET requests
    if (method === 'GET' && this.cacheConfig.enabled) {
      const cachedResponse = this.getCachedResponse<T>(requestKey);
      if (cachedResponse) {
        return cachedResponse;
      }
    }

    // Get or create circuit breaker for endpoint
    const breaker = this.getCircuitBreaker(endpoint);

    try {
      // Create request configuration
      const requestConfig = this.createRequestConfig(method, endpoint, config);

      // Execute request through circuit breaker
      const response = await breaker.fire<AxiosResponse>(() =>
        this.apiClient.request(requestConfig)
      );

      // Transform and cache response
      const transformedResponse = transformResponse<T>(response, {
        satellite: config.satellite
      });

      if (method === 'GET' && this.cacheConfig.enabled) {
        this.cacheResponse(requestKey, transformedResponse);
      }

      return transformedResponse;
    } catch (error) {
      // Handle satellite-specific errors
      if (isSatelliteError(error)) {
        throw {
          ...error,
          details: {
            ...error.details,
            endpoint,
            requestConfig: config
          }
        };
      }

      throw handleApiError(error, {
        method,
        endpoint,
        config
      });
    }
  }

  /**
   * Setup request interceptors for compression and monitoring
   */
  private setupRequestInterceptors(): void {
    this.apiClient.interceptors.request.use(
      (config) => {
        // Add compression for large payloads
        if (config.data && JSON.stringify(config.data).length > 1024 * 10) {
          config.headers['Content-Encoding'] = 'gzip';
          config.transformRequest = [(data) => this.compressData(data)];
        }

        // Add monitoring headers
        config.headers['X-Request-Time'] = new Date().toISOString();
        config.headers['X-Request-ID'] = crypto.randomUUID();

        return config;
      },
      (error) => Promise.reject(handleApiError(error))
    );
  }

  /**
   * Setup response interceptors for error handling and metrics
   */
  private setupResponseInterceptors(): void {
    this.apiClient.interceptors.response.use(
      (response) => {
        // Update metrics
        this.updateMetrics(response);
        return response;
      },
      async (error: AxiosError) => {
        // Handle satellite-specific errors
        if (isSatelliteError(error.response?.data)) {
          return Promise.reject({
            ...API_ERROR_CODES.SATELLITE_ERROR,
            details: error.response?.data
          });
        }

        // Handle general errors
        return Promise.reject(handleApiError(error));
      }
    );
  }

  /**
   * Get or create circuit breaker for endpoint
   */
  private getCircuitBreaker(endpoint: string): CircuitBreaker {
    if (!this.circuitBreakers.has(endpoint)) {
      const breaker = new CircuitBreaker(
        async (request: Promise<unknown>) => request,
        {
          ...circuitBreakerConfig,
          name: endpoint
        }
      );

      breaker.on('open', () => {
        console.warn(`Circuit breaker opened for endpoint: ${endpoint}`);
      });

      this.circuitBreakers.set(endpoint, breaker);
    }

    return this.circuitBreakers.get(endpoint)!;
  }

  /**
   * Generate cache key for request
   */
  private generateCacheKey(
    method: HttpMethod,
    endpoint: string,
    config: Partial<ApiRequestConfig>
  ): string {
    return `${method}:${endpoint}:${JSON.stringify(config.params || {})}`;
  }

  /**
   * Get cached response if valid
   */
  private getCachedResponse<T>(key: string): ApiResponse<T> | null {
    const cached = this.requestCache.get(key);
    if (
      cached &&
      Date.now() - cached.timestamp < this.cacheConfig.ttl
    ) {
      return cached.data;
    }
    return null;
  }

  /**
   * Cache response with TTL
   */
  private cacheResponse(key: string, response: ApiResponse<any>): void {
    // Implement LRU cache eviction if needed
    if (this.requestCache.size >= this.cacheConfig.maxSize) {
      const oldestKey = this.requestCache.keys().next().value;
      this.requestCache.delete(oldestKey);
    }

    this.requestCache.set(key, {
      data: response,
      timestamp: Date.now()
    });
  }

  /**
   * Create request configuration with defaults
   */
  private createRequestConfig(
    method: HttpMethod,
    endpoint: string,
    config: Partial<ApiRequestConfig>
  ): ApiRequestConfig {
    return {
      ...this.config,
      ...config,
      method,
      url: endpoint,
      headers: {
        ...this.config.headers,
        ...config.headers
      }
    };
  }

  /**
   * Compress request data if needed
   */
  private compressData(data: any): any {
    // Implement compression logic here
    return data;
  }

  /**
   * Update metrics for monitoring
   */
  private updateMetrics(response: AxiosResponse): void {
    // Implement metrics collection logic here
  }
}

export default ApiService;