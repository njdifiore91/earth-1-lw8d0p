// @version react@18.2.x
import React, { useCallback, useEffect, useRef, useState } from 'react';
// @version @mui/material@5.x
import { IconButton, Tooltip, Stack, CircularProgress } from '@mui/material';
// @version @mui/icons-material@5.x
import {
  PolygonOutlined,
  RoomOutlined,
  TimelineOutlined,
  ClearOutlined
} from '@mui/icons-material';

import { DrawMode, MapState } from '../../../types/map.types';
import { useMap } from '../../../hooks/useMap';
import { DRAW_DEFAULTS, INTERACTION_SETTINGS } from '../../../constants/map.constants';

interface DrawToolsProps {
  onDrawComplete: (features: mapboxgl.MapboxGeoJSONFeature[], mode: DrawMode) => void;
  onDrawCancel: () => void;
  className?: string;
  disabled?: boolean;
  maxPoints?: number;
  snapToGrid?: boolean;
  gridSize?: number;
}

/**
 * DrawTools component provides map drawing functionality with accessibility support
 * and touch optimization for defining areas of interest.
 */
export const DrawTools: React.FC<DrawToolsProps> = ({
  onDrawComplete,
  onDrawCancel,
  className,
  disabled = false,
  maxPoints = DRAW_DEFAULTS.MAX_POINTS,
  snapToGrid = false,
  gridSize = DRAW_DEFAULTS.SNAP_TOLERANCE
}) => {
  // Map state and refs
  const { mapState, setDrawMode } = useMap();
  const drawingRef = useRef<boolean>(false);
  const pointCountRef = useRef<number>(0);
  const featuresRef = useRef<mapboxgl.MapboxGeoJSONFeature[]>([]);

  // Component state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [activeMode, setActiveMode] = useState<DrawMode>(DrawMode.NONE);
  const [error, setError] = useState<string | null>(null);

  /**
   * Handles switching between different drawing modes
   */
  const handleDrawModeChange = useCallback((mode: DrawMode) => {
    if (disabled || isProcessing) return;

    // Cancel current drawing if switching modes
    if (drawingRef.current) {
      handleDrawCancel();
    }

    setActiveMode(mode);
    setDrawMode(mode);
    drawingRef.current = true;
    pointCountRef.current = 0;
    featuresRef.current = [];
    setError(null);

    // Initialize drawing settings
    if (snapToGrid) {
      // Enable grid snapping with specified size
      document.body.style.cursor = 'crosshair';
    }
  }, [disabled, isProcessing, setDrawMode, snapToGrid]);

  /**
   * Handles drawing cancellation and cleanup
   */
  const handleDrawCancel = useCallback(() => {
    drawingRef.current = false;
    pointCountRef.current = 0;
    featuresRef.current = [];
    setActiveMode(DrawMode.NONE);
    setDrawMode(DrawMode.NONE);
    setError(null);
    document.body.style.cursor = 'default';
    onDrawCancel();
  }, [setDrawMode, onDrawCancel]);

  /**
   * Handles completion of drawing operation
   */
  const handleDrawComplete = useCallback(async () => {
    if (!drawingRef.current || featuresRef.current.length === 0) return;

    setIsProcessing(true);
    try {
      await onDrawComplete(featuresRef.current, activeMode);
      handleDrawCancel();
    } catch (err) {
      setError('Failed to process drawing');
      console.error('Draw completion error:', err);
    } finally {
      setIsProcessing(false);
    }
  }, [activeMode, onDrawComplete, handleDrawCancel]);

  /**
   * Effect to handle keyboard shortcuts and accessibility
   */
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (disabled) return;

      switch (e.key) {
        case 'p':
          handleDrawModeChange(DrawMode.DRAW_POLYGON);
          break;
        case 'l':
          handleDrawModeChange(DrawMode.DRAW_LINE);
          break;
        case 'm':
          handleDrawModeChange(DrawMode.DRAW_POINT);
          break;
        case 'Escape':
          handleDrawCancel();
          break;
        case 'Enter':
          if (drawingRef.current) {
            handleDrawComplete();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [disabled, handleDrawModeChange, handleDrawCancel, handleDrawComplete]);

  return (
    <Stack
      className={className}
      spacing={1}
      sx={{
        position: 'absolute',
        top: 20,
        left: 20,
        zIndex: 1000,
        backgroundColor: 'background.paper',
        borderRadius: 1,
        padding: 1,
        boxShadow: 3
      }}
      role="toolbar"
      aria-label="Drawing Tools"
    >
      <Tooltip title="Draw Polygon (P)" placement="right">
        <span>
          <IconButton
            onClick={() => handleDrawModeChange(DrawMode.DRAW_POLYGON)}
            disabled={disabled || isProcessing}
            color={activeMode === DrawMode.DRAW_POLYGON ? 'primary' : 'default'}
            aria-label="Draw Polygon"
            aria-pressed={activeMode === DrawMode.DRAW_POLYGON}
          >
            <PolygonOutlined />
          </IconButton>
        </span>
      </Tooltip>

      <Tooltip title="Draw Line (L)" placement="right">
        <span>
          <IconButton
            onClick={() => handleDrawModeChange(DrawMode.DRAW_LINE)}
            disabled={disabled || isProcessing}
            color={activeMode === DrawMode.DRAW_LINE ? 'primary' : 'default'}
            aria-label="Draw Line"
            aria-pressed={activeMode === DrawMode.DRAW_LINE}
          >
            <TimelineOutlined />
          </IconButton>
        </span>
      </Tooltip>

      <Tooltip title="Place Point (M)" placement="right">
        <span>
          <IconButton
            onClick={() => handleDrawModeChange(DrawMode.DRAW_POINT)}
            disabled={disabled || isProcessing}
            color={activeMode === DrawMode.DRAW_POINT ? 'primary' : 'default'}
            aria-label="Place Point"
            aria-pressed={activeMode === DrawMode.DRAW_POINT}
          >
            <RoomOutlined />
          </IconButton>
        </span>
      </Tooltip>

      {(drawingRef.current || isProcessing) && (
        <Tooltip title="Cancel Drawing (Esc)" placement="right">
          <span>
            <IconButton
              onClick={handleDrawCancel}
              disabled={isProcessing}
              color="error"
              aria-label="Cancel Drawing"
            >
              {isProcessing ? <CircularProgress size={24} /> : <ClearOutlined />}
            </IconButton>
          </span>
        </Tooltip>
      )}

      {error && (
        <Tooltip title={error} placement="right">
          <div
            role="alert"
            aria-live="polite"
            style={{
              color: 'error.main',
              fontSize: '0.75rem',
              padding: '0 8px'
            }}
          >
            {error}
          </div>
        </Tooltip>
      )}
    </Stack>
  );
};

export default DrawTools;