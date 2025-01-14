import React, { useCallback, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { DataGrid, GridColDef, GridFilterModel } from '@mui/x-data-grid'; // v6.0.0
import { useTheme, styled } from '@mui/material'; // v5.0.0

// Internal imports
import { SearchResult, SearchStatus } from '../../../types/search.types';
import { 
  selectSearchResults, 
  selectSearchStatus, 
  selectWebSocketStatus 
} from '../../../store/slices/searchSlice';
import { Button, ExportButton } from '../../common/Button/Button';

/**
 * Enhanced props interface for ResultsGrid component
 */
export interface ResultsGridProps {
  onResultSelect: (result: SearchResult) => void;
  onExport: (format: string) => Promise<void>;
  customFilters?: GridFilterModel;
}

/**
 * Styled container with responsive design and accessibility support
 */
const GridContainer = styled('div')(({ theme }) => ({
  height: `calc(100vh - ${theme.spacing(20)})`,
  width: '100%',
  padding: theme.spacing(2),
  borderRadius: theme.shape.borderRadius,
  boxShadow: theme.shadows[1],
  backgroundColor: theme.palette.background.paper,
  
  // Enhanced accessibility styles
  '& .MuiDataGrid-root': {
    border: 'none',
    '& .MuiDataGrid-cell:focus-within': {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: '-1px',
    },
  },

  // Responsive design
  [theme.breakpoints.down('md')]: {
    height: `calc(100vh - ${theme.spacing(16)})`,
    padding: theme.spacing(1),
  },

  // High contrast support
  '@media (forced-colors: active)': {
    borderColor: 'CanvasText',
  },

  // RTL support
  '[dir="rtl"] &': {
    '& .MuiDataGrid-columnHeaders': {
      direction: 'rtl',
    },
  },
}));

/**
 * Custom hook for grid column definitions with enhanced formatting
 */
const useGridColumns = (locale: string): GridColDef[] => {
  const theme = useTheme();

  return useMemo(() => [
    {
      field: 'id',
      headerName: 'ID',
      width: 130,
      hideable: false,
    },
    {
      field: 'timestamp',
      headerName: 'Time',
      width: 180,
      valueFormatter: (params) => {
        return new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(params.value));
      },
    },
    {
      field: 'confidence',
      headerName: 'Confidence',
      width: 130,
      type: 'number',
      valueFormatter: (params) => {
        return `${(params.value * 100).toFixed(1)}%`;
      },
      cellClassName: (params) => {
        const value = params.value as number;
        return value >= 0.9 ? 'high-confidence' :
               value >= 0.7 ? 'medium-confidence' :
               'low-confidence';
      },
    },
    {
      field: 'metadata.assetId',
      headerName: 'Asset Type',
      width: 150,
      valueGetter: (params) => params.row.metadata?.assetId,
    },
    {
      field: 'metadata.resolution',
      headerName: 'Resolution',
      width: 130,
      type: 'number',
      valueFormatter: (params) => {
        return `${params.value}m`;
      },
    },
    {
      field: 'metadata.costEstimate',
      headerName: 'Cost',
      width: 120,
      type: 'number',
      valueFormatter: (params) => {
        return new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: 'USD',
        }).format(params.value);
      },
    },
    {
      field: 'validation.qualityScore',
      headerName: 'Quality',
      width: 120,
      type: 'number',
      valueFormatter: (params) => {
        return `${(params.value * 100).toFixed(0)}%`;
      },
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 150,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Button
          variant="outlined"
          size="small"
          onClick={() => params.row.onSelect(params.row)}
          aria-label={`Select result ${params.row.id}`}
        >
          Select
        </Button>
      ),
    },
  ], [locale, theme]);
};

/**
 * Enterprise-grade results grid component with real-time updates and accessibility
 */
export const ResultsGrid = React.memo<ResultsGridProps>(({
  onResultSelect,
  onExport,
  customFilters,
}) => {
  // Redux selectors
  const results = useSelector(selectSearchResults);
  const searchStatus = useSelector(selectSearchStatus);
  const wsStatus = useSelector(selectWebSocketStatus);

  // Get locale for formatting
  const locale = navigator.language || 'en-US';

  // Get column definitions
  const columns = useGridColumns(locale);

  // Prepare rows with action handlers
  const rows = useMemo(() => {
    return results.map(result => ({
      ...result,
      onSelect: onResultSelect,
    }));
  }, [results, onResultSelect]);

  // Loading state based on search status
  const isLoading = searchStatus === 'IN_PROGRESS';

  // Handle export action
  const handleExport = useCallback(async (format: string) => {
    try {
      await onExport(format);
    } catch (error) {
      console.error('Export failed:', error);
    }
  }, [onExport]);

  // WebSocket connection status effect
  useEffect(() => {
    if (wsStatus === 'disconnected') {
      console.warn('WebSocket disconnected - real-time updates unavailable');
    }
  }, [wsStatus]);

  return (
    <GridContainer>
      <DataGrid
        rows={rows}
        columns={columns}
        loading={isLoading}
        filterModel={customFilters}
        disableColumnMenu={false}
        disableSelectionOnClick
        autoHeight={false}
        density="standard"
        pagination
        paginationMode="client"
        pageSize={25}
        rowsPerPageOptions={[10, 25, 50, 100]}
        checkboxSelection={false}
        disableColumnSelector={false}
        disableDensitySelector={false}
        componentsProps={{
          toolbar: {
            csvOptions: { allColumns: true, fileName: 'search-results' },
          },
        }}
        // Accessibility props
        aria-label="Search Results Grid"
        getRowId={(row) => row.id}
        // Performance props
        sortingOrder={['desc', 'asc']}
        sortingMode="client"
        // Error handling
        error={searchStatus === 'FAILED' ? 'Failed to load results' : null}
        // Localization
        localeText={{
          noRowsLabel: 'No results found',
          errorOverlayDefaultLabel: 'An error occurred.',
          toolbarExportCSV: 'Download CSV',
        }}
      />
      <ExportButton
        variant="contained"
        color="primary"
        onClick={() => handleExport('csv')}
        exportFormats={['csv', 'xlsx', 'json']}
        disabled={rows.length === 0 || isLoading}
        aria-label="Export results"
      />
    </GridContainer>
  );
});

// Display name for debugging
ResultsGrid.displayName = 'ResultsGrid';

export default ResultsGrid;