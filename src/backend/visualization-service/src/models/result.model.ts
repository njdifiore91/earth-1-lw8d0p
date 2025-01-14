/**
 * @fileoverview Enhanced visualization result model with comprehensive data management,
 * security features, and monitoring capabilities for the Matter platform.
 * @version 1.0.0
 */

import { Pool, QueryResult } from 'pg'; // v8.11.0
import sanitize from 'sanitize-html'; // v2.11.0
import winston from 'winston'; // v3.8.0
import { Meter } from '@opentelemetry/metrics'; // v1.0.0

import { 
  VisualizationConfig, 
  TimelineData, 
  CapabilityMatrixData 
} from '../interfaces/visualization.interface';
import { createVisualizationDatabasePool } from '../config/database.config';

/**
 * Enhanced model class for managing visualization results with comprehensive
 * data validation, security features, and monitoring capabilities.
 */
export class VisualizationResult {
  private id: string;
  private searchId: string;
  private timelineData: TimelineData;
  private capabilityMatrix: CapabilityMatrixData[];
  private createdAt: Date;
  private updatedAt: Date;
  private readonly logger: winston.Logger;
  private readonly dbPool: Pool;
  private static readonly meter: Meter;

  /**
   * Initializes a new visualization result instance with enhanced validation and monitoring
   * @param searchId - Associated search identifier
   * @param timelineData - Timeline visualization data
   * @param capabilityMatrix - Capability assessment matrix data
   */
  constructor(
    searchId: string,
    timelineData: TimelineData,
    capabilityMatrix: CapabilityMatrixData[]
  ) {
    // Initialize logging
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      transports: [
        new winston.transports.File({ filename: 'visualization-error.log', level: 'error' }),
        new winston.transports.File({ filename: 'visualization-combined.log' })
      ]
    });

    // Sanitize inputs
    this.searchId = sanitize(searchId, { allowedTags: [], allowedAttributes: {} });
    this.timelineData = this.sanitizeTimelineData(timelineData);
    this.capabilityMatrix = this.sanitizeCapabilityMatrix(capabilityMatrix);

    // Initialize timestamps
    this.createdAt = new Date();
    this.updatedAt = new Date();

    // Generate unique ID
    this.id = `viz_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Initialize database connection pool
    this.dbPool = createVisualizationDatabasePool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'matter_viz',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      ssl: process.env.DB_SSL === 'true'
    });
  }

  /**
   * Validates timeline and capability matrix data with comprehensive checks
   * @returns Promise resolving to validation result
   */
  public async validateData(): Promise<boolean> {
    try {
      // Validate timeline data
      if (!this.timelineData.startTime || !this.timelineData.endTime) {
        throw new Error('Invalid timeline data: missing timestamps');
      }

      if (this.timelineData.startTime >= this.timelineData.endTime) {
        throw new Error('Invalid timeline data: start time must be before end time');
      }

      if (this.timelineData.confidenceScore < 0 || this.timelineData.confidenceScore > 100) {
        throw new Error('Invalid confidence score: must be between 0 and 100');
      }

      // Validate capability matrix
      if (!Array.isArray(this.capabilityMatrix) || this.capabilityMatrix.length === 0) {
        throw new Error('Invalid capability matrix: must be non-empty array');
      }

      for (const capability of this.capabilityMatrix) {
        if (!capability.assetType || typeof capability.assetType !== 'string') {
          throw new Error('Invalid capability matrix: missing asset type');
        }

        if (capability.confidenceScore < 0 || capability.confidenceScore > 100) {
          throw new Error('Invalid capability matrix: confidence score must be between 0 and 100');
        }
      }

      return true;
    } catch (error) {
      this.logger.error('Data validation failed', { error, searchId: this.searchId });
      throw error;
    }
  }

  /**
   * Persists the visualization result to the database with enhanced security and monitoring
   * @returns Promise resolving when save is complete
   */
  public async save(): Promise<void> {
    const client = await this.dbPool.connect();
    const startTime = Date.now();

    try {
      // Validate data before persistence
      await this.validateData();

      // Begin transaction
      await client.query('BEGIN');

      // Insert main visualization result
      const resultQuery = `
        INSERT INTO visualization_results 
        (id, search_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE
        SET updated_at = EXCLUDED.updated_at
        RETURNING id`;

      await client.query(resultQuery, [
        this.id,
        this.searchId,
        this.createdAt,
        this.updatedAt
      ]);

      // Insert timeline data
      const timelineQuery = `
        INSERT INTO visualization_timelines
        (result_id, start_time, end_time, confidence_score)
        VALUES ($1, $2, $3, $4)`;

      await client.query(timelineQuery, [
        this.id,
        this.timelineData.startTime,
        this.timelineData.endTime,
        this.timelineData.confidenceScore
      ]);

      // Insert capability matrix data
      const matrixQuery = `
        INSERT INTO visualization_capabilities
        (result_id, asset_type, confidence_score)
        VALUES ($1, $2, $3)`;

      for (const capability of this.capabilityMatrix) {
        await client.query(matrixQuery, [
          this.id,
          capability.assetType,
          capability.confidenceScore
        ]);
      }

      // Commit transaction
      await client.query('COMMIT');

      // Record metrics
      const duration = Date.now() - startTime;
      VisualizationResult.meter.createHistogram('visualization_save_duration').record(duration);

      this.logger.info('Visualization result saved successfully', { 
        resultId: this.id,
        searchId: this.searchId,
        duration 
      });
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Failed to save visualization result', { error, searchId: this.searchId });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves a visualization result by ID with caching and monitoring
   * @param id - Visualization result identifier
   * @returns Promise resolving to found result
   */
  public static async findById(id: string): Promise<VisualizationResult | null> {
    const startTime = Date.now();
    const sanitizedId = sanitize(id, { allowedTags: [], allowedAttributes: {} });

    try {
      const pool = createVisualizationDatabasePool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'matter_viz',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl: process.env.DB_SSL === 'true'
      });

      const result = await pool.query(`
        SELECT 
          vr.*,
          vt.start_time,
          vt.end_time,
          vt.confidence_score as timeline_confidence,
          vc.asset_type,
          vc.confidence_score as capability_confidence
        FROM visualization_results vr
        LEFT JOIN visualization_timelines vt ON vt.result_id = vr.id
        LEFT JOIN visualization_capabilities vc ON vc.result_id = vr.id
        WHERE vr.id = $1
      `, [sanitizedId]);

      if (result.rows.length === 0) {
        return null;
      }

      // Record metrics
      const duration = Date.now() - startTime;
      VisualizationResult.meter.createHistogram('visualization_find_duration').record(duration);

      return this.mapResultToModel(result.rows);
    } catch (error) {
      winston.error('Failed to find visualization result', { error, id: sanitizedId });
      throw error;
    }
  }

  /**
   * Retrieves visualization results for a search with pagination and caching
   * @param searchId - Search identifier
   * @param page - Page number
   * @param limit - Results per page
   * @returns Promise resolving to array of results
   */
  public static async findBySearchId(
    searchId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<VisualizationResult[]> {
    const startTime = Date.now();
    const sanitizedSearchId = sanitize(searchId, { allowedTags: [], allowedAttributes: {} });
    const offset = (page - 1) * limit;

    try {
      const pool = createVisualizationDatabasePool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'matter_viz',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl: process.env.DB_SSL === 'true'
      });

      const result = await pool.query(`
        SELECT 
          vr.*,
          vt.start_time,
          vt.end_time,
          vt.confidence_score as timeline_confidence,
          vc.asset_type,
          vc.confidence_score as capability_confidence
        FROM visualization_results vr
        LEFT JOIN visualization_timelines vt ON vt.result_id = vr.id
        LEFT JOIN visualization_capabilities vc ON vc.result_id = vr.id
        WHERE vr.search_id = $1
        ORDER BY vr.created_at DESC
        LIMIT $2 OFFSET $3
      `, [sanitizedSearchId, limit, offset]);

      // Record metrics
      const duration = Date.now() - startTime;
      VisualizationResult.meter.createHistogram('visualization_search_duration').record(duration);

      return result.rows.map(row => this.mapResultToModel([row]));
    } catch (error) {
      winston.error('Failed to find visualization results by search ID', { 
        error, 
        searchId: sanitizedSearchId 
      });
      throw error;
    }
  }

  /**
   * Sanitizes timeline data for security
   * @param data - Raw timeline data
   * @returns Sanitized timeline data
   */
  private sanitizeTimelineData(data: TimelineData): TimelineData {
    return {
      ...data,
      id: sanitize(data.id, { allowedTags: [], allowedAttributes: {} }),
      startTime: new Date(data.startTime),
      endTime: new Date(data.endTime),
      confidenceScore: Math.min(Math.max(data.confidenceScore, 0), 100)
    };
  }

  /**
   * Sanitizes capability matrix data for security
   * @param data - Raw capability matrix data
   * @returns Sanitized capability matrix data
   */
  private sanitizeCapabilityMatrix(data: CapabilityMatrixData[]): CapabilityMatrixData[] {
    return data.map(capability => ({
      ...capability,
      assetType: sanitize(capability.assetType, { allowedTags: [], allowedAttributes: {} }),
      confidenceScore: Math.min(Math.max(capability.confidenceScore, 0), 100)
    }));
  }

  /**
   * Maps database result to model instance
   * @param rows - Database result rows
   * @returns Mapped visualization result model
   */
  private static mapResultToModel(rows: any[]): VisualizationResult {
    const firstRow = rows[0];
    const timelineData: TimelineData = {
      id: firstRow.id,
      startTime: firstRow.start_time,
      endTime: firstRow.end_time,
      confidenceScore: firstRow.timeline_confidence,
      collectionWindows: [],
      metadata: {},
      status: 'completed',
      styleOverrides: {}
    };

    const capabilityMatrix: CapabilityMatrixData[] = rows.map(row => ({
      assetType: row.asset_type,
      confidenceScore: row.capability_confidence,
      parameters: {
        resolution: 0,
        coverage: 0,
        accuracy: 0,
        reliability: 0
      },
      validationRules: {
        minConfidence: 0,
        maxConfidence: 100,
        thresholds: {}
      },
      comparisonMetrics: {
        historical: 0,
        benchmark: 0,
        trend: []
      }
    }));

    return new VisualizationResult(
      firstRow.search_id,
      timelineData,
      capabilityMatrix
    );
  }
}