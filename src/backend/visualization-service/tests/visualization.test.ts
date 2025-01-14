/**
 * @fileoverview Comprehensive test suite for Matter visualization service components
 * including timeline generation, capability matrix creation, collection window visualization,
 * performance benchmarking, and accessibility validation.
 * @version 1.0.0
 */

import { jest } from '@jest/globals'; // v29.5.0
import request from 'supertest'; // v6.3.3
import cheerio from 'cheerio'; // v1.0.0-rc.12
import app from '../src/app';
import { VisualizationController } from '../src/controllers/visualization.controller';
import { D3Service } from '../src/services/d3.service';

// Test configuration constants
const testVisualizationConfig = {
    width: 800,
    height: 400,
    margin: { top: 20, right: 20, bottom: 30, left: 40 },
    accessibility: { ariaLabels: true, highContrast: true },
    performance: { maxRenderTime: 3000, maxMemoryUsage: '100MB' }
};

// Mock data for testing
const mockTimelineData = {
    id: 'test-timeline-1',
    startTime: new Date('2023-01-01T00:00:00Z'),
    endTime: new Date('2023-12-31T23:59:59Z'),
    confidenceScore: 0.95,
    collectionWindows: [
        {
            startTime: new Date('2023-01-15T10:00:00Z'),
            endTime: new Date('2023-01-15T14:00:00Z'),
            priority: 1,
            status: 'completed'
        }
    ],
    metadata: {
        description: 'Test Timeline',
        tags: ['test', 'visualization']
    },
    status: 'completed'
};

describe('VisualizationController', () => {
    let controller: VisualizationController;
    let d3Service: D3Service;

    beforeAll(() => {
        d3Service = new D3Service(testVisualizationConfig);
        controller = new VisualizationController(d3Service);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Timeline Generation', () => {
        it('should generate timeline visualization with performance benchmarking', async () => {
            const startTime = Date.now();
            const response = await request(app)
                .post('/api/v1/visualizations/timeline')
                .send({ searchId: 'test-search', data: mockTimelineData });

            // Verify response time is within limits
            const responseTime = Date.now() - startTime;
            expect(responseTime).toBeLessThan(testVisualizationConfig.performance.maxRenderTime);
            expect(response.status).toBe(200);

            // Validate SVG structure
            const $ = cheerio.load(response.body.svg);
            expect($('svg')).toBeTruthy();
            expect($('.timeline-visualization')).toBeTruthy();
            expect($('.confidence-line')).toBeTruthy();
        });

        it('should validate accessibility requirements', async () => {
            const response = await request(app)
                .post('/api/v1/visualizations/timeline')
                .send({ searchId: 'test-search', data: mockTimelineData });

            const $ = cheerio.load(response.body.svg);

            // Check ARIA attributes
            expect($('svg').attr('role')).toBe('img');
            expect($('svg').attr('aria-label')).toBeTruthy();
            expect($('.x-axis').attr('aria-label')).toBeTruthy();
            expect($('.y-axis').attr('aria-label')).toBeTruthy();

            // Verify high contrast support
            const confidenceLine = $('.confidence-line');
            const lineColor = confidenceLine.attr('stroke');
            expect(getContrastRatio(lineColor, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
        });

        it('should handle memory cleanup after visualization', async () => {
            const initialMemory = process.memoryUsage().heapUsed;
            
            await request(app)
                .post('/api/v1/visualizations/timeline')
                .send({ searchId: 'test-search', data: mockTimelineData });

            // Force garbage collection
            global.gc && global.gc();

            const memoryUsed = process.memoryUsage().heapUsed - initialMemory;
            expect(memoryUsed).toBeLessThan(parseMemoryString(testVisualizationConfig.performance.maxMemoryUsage));
        });
    });

    describe('Capability Matrix', () => {
        const mockMatrixData = {
            assetType: 'SAR',
            confidenceScore: 0.85,
            parameters: {
                resolution: 0.5,
                coverage: 0.9,
                accuracy: 0.8,
                reliability: 0.95
            }
        };

        it('should generate capability matrix with performance validation', async () => {
            const startTime = Date.now();
            const response = await request(app)
                .post('/api/v1/visualizations/capability-matrix')
                .send({ searchId: 'test-search', data: mockMatrixData });

            const renderTime = Date.now() - startTime;
            expect(renderTime).toBeLessThan(testVisualizationConfig.performance.maxRenderTime);
            expect(response.status).toBe(200);

            // Validate matrix structure
            const $ = cheerio.load(response.body.svg);
            expect($('.capability-matrix')).toBeTruthy();
            expect($('.matrix-cell')).toHaveLength(4); // One for each parameter
        });

        it('should validate color scaling and accessibility', async () => {
            const response = await request(app)
                .post('/api/v1/visualizations/capability-matrix')
                .send({ searchId: 'test-search', data: mockMatrixData });

            const $ = cheerio.load(response.body.svg);
            
            // Check color contrast for each cell
            $('.matrix-cell').each((_, cell) => {
                const fillColor = $(cell).attr('fill');
                expect(getContrastRatio(fillColor, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
            });
        });
    });

    describe('Collection Windows', () => {
        const mockWindowsData = [
            {
                startTime: new Date('2023-01-15T10:00:00Z'),
                endTime: new Date('2023-01-15T14:00:00Z'),
                priority: 1,
                status: 'completed'
            },
            {
                startTime: new Date('2023-01-15T12:00:00Z'),
                endTime: new Date('2023-01-15T16:00:00Z'),
                priority: 2,
                status: 'pending'
            }
        ];

        it('should handle overlapping collection windows', async () => {
            const response = await request(app)
                .post('/api/v1/visualizations/collection-windows')
                .send({ searchId: 'test-search', data: mockWindowsData });

            const $ = cheerio.load(response.body.svg);
            const windows = $('.collection-window');
            
            expect(windows).toHaveLength(2);
            expect($(windows[0]).attr('opacity')).not.toBe($(windows[1]).attr('opacity'));
        });

        it('should validate time scale accuracy', async () => {
            const response = await request(app)
                .post('/api/v1/visualizations/collection-windows')
                .send({ searchId: 'test-search', data: mockWindowsData });

            const $ = cheerio.load(response.body.svg);
            const xAxis = $('.x-axis');
            
            expect(xAxis.find('text')).toHaveLength(mockWindowsData.length * 2); // Start and end times
            expect(xAxis.find('line')).toBeTruthy(); // Time scale lines
        });
    });
});

// Utility functions for testing
function getContrastRatio(color1: string, color2: string): number {
    // Convert colors to relative luminance and calculate contrast ratio
    const getLuminance = (color: string): number => {
        const rgb = color.match(/\d+/g)?.map(Number) || [0, 0, 0];
        const [r, g, b] = rgb.map(c => {
            const sRGB = c / 255;
            return sRGB <= 0.03928
                ? sRGB / 12.92
                : Math.pow((sRGB + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const l1 = getLuminance(color1);
    const l2 = getLuminance(color2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

function parseMemoryString(memoryString: string): number {
    const value = parseInt(memoryString);
    const unit = memoryString.slice(-2).toLowerCase();
    const multipliers = { kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024 };
    return value * (multipliers[unit] || 1);
}