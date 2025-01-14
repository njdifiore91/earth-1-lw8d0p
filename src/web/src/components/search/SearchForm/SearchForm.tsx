import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  Grid, 
  Paper, 
  Stepper, 
  Step, 
  StepLabel, 
  Button, 
  CircularProgress, 
  Alert 
} from '@mui/material';
import { styled } from '@mui/material/styles';

// Internal imports
import LocationInput from '../LocationInput/LocationInput';
import AssetSelector from '../AssetSelector/AssetSelector';
import RequirementsForm from '../RequirementsForm/RequirementsForm';
import { SearchParameters, SearchRequirements, AssetType, ValidationError } from '../../../types/search.types';

// Styled components with Material Design 3.0 specifications
const StyledPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  marginBottom: theme.spacing(2),
  position: 'relative',
  [theme.breakpoints.down('md')]: {
    padding: theme.spacing(2),
  }
}));

const StyledStepContainer = styled('div')(({ theme }) => ({
  marginTop: theme.spacing(2),
  marginBottom: theme.spacing(2),
  minHeight: '400px'
}));

const StyledButtonContainer = styled('div')(({ theme }) => ({
  marginTop: theme.spacing(2),
  display: 'flex',
  justifyContent: 'space-between',
  gap: theme.spacing(2)
}));

const LoadingOverlay = styled('div')(({ theme }) => ({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(255, 255, 255, 0.7)',
  zIndex: 1
}));

// Step definitions
const STEPS = ['Location', 'Asset Type', 'Requirements'];

// Props interface
interface SearchFormProps {
  onSubmit: (parameters: SearchParameters) => Promise<void>;
  initialValues?: SearchParameters | null;
  onError?: (error: ValidationError) => void;
}

const SearchForm: React.FC<SearchFormProps> = React.memo(({
  onSubmit,
  initialValues,
  onError
}) => {
  const dispatch = useDispatch();
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<SearchParameters>>(initialValues || {});

  // Form completion status
  const isStepComplete = useMemo(() => ({
    0: !!formData.location,
    1: !!formData.assetType,
    2: !!formData.requirements
  }), [formData]);

  // Handle location selection
  const handleLocationSelect = useCallback((location: GeoJSON.Feature) => {
    setFormData(prev => ({ ...prev, location }));
    setError(null);
  }, []);

  // Handle asset type selection
  const handleAssetSelect = useCallback((assetType: AssetType) => {
    setFormData(prev => ({ ...prev, assetType }));
    setError(null);
  }, []);

  // Handle requirements submission
  const handleRequirementsSubmit = useCallback(async (requirements: SearchRequirements) => {
    setFormData(prev => ({ ...prev, requirements }));
    setError(null);
  }, []);

  // Handle step navigation
  const handleNext = useCallback(() => {
    if (activeStep < STEPS.length - 1) {
      setActiveStep(prev => prev + 1);
    } else {
      handleSubmit();
    }
  }, [activeStep]);

  const handleBack = useCallback(() => {
    setActiveStep(prev => prev - 1);
    setError(null);
  }, []);

  // Handle form submission
  const handleSubmit = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (!formData.location || !formData.assetType || !formData.requirements) {
        throw new Error('Please complete all required fields');
      }

      await onSubmit(formData as SearchParameters);
    } catch (err) {
      const error = err as ValidationError;
      setError(error.message);
      onError?.(error);
    } finally {
      setLoading(false);
    }
  }, [formData, onSubmit, onError]);

  // Render step content
  const renderStepContent = useCallback((step: number) => {
    switch (step) {
      case 0:
        return (
          <LocationInput
            onLocationSelect={handleLocationSelect}
            initialLocation={formData.location}
            isAccessible={true}
          />
        );
      case 1:
        return (
          <AssetSelector
            onChange={handleAssetSelect}
            disabled={!formData.location}
            required={true}
          />
        );
      case 2:
        return (
          <RequirementsForm
            initialValues={formData.requirements}
            assetType={formData.assetType!}
            onSubmit={handleRequirementsSubmit}
            onValidationError={(errors) => setError(Object.values(errors)[0])}
            isProcessing={loading}
          />
        );
      default:
        return null;
    }
  }, [formData, loading, handleLocationSelect, handleAssetSelect, handleRequirementsSubmit]);

  return (
    <StyledPaper elevation={2}>
      {loading && (
        <LoadingOverlay>
          <CircularProgress size={40} />
        </LoadingOverlay>
      )}

      <Stepper activeStep={activeStep} alternativeLabel>
        {STEPS.map((label, index) => (
          <Step key={label} completed={isStepComplete[index]}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <StyledStepContainer>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {renderStepContent(activeStep)}
      </StyledStepContainer>

      <StyledButtonContainer>
        <Button
          onClick={handleBack}
          disabled={activeStep === 0 || loading}
          variant="outlined"
        >
          Back
        </Button>
        <Button
          onClick={handleNext}
          disabled={!isStepComplete[activeStep] || loading}
          variant="contained"
          color="primary"
        >
          {activeStep === STEPS.length - 1 ? 'Submit' : 'Next'}
        </Button>
      </StyledButtonContainer>
    </StyledPaper>
  );
});

SearchForm.displayName = 'SearchForm';

export default SearchForm;