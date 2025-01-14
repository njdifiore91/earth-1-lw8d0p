/**
 * @fileoverview Utility functions for formatting dates, numbers, and visualization data
 * for consistent display across the Matter satellite data product matching platform.
 * @version 1.0.0
 */

import { format } from 'date-fns'; // v2.30.0
import { format as d3Format } from 'd3-format'; // v7.8.5
import { TimelineData } from '../interfaces/visualization.interface';

// Constants for formatting configuration
const DEFAULT_DATE_FORMAT = 'yyyy-MM-dd HH:mm:ss';
const CONFIDENCE_SCORE_PRECISION = 2;
const DURATION_FORMATS = {
    MINUTES: '.1f',
    HOURS: '.2f',
    DAYS: '.2f'
};

const ASSET_TYPE_FORMATTING = {
    SPECIAL_CASES: new Map([
        ['sar', 'SAR'],
        ['eos', 'EOS'],
        ['ir', 'IR']
    ]),
    WORD_SEPARATORS: /[-_\s]+/g
};

/**
 * Formats dates for timeline visualization display with timezone support.
 * @param date - The date to format
 * @param formatString - Optional custom format string
 * @returns Formatted date string in specified format
 * @throws {Error} If date is invalid
 */
export function formatTimelineDate(date: Date, formatString?: string): string {
    try {
        if (!(date instanceof Date) || isNaN(date.getTime())) {
            throw new Error('Invalid date provided to formatTimelineDate');
        }

        const dateFormat = formatString || DEFAULT_DATE_FORMAT;
        return format(date, dateFormat);
    } catch (error) {
        console.error('Error formatting timeline date:', error);
        throw error;
    }
}

/**
 * Formats confidence scores for visualization display with enhanced precision control.
 * @param score - Confidence score between 0 and 1
 * @returns Formatted confidence score as percentage with specified precision
 * @throws {Error} If score is invalid
 */
export function formatConfidenceScore(score: number): string {
    try {
        if (typeof score !== 'number' || isNaN(score) || score < 0 || score > 1) {
            throw new Error('Invalid confidence score: must be between 0 and 1');
        }

        const percentage = score * 100;
        const formatter = d3Format(`.${CONFIDENCE_SCORE_PRECISION}f`);
        return `${formatter(percentage)}%`;
    } catch (error) {
        console.error('Error formatting confidence score:', error);
        throw error;
    }
}

/**
 * Formats time duration between two dates with intelligent unit selection.
 * @param startTime - Start date of the duration
 * @param endTime - End date of the duration
 * @returns Formatted duration string with appropriate units
 * @throws {Error} If dates are invalid
 */
export function formatDuration(startTime: Date, endTime: Date): string {
    try {
        if (!(startTime instanceof Date) || !(endTime instanceof Date) ||
            isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
            throw new Error('Invalid date(s) provided to formatDuration');
        }

        const durationMs = endTime.getTime() - startTime.getTime();
        
        if (durationMs < 0) {
            throw new Error('End time must be after start time');
        }

        // Convert to appropriate units and format
        const minutes = durationMs / (1000 * 60);
        const hours = minutes / 60;
        const days = hours / 24;

        if (days >= 1) {
            return `${d3Format(DURATION_FORMATS.DAYS)(days)} days`;
        } else if (hours >= 1) {
            return `${d3Format(DURATION_FORMATS.HOURS)(hours)} hours`;
        } else {
            return `${d3Format(DURATION_FORMATS.MINUTES)(minutes)} minutes`;
        }
    } catch (error) {
        console.error('Error formatting duration:', error);
        throw error;
    }
}

/**
 * Formats asset type names for standardized display across the application.
 * @param assetType - Raw asset type string
 * @returns Formatted asset type string following display standards
 * @throws {Error} If asset type is invalid
 */
export function formatAssetType(assetType: string): string {
    try {
        if (!assetType || typeof assetType !== 'string') {
            throw new Error('Invalid asset type provided');
        }

        // Handle special cases first
        const lowerAssetType = assetType.toLowerCase();
        if (ASSET_TYPE_FORMATTING.SPECIAL_CASES.has(lowerAssetType)) {
            return ASSET_TYPE_FORMATTING.SPECIAL_CASES.get(lowerAssetType)!;
        }

        // Split into words, capitalize each word, and join
        return assetType
            .split(ASSET_TYPE_FORMATTING.WORD_SEPARATORS)
            .filter(word => word.length > 0)
            .map(word => {
                const lowerWord = word.toLowerCase();
                return word.length > 1 
                    ? word.charAt(0).toUpperCase() + lowerWord.slice(1)
                    : word.toUpperCase();
            })
            .join(' ');
    } catch (error) {
        console.error('Error formatting asset type:', error);
        throw error;
    }
}

/**
 * Type guard to check if a value is a valid Date object
 * @param value - Value to check
 * @returns Boolean indicating if value is a valid Date
 */
function isValidDate(value: any): value is Date {
    return value instanceof Date && !isNaN(value.getTime());
}