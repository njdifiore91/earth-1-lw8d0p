import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Internal imports
import RequirementsForm from './RequirementsForm';
import { SearchRequirements, AssetType } from '../../../types/search.types';
import { ASSET_VALIDATION } from '../../../constants/validation.constants';

expect.extend(toHaveNoViolations);

// Mock handlers
const mockOnSubmit = jest.fn();
const mockOnValidationError = jest.fn();

// Test data
const validRequirements: SearchRequirements = {
  minimumSize: 10,
  detectionLimit: 5,
  adjacentRecommendations: true,
  timeWindow: {
    start: '2023-05-15T09:00',
    end: '2023-05-16T09:00'
  },
  assetSpecificParams: {
    cloudCover: 15
  }
};

const invalidRequirements: SearchRequirements = {
  minimumSize: -1,
  detectionLimit: 0,
  adjacentRecommendations: false,
  timeWindow: {
    start: '2023-05-16T09:00',
    end: '2023-05-15T09:00'
  },
  assetSpecificParams: {
    cloudCover: 101
  }
};

describe('RequirementsForm Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all form fields with correct attributes', () => {
    render(
      <RequirementsForm
        assetType="ENVIRONMENTAL_MONITORING"
        onSubmit={mockOnSubmit}
        onValidationError={mockOnValidationError}
      />
    );

    // Check for required fields
    expect(screen.getByLabelText(/minimum size/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/detection limit/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/start time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/end time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/include adjacent recommendations/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/maximum cloud cover/i)).toBeInTheDocument();

    // Verify input attributes
    const minimumSizeInput = screen.getByLabelText(/minimum size/i);
    expect(minimumSizeInput).toHaveAttribute('type', 'number');
    expect(minimumSizeInput).toHaveAttribute('required');
    expect(minimumSizeInput).toHaveAttribute('min', '1000'); // From ASSET_VALIDATION
  });

  it('handles form validation and submission correctly', async () => {
    render(
      <RequirementsForm
        assetType="ENVIRONMENTAL_MONITORING"
        onSubmit={mockOnSubmit}
        onValidationError={mockOnValidationError}
        initialValues={validRequirements}
      />
    );

    const submitButton = screen.getByRole('button', { name: /submit requirements/i });
    
    // Submit valid form
    await userEvent.click(submitButton);
    expect(mockOnSubmit).toHaveBeenCalledWith(validRequirements);
    expect(mockOnValidationError).not.toHaveBeenCalled();

    // Test invalid input
    const minimumSizeInput = screen.getByLabelText(/minimum size/i);
    await userEvent.clear(minimumSizeInput);
    await userEvent.type(minimumSizeInput, '-1');
    
    expect(screen.getByText(/minimum size must be greater than/i)).toBeInTheDocument();
    expect(submitButton).toBeDisabled();
  });

  it('provides accessible error messages', async () => {
    render(
      <RequirementsForm
        assetType="ENVIRONMENTAL_MONITORING"
        onSubmit={mockOnSubmit}
        onValidationError={mockOnValidationError}
      />
    );

    const detectionLimitInput = screen.getByLabelText(/detection limit/i);
    await userEvent.clear(detectionLimitInput);
    await userEvent.type(detectionLimitInput, '0');

    const errorMessage = await screen.findByText(/detection limit must be greater than/i);
    expect(errorMessage).toHaveAttribute('role', 'alert');
    expect(detectionLimitInput).toHaveAttribute('aria-invalid', 'true');
    expect(detectionLimitInput).toHaveAttribute('aria-describedby');
  });

  it('handles asset-specific fields correctly', () => {
    const { rerender } = render(
      <RequirementsForm
        assetType="ENVIRONMENTAL_MONITORING"
        onSubmit={mockOnSubmit}
        onValidationError={mockOnValidationError}
      />
    );

    expect(screen.getByLabelText(/maximum cloud cover/i)).toBeInTheDocument();

    rerender(
      <RequirementsForm
        assetType="INFRASTRUCTURE"
        onSubmit={mockOnSubmit}
        onValidationError={mockOnValidationError}
      />
    );

    expect(screen.queryByLabelText(/maximum cloud cover/i)).not.toBeInTheDocument();
  });

  it('handles time window validation correctly', async () => {
    render(
      <RequirementsForm
        assetType="ENVIRONMENTAL_MONITORING"
        onSubmit={mockOnSubmit}
        onValidationError={mockOnValidationError}
      />
    );

    const startTimeInput = screen.getByLabelText(/start time/i);
    const endTimeInput = screen.getByLabelText(/end time/i);

    await userEvent.type(startTimeInput, '2023-05-16T09:00');
    await userEvent.type(endTimeInput, '2023-05-15T09:00');

    expect(screen.getByText(/end time must be after start time/i)).toBeInTheDocument();
  });

  it('meets accessibility standards', async () => {
    const { container } = render(
      <RequirementsForm
        assetType="ENVIRONMENTAL_MONITORING"
        onSubmit={mockOnSubmit}
        onValidationError={mockOnValidationError}
      />
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('handles keyboard navigation correctly', async () => {
    render(
      <RequirementsForm
        assetType="ENVIRONMENTAL_MONITORING"
        onSubmit={mockOnSubmit}
        onValidationError={mockOnValidationError}
      />
    );

    const firstInput = screen.getByLabelText(/minimum size/i);
    firstInput.focus();

    // Test tab navigation
    await userEvent.tab();
    expect(screen.getByLabelText(/detection limit/i)).toHaveFocus();

    await userEvent.tab();
    expect(screen.getByLabelText(/start time/i)).toHaveFocus();
  });

  it('debounces validation calls', async () => {
    jest.useFakeTimers();

    render(
      <RequirementsForm
        assetType="ENVIRONMENTAL_MONITORING"
        onSubmit={mockOnSubmit}
        onValidationError={mockOnValidationError}
      />
    );

    const minimumSizeInput = screen.getByLabelText(/minimum size/i);
    await userEvent.type(minimumSizeInput, '100');

    expect(mockOnValidationError).not.toHaveBeenCalled();
    jest.advanceTimersByTime(300);
    expect(mockOnValidationError).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });

  it('handles processing state correctly', () => {
    render(
      <RequirementsForm
        assetType="ENVIRONMENTAL_MONITORING"
        onSubmit={mockOnSubmit}
        onValidationError={mockOnValidationError}
        isProcessing={true}
      />
    );

    const submitButton = screen.getByRole('button', { name: /submit requirements/i });
    expect(submitButton).toBeDisabled();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});