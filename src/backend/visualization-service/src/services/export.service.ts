/**
 * @fileoverview Advanced export service for Matter visualization platform.
 * Handles optimized exports of visualizations in multiple formats with support for
 * compression, watermarking, and memory-efficient processing.
 * @version 1.0.0
 */

import { Injectable } from '@nestjs/common';
import { ExportOptions } from '../interfaces/visualization.interface';
import { D3Service } from './d3.service';
import { formatTimelineDate } from '../utils/format.utils';
import sharp from 'sharp'; // v0.32.5
import PDFDocument from '@pdfkit/pdfkit'; // v3.0.0
import SVGtoPDF from 'svg-to-pdfkit'; // v0.1.8
import { Transform, Readable } from 'stream';

// Export configuration constants
const SUPPORTED_FORMATS = ['svg', 'png', 'pdf'] as const;
const DEFAULT_RESOLUTION = 300;
const MAX_RESOLUTION = 1200;
const CACHE_DURATION = 3600000; // 1 hour in milliseconds
const MAX_EXPORT_SIZE = 100000000; // 100MB
const COMPRESSION_LEVELS = { low: 3, medium: 6, high: 9 };

@Injectable()
export class ExportService {
    private readonly exportCache: Map<string, { buffer: Buffer; timestamp: number }>;
    private readonly exportQueue: Map<string, Promise<Buffer>>;

    constructor(
        private readonly d3Service: D3Service,
        private readonly configService: any
    ) {
        this.exportCache = new Map();
        this.exportQueue = new Map();
        
        // Clean up expired cache entries periodically
        setInterval(() => this.cleanupCache(), CACHE_DURATION);
    }

    /**
     * Exports timeline visualization with advanced options and optimization
     * @param data Timeline data to visualize
     * @param options Export configuration options
     * @returns Promise resolving to exported buffer
     */
    async exportTimeline(data: any, options: ExportOptions): Promise<Buffer> {
        try {
            // Validate options
            this.validateExportOptions(options);

            // Generate cache key
            const cacheKey = this.generateCacheKey('timeline', data, options);

            // Check cache
            const cached = this.exportCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
                return cached.buffer;
            }

            // Check if export is already in progress
            const pending = this.exportQueue.get(cacheKey);
            if (pending) {
                return pending;
            }

            // Create new export promise
            const exportPromise = (async () => {
                // Generate SVG using D3Service
                const svg = this.d3Service.createTimeline(data);

                // Process the export based on format
                const buffer = await this.processExport(svg, options);

                // Cache the result
                this.exportCache.set(cacheKey, {
                    buffer,
                    timestamp: Date.now()
                });

                return buffer;
            })();

            // Add to queue and clean up after completion
            this.exportQueue.set(cacheKey, exportPromise);
            exportPromise.finally(() => this.exportQueue.delete(cacheKey));

            return exportPromise;
        } catch (error) {
            console.error('Timeline export error:', error);
            throw error;
        }
    }

    /**
     * Exports capability matrix with format-specific optimizations
     * @param data Matrix data to visualize
     * @param options Export configuration options
     * @returns Promise resolving to exported buffer
     */
    async exportCapabilityMatrix(data: any[], options: ExportOptions): Promise<Buffer> {
        try {
            this.validateExportOptions(options);
            const cacheKey = this.generateCacheKey('matrix', data, options);

            const cached = this.exportCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
                return cached.buffer;
            }

            const svg = this.d3Service.createCapabilityMatrix(data);
            const buffer = await this.processExport(svg, options);

            this.exportCache.set(cacheKey, {
                buffer,
                timestamp: Date.now()
            });

            return buffer;
        } catch (error) {
            console.error('Capability matrix export error:', error);
            throw error;
        }
    }

    /**
     * Exports collection windows with streaming support for large datasets
     * @param windows Collection window data
     * @param options Export configuration options
     * @returns Promise resolving to exported buffer
     */
    async exportCollectionWindows(windows: any[], options: ExportOptions): Promise<Buffer> {
        try {
            this.validateExportOptions(options);

            // Use streaming for large datasets
            if (windows.length > 1000) {
                return this.streamExport(windows, options);
            }

            const svg = this.d3Service.createCollectionWindows(windows);
            return this.processExport(svg, options);
        } catch (error) {
            console.error('Collection windows export error:', error);
            throw error;
        }
    }

    /**
     * Validates export options and sets defaults
     * @param options Export options to validate
     */
    private validateExportOptions(options: ExportOptions): void {
        if (!SUPPORTED_FORMATS.includes(options.format as any)) {
            throw new Error(`Unsupported format: ${options.format}`);
        }

        if (options.resolution) {
            if (options.resolution < 1 || options.resolution > MAX_RESOLUTION) {
                throw new Error(`Invalid resolution: ${options.resolution}`);
            }
        }
    }

    /**
     * Processes export based on format and options
     * @param svg SVG content to process
     * @param options Export configuration
     * @returns Processed buffer
     */
    private async processExport(svg: string, options: ExportOptions): Promise<Buffer> {
        switch (options.format) {
            case 'svg':
                return this.processSVGExport(svg, options);
            case 'png':
                return this.processPNGExport(svg, options);
            case 'pdf':
                return this.processPDFExport(svg, options);
            default:
                throw new Error(`Unsupported format: ${options.format}`);
        }
    }

    /**
     * Processes SVG export with optimization
     */
    private async processSVGExport(svg: string, options: ExportOptions): Promise<Buffer> {
        let processed = svg;

        if (options.watermark) {
            processed = this.addWatermark(processed, options.watermark);
        }

        if (options.compression?.enabled) {
            processed = this.compressSVG(processed);
        }

        return Buffer.from(processed);
    }

    /**
     * Processes PNG export with sharp optimization
     */
    private async processPNGExport(svg: string, options: ExportOptions): Promise<Buffer> {
        const buffer = Buffer.from(svg);
        let sharpInstance = sharp(buffer);

        if (options.resolution) {
            sharpInstance = sharpInstance.resize({
                width: Math.floor(options.resolution * 8.27), // A4 width in inches * DPI
                height: Math.floor(options.resolution * 11.69), // A4 height in inches * DPI
                fit: 'inside'
            });
        }

        if (options.compression?.enabled) {
            sharpInstance = sharpInstance.png({
                compressionLevel: COMPRESSION_LEVELS[options.compression.level] || COMPRESSION_LEVELS.medium
            });
        }

        return sharpInstance.toBuffer();
    }

    /**
     * Processes PDF export with metadata and compression
     */
    private async processPDFExport(svg: string, options: ExportOptions): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({
                compress: options.compression?.enabled,
                info: options.includeMetadata ? {
                    Title: 'Matter Visualization Export',
                    Creator: 'Matter Platform',
                    Producer: 'Matter Export Service',
                    CreationDate: new Date()
                } : undefined
            });

            const chunks: Buffer[] = [];
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            SVGtoPDF(doc, svg, 0, 0);

            if (options.watermark) {
                this.addPDFWatermark(doc, options.watermark);
            }

            doc.end();
        });
    }

    /**
     * Handles streaming export for large datasets
     */
    private async streamExport(data: any[], options: ExportOptions): Promise<Buffer> {
        const chunkSize = 100;
        const chunks: Buffer[] = [];

        for (let i = 0; i < data.length; i += chunkSize) {
            const chunk = data.slice(i, i + chunkSize);
            const svg = this.d3Service.createCollectionWindows(chunk);
            const buffer = await this.processExport(svg, options);
            chunks.push(buffer);

            if (Buffer.concat(chunks).length > MAX_EXPORT_SIZE) {
                throw new Error('Export size limit exceeded');
            }
        }

        return Buffer.concat(chunks);
    }

    /**
     * Cleans up expired cache entries
     */
    private cleanupCache(): void {
        const now = Date.now();
        for (const [key, value] of this.exportCache.entries()) {
            if (now - value.timestamp > CACHE_DURATION) {
                this.exportCache.delete(key);
            }
        }
    }

    /**
     * Generates cache key for export
     */
    private generateCacheKey(type: string, data: any, options: ExportOptions): string {
        return `${type}-${JSON.stringify(data)}-${JSON.stringify(options)}`;
    }

    /**
     * Adds watermark to SVG content
     */
    private addWatermark(svg: string, watermark: ExportOptions['watermark']): string {
        // Implementation of SVG watermark addition
        return svg.replace('</svg>', 
            `<text x="${watermark.position.includes('right') ? '95%' : '5%'}" 
                   y="${watermark.position.includes('bottom') ? '95%' : '5%'}" 
                   font-family="Arial" 
                   font-size="12" 
                   fill="#888" 
                   text-anchor="${watermark.position.includes('right') ? 'end' : 'start'}"
                   opacity="0.5">${watermark.text}</text></svg>`);
    }

    /**
     * Adds watermark to PDF document
     */
    private addPDFWatermark(doc: PDFKit.PDFDocument, watermark: ExportOptions['watermark']): void {
        doc.save();
        doc.fontSize(12)
           .fillColor('#888888')
           .text(watermark.text, 
                watermark.position.includes('right') ? 550 : 50,
                watermark.position.includes('bottom') ? 750 : 50,
                { opacity: 0.5 });
        doc.restore();
    }

    /**
     * Compresses SVG content
     */
    private compressSVG(svg: string): string {
        return svg
            .replace(/>\s+</g, '><')
            .replace(/\s+/g, ' ')
            .replace(/\s*([{}>])\s*/g, '$1');
    }
}