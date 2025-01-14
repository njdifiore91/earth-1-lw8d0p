// @version react@18.2.x
import React, { useCallback, useMemo, useState } from 'react';
// @version react-redux@8.1.x
import { useDispatch, useSelector } from 'react-redux';
// @version @mui/material@5.x
import { 
  Box,
  Switch,
  FormGroup,
  FormControlLabel,
  Slider,
  Typography,
  IconButton,
  Tooltip,
  Divider
} from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import DeleteIcon from '@mui/icons-material/Delete';

import { LayerType, MapLayer } from '../../../types/map.types';
import { MAP_STYLES, LAYER_DEFAULTS } from '../../../constants/map.constants';
import { 
  toggleLayerVisibility, 
  removeLayer,
  selectMapState 
} from '../../../store/slices/mapSlice';

interface LayerControlProps {
  className?: string;
  initialLayers: MapLayer[];
  onLayerChange?: (layers: MapLayer[]) => void;
}

const LayerControl: React.FC<LayerControlProps> = ({
  className,
  initialLayers,
  onLayerChange
}) => {
  const dispatch = useDispatch();
  const mapState = useSelector(selectMapState);
  const [draggedLayer, setDraggedLayer] = useState<string | null>(null);

  // Memoized sorted layers for performance
  const sortedLayers = useMemo(() => {
    return Object.values(mapState.layers).sort((a, b) => 
      (b.metadata?.zIndex || 0) - (a.metadata?.zIndex || 0)
    );
  }, [mapState.layers]);

  // Handle layer visibility toggle with validation
  const handleLayerToggle = useCallback((layerId: string, visible: boolean) => {
    if (!mapState.layers[layerId]) {
      return;
    }

    dispatch(toggleLayerVisibility({ layerId, visible }));
    
    if (onLayerChange) {
      const updatedLayers = Object.values(mapState.layers).map(layer => 
        layer.id === layerId 
          ? { ...layer, layout: { ...layer.layout, visibility: visible ? 'visible' : 'none' }}
          : layer
      );
      onLayerChange(updatedLayers);
    }
  }, [dispatch, mapState.layers, onLayerChange]);

  // Handle layer opacity changes with debouncing
  const handleLayerOpacity = useCallback((layerId: string, opacity: number) => {
    const layer = mapState.layers[layerId];
    if (!layer) return;

    const updatedLayer = {
      ...layer,
      paint: {
        ...layer.paint,
        [`${layer.type}-opacity`]: opacity
      }
    };

    dispatch(removeLayer(layerId));
    dispatch({ type: 'map/addLayer', payload: updatedLayer });

    if (onLayerChange) {
      onLayerChange(Object.values(mapState.layers));
    }
  }, [dispatch, mapState.layers, onLayerChange]);

  // Handle layer reordering with drag and drop
  const handleLayerReorder = useCallback((draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;

    const layers = Object.values(mapState.layers);
    const draggedIndex = layers.findIndex(l => l.id === draggedId);
    const targetIndex = layers.findIndex(l => l.id === targetId);

    const reorderedLayers = [...layers];
    const [draggedLayer] = reorderedLayers.splice(draggedIndex, 1);
    reorderedLayers.splice(targetIndex, 0, draggedLayer);

    // Update z-indices
    const updatedLayers = reorderedLayers.map((layer, idx) => ({
      ...layer,
      metadata: {
        ...layer.metadata,
        zIndex: reorderedLayers.length - idx + LAYER_DEFAULTS.Z_INDEX_BASE
      }
    }));

    // Update store with reordered layers
    updatedLayers.forEach(layer => {
      dispatch(removeLayer(layer.id));
      dispatch({ type: 'map/addLayer', payload: layer });
    });

    if (onLayerChange) {
      onLayerChange(updatedLayers);
    }
  }, [dispatch, mapState.layers, onLayerChange]);

  // Handle layer deletion
  const handleLayerDelete = useCallback((layerId: string) => {
    dispatch(removeLayer(layerId));
    
    if (onLayerChange) {
      const updatedLayers = Object.values(mapState.layers).filter(layer => layer.id !== layerId);
      onLayerChange(updatedLayers);
    }
  }, [dispatch, mapState.layers, onLayerChange]);

  return (
    <Box 
      className={className}
      sx={{
        width: '300px',
        padding: 2,
        backgroundColor: 'background.paper',
        borderRadius: 1,
        boxShadow: 2
      }}
    >
      <Typography variant="h6" gutterBottom>
        Layer Control
      </Typography>
      <Divider sx={{ mb: 2 }} />
      
      <FormGroup>
        {sortedLayers.map((layer) => (
          <Box
            key={layer.id}
            draggable
            onDragStart={() => setDraggedLayer(layer.id)}
            onDragEnd={() => setDraggedLayer(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (draggedLayer) {
                handleLayerReorder(draggedLayer, layer.id);
              }
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              padding: 1,
              borderRadius: 1,
              backgroundColor: draggedLayer === layer.id ? 'action.hover' : 'transparent',
              '&:hover': {
                backgroundColor: 'action.hover'
              }
            }}
          >
            <IconButton 
              size="small"
              sx={{ cursor: 'grab' }}
            >
              <DragIndicatorIcon />
            </IconButton>

            <FormControlLabel
              control={
                <Switch
                  checked={layer.layout.visibility === 'visible'}
                  onChange={(e) => handleLayerToggle(layer.id, e.target.checked)}
                  inputProps={{ 'aria-label': `Toggle ${layer.id} visibility` }}
                />
              }
              label={layer.id}
              sx={{ flex: 1, ml: 1 }}
            />

            <Box sx={{ width: '120px', mx: 2 }}>
              <Tooltip title="Layer Opacity">
                <Slider
                  size="small"
                  value={layer.paint[`${layer.type}-opacity`] || LAYER_DEFAULTS.FILL_OPACITY}
                  onChange={(_, value) => handleLayerOpacity(layer.id, value as number)}
                  min={0}
                  max={1}
                  step={0.1}
                  aria-label={`${layer.id} opacity`}
                  disabled={layer.layout.visibility !== 'visible'}
                />
              </Tooltip>
            </Box>

            <Tooltip title="Delete Layer">
              <IconButton
                size="small"
                onClick={() => handleLayerDelete(layer.id)}
                aria-label={`Delete ${layer.id}`}
              >
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          </Box>
        ))}
      </FormGroup>

      {sortedLayers.length === 0 && (
        <Typography 
          variant="body2" 
          color="text.secondary"
          sx={{ textAlign: 'center', py: 2 }}
        >
          No layers available
        </Typography>
      )}
    </Box>
  );
};

export default LayerControl;