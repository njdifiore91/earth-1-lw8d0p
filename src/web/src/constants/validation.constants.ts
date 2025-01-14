// Import asset type definitions for validation
import { AssetType } from '../types/search.types';

/**
 * Location validation constants for coordinate and area validation
 */
export const LOCATION_VALIDATION = {
  // Maximum area size in square kilometers
  MAX_AREA_SIZE: 1000000,
  
  // Valid coordinate bounds for latitude and longitude
  COORDINATE_BOUNDS: {
    lat: {
      min: -90,
      max: 90
    },
    lng: {
      min: -180,
      max: 180
    }
  },
  
  // Decimal precision for coordinate values
  PRECISION: 6
} as const;

/**
 * Search parameter validation constants for date ranges and confidence thresholds
 */
export const SEARCH_VALIDATION = {
  // Date range limits in days
  MIN_DATE_RANGE: 1,
  MAX_DATE_RANGE: 365,
  
  // Confidence score thresholds as percentages
  MIN_CONFIDENCE: 0,
  MAX_CONFIDENCE: 100,
  
  // Time window validation
  MIN_TIME_WINDOW: 24, // hours
  MAX_TIME_WINDOW: 8760, // hours (1 year)
  
  // Processing level requirements
  REQUIRED_PROCESSING_LEVELS: [
    'RAW',
    'BASIC',
    'ENHANCED'
  ]
} as const;

/**
 * Asset validation constants for requirements and specifications
 */
export const ASSET_VALIDATION = {
  // Detection limits in meters
  MIN_DETECTION_LIMIT: 0.1,
  MAX_DETECTION_LIMIT: 1000,
  
  // Required fields for asset definition
  REQUIRED_FIELDS: [
    'assetType',
    'minimumSize',
    'detectionLimit'
  ] as const,
  
  // Allowed asset types matching the AssetType enum
  ALLOWED_ASSET_TYPES: [
    'ENVIRONMENTAL_MONITORING',
    'INFRASTRUCTURE',
    'AGRICULTURE',
    'CUSTOM'
  ] as const,
  
  // Validation rules for specific asset types
  TYPE_SPECIFIC_RULES: {
    ENVIRONMENTAL_MONITORING: {
      minArea: 1000, // square meters
      maxCloudCover: 20 // percentage
    },
    INFRASTRUCTURE: {
      minResolution: 0.5, // meters
      maxIncidenceAngle: 45 // degrees
    },
    AGRICULTURE: {
      minNDVI: -1,
      maxNDVI: 1,
      seasonalityRequired: true
    }
  }
} as const;

/**
 * File upload validation constants for KML and related files
 */
export const FILE_VALIDATION = {
  // Maximum file size in bytes (10MB)
  MAX_KML_SIZE: 10485760,
  
  // Allowed file extensions
  ALLOWED_FILE_TYPES: [
    '.kml',
    '.kmz'
  ] as const,
  
  // Maximum number of files per upload
  MAX_FILE_COUNT: 1,
  
  // File validation rules
  VALIDATION_RULES: {
    minFeatures: 1,
    maxFeatures: 100,
    maxVertices: 10000,
    requiredElements: [
      'Polygon',
      'coordinates'
    ]
  }
} as const;

/**
 * User input validation constants for form fields and data entry
 */
export const USER_INPUT_VALIDATION = {
  // Text input length constraints
  MIN_LENGTH: 3,
  MAX_LENGTH: 255,
  
  // Email validation pattern
  EMAIL_PATTERN: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
  
  // Input sanitization rules
  SANITIZATION_RULES: {
    allowedCharacters: /^[a-zA-Z0-9\s\-_.,()]+$/,
    maxLineLength: 1000,
    maxParagraphs: 10
  },
  
  // Field-specific validation
  FIELD_RULES: {
    name: {
      required: true,
      minLength: 2,
      maxLength: 100,
      pattern: /^[a-zA-Z\s-]+$/
    },
    description: {
      required: false,
      minLength: 10,
      maxLength: 1000,
      allowHtml: false
    },
    phoneNumber: {
      required: false,
      pattern: /^\+?[\d\s-()]+$/,
      minLength: 10,
      maxLength: 20
    }
  }
} as const;

/**
 * Type guard to check if a value is a valid AssetType
 */
export const isValidAssetType = (value: string): value is AssetType => {
  return ASSET_VALIDATION.ALLOWED_ASSET_TYPES.includes(value as AssetType);
};

/**
 * Type guard to check if a file type is allowed
 */
export const isAllowedFileType = (filename: string): boolean => {
  const extension = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return FILE_VALIDATION.ALLOWED_FILE_TYPES.includes(extension as typeof FILE_VALIDATION.ALLOWED_FILE_TYPES[number]);
};