/**
 * Date utility functions for Matter satellite data product matching platform
 * Handles timezone-aware collection window visualization, schedule generation, and duration formatting
 * @module date.utils
 * @version 1.0.0
 */

// External imports
// date-fns v2.30.0
import { format, parse, isValid, differenceInMinutes, addMinutes } from 'date-fns';
// date-fns-tz v2.0.0
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';

// Constants for date and time formatting
export const DATE_FORMAT = 'yyyy-MM-dd HH:mm:ss';
export const TIME_FORMAT = 'HH:mm:ss';
export const DURATION_FORMAT = 'H[h] mm[m]';

/**
 * Formats a collection window timestamp for display with timezone awareness
 * @param date - UTC timestamp to format
 * @param formatString - Optional format string, defaults to DATE_FORMAT
 * @returns Formatted date string in local timezone
 * @throws {Error} If date is invalid
 */
export const formatCollectionWindow = (date: Date, formatString: string = DATE_FORMAT): string => {
  if (!isValid(date)) {
    throw new Error('Invalid date provided to formatCollectionWindow');
  }

  try {
    const localDate = utcToZonedTime(date, Intl.DateTimeFormat().resolvedOptions().timeZone);
    return format(localDate, formatString);
  } catch (error) {
    throw new Error(`Error formatting collection window: ${error.message}`);
  }
};

/**
 * Parses a collection time string into a UTC Date object with validation
 * @param dateString - Date string in supported format (yyyy-MM-dd HH:mm:ss)
 * @returns Parsed UTC Date object
 * @throws {Error} If date string is invalid or parsing fails
 */
export const parseCollectionTime = (dateString: string): Date => {
  const dateFormatRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
  
  if (!dateFormatRegex.test(dateString)) {
    throw new Error('Invalid date string format. Expected: yyyy-MM-dd HH:mm:ss');
  }

  try {
    const localDate = parse(dateString, DATE_FORMAT, new Date());
    if (!isValid(localDate)) {
      throw new Error('Invalid date components');
    }
    
    return zonedTimeToUtc(localDate, Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch (error) {
    throw new Error(`Error parsing collection time: ${error.message}`);
  }
};

/**
 * Calculates start and end times for a collection window with validation
 * @param centerTime - Center point of collection window (UTC)
 * @param durationMinutes - Duration of collection window in minutes
 * @returns Object containing start and end times in UTC
 * @throws {Error} If parameters are invalid
 */
export const calculateTimeWindow = (
  centerTime: Date,
  durationMinutes: number
): { start: Date; end: Date } => {
  if (!isValid(centerTime)) {
    throw new Error('Invalid center time provided');
  }

  if (typeof durationMinutes !== 'number' || durationMinutes <= 0) {
    throw new Error('Duration must be a positive number of minutes');
  }

  try {
    const halfDuration = durationMinutes / 2;
    const windowStart = addMinutes(centerTime, -halfDuration);
    const windowEnd = addMinutes(centerTime, halfDuration);

    if (!isValid(windowStart) || !isValid(windowEnd)) {
      throw new Error('Invalid window boundaries calculated');
    }

    return {
      start: windowStart,
      end: windowEnd
    };
  } catch (error) {
    throw new Error(`Error calculating time window: ${error.message}`);
  }
};

/**
 * Checks if a given time falls within a collection window with timezone handling
 * @param time - Time to check (UTC)
 * @param windowStart - Start of collection window (UTC)
 * @param windowEnd - End of collection window (UTC)
 * @returns Boolean indicating if time is within window
 * @throws {Error} If any provided dates are invalid
 */
export const isWithinCollectionWindow = (
  time: Date,
  windowStart: Date,
  windowEnd: Date
): boolean => {
  if (!isValid(time) || !isValid(windowStart) || !isValid(windowEnd)) {
    throw new Error('Invalid date(s) provided to isWithinCollectionWindow');
  }

  try {
    const timeUtc = zonedTimeToUtc(time, Intl.DateTimeFormat().resolvedOptions().timeZone);
    const startUtc = zonedTimeToUtc(windowStart, Intl.DateTimeFormat().resolvedOptions().timeZone);
    const endUtc = zonedTimeToUtc(windowEnd, Intl.DateTimeFormat().resolvedOptions().timeZone);

    return timeUtc >= startUtc && timeUtc <= endUtc;
  } catch (error) {
    throw new Error(`Error checking collection window: ${error.message}`);
  }
};

/**
 * Formats a duration in minutes into a human-readable string with units
 * @param minutes - Duration in minutes
 * @returns Formatted duration string (e.g., '2h 30m')
 * @throws {Error} If minutes is invalid
 */
export const formatDuration = (minutes: number): string => {
  if (typeof minutes !== 'number' || minutes < 0) {
    throw new Error('Duration must be a non-negative number of minutes');
  }

  try {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours === 0) {
      return `${remainingMinutes}m`;
    }
    if (remainingMinutes === 0) {
      return `${hours}h`;
    }
    return `${hours}h ${remainingMinutes}m`;
  } catch (error) {
    throw new Error(`Error formatting duration: ${error.message}`);
  }
};