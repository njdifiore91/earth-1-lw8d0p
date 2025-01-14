import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  RadioGroup, 
  Radio, 
  FormControlLabel, 
  CircularProgress, 
  Alert 
} from '@mui/material';
import { styled } from '@mui/material/styles';
import mapboxgl from 'mapbox-gl';
import { debounce } from 'lodash';

// Internal imports
import Input from '../../common/Input/Input';
import Button from '../../common/Button/Button';
import { DrawMode } from '../../../types/map.types';
import { setSearchParameters } from '../../../store/slices/searchSlice';
import { LOCATION_VALIDATION, FILE_VALIDATION } from '../../../constants/validation.constants';

// Styled components with enhanced accessibility
const StyledContainer = styled('div')(({ theme }) => ({
  padding: theme.spacing(3),
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(2),
  backgroundColor: theme.palette.background.paper,
  borderRadius: theme.shape.borderRadius,
  boxShadow: theme.shadows[1],
  '& .MuiFormControlLabel-root': {
    marginBottom: theme.spacing(1),
  },
  [theme.breakpoints.down('md')]: {
    padding: theme.spacing(2),
  },
}));

const StyledInputGroup = styled('div')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(2),
  '& .MuiFormHelperText-root': {
    marginLeft: theme.spacing(1),
  },
  '& .visually-hidden': {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    border: 0,
  },
}));

interface LocationInputProps {
  onLocationChange: (location: GeoJSON.Feature) => void;
  initialLocation?: GeoJSON.Feature | null;
  isAccessible?: boolean;
}

export const LocationInput: React.FC<LocationInputProps> = ({
  onLocationChange,
  initialLocation,
  isAccessible = false,
}) => {
  const dispatch = useDispatch();
  const [inputMethod, setInputMethod] = useState<'draw' | 'upload' | 'coordinates'>('draw');
  const [coordinates, setCoordinates] = useState({ lat: '', lng: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<mapboxgl.Map | null>(null);

  // Initialize map
  useEffect(() => {
    if (inputMethod === 'draw' && mapContainerRef.current && !mapInstance.current) {
      mapInstance.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/satellite-v9',
        center: [-74.5, 40],
        zoom: 9,
        accessToken: process.env.MAPBOX_ACCESS_TOKEN
      });

      // Add accessibility controls
      if (isAccessible) {
        mapInstance.current.addControl(new mapboxgl.NavigationControl());
        mapInstance.current.addControl(new mapboxgl.KeyboardHandler());
      }

      return () => {
        mapInstance.current?.remove();
        mapInstance.current = null;
      };
    }
  }, [inputMethod, isAccessible]);

  // Handle input method change
  const handleInputMethodChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const method = event.target.value as 'draw' | 'upload' | 'coordinates';
    setInputMethod(method);
    setError(null);
    setValidationMessage(null);

    // Announce method change for screen readers
    const announcement = `Switched to ${method} input method`;
    const ariaLive = document.getElementById('aria-live-region');
    if (ariaLive) {
      ariaLive.textContent = announcement;
    }
  }, []);

  // Handle coordinate input with validation
  const handleCoordinateChange = useCallback(
    debounce((event: React.ChangeEvent<HTMLInputElement>, field: 'lat' | 'lng') => {
      const value = event.target.value;
      const numValue = parseFloat(value);

      setCoordinates(prev => ({ ...prev, [field]: value }));

      if (isNaN(numValue)) {
        setError(`Invalid ${field === 'lat' ? 'latitude' : 'longitude'} value`);
        return;
      }

      const bounds = LOCATION_VALIDATION.COORDINATE_BOUNDS[field];
      if (numValue < bounds.min || numValue > bounds.max) {
        setError(`${field === 'lat' ? 'Latitude' : 'Longitude'} must be between ${bounds.min} and ${bounds.max}`);
        return;
      }

      setError(null);

      if (coordinates.lat && coordinates.lng) {
        const location: GeoJSON.Feature = {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [parseFloat(coordinates.lng), parseFloat(coordinates.lat)]
          },
          properties: {}
        };
        onLocationChange(location);
        dispatch(setSearchParameters({ location }));
      }
    }, 300),
    [coordinates, dispatch, onLocationChange]
  );

  // Handle file upload with validation
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      setError(null);

      // Validate file size
      if (file.size > FILE_VALIDATION.MAX_KML_SIZE) {
        throw new Error(`File size exceeds maximum limit of ${FILE_VALIDATION.MAX_KML_SIZE / 1024 / 1024}MB`);
      }

      // Validate file type
      if (!FILE_VALIDATION.ALLOWED_FILE_TYPES.includes(file.name.toLowerCase().split('.').pop() as '.kml' | '.kmz')) {
        throw new Error('Invalid file type. Only KML and KMZ files are supported');
      }

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          // Here you would implement KML parsing logic
          // For now, we'll simulate with a mock feature
          const location: GeoJSON.Feature = {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [[]]
            },
            properties: {}
          };

          onLocationChange(location);
          dispatch(setSearchParameters({ location }));
          setValidationMessage('File uploaded successfully');
        } catch (error) {
          setError('Failed to parse KML file');
        }
      };

      reader.readAsText(file);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'File upload failed');
    } finally {
      setLoading(false);
    }
  }, [dispatch, onLocationChange]);

  return (
    <StyledContainer role="region" aria-label="Location Input">
      <div id="aria-live-region" className="visually-hidden" aria-live="polite" />
      
      <RadioGroup
        aria-label="Location input method"
        value={inputMethod}
        onChange={handleInputMethodChange}
      >
        <FormControlLabel
          value="draw"
          control={<Radio />}
          label="Draw on map"
          aria-describedby="draw-description"
        />
        <FormControlLabel
          value="upload"
          control={<Radio />}
          label="Upload KML file"
          aria-describedby="upload-description"
        />
        <FormControlLabel
          value="coordinates"
          control={<Radio />}
          label="Enter coordinates"
          aria-describedby="coordinates-description"
        />
      </RadioGroup>

      <StyledInputGroup>
        {inputMethod === 'draw' && (
          <div
            ref={mapContainerRef}
            style={{ height: '400px', width: '100%' }}
            role="application"
            aria-label="Interactive map for drawing location"
          />
        )}

        {inputMethod === 'upload' && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".kml,.kmz"
              onChange={handleFileUpload}
              className="visually-hidden"
              aria-label="Upload KML or KMZ file"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} /> : undefined}
              ariaLabel="Choose file to upload"
            >
              {loading ? 'Uploading...' : 'Choose File'}
            </Button>
          </>
        )}

        {inputMethod === 'coordinates' && (
          <>
            <Input
              name="latitude"
              id="latitude"
              type="number"
              value={coordinates.lat}
              onChange={(e) => handleCoordinateChange(e, 'lat')}
              label="Latitude"
              placeholder="Enter latitude"
              required
              error={!!error && error.includes('latitude')}
              helperText={error?.includes('latitude') ? error : ''}
            />
            <Input
              name="longitude"
              id="longitude"
              type="number"
              value={coordinates.lng}
              onChange={(e) => handleCoordinateChange(e, 'lng')}
              label="Longitude"
              placeholder="Enter longitude"
              required
              error={!!error && error.includes('longitude')}
              helperText={error?.includes('longitude') ? error : ''}
            />
          </>
        )}

        {error && (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        )}

        {validationMessage && (
          <Alert severity="success" role="status">
            {validationMessage}
          </Alert>
        )}
      </StyledInputGroup>
    </StyledContainer>
  );
};

export default LocationInput;