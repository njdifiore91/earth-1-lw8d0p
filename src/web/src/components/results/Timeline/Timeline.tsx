import React, { useEffect, useMemo, useCallback, useRef } from 'react';
import { useSelector } from 'react-redux'; // v8.1.0
import * as d3 from 'd3'; // v7.8.5

// Internal imports
import { SearchResult, SearchState } from '../../../types/search.types';
import { formatCollectionWindow, calculateTimeWindow } from '../../../utils/date.utils';
import Loader from '../../common/Loader/Loader';
import { selectSearchResults, selectSearchStatus } from '../../../store/slices/searchSlice';

// Component props interface
interface TimelineProps {
  readonly height?: number;
  readonly width?: number | string;
  readonly className?: string;
  readonly ariaLabel?: string;
}

// Timeline component with performance optimization
const Timeline: React.FC<TimelineProps> = React.memo(({
  height = 200,
  width = '100%',
  className = '',
  ariaLabel = 'Search Results Timeline'
}) => {
  // Refs for D3 elements
  const svgRef = useRef<SVGSVGElement>(null);
  const timelineRef = useRef<SVGGElement>(null);
  const brushRef = useRef<SVGGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Redux state
  const results = useSelector(selectSearchResults);
  const status = useSelector(selectSearchStatus);

  // Constants for timeline visualization
  const MARGIN = { top: 20, right: 30, bottom: 30, left: 40 };
  const TIMELINE_HEIGHT = height - MARGIN.top - MARGIN.bottom;
  const TIMELINE_WIDTH = typeof width === 'number' ? width - MARGIN.left - MARGIN.right : '100%';

  // Memoized scale creation
  const timeScale = useMemo(() => {
    if (!results.length) return null;

    const timestamps = results.map(r => new Date(r.timestamp));
    const domain = [
      d3.min(timestamps) || new Date(),
      d3.max(timestamps) || new Date()
    ];

    return d3.scaleTime()
      .domain(domain)
      .range([0, typeof TIMELINE_WIDTH === 'number' ? TIMELINE_WIDTH : 800])
      .nice();
  }, [results, TIMELINE_WIDTH]);

  // Initialize D3 visualization
  const initializeTimeline = useCallback(() => {
    if (!svgRef.current || !timeScale || !results.length) return;

    const svg = d3.select(svgRef.current);
    const timeline = d3.select(timelineRef.current);

    // Clear existing elements
    timeline.selectAll('*').remove();

    // Create axes
    const xAxis = d3.axisBottom(timeScale);
    const yAxis = d3.axisLeft(d3.scaleLinear()
      .domain([0, 100])
      .range([TIMELINE_HEIGHT, 0]));

    // Add axes to timeline
    timeline.append('g')
      .attr('class', 'timeline__axis timeline__axis--x')
      .attr('transform', `translate(0,${TIMELINE_HEIGHT})`)
      .call(xAxis);

    timeline.append('g')
      .attr('class', 'timeline__axis timeline__axis--y')
      .call(yAxis.tickFormat(d => `${d}%`));

    // Add collection windows
    const markers = timeline.selectAll('.timeline__marker')
      .data(results)
      .enter()
      .append('g')
      .attr('class', 'timeline__marker')
      .attr('role', 'graphics-symbol')
      .attr('aria-label', d => `Collection window at ${formatCollectionWindow(new Date(d.timestamp))} with ${d.confidence}% confidence`);

    // Add marker circles
    markers.append('circle')
      .attr('cx', d => timeScale(new Date(d.timestamp)))
      .attr('cy', d => TIMELINE_HEIGHT * (1 - d.confidence / 100))
      .attr('r', 6)
      .attr('class', 'timeline__marker-circle')
      .attr('tabindex', 0)
      .attr('aria-selected', 'false');

    // Add confidence lines
    markers.append('line')
      .attr('x1', d => timeScale(new Date(d.timestamp)))
      .attr('x2', d => timeScale(new Date(d.timestamp)))
      .attr('y1', TIMELINE_HEIGHT)
      .attr('y2', d => TIMELINE_HEIGHT * (1 - d.confidence / 100))
      .attr('class', 'timeline__confidence-line');

    // Initialize brush
    const brush = d3.brushX()
      .extent([[0, 0], [TIMELINE_WIDTH, TIMELINE_HEIGHT]])
      .on('brush', handleBrush)
      .on('end', handleBrushEnd);

    d3.select(brushRef.current)
      .call(brush);

  }, [timeScale, results, TIMELINE_HEIGHT, TIMELINE_WIDTH]);

  // Brush event handlers
  const handleBrush = useCallback((event: d3.D3BrushEvent<unknown>) => {
    if (!event.selection) return;
    const [x0, x1] = event.selection as [number, number];
    const selectedTimes = timeScale?.invert(x0);
    const selectedTimeEnd = timeScale?.invert(x1);
    // Update selected range logic here
  }, [timeScale]);

  const handleBrushEnd = useCallback((event: d3.D3BrushEvent<unknown>) => {
    if (!event.selection) {
      // Reset selection logic here
    }
  }, []);

  // Keyboard navigation
  const handleKeyNavigation = useCallback((event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (!target.classList.contains('timeline__marker-circle')) return;

    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowRight':
        const markers = Array.from(document.querySelectorAll('.timeline__marker-circle'));
        const currentIndex = markers.indexOf(target);
        const nextIndex = event.key === 'ArrowLeft' ? 
          Math.max(0, currentIndex - 1) : 
          Math.min(markers.length - 1, currentIndex + 1);
        (markers[nextIndex] as HTMLElement).focus();
        break;
      case 'Enter':
      case ' ':
        target.setAttribute('aria-selected', 
          target.getAttribute('aria-selected') === 'true' ? 'false' : 'true');
        break;
    }
  }, []);

  // Initialize and cleanup
  useEffect(() => {
    initializeTimeline();
    return () => {
      // Cleanup D3 elements
      if (svgRef.current) {
        d3.select(svgRef.current).selectAll('*').remove();
      }
    };
  }, [initializeTimeline]);

  // Loading state
  if (status === 'IN_PROGRESS') {
    return <Loader size="large" ariaLabel="Loading timeline data" />;
  }

  // Empty state
  if (!results.length) {
    return (
      <div className="timeline__empty" role="alert">
        No collection windows available
      </div>
    );
  }

  return (
    <div 
      className={`timeline ${className}`}
      role="region"
      aria-label={ariaLabel}
    >
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="timeline__svg"
        role="img"
        aria-label="Timeline visualization of collection windows"
      >
        <g
          ref={timelineRef}
          className="timeline__content"
          transform={`translate(${MARGIN.left},${MARGIN.top})`}
        >
          <g ref={brushRef} className="timeline__brush" />
        </g>
      </svg>
      <div 
        ref={tooltipRef}
        className="timeline__tooltip"
        role="tooltip"
        aria-hidden="true"
      />
    </div>
  );
});

// Display name for debugging
Timeline.displayName = 'Timeline';

export default Timeline;