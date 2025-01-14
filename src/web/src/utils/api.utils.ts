/**
 * Advanced API Utility Functions for Matter Satellite Platform
 * @version 1.0.0
 * Implements enterprise-grade API communication with enhanced error handling,
 * circuit breaker patterns, and satellite-specific transformations
 */

// External imports
import axios, { AxiosError, AxiosResponse } from 'axios'; // v1.x
import CircuitBreaker from 'opossum'; // v6.x

// Internal imports
import { 
  ApiResponse, 
  ApiError, 
  ApiRequestConfig, 
  SearchApiTypes 
} from '../types/api.types';
import { apiConfig } from '../config/api.config';
import { API_ERROR_CODES, HTTP_STATUS } from '../constants/api.constants';

/**
 * Enhanced retry configuration interface with satellite-specific options
 */
interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  retryableStatuses: number[];
  retryableSatelliteErrors: string[];
  enableExponentialBackoff: boolean;
}

/**
 * Type definition for API request options
 */
type ApiRequestOptions = Partial<ApiRequestConfig> & {
  retry?: RetryOptions;
  circuitBreaker?: {
    enabled: boolean;
    fallbackResponse?: unknown;
  };
  satellite?: {
    priority: 'low' | 'medium' | 'high';
    timeout?: number;
    validateSatelliteResponse?: boolean;
  };
};

/**
 * Circuit breaker instances for different services
 */
const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Creates or retrieves a circuit breaker instance for a service
 */
function getCircuitBreaker(serviceName: string): CircuitBreaker {
  if (!circuitBreakers.has(serviceName)) {
    const breaker = new CircuitBreaker(async (request: Promise<unknown>) => request, {
      timeout: apiConfig.circuitBreakerConfig.resetTimeout,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      name: serviceName
    });

    breaker.on('open', () => {
      console.warn(`Circuit breaker opened for service: ${serviceName}`);
    });

    breaker.on('halfOpen', () => {
      console.info(`Circuit breaker half-open for service: ${serviceName}`);
    });

    breaker.on('close', () => {
      console.info(`Circuit breaker closed for service: ${serviceName}`);
    });

    circuitBreakers.set(serviceName, breaker);
  }

  return circuitBreakers.get(serviceName)!;
}

/**
 * Advanced error handler with satellite-specific error mapping
 */
export function handleApiError(error: unknown, context?: Record<string, unknown>): ApiError {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiError>;
    const satelliteError = axiosError.response?.data?.satelliteErrorCode;

    if (satelliteError) {
      return {
        code: 'SATELLITE_ERROR',
        message: API_ERROR_CODES.SATELLITE_ERROR.message,
        details: {
          satelliteCode: satelliteError,
          originalError: axiosError.response?.data,
          context
        },
        timestamp: new Date().toISOString()
      };
    }

    return {
      code: axiosError.response?.status === HTTP_STATUS.SERVICE_UNAVAILABLE
        ? 'SERVICE_UNAVAILABLE'
        : 'NETWORK_ERROR',
      message: axiosError.message,
      details: {
        status: axiosError.response?.status,
        data: axiosError.response?.data,
        context
      },
      timestamp: new Date().toISOString()
    };
  }

  return {
    code: 'SERVER_ERROR',
    message: error instanceof Error ? error.message : 'Unknown error occurred',
    details: { error, context },
    timestamp: new Date().toISOString()
  };
}

/**
 * Creates a configured API request with advanced resilience patterns
 */
export async function createApiRequest<T>(
  options: ApiRequestOptions
): Promise<ApiResponse<T>> {
  const {
    retry = apiConfig.retryConfig,
    circuitBreaker = { enabled: true },
    satellite
  } = options;

  const config: ApiRequestConfig = {
    ...apiConfig.baseConfig,
    ...options,
    headers: {
      ...apiConfig.baseConfig.headers,
      ...options.headers,
      ...(satellite?.priority && { 'X-Priority': satellite.priority })
    }
  };

  const makeRequest = async (): Promise<AxiosResponse> => {
    let retryCount = 0;
    
    while (true) {
      try {
        const response = await axios(config);
        return response;
      } catch (error) {
        const apiError = handleApiError(error, { retryCount, config });

        const shouldRetry = 
          retryCount < retry.maxRetries &&
          (retry.retryableStatuses.includes(apiError.details.status as number) ||
           retry.retryableSatelliteErrors.includes(apiError.details.satelliteCode as string));

        if (!shouldRetry) {
          throw apiError;
        }

        const delay = retry.enableExponentialBackoff
          ? Math.min(retry.baseDelay * Math.pow(2, retryCount), retry.maxDelay)
          : retry.baseDelay;

        await new Promise(resolve => setTimeout(resolve, delay));
        retryCount++;
      }
    }
  };

  if (circuitBreaker.enabled) {
    const breaker = getCircuitBreaker(config.baseURL || 'default');
    
    try {
      const response = await breaker.fire(makeRequest);
      return transformResponse<T>(response, { satellite });
    } catch (error) {
      if (circuitBreaker.fallbackResponse !== undefined) {
        return {
          data: circuitBreaker.fallbackResponse as T,
          status: HTTP_STATUS.OK,
          message: 'Fallback response due to circuit breaker',
          timestamp: new Date().toISOString(),
          requestId: config.headers['X-Request-ID']
        };
      }
      throw error;
    }
  }

  const response = await makeRequest();
  return transformResponse<T>(response, { satellite });
}

/**
 * Advanced response transformer with satellite-specific handling
 */
export function transformResponse<T>(
  response: AxiosResponse,
  options?: { satellite?: ApiRequestOptions['satellite'] }
): ApiResponse<T> {
  const { data, status, headers } = response;

  // Validate satellite-specific response format if required
  if (options?.satellite?.validateSatelliteResponse) {
    validateSatelliteResponse(data);
  }

  return {
    data: data as T,
    status,
    message: data.message || 'Success',
    timestamp: new Date().toISOString(),
    requestId: headers['x-request-id'],
    ...(data.metadata && { metadata: data.metadata })
  };
}

/**
 * Validates satellite-specific response format
 */
function validateSatelliteResponse(data: unknown): void {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid satellite response format');
  }

  const requiredFields = ['data', 'metadata', 'timestamp'];
  for (const field of requiredFields) {
    if (!(field in data)) {
      throw new Error(`Missing required field in satellite response: ${field}`);
    }
  }
}

/**
 * Type guard for satellite-specific error responses
 */
export function isSatelliteError(error: unknown): error is ApiError & { satelliteErrorCode: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'satelliteErrorCode' in error
  );
}