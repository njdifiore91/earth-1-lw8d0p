/**
 * @fileoverview Visualization service interfaces for Matter satellite data product matching platform.
 * Defines comprehensive data structures and configurations for visualization components including
 * timeline views, capability matrices, collection windows, and export options.
 * @version 1.0.0
 */

/**
 * Configuration interface for visualization components with comprehensive styling,
 * responsiveness, and accessibility options.
 */
export interface VisualizationConfig {
    /** Width of the visualization in pixels */
    width: number;
    
    /** Height of the visualization in pixels */
    height: number;
    
    /** Margin configuration for the visualization */
    margin: {
        top: number;
        right: number;
        bottom: number;
        left: number;
    };
    
    /** Theme configuration for consistent styling */
    theme: {
        primary: string;
        secondary: string;
        background: string;
        text: string;
        accent: string;
    };
    
    /** Responsive design configuration */
    responsive: {
        breakpoints: {
            mobile: number;
            tablet: number;
            desktop: number;
        };
        scaling: number;
    };
    
    /** Interaction configuration for visualization controls */
    interaction: {
        zoomEnabled: boolean;
        panEnabled: boolean;
        zoomRange: [number, number];
    };
    
    /** Accessibility configuration for WCAG compliance */
    accessibility: {
        ariaLabels: Record<string, string>;
        highContrast: boolean;
    };
}

/**
 * Timeline visualization data structure with enhanced metadata
 * and styling capabilities.
 */
export interface TimelineData {
    /** Unique identifier for the timeline entry */
    id: string;
    
    /** Start time of the timeline entry */
    startTime: Date;
    
    /** End time of the timeline entry */
    endTime: Date;
    
    /** Confidence score for the timeline entry (0-100) */
    confidenceScore: number;
    
    /** Collection windows associated with this timeline */
    collectionWindows: CollectionWindow[];
    
    /** Additional metadata for the timeline entry */
    metadata: {
        description: string;
        tags: string[];
        customData: Record<string, any>;
    };
    
    /** Current status of the timeline entry */
    status: 'pending' | 'active' | 'completed' | 'error';
    
    /** Optional style overrides for visualization */
    styleOverrides?: {
        color?: string;
        opacity?: number;
        highlight?: boolean;
    };
}

/**
 * Capability matrix visualization data with validation
 * and comparison features.
 */
export interface CapabilityMatrixData {
    /** Type of asset being evaluated */
    assetType: string;
    
    /** Overall confidence score for the capability assessment */
    confidenceScore: number;
    
    /** Detailed capability parameters */
    parameters: {
        resolution: number;
        coverage: number;
        accuracy: number;
        reliability: number;
    };
    
    /** Validation rules for capability assessment */
    validationRules: {
        minConfidence: number;
        maxConfidence: number;
        thresholds: Record<string, number>;
    };
    
    /** Comparison metrics for capability assessment */
    comparisonMetrics: {
        historical: number;
        benchmark: number;
        trend: number[];
    };
}

/**
 * Export configuration interface with enhanced format
 * and security options.
 */
export interface ExportOptions {
    /** Export file format */
    format: 'png' | 'svg' | 'pdf' | 'csv' | 'json';
    
    /** Export resolution in DPI */
    resolution: number;
    
    /** Include metadata in export */
    includeMetadata: boolean;
    
    /** Compression configuration for exports */
    compression: {
        enabled: boolean;
        level: 1 | 2 | 3 | 4 | 5;
    };
    
    /** Watermark configuration for exports */
    watermark: {
        text: string;
        position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    };
}

/**
 * Collection window interface for satellite data collection
 * with status tracking and conflict detection.
 */
export interface CollectionWindow {
    /** Start time of the collection window */
    startTime: Date;
    
    /** End time of the collection window */
    endTime: Date;
    
    /** Priority level of the collection (1-10) */
    priority: number;
    
    /** Current status of the collection window */
    status: 'available' | 'scheduled' | 'conflict' | 'completed';
    
    /** Conflict detection information */
    conflictDetection: {
        hasConflict: boolean;
        conflictingWindows: string[];
    };
    
    /** Optional notes for the collection window */
    notes: string;
}