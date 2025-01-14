import React, { useMemo, useCallback, useEffect, useRef } from 'react'; // v18.2.0
import { useSelector } from 'react-redux'; // v8.0.5
import styled from 'styled-components'; // v5.3.6
import { useVirtual } from 'react-virtual'; // v2.10.4
import { initializeChart, updateChart, ChartErrorBoundary } from '../../visualization/Chart/Chart';
import { SearchResult, SearchParameters, AssetType } from '../../../types/search.types';

// Constants for matrix visualization
const MATRIX_COLORS = {
  LOW: '#ff4d4d',
  MEDIUM: '#ffd700',
  HIGH: '#4CAF50',
  DISABLED: '#cccccc'
} as const;

const CONFIDENCE_THRESHOLDS = {
  LOW: 0.4,
  MEDIUM: 0.7,
  HIGH: 0.9,
  CRITICAL: 0.95
} as const;

const VIRTUALIZATION_CONFIG = {
  itemSize: 50,
  overscan: 5,
  threshold: 100
} as const;

// Styled components
const MatrixContainer = styled.div<{ $isDarkMode: boolean }>`
  position: relative;
  width: 100%;
  height: 100%;
  background: ${props => props.$isDarkMode ? '#1a1a1a' : '#ffffff'};
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`;

const MatrixCell = styled.div<{ $confidence: number }>`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background-color: ${props => getConfidenceColor(props.$confidence)};
  cursor: pointer;
  transition: transform 0.2s ease;
  
  &:hover {
    transform: scale(1.05);
  }
  
  &:focus-visible {
    outline: 2px solid #0066cc;
    outline-offset: -2px;
  }
`;

// Interfaces
interface CapabilityMatrixProps {
  width: number;
  height: number;
  onCapabilityClick: (assetType: AssetType, confidence: number, window: TimeWindow) => void;
  theme?: 'light' | 'dark';
  accessibility?: {
    announceChanges?: boolean;
    keyboardNav?: boolean;
  };
}

interface MatrixData {
  assetType: AssetType;
  confidence: number;
  window: TimeWindow;
  metadata: Record<string, unknown>;
}

interface TimeWindow {
  start: string;
  end: string;
}

// Helper functions
const getConfidenceColor = (confidence: number): string => {
  if (confidence >= CONFIDENCE_THRESHOLDS.CRITICAL) return MATRIX_COLORS.HIGH;
  if (confidence >= CONFIDENCE_THRESHOLDS.HIGH) return MATRIX_COLORS.HIGH;
  if (confidence >= CONFIDENCE_THRESHOLDS.MEDIUM) return MATRIX_COLORS.MEDIUM;
  if (confidence >= CONFIDENCE_THRESHOLDS.LOW) return MATRIX_COLORS.LOW;
  return MATRIX_COLORS.DISABLED;
};

// Main component
export const CapabilityMatrix: React.FC<CapabilityMatrixProps> = React.memo(({
  width,
  height,
  onCapabilityClick,
  theme = 'light',
  accessibility = { announceChanges: true, keyboardNav: true }
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const searchResults = useSelector((state: any) => state.search.results);
  const isDarkMode = theme === 'dark';

  // Memoized matrix data transformation
  const matrixData = useMemo(() => {
    return searchResults.map((result: SearchResult) => ({
      assetType: result.metadata.assetType as AssetType,
      confidence: result.confidence,
      window: {
        start: result.metadata.collectionTime,
        end: result.metadata.collectionTime
      },
      metadata: result.metadata
    }));
  }, [searchResults]);

  // Virtual list setup for performance
  const rowVirtualizer = useVirtual({
    size: matrixData.length,
    parentRef: chartRef,
    estimateSize: useCallback(() => VIRTUALIZATION_CONFIG.itemSize, []),
    overscan: VIRTUALIZATION_CONFIG.overscan
  });

  // Chart initialization and updates
  useEffect(() => {
    if (!chartRef.current || !matrixData.length) return;

    const chart = initializeChart(chartRef.current, {
      width,
      height,
      theme: isDarkMode ? 'dark' : 'light',
      accessibility: {
        announceDataChanges: accessibility.announceChanges,
        enableKeyboardNav: accessibility.keyboardNav
      }
    });

    updateChart(chart, matrixData);

    return () => {
      chart.destroy?.();
    };
  }, [width, height, matrixData, isDarkMode, accessibility]);

  // Keyboard navigation
  const handleKeyDown = useCallback((event: React.KeyboardEvent, data: MatrixData) => {
    if (!accessibility.keyboardNav) return;

    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        onCapabilityClick(data.assetType, data.confidence, data.window);
        break;
      case 'ArrowRight':
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'ArrowDown':
        event.preventDefault();
        // Handle focus movement
        const currentIndex = matrixData.indexOf(data);
        let newIndex = currentIndex;
        
        switch (event.key) {
          case 'ArrowRight': newIndex = Math.min(currentIndex + 1, matrixData.length - 1); break;
          case 'ArrowLeft': newIndex = Math.max(currentIndex - 1, 0); break;
          case 'ArrowUp': newIndex = Math.max(currentIndex - width, 0); break;
          case 'ArrowDown': newIndex = Math.min(currentIndex + width, matrixData.length - 1); break;
        }
        
        document.querySelector(`[data-index="${newIndex}"]`)?.focus();
        break;
    }
  }, [matrixData, width, onCapabilityClick, accessibility.keyboardNav]);

  return (
    <ChartErrorBoundary>
      <MatrixContainer
        ref={chartRef}
        $isDarkMode={isDarkMode}
        role="grid"
        aria-label="Capability Assessment Matrix"
      >
        {rowVirtualizer.virtualItems.map((virtualRow) => {
          const data = matrixData[virtualRow.index];
          return (
            <MatrixCell
              key={virtualRow.index}
              $confidence={data.confidence}
              style={{
                transform: `translateY(${virtualRow.start}px)`,
                height: `${virtualRow.size}px`,
              }}
              onClick={() => onCapabilityClick(data.assetType, data.confidence, data.window)}
              onKeyDown={(e) => handleKeyDown(e, data)}
              role="gridcell"
              tabIndex={0}
              data-index={virtualRow.index}
              aria-label={`${data.assetType} capability with ${Math.round(data.confidence * 100)}% confidence`}
            >
              {Math.round(data.confidence * 100)}%
            </MatrixCell>
          );
        })}
      </MatrixContainer>
    </ChartErrorBoundary>
  );
});

CapabilityMatrix.displayName = 'CapabilityMatrix';

export default CapabilityMatrix;