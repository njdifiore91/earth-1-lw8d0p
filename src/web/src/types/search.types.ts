// External imports - version specified for dependency management
import { Feature, FeatureCollection } from '@types/geojson'; // v7946.0.10

// Internal imports
import { ApiResponse, SearchApiTypes } from './api.types';
import { MapState, LayerType } from './map.types';

/**
 * Date range type for search time windows
 */
export type DateRange = {
  start: string;
  end: string;
  timezone?: string;
};

/**
 * Available asset types for satellite data products
 */
export type AssetType = 
  | 'ENVIRONMENTAL_MONITORING'
  | 'INFRASTRUCTURE'
  | 'AGRICULTURE'
  | 'CUSTOM';

/**
 * Search validation rules interface
 */
export interface SearchValidationRules {
  minConfidence: number;
  maxAreaSize: number;
  requiredFields: string[];
  customValidators: Record<string, (value: unknown) => boolean>;
}

/**
 * Search constraints interface
 */
export interface SearchConstraints {
  type: string;
  value: number | string | boolean;
  operator: 'equals' | 'greaterThan' | 'lessThan' | 'between' | 'contains';
  unit?: string;
}

/**
 * Search priority levels
 */
export type SearchPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Enhanced interface for search requirement specifications
 */
export interface SearchRequirements {
  minimumSize: number;
  detectionLimit: number;
  adjacentRecommendations: boolean;
  customParameters: Record<string, unknown>;
  constraints: SearchConstraints[];
  priority: SearchPriority;
}

/**
 * Interface for search input parameters with enhanced validation
 */
export interface SearchParameters {
  location: Feature | FeatureCollection;
  timeWindow: DateRange;
  assetType: AssetType;
  requirements: SearchRequirements;
  validationRules: SearchValidationRules;
}

/**
 * Search result metadata interface
 */
export interface SearchResultMetadata {
  assetId: string;
  collectionTime: string;
  processingLevel: string;
  resolution: number;
  cloudCover?: number;
  costEstimate: number;
  dataQuality: number;
}

/**
 * Search result validation interface
 */
export interface SearchResultValidation {
  isValid: boolean;
  confidence: number;
  qualityScore: number;
  validationErrors: string[];
  lastValidated: string;
}

/**
 * Search performance metrics interface
 */
export interface SearchPerformanceMetrics {
  processingTime: number;
  coveragePercentage: number;
  matchAccuracy: number;
  optimizationScore: number;
}

/**
 * Recommendation interface for search results
 */
export interface Recommendation {
  id: string;
  type: string;
  confidence: number;
  description: string;
  alternativeAssets: string[];
  costDelta: number;
}

/**
 * Enhanced interface for search result data with metadata validation
 */
export interface SearchResult {
  id: string;
  timestamp: string;
  location: Feature;
  confidence: number;
  recommendations: Recommendation[];
  metadata: SearchResultMetadata;
  validation: SearchResultValidation;
  performance: SearchPerformanceMetrics;
}

/**
 * Search status type
 */
export type SearchStatus = 
  | 'IDLE'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'PARTIALLY_COMPLETED';

/**
 * Search error interface
 */
export type SearchError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retry?: boolean;
};

/**
 * Search loading state interface
 */
export type SearchLoadingState = {
  parameters: boolean;
  results: boolean;
  filters: boolean;
};

/**
 * Search pagination interface
 */
export type SearchPagination = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

/**
 * Search filter state interface
 */
export interface SearchFilterState {
  dateRange?: DateRange;
  confidenceThreshold?: number;
  assetTypes?: AssetType[];
  locationBounds?: Feature;
  priorityLevels?: SearchPriority[];
  costRange?: { min: number; max: number };
}

/**
 * Available fields for sorting search results
 */
export enum SearchSortField {
  TIMESTAMP = 'TIMESTAMP',
  CONFIDENCE = 'CONFIDENCE',
  PRIORITY = 'PRIORITY',
  COST_ESTIMATE = 'COST_ESTIMATE',
  COVERAGE_AREA = 'COVERAGE_AREA'
}

/**
 * Available filter types for search results
 */
export enum SearchFilterType {
  DATE_RANGE = 'DATE_RANGE',
  CONFIDENCE_THRESHOLD = 'CONFIDENCE_THRESHOLD',
  ASSET_TYPE = 'ASSET_TYPE',
  LOCATION_BOUNDS = 'LOCATION_BOUNDS',
  PRIORITY_LEVEL = 'PRIORITY_LEVEL',
  COST_RANGE = 'COST_RANGE'
}

/**
 * Enhanced interface for search state management with granular loading states
 */
export interface SearchState {
  parameters: SearchParameters;
  results: SearchResult[];
  status: SearchStatus;
  error: SearchError | null;
  loading: SearchLoadingState;
  pagination: SearchPagination;
  filters: SearchFilterState;
}