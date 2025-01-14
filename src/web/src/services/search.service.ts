/**
 * Search Service for Matter Satellite Data Product Matching Platform
 * @version 1.0.0
 * Implements enterprise-grade search operations with enhanced error handling,
 * caching, and real-time updates for satellite data product matching
 */

// External imports - versions specified for dependency management
import { Feature, FeatureCollection } from '@types/geojson'; // v7946.0.10

// Internal imports
import { ApiResponse, SearchApiTypes } from '../types/api.types';
import { 
  SearchParameters, 
  SearchResult, 
  SearchState, 
  SearchStatus,
  SearchValidationRules,
  SearchError
} from '../types/search.types';
import { ApiService } from './api.service';
import { WebSocketService } from './websocket.service';
import { apiConfig } from '../config/api.config';

/**
 * Cache entry interface with TTL and validation
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  validUntil: number;
}

/**
 * Rate limiter configuration for search operations
 */
interface RateLimiterConfig {
  maxRequests: number;
  windowMs: number;
  perUser: boolean;
}

/**
 * Enterprise-grade search service implementation
 */
export class SearchService {
  private readonly apiService: ApiService;
  private readonly wsService: WebSocketService;
  private currentState: SearchState | null = null;
  private readonly searchCache: Map<string, CacheEntry<SearchResult>> = new Map();
  private readonly rateLimiter: Map<string, { count: number; resetTime: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly validationRules: SearchValidationRules = {
    minConfidence: 0.7,
    maxAreaSize: 1000000, // square kilometers
    requiredFields: ['location', 'timeWindow', 'assetType'],
    customValidators: {}
  };

  constructor(apiService: ApiService, wsService: WebSocketService) {
    this.apiService = apiService;
    this.wsService = wsService;
    this.setupWebSocketHandlers();
  }

  /**
   * Creates a new search with comprehensive validation and real-time updates
   */
  public async createSearch(parameters: SearchParameters): Promise<SearchResult> {
    try {
      // Validate rate limits
      this.checkRateLimit(parameters);

      // Validate search parameters
      this.validateSearchParameters(parameters);

      // Create search request
      const request: SearchApiTypes.SearchRequest = this.createSearchRequest(parameters);

      // Send request with retry logic
      const response = await this.apiService.request<SearchApiTypes.SearchResponse>(
        'POST',
        apiConfig.serviceConfigs.search.endpoints.CREATE,
        { data: request }
      );

      // Process and cache result
      const searchResult = this.processSearchResponse(response);
      this.cacheSearchResult(searchResult);

      // Setup real-time updates
      await this.setupRealtimeUpdates(searchResult.id);

      // Update current state
      this.updateSearchState({
        parameters,
        results: [searchResult],
        status: 'COMPLETED',
        error: null,
        loading: { parameters: false, results: false, filters: false },
        pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
        filters: {}
      });

      return searchResult;

    } catch (error) {
      this.handleSearchError(error);
      throw error;
    }
  }

  /**
   * Retrieves a search by ID with caching and validation
   */
  public async getSearchById(searchId: string): Promise<SearchResult> {
    try {
      // Check cache first
      const cached = this.getCachedResult(searchId);
      if (cached) return cached;

      // Fetch from API if not cached
      const response = await this.apiService.request<SearchApiTypes.SearchResponse>(
        'GET',
        `${apiConfig.serviceConfigs.search.endpoints.GET_BY_ID}/${searchId}`
      );

      const searchResult = this.processSearchResponse(response);
      this.cacheSearchResult(searchResult);

      return searchResult;

    } catch (error) {
      this.handleSearchError(error);
      throw error;
    }
  }

  /**
   * Updates search parameters with validation and real-time notification
   */
  public async updateSearchParameters(
    searchId: string,
    parameters: Partial<SearchParameters>
  ): Promise<SearchResult> {
    try {
      // Validate parameters
      this.validateSearchParameters({ ...this.currentState?.parameters, ...parameters });

      const response = await this.apiService.request<SearchApiTypes.SearchResponse>(
        'PUT',
        `${apiConfig.serviceConfigs.search.endpoints.GET_BY_ID}/${searchId}`,
        { data: parameters }
      );

      const searchResult = this.processSearchResponse(response);
      this.cacheSearchResult(searchResult);
      
      return searchResult;

    } catch (error) {
      this.handleSearchError(error);
      throw error;
    }
  }

  /**
   * Subscribes to real-time search updates with enhanced error handling
   */
  public async subscribeToUpdates(
    searchId: string,
    callback: (result: SearchResult) => void
  ): Promise<void> {
    try {
      await this.wsService.subscribeToSearch(
        searchId,
        (data) => {
          if (data) {
            const searchResult = this.processSearchResponse({ data });
            this.cacheSearchResult(searchResult);
            callback(searchResult);
          }
        },
        { retryOnError: true, timeout: 30000 }
      );
    } catch (error) {
      this.handleSearchError(error);
      throw error;
    }
  }

  /**
   * Unsubscribes from real-time updates with cleanup
   */
  public unsubscribeFromUpdates(searchId: string): void {
    this.wsService.unsubscribeFromSearch(searchId, () => {
      // Cleanup callback
      this.searchCache.delete(searchId);
    });
  }

  /**
   * Private helper methods
   */

  private setupWebSocketHandlers(): void {
    this.wsService.connect().catch(error => {
      console.error('WebSocket connection failed:', error);
    });
  }

  private validateSearchParameters(parameters: Partial<SearchParameters>): void {
    // Validate required fields
    for (const field of this.validationRules.requiredFields) {
      if (!(field in parameters)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate location size
    if (parameters.location) {
      const area = this.calculateArea(parameters.location);
      if (area > this.validationRules.maxAreaSize) {
        throw new Error('Search area exceeds maximum allowed size');
      }
    }

    // Run custom validators
    Object.entries(this.validationRules.customValidators).forEach(([key, validator]) => {
      if (!validator(parameters[key])) {
        throw new Error(`Validation failed for ${key}`);
      }
    });
  }

  private createSearchRequest(parameters: SearchParameters): SearchApiTypes.SearchRequest {
    return {
      location: parameters.location,
      assetTypes: [parameters.assetType],
      parameters: {
        minConfidence: this.validationRules.minConfidence,
        maxResults: 100,
        includeDrafts: false,
        priorityLevel: 'medium',
        optimizationCriteria: ['coverage', 'time', 'cost']
      },
      filters: {},
      timeRange: {
        start: parameters.timeWindow.start,
        end: parameters.timeWindow.end
      }
    };
  }

  private processSearchResponse(
    response: ApiResponse<SearchApiTypes.SearchResponse>
  ): SearchResult {
    const result = response.data.results[0];
    return {
      id: result.id,
      timestamp: new Date().toISOString(),
      location: result.geometry,
      confidence: result.confidence,
      recommendations: [],
      metadata: {
        assetId: result.assetType,
        collectionTime: new Date().toISOString(),
        processingLevel: 'standard',
        resolution: 0,
        costEstimate: 0,
        dataQuality: result.score
      },
      validation: {
        isValid: result.confidence >= this.validationRules.minConfidence,
        confidence: result.confidence,
        qualityScore: result.score,
        validationErrors: [],
        lastValidated: new Date().toISOString()
      },
      performance: {
        processingTime: response.data.summary.processingTime,
        coveragePercentage: response.data.summary.coveragePercentage,
        matchAccuracy: result.confidence,
        optimizationScore: result.score
      }
    };
  }

  private cacheSearchResult(result: SearchResult): void {
    this.searchCache.set(result.id, {
      data: result,
      timestamp: Date.now(),
      validUntil: Date.now() + this.CACHE_TTL
    });
  }

  private getCachedResult(searchId: string): SearchResult | null {
    const cached = this.searchCache.get(searchId);
    if (cached && Date.now() < cached.validUntil) {
      return cached.data;
    }
    return null;
  }

  private updateSearchState(state: SearchState): void {
    this.currentState = state;
  }

  private handleSearchError(error: unknown): void {
    const searchError: SearchError = {
      code: 'SEARCH_ERROR',
      message: error instanceof Error ? error.message : 'Unknown search error',
      details: { error },
      retry: true
    };

    this.updateSearchState({
      ...this.currentState!,
      error: searchError,
      status: 'FAILED'
    });
  }

  private async setupRealtimeUpdates(searchId: string): Promise<void> {
    await this.subscribeToUpdates(searchId, (result) => {
      if (this.currentState) {
        this.updateSearchState({
          ...this.currentState,
          results: [result],
          status: 'COMPLETED'
        });
      }
    });
  }

  private checkRateLimit(parameters: SearchParameters): void {
    const now = Date.now();
    const key = parameters.assetType;
    const limit = this.rateLimiter.get(key);

    if (!limit || now > limit.resetTime) {
      this.rateLimiter.set(key, { count: 1, resetTime: now + 60000 });
      return;
    }

    if (limit.count >= 100) {
      throw new Error('Rate limit exceeded');
    }

    limit.count++;
  }

  private calculateArea(location: Feature | FeatureCollection): number {
    // Implementation for area calculation
    return 0;
  }
}

export default SearchService;