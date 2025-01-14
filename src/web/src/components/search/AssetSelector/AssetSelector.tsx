/**
 * AssetSelector Component
 * @version 1.0.0
 * Implements enterprise-grade asset type selection with enhanced validation,
 * accessibility features, and Material Design 3.0 compliance
 */

// External imports
import React, { useCallback, useMemo, useEffect } from 'react'; // ^18.2.0
import { useDispatch, useSelector } from 'react-redux'; // ^8.0.5

// Internal imports
import Select from '../../common/Select/Select';
import { 
  AssetType, 
  SearchParameters, 
  CustomAssetValidation 
} from '../../../types/search.types';
import { 
  setSearchParameters, 
  selectSearchParameters,
  validateAssetType 
} from '../../../store/slices/searchSlice';

// Constants for asset type options with accessibility support
const ASSET_TYPE_OPTIONS = [
  {
    value: 'ENVIRONMENTAL_MONITORING',
    label: 'Environmental Monitoring',
    description: 'Satellite data for environmental monitoring and analysis',
    ariaLabel: 'Select Environmental Monitoring asset type'
  },
  {
    value: 'INFRASTRUCTURE',
    label: 'Infrastructure',
    description: 'Satellite data for infrastructure monitoring',
    ariaLabel: 'Select Infrastructure asset type'
  },
  {
    value: 'AGRICULTURE',
    label: 'Agriculture',
    description: 'Satellite data for agricultural monitoring',
    ariaLabel: 'Select Agriculture asset type'
  },
  {
    value: 'CUSTOM',
    label: 'Custom',
    description: 'Define custom satellite data requirements',
    ariaLabel: 'Select Custom asset type'
  }
] as const;

// Error message constants
const ERROR_MESSAGES = {
  INVALID_TYPE: 'Selected asset type is not valid',
  CUSTOM_VALIDATION_FAILED: 'Custom validation failed',
  REQUIRED_FIELD: 'Asset type selection is required'
} as const;

// Component props interface with enhanced validation and accessibility options
interface AssetSelectorProps {
  disabled?: boolean;
  required?: boolean;
  onChange?: (assetType: AssetType) => void;
  customValidation?: CustomAssetValidation;
  errorMessage?: string;
}

/**
 * Enhanced AssetSelector component with comprehensive validation and accessibility
 */
const AssetSelector: React.FC<AssetSelectorProps> = React.memo(({
  disabled = false,
  required = true,
  onChange,
  customValidation,
  errorMessage
}) => {
  // Redux hooks
  const dispatch = useDispatch();
  const searchParameters = useSelector(selectSearchParameters);

  // Memoized asset type options
  const options = useMemo(() => ASSET_TYPE_OPTIONS.map(option => ({
    value: option.value,
    label: option.label,
    'aria-label': option.ariaLabel,
    'data-description': option.description
  })), []);

  // Validation state
  const [validationError, setValidationError] = React.useState<string | null>(null);

  /**
   * Handles asset type selection with enhanced validation
   */
  const handleAssetTypeChange = useCallback((value: string) => {
    const assetType = value as AssetType;
    let isValid = true;
    let validationMessage = '';

    try {
      // Basic validation
      if (!Object.values(ASSET_TYPE_OPTIONS).map(opt => opt.value).includes(assetType)) {
        isValid = false;
        validationMessage = ERROR_MESSAGES.INVALID_TYPE;
      }

      // Custom validation if provided
      if (isValid && customValidation) {
        isValid = customValidation(assetType);
        if (!isValid) {
          validationMessage = ERROR_MESSAGES.CUSTOM_VALIDATION_FAILED;
        }
      }

      // Special handling for custom asset type
      if (isValid && assetType === 'CUSTOM') {
        // Validate custom asset type requirements
        isValid = validateAssetType(assetType);
      }

      if (isValid) {
        // Update search parameters in Redux store
        dispatch(setSearchParameters({
          ...searchParameters,
          assetType
        }));

        // Clear validation error
        setValidationError(null);

        // Call onChange callback if provided
        onChange?.(assetType);
      } else {
        setValidationError(validationMessage || errorMessage || ERROR_MESSAGES.INVALID_TYPE);
      }
    } catch (error) {
      console.error('Asset type selection error:', error);
      setValidationError(ERROR_MESSAGES.INVALID_TYPE);
    }
  }, [dispatch, searchParameters, customValidation, onChange, errorMessage]);

  // Effect for initial validation
  useEffect(() => {
    if (required && !searchParameters?.assetType) {
      setValidationError(ERROR_MESSAGES.REQUIRED_FIELD);
    }
  }, [required, searchParameters?.assetType]);

  return (
    <Select
      value={searchParameters?.assetType || ''}
      onChange={handleAssetTypeChange}
      options={options}
      label="Asset Type"
      disabled={disabled}
      required={required}
      error={!!validationError}
      helperText={validationError}
      fullWidth
      id="asset-type-selector"
      aria-label="Select satellite data asset type"
    />
  );
});

// Display name for debugging
AssetSelector.displayName = 'AssetSelector';

export default AssetSelector;