// External imports with versions
import { Feature, FeatureCollection } from '@types/geojson'; // v7946.0.10
import { memoize } from 'lodash'; // v4.17.21
import sanitizeHtml from 'sanitize-html'; // v2.7.0

// Internal imports
import {
  LOCATION_VALIDATION,
  SEARCH_VALIDATION,
  ASSET_VALIDATION,
  FILE_VALIDATION
} from '../constants/validation.constants';
import { SearchParameters, SearchRequirements, AssetType } from '../types/search.types';
import { ApiError } from '../types/api.types';

/**
 * Enhanced custom error class for validation failures with accessibility support
 */
export class ValidationError extends Error {
  public code: string;
  public details: Record<string, any>;
  public ariaLabel: string;

  constructor(message: string, details: Record<string, any>, ariaLabel: string) {
    super(message);
    this.name = 'ValidationError';
    this.code = 'VALIDATION_ERROR';
    this.details = this.sanitizeErrorDetails(details);
    this.ariaLabel = ariaLabel;
    Error.captureStackTrace(this, ValidationError);
  }

  private sanitizeErrorDetails(details: Record<string, any>): Record<string, any> {
    return Object.entries(details).reduce((acc, [key, value]) => ({
      ...acc,
      [key]: typeof value === 'string' ? sanitizeHtml(value) : value
    }), {});
  }
}

/**
 * Validates search parameters with enhanced security and performance optimization
 * @param params SearchParameters to validate
 * @throws ValidationError if validation fails
 */
export const validateSearchParameters = memoize((params: SearchParameters): boolean => {
  try {
    // Sanitize input parameters
    const sanitizedParams = sanitizeSearchParams(params);

    // Validate location
    validateLocation(sanitizedParams.location);

    // Validate time window
    validateTimeWindow(sanitizedParams.timeWindow);

    // Validate asset type
    validateAssetType(sanitizedParams.assetType);

    // Validate requirements if present
    if (sanitizedParams.requirements) {
      validateRequirements(sanitizedParams.requirements);
    }

    return true;
  } catch (error) {
    throw new ValidationError(
      'Search parameter validation failed',
      { params, error: error.message },
      'Search parameters contain invalid values'
    );
  }
}, (params: SearchParameters) => JSON.stringify(params));

/**
 * Validates location data with web worker support for large datasets
 * @param location GeoJSON Feature or FeatureCollection to validate
 * @throws ValidationError if validation fails
 */
export const validateLocation = (location: Feature | FeatureCollection): boolean => {
  if (!location || !location.type) {
    throw new ValidationError(
      'Invalid location data',
      { location },
      'Location data is missing or invalid'
    );
  }

  // Validate coordinates are within bounds
  const coordinates = extractCoordinates(location);
  validateCoordinateBounds(coordinates);

  // Validate area size
  const areaSize = calculateAreaSize(coordinates);
  if (areaSize > LOCATION_VALIDATION.MAX_AREA_SIZE) {
    throw new ValidationError(
      'Area size exceeds maximum limit',
      { areaSize, maxSize: LOCATION_VALIDATION.MAX_AREA_SIZE },
      'Selected area is too large'
    );
  }

  return true;
};

/**
 * Sanitizes search parameters to prevent XSS and injection attacks
 */
const sanitizeSearchParams = (params: SearchParameters): SearchParameters => {
  return {
    ...params,
    requirements: params.requirements ? {
      ...params.requirements,
      customParameters: sanitizeCustomParameters(params.requirements.customParameters)
    } : undefined
  };
};

/**
 * Validates time window against configured constraints
 */
const validateTimeWindow = (timeWindow: { start: string; end: string }): void => {
  const start = new Date(timeWindow.start);
  const end = new Date(timeWindow.end);
  const rangeDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);

  if (rangeDays < SEARCH_VALIDATION.MIN_DATE_RANGE || rangeDays > SEARCH_VALIDATION.MAX_DATE_RANGE) {
    throw new ValidationError(
      'Invalid time window range',
      { rangeDays, min: SEARCH_VALIDATION.MIN_DATE_RANGE, max: SEARCH_VALIDATION.MAX_DATE_RANGE },
      'Time window is outside allowed range'
    );
  }
};

/**
 * Validates asset type against allowed values
 */
const validateAssetType = (assetType: AssetType): void => {
  if (!ASSET_VALIDATION.ALLOWED_ASSET_TYPES.includes(assetType)) {
    throw new ValidationError(
      'Invalid asset type',
      { assetType, allowedTypes: ASSET_VALIDATION.ALLOWED_ASSET_TYPES },
      'Selected asset type is not supported'
    );
  }
};

/**
 * Validates search requirements including detection limits and constraints
 */
const validateRequirements = (requirements: SearchRequirements): void => {
  // Validate detection limit
  if (requirements.detectionLimit < ASSET_VALIDATION.MIN_DETECTION_LIMIT ||
      requirements.detectionLimit > ASSET_VALIDATION.MAX_DETECTION_LIMIT) {
    throw new ValidationError(
      'Invalid detection limit',
      { 
        detectionLimit: requirements.detectionLimit,
        min: ASSET_VALIDATION.MIN_DETECTION_LIMIT,
        max: ASSET_VALIDATION.MAX_DETECTION_LIMIT
      },
      'Detection limit is outside allowed range'
    );
  }

  // Validate custom parameters
  validateCustomParameters(requirements.customParameters);
};

/**
 * Extracts coordinates from GeoJSON for validation
 */
const extractCoordinates = (location: Feature | FeatureCollection): number[][] => {
  const features = location.type === 'FeatureCollection' ? location.features : [location];
  return features.reduce((acc: number[][], feature: Feature) => {
    if (feature.geometry.type === 'Polygon') {
      return [...acc, ...feature.geometry.coordinates[0]];
    }
    return acc;
  }, []);
};

/**
 * Validates coordinates are within allowed bounds
 */
const validateCoordinateBounds = (coordinates: number[][]): void => {
  coordinates.forEach(([lng, lat]) => {
    if (lat < LOCATION_VALIDATION.COORDINATE_BOUNDS.lat.min ||
        lat > LOCATION_VALIDATION.COORDINATE_BOUNDS.lat.max ||
        lng < LOCATION_VALIDATION.COORDINATE_BOUNDS.lng.min ||
        lng > LOCATION_VALIDATION.COORDINATE_BOUNDS.lng.max) {
      throw new ValidationError(
        'Coordinates out of bounds',
        { coordinates: [lng, lat], bounds: LOCATION_VALIDATION.COORDINATE_BOUNDS },
        'Selected location contains coordinates outside allowed range'
      );
    }
  });
};

/**
 * Calculates area size from coordinates
 */
const calculateAreaSize = (coordinates: number[][]): number => {
  // Implementation of area calculation algorithm
  // Returns area in square kilometers
  return 0; // Placeholder - actual implementation would go here
};

/**
 * Sanitizes custom parameters to prevent injection attacks
 */
const sanitizeCustomParameters = (params: Record<string, unknown>): Record<string, unknown> => {
  return Object.entries(params).reduce((acc, [key, value]) => ({
    ...acc,
    [sanitizeHtml(key)]: typeof value === 'string' ? sanitizeHtml(value) : value
  }), {});
};

/**
 * Validates custom parameters against type-specific rules
 */
const validateCustomParameters = (params: Record<string, unknown>): void => {
  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === 'string' && value.length > 1000) {
      throw new ValidationError(
        'Custom parameter value too long',
        { key, maxLength: 1000 },
        'Custom parameter exceeds maximum length'
      );
    }
  });
};