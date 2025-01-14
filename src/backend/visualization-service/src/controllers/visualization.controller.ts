/**
 * @fileoverview Visualization controller handling HTTP requests for visualization generation,
 * management and export with enhanced error handling, validation, caching and monitoring.
 * @version 1.0.0
 */

import { Request, Response } from 'express'; // v4.18.2
import { StatusCodes } from 'http-status-codes'; // v2.2.0
import { RateLimit } from 'express-rate-limit'; // v6.7.0
import { Cache } from 'node-cache'; // v5.1.2
import * as winston from 'winston'; // v3.8.2

import { 
  VisualizationConfig,
  TimelineData
} from '../interfaces/visualization.interface';
import { VisualizationResult } from '../models/result.model';
import { D3Service } from '../services/d3.service';
import { ExportService } from '../services/export.service';

// Cache configuration
const CACHE_TTL = 3600; // 1 hour
const CHECK_PERIOD = 600; // 10 minutes

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 100; // requests per window

@Controller('/api/v1/visualizations')
export class VisualizationController {
  private readonly cache: Cache;
  private readonly logger: winston.Logger;
  private readonly rateLimiter: RateLimit;

  constructor(
    private readonly d3Service: D3Service,
    private readonly exportService: ExportService
  ) {
    // Initialize cache
    this.cache = new Cache({
      stdTTL: CACHE_TTL,
      checkperiod: CHECK_PERIOD,
      useClones: false
    });

    // Initialize logger
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      transports: [
        new winston.transports.File({ filename: 'visualization-error.log', level: 'error' }),
        new winston.transports.File({ filename: 'visualization-combined.log' })
      ]
    });

    // Initialize rate limiter
    this.rateLimiter = new RateLimit({
      windowMs: RATE_LIMIT_WINDOW,
      max: RATE_LIMIT_MAX,
      message: 'Too many visualization requests, please try again later'
    });
  }

  /**
   * Generates timeline visualization with validation and caching
   */
  @Post('/timeline')
  @UseGuards(AuthGuard)
  async generateTimeline(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    try {
      // Validate request body
      const { searchId, config } = req.body;
      if (!searchId) {
        throw new Error('Search ID is required');
      }

      // Check cache
      const cacheKey = `timeline_${searchId}`;
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.logger.info('Timeline cache hit', { searchId });
        res.status(StatusCodes.OK).json(cached);
        return;
      }

      // Generate visualization
      const timelineData = await VisualizationResult.findBySearchId(searchId);
      if (!timelineData) {
        throw new Error('Timeline data not found');
      }

      const visualization = await this.d3Service.createTimeline(timelineData);

      // Cache result
      this.cache.set(cacheKey, visualization);

      // Log metrics
      const duration = Date.now() - startTime;
      this.logger.info('Timeline generated', { 
        searchId, 
        duration,
        cacheStatus: 'miss'
      });

      res.status(StatusCodes.OK).json(visualization);
    } catch (error) {
      this.logger.error('Timeline generation failed', { 
        error: error.message,
        stack: error.stack
      });
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to generate timeline visualization'
      });
    }
  }

  /**
   * Generates capability matrix visualization with error handling
   */
  @Post('/capability-matrix')
  @UseGuards(AuthGuard)
  async generateCapabilityMatrix(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    try {
      const { searchId, config } = req.body;
      if (!searchId) {
        throw new Error('Search ID is required');
      }

      const cacheKey = `matrix_${searchId}`;
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.logger.info('Matrix cache hit', { searchId });
        res.status(StatusCodes.OK).json(cached);
        return;
      }

      const matrixData = await VisualizationResult.findBySearchId(searchId);
      if (!matrixData) {
        throw new Error('Matrix data not found');
      }

      const visualization = await this.d3Service.createCapabilityMatrix(matrixData);
      this.cache.set(cacheKey, visualization);

      const duration = Date.now() - startTime;
      this.logger.info('Capability matrix generated', {
        searchId,
        duration,
        cacheStatus: 'miss'
      });

      res.status(StatusCodes.OK).json(visualization);
    } catch (error) {
      this.logger.error('Matrix generation failed', {
        error: error.message,
        stack: error.stack
      });
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to generate capability matrix'
      });
    }
  }

  /**
   * Generates collection windows visualization with monitoring
   */
  @Post('/collection-windows')
  @UseGuards(AuthGuard)
  async generateCollectionWindows(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    try {
      const { searchId, config } = req.body;
      if (!searchId) {
        throw new Error('Search ID is required');
      }

      const cacheKey = `windows_${searchId}`;
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.logger.info('Windows cache hit', { searchId });
        res.status(StatusCodes.OK).json(cached);
        return;
      }

      const windowsData = await VisualizationResult.findBySearchId(searchId);
      if (!windowsData) {
        throw new Error('Collection windows data not found');
      }

      const visualization = await this.d3Service.createCollectionWindows(windowsData);
      this.cache.set(cacheKey, visualization);

      const duration = Date.now() - startTime;
      this.logger.info('Collection windows generated', {
        searchId,
        duration,
        cacheStatus: 'miss'
      });

      res.status(StatusCodes.OK).json(visualization);
    } catch (error) {
      this.logger.error('Windows generation failed', {
        error: error.message,
        stack: error.stack
      });
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to generate collection windows'
      });
    }
  }

  /**
   * Exports visualization with rate limiting and streaming
   */
  @Post('/export')
  @UseGuards(AuthGuard)
  @UseGuards(this.rateLimiter)
  async exportVisualization(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    try {
      const { searchId, type, format } = req.body;
      if (!searchId || !type || !format) {
        throw new Error('Search ID, type and format are required');
      }

      let exportBuffer: Buffer;
      switch (type) {
        case 'timeline':
          const timelineData = await VisualizationResult.findBySearchId(searchId);
          exportBuffer = await this.exportService.exportTimeline(timelineData, { format });
          break;
        case 'matrix':
          const matrixData = await VisualizationResult.findBySearchId(searchId);
          exportBuffer = await this.exportService.exportCapabilityMatrix(matrixData, { format });
          break;
        case 'windows':
          const windowsData = await VisualizationResult.findBySearchId(searchId);
          exportBuffer = await this.exportService.exportCollectionWindows(windowsData, { format });
          break;
        default:
          throw new Error('Invalid visualization type');
      }

      const duration = Date.now() - startTime;
      this.logger.info('Visualization exported', {
        searchId,
        type,
        format,
        duration
      });

      res.setHeader('Content-Type', `application/${format}`);
      res.setHeader('Content-Disposition', `attachment; filename=visualization.${format}`);
      res.status(StatusCodes.OK).send(exportBuffer);
    } catch (error) {
      this.logger.error('Export failed', {
        error: error.message,
        stack: error.stack
      });
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to export visualization'
      });
    }
  }

  /**
   * Retrieves cached visualization by ID
   */
  @Get('/:id')
  @UseGuards(AuthGuard)
  async getVisualizationById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        throw new Error('Visualization ID is required');
      }

      const cacheKey = `viz_${id}`;
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.logger.info('Visualization cache hit', { id });
        res.status(StatusCodes.OK).json(cached);
        return;
      }

      const visualization = await VisualizationResult.findById(id);
      if (!visualization) {
        res.status(StatusCodes.NOT_FOUND).json({
          error: 'Visualization not found'
        });
        return;
      }

      this.cache.set(cacheKey, visualization);
      res.status(StatusCodes.OK).json(visualization);
    } catch (error) {
      this.logger.error('Visualization retrieval failed', {
        error: error.message,
        stack: error.stack
      });
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to retrieve visualization'
      });
    }
  }
}