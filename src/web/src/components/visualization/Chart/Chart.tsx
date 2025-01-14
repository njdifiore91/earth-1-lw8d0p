import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'; // v18.2.0
import * as d3 from 'd3'; // v7.8.5
import classnames from 'classnames'; // v2.3.2
import ResizeObserver from 'resize-observer-polyfill'; // v1.5.1
import { Loader } from '../../common/Loader/Loader';
import { ApiResponse } from '../../../types/api.types';

// Chart types and configurations
export type ChartType = 'timeline' | 'matrix' | 'windows';

export interface ChartData<T> {
  values: T[];
  xAccessor: (d: T) => Date | number;
  yAccessor: (d: T) => number;
  metadata?: Record<string, unknown>;
}

export interface ChartConfig {
  width?: number;
  height?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  animate?: boolean;
  interactive?: boolean;
  responsive?: boolean;
  theme?: 'light' | 'dark';
  accessibility?: {
    announceDataChanges?: boolean;
    enableKeyboardNav?: boolean;
  };
}

export interface ChartInteractionHandlers {
  onZoom?: (domain: [number, number]) => void;
  onBrush?: (selection: [number, number]) => void;
  onClick?: (datum: unknown) => void;
  onHover?: (datum: unknown | null) => void;
}

export interface ChartProps<T = unknown> {
  type: ChartType;
  data: ChartData<T>;
  config?: ChartConfig;
  className?: string;
  onInteraction?: ChartInteractionHandlers;
}

// Custom hook for chart dimensions
const useChartDimensions = (config?: ChartConfig) => {
  const [dimensions, setDimensions] = useState({
    width: config?.width || 600,
    height: config?.height || 400,
    margin: config?.margin || { top: 20, right: 20, bottom: 30, left: 40 }
  });

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !config?.responsive) return;

    const resizeObserver = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDimensions(prev => ({
        ...prev,
        width: width || prev.width,
        height: height || prev.height
      }));
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [config?.responsive]);

  return { dimensions, containerRef };
};

// Main Chart component
export const Chart = React.memo(<T extends unknown>({
  type,
  data,
  config = {},
  className,
  onInteraction
}: ChartProps<T>) => {
  const { dimensions, containerRef } = useChartDimensions(config);
  const svgRef = useRef<SVGSVGElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Memoized scales
  const scales = useMemo(() => {
    const { width, height, margin } = dimensions;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    return {
      x: type === 'timeline' 
        ? d3.scaleTime()
            .domain(d3.extent(data.values, data.xAccessor) as [Date, Date])
            .range([0, innerWidth])
        : d3.scaleLinear()
            .domain([0, d3.max(data.values, data.xAccessor) as number])
            .range([0, innerWidth]),
      y: d3.scaleLinear()
        .domain([0, d3.max(data.values, data.yAccessor) as number])
        .range([innerHeight, 0])
    };
  }, [data, dimensions, type]);

  // Chart rendering function
  const renderChart = useCallback(() => {
    if (!svgRef.current || !data.values.length) return;

    const svg = d3.select(svgRef.current);
    const { width, height, margin } = dimensions;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Clear previous content
    svg.selectAll('*').remove();

    // Create chart container with accessibility attributes
    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)
      .attr('role', 'graphics-document')
      .attr('aria-roledescription', 'data visualization');

    // Add axes
    const xAxis = g
      .append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(scales.x));

    const yAxis = g
      .append('g')
      .attr('class', 'y-axis')
      .call(d3.axisLeft(scales.y));

    // Add chart content based on type
    switch (type) {
      case 'timeline':
        const line = d3.line<T>()
          .x(d => scales.x(data.xAccessor(d)))
          .y(d => scales.y(data.yAccessor(d)));

        g.append('path')
          .datum(data.values)
          .attr('class', 'line')
          .attr('d', line)
          .attr('fill', 'none')
          .attr('stroke', 'currentColor');
        break;

      case 'matrix':
        g.selectAll('rect')
          .data(data.values)
          .enter()
          .append('rect')
          .attr('x', d => scales.x(data.xAccessor(d)))
          .attr('y', d => scales.y(data.yAccessor(d)))
          .attr('width', innerWidth / data.values.length)
          .attr('height', d => innerHeight - scales.y(data.yAccessor(d)));
        break;

      case 'windows':
        g.selectAll('circle')
          .data(data.values)
          .enter()
          .append('circle')
          .attr('cx', d => scales.x(data.xAccessor(d)))
          .attr('cy', d => scales.y(data.yAccessor(d)))
          .attr('r', 5);
        break;
    }

    // Add interactions if enabled
    if (config.interactive) {
      // Zoom behavior
      const zoom = d3.zoom()
        .scaleExtent([1, 5])
        .on('zoom', (event) => {
          g.attr('transform', event.transform);
          onInteraction?.onZoom?.(scales.x.domain());
        });

      // Brush behavior
      const brush = d3.brush()
        .extent([[0, 0], [innerWidth, innerHeight]])
        .on('end', (event) => {
          if (!event.selection) return;
          const [[x0, y0], [x1, y1]] = event.selection;
          onInteraction?.onBrush?.([scales.x.invert(x0), scales.x.invert(x1)]);
        });

      if (onInteraction?.onZoom) svg.call(zoom);
      if (onInteraction?.onBrush) g.call(brush);
    }

    setIsLoading(false);
  }, [data, dimensions, scales, type, config.interactive, onInteraction]);

  // Initial render and updates
  useEffect(() => {
    try {
      renderChart();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error rendering chart');
      setIsLoading(false);
    }
  }, [renderChart]);

  // Keyboard navigation
  useEffect(() => {
    if (!config.accessibility?.enableKeyboardNav) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!svgRef.current) return;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowLeft':
          const step = e.key === 'ArrowRight' ? 1 : -1;
          const currentIndex = data.values.findIndex(d => d === data.values[0]);
          const newIndex = Math.max(0, Math.min(data.values.length - 1, currentIndex + step));
          onInteraction?.onClick?.(data.values[newIndex]);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [data.values, config.accessibility?.enableKeyboardNav, onInteraction]);

  const chartClasses = classnames(
    'chart',
    `chart--${type}`,
    {
      'chart--interactive': config.interactive,
      'chart--loading': isLoading,
      'chart--error': error,
      [`chart--theme-${config.theme}`]: config.theme
    },
    className
  );

  if (error) {
    return (
      <div className="chart__error" role="alert">
        {error}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={chartClasses}>
      {isLoading && <Loader size="medium" />}
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        role="img"
        aria-label={`${type} chart visualization`}
      >
        <title>Data Visualization Chart</title>
        <desc>Interactive data visualization showing {type} view of the dataset</desc>
      </svg>
    </div>
  );
});

Chart.displayName = 'Chart';

export default Chart;