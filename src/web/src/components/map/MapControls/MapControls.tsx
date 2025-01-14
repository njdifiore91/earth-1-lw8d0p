// @version react@18.2.x
import React from 'react';
// @version react-redux@8.x
import { useSelector } from 'react-redux';
// @version lodash@4.x
import { debounce } from 'lodash';
// @version @mui/material@5.x
import { useTheme } from '@mui/material';

// Internal imports
import { useMap } from '../../../hooks/useMap';
import { Button } from '../../common/Button/Button';
import { DrawMode } from '../../../types/map.types';

/**
 * Interface for MapControls component props
 */
interface MapControlsProps {
  className?: string;
  isOffline?: boolean;
  touchEnabled?: boolean;
  ariaLabels?: {
    zoom: string;
    draw: string;
  };
}

/**
 * Enhanced MapControls component with accessibility and performance optimization
 */
export const MapControls = React.memo<MapControlsProps>(({
  className,
  isOffline = false,
  touchEnabled = false,
  ariaLabels = {
    zoom: 'Map zoom controls',
    draw: 'Drawing tools'
  }
}) => {
  // Hooks
  const theme = useTheme();
  const { setZoom, setDrawMode, getMapState } = useMap();
  const mapState = useSelector((state: any) => state.map.currentState);

  // Constants for zoom limits
  const MIN_ZOOM = 0;
  const MAX_ZOOM = 22;
  const ZOOM_STEP = 1;

  /**
   * Debounced zoom in handler with validation
   */
  const handleZoomIn = debounce(() => {
    const currentZoom = getMapState().zoom;
    if (currentZoom < MAX_ZOOM) {
      setZoom(Math.min(currentZoom + ZOOM_STEP, MAX_ZOOM), {
        animate: true,
        duration: 300,
        announceChange: true
      });
    }
  }, 300);

  /**
   * Debounced zoom out handler with validation
   */
  const handleZoomOut = debounce(() => {
    const currentZoom = getMapState().zoom;
    if (currentZoom > MIN_ZOOM) {
      setZoom(Math.max(currentZoom - ZOOM_STEP, MIN_ZOOM), {
        animate: true,
        duration: 300,
        announceChange: true
      });
    }
  }, 300);

  /**
   * Debounced drawing mode toggle with enhanced feedback
   */
  const toggleDrawMode = debounce(() => {
    const currentMode = getMapState().drawMode;
    const newMode = currentMode === DrawMode.DRAW_POLYGON 
      ? DrawMode.NONE 
      : DrawMode.DRAW_POLYGON;

    setDrawMode(newMode, {
      updateCursor: true,
      announceChange: true
    });
  }, 300);

  return (
    <div 
      className={`map-controls ${className || ''}`}
      role="group"
      aria-label={ariaLabels.zoom}
      style={{
        position: 'absolute',
        right: theme.spacing(2),
        top: theme.spacing(2),
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing(1),
        zIndex: 1000,
      }}
    >
      {/* Zoom Controls */}
      <div
        role="group"
        aria-label={ariaLabels.zoom}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: theme.spacing(0.5),
          backgroundColor: theme.palette.background.paper,
          borderRadius: theme.shape.borderRadius,
          boxShadow: theme.shadows[2],
        }}
      >
        <Button
          variant="contained"
          color="primary"
          size="small"
          onClick={handleZoomIn}
          disabled={isOffline || mapState.zoom >= MAX_ZOOM}
          ariaLabel="Zoom in"
          startIcon={<span aria-hidden="true">+</span>}
          style={{
            minWidth: touchEnabled ? '48px' : '36px',
            minHeight: touchEnabled ? '48px' : '36px',
          }}
        />
        <Button
          variant="contained"
          color="primary"
          size="small"
          onClick={handleZoomOut}
          disabled={isOffline || mapState.zoom <= MIN_ZOOM}
          ariaLabel="Zoom out"
          startIcon={<span aria-hidden="true">-</span>}
          style={{
            minWidth: touchEnabled ? '48px' : '36px',
            minHeight: touchEnabled ? '48px' : '36px',
          }}
        />
      </div>

      {/* Drawing Tools */}
      <div
        role="group"
        aria-label={ariaLabels.draw}
        style={{
          backgroundColor: theme.palette.background.paper,
          borderRadius: theme.shape.borderRadius,
          boxShadow: theme.shadows[2],
        }}
      >
        <Button
          variant="contained"
          color="primary"
          size="small"
          onClick={toggleDrawMode}
          disabled={isOffline}
          ariaLabel={mapState.drawMode === DrawMode.DRAW_POLYGON ? 'Stop drawing' : 'Start drawing'}
          startIcon={
            <span aria-hidden="true">
              {mapState.drawMode === DrawMode.DRAW_POLYGON ? '✓' : '✏️'}
            </span>
          }
          style={{
            minWidth: touchEnabled ? '48px' : '36px',
            minHeight: touchEnabled ? '48px' : '36px',
            backgroundColor: mapState.drawMode === DrawMode.DRAW_POLYGON 
              ? theme.palette.primary.dark 
              : theme.palette.primary.main,
          }}
        />
      </div>
    </div>
  );
});

// Display name for debugging
MapControls.displayName = 'MapControls';

export default MapControls;