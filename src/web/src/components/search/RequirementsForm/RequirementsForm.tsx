import React, { useCallback, useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form'; // v7.45.0
import { Grid, Checkbox, FormControlLabel, CircularProgress } from '@mui/material'; // v5.x
import { debounce } from 'lodash'; // v4.17.21

// Internal imports
import { SearchRequirements, AssetType } from '../../../types/search.types';
import { validateRequirements } from '../../../utils/validation.utils';
import Input from '../../common/Input/Input';
import { ASSET_VALIDATION } from '../../../constants/validation.constants';

interface RequirementsFormProps {
  initialValues?: SearchRequirements;
  assetType: AssetType;
  onSubmit: (requirements: SearchRequirements) => Promise<void>;
  onValidationError?: (errors: Record<string, string>) => void;
  isProcessing?: boolean;
}

const RequirementsForm: React.FC<RequirementsFormProps> = ({
  initialValues,
  assetType,
  onSubmit,
  onValidationError,
  isProcessing = false,
}) => {
  // Form initialization with react-hook-form
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    setError,
    clearErrors,
    setValue,
  } = useForm<SearchRequirements>({
    defaultValues: {
      minimumSize: initialValues?.minimumSize || 0,
      detectionLimit: initialValues?.detectionLimit || ASSET_VALIDATION.MIN_DETECTION_LIMIT,
      adjacentRecommendations: initialValues?.adjacentRecommendations || false,
      timeWindow: initialValues?.timeWindow || { start: '', end: '' },
      assetSpecificParams: initialValues?.assetSpecificParams || {},
    },
    mode: 'onChange',
  });

  // Watch form values for validation
  const formValues = useWatch({ control });

  // Memoized validation rules based on asset type
  const validationRules = useMemo(() => {
    return ASSET_VALIDATION.TYPE_SPECIFIC_RULES[assetType] || {};
  }, [assetType]);

  // Debounced validation handler
  const debouncedValidation = useCallback(
    debounce(async (data: SearchRequirements) => {
      try {
        await validateRequirements(data);
        clearErrors();
      } catch (error) {
        if (error.details) {
          Object.entries(error.details).forEach(([field, message]) => {
            setError(field as keyof SearchRequirements, {
              type: 'validation',
              message: message as string,
            });
          });
          onValidationError?.(error.details);
        }
      }
    }, 300),
    [setError, clearErrors, onValidationError]
  );

  // Effect for validation on form value changes
  useEffect(() => {
    debouncedValidation(formValues);
    return () => {
      debouncedValidation.cancel();
    };
  }, [formValues, debouncedValidation]);

  // Form submission handler
  const handleFormSubmit = useCallback(
    async (data: SearchRequirements) => {
      try {
        await validateRequirements(data);
        await onSubmit(data);
      } catch (error) {
        if (error.details && onValidationError) {
          onValidationError(error.details);
        }
      }
    },
    [onSubmit, onValidationError]
  );

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} noValidate>
      <Grid container spacing={3}>
        {/* Minimum Size Input */}
        <Grid item xs={12} md={6}>
          <Input
            id="minimumSize"
            name="minimumSize"
            type="number"
            label="Minimum Size (meters)"
            value={formValues.minimumSize}
            onChange={(e) => setValue('minimumSize', Number(e.target.value))}
            error={!!errors.minimumSize}
            helperText={errors.minimumSize?.message}
            required
            inputProps={{
              min: validationRules.minArea || 0,
              max: validationRules.maxArea,
              step: 0.1,
              'aria-label': 'Enter minimum detectable size in meters',
            }}
          />
        </Grid>

        {/* Detection Limit Input */}
        <Grid item xs={12} md={6}>
          <Input
            id="detectionLimit"
            name="detectionLimit"
            type="number"
            label="Detection Limit"
            value={formValues.detectionLimit}
            onChange={(e) => setValue('detectionLimit', Number(e.target.value))}
            error={!!errors.detectionLimit}
            helperText={errors.detectionLimit?.message}
            required
            inputProps={{
              min: ASSET_VALIDATION.MIN_DETECTION_LIMIT,
              max: ASSET_VALIDATION.MAX_DETECTION_LIMIT,
              step: 0.1,
              'aria-label': 'Enter detection limit value',
            }}
          />
        </Grid>

        {/* Time Window Inputs */}
        <Grid item xs={12} md={6}>
          <Input
            id="timeWindow.start"
            name="timeWindow.start"
            type="datetime-local"
            label="Start Time"
            value={formValues.timeWindow?.start}
            onChange={(e) => setValue('timeWindow.start', e.target.value)}
            error={!!errors.timeWindow?.start}
            helperText={errors.timeWindow?.start?.message}
            required
            inputProps={{
              'aria-label': 'Select start time',
            }}
          />
        </Grid>

        <Grid item xs={12} md={6}>
          <Input
            id="timeWindow.end"
            name="timeWindow.end"
            type="datetime-local"
            label="End Time"
            value={formValues.timeWindow?.end}
            onChange={(e) => setValue('timeWindow.end', e.target.value)}
            error={!!errors.timeWindow?.end}
            helperText={errors.timeWindow?.end?.message}
            required
            inputProps={{
              'aria-label': 'Select end time',
            }}
          />
        </Grid>

        {/* Asset-specific Parameters */}
        {assetType === 'ENVIRONMENTAL_MONITORING' && (
          <Grid item xs={12}>
            <Input
              id="assetSpecificParams.cloudCover"
              name="assetSpecificParams.cloudCover"
              type="number"
              label="Maximum Cloud Cover (%)"
              value={formValues.assetSpecificParams?.cloudCover || 0}
              onChange={(e) => 
                setValue('assetSpecificParams.cloudCover', Number(e.target.value))
              }
              error={!!errors.assetSpecificParams?.cloudCover}
              helperText={errors.assetSpecificParams?.cloudCover?.message}
              inputProps={{
                min: 0,
                max: validationRules.maxCloudCover || 100,
                'aria-label': 'Enter maximum cloud cover percentage',
              }}
            />
          </Grid>
        )}

        {/* Adjacent Recommendations Checkbox */}
        <Grid item xs={12}>
          <FormControlLabel
            control={
              <Checkbox
                checked={formValues.adjacentRecommendations}
                onChange={(e) => 
                  setValue('adjacentRecommendations', e.target.checked)
                }
                color="primary"
                disabled={isProcessing}
              />
            }
            label="Include adjacent recommendations"
          />
        </Grid>

        {/* Submit Button */}
        <Grid item xs={12}>
          <button
            type="submit"
            disabled={isProcessing || Object.keys(errors).length > 0}
            aria-label="Submit requirements"
            style={{ position: 'relative' }}
          >
            {isProcessing ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              'Submit Requirements'
            )}
          </button>
        </Grid>
      </Grid>
    </form>
  );
};

export default RequirementsForm;