import React, { useEffect, useMemo, useCallback, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import { io, Socket } from 'socket.io-client';

// Internal components
import { ResultsGrid } from '../../components/results/ResultsGrid/ResultsGrid';
import { CapabilityMatrix } from '../../components/results/CapabilityMatrix/CapabilityMatrix';
import { Timeline } from '../../components/results/Timeline/Timeline';
import { Button } from '../../components/common/Button/Button';
import { Loader } from '../../components/common/Loader/Loader';

// Redux and types
import { 
  selectSearchResults, 
  selectSearchStatus,
  updateSearchStatus,
  setSearchResults 
} from '../../store/slices/searchSlice';
import { SearchResult, SearchStatus } from '../../types/search.types';

// Styled container for results layout
const ResultsContainer = styled.div`
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 24px;
  padding: 24px;
  height: 100%;
  overflow: hidden;

  @media (max-width: 768px) {
    padding: 16px;
    gap: 16px;
  }
`;

const ResultsHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const ResultsContent = styled.div`
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 24px;
  height: 100%;
  overflow: hidden;

  @media (max-width: 992px) {
    grid-template-columns: 1fr;
  }
`;

const TimelineContainer = styled.div`
  height: 200px;
  width: 100%;
  background: ${props => props.theme.palette.background.paper};
  border-radius: 8px;
  padding: 16px;
`;

// Props interface
export interface ResultsProps {
  className?: string;
  searchId: string;
  onError?: (error: Error) => void;
}

// Error fallback component
const ErrorFallback: React.FC<{ error: Error; resetErrorBoundary: () => void }> = ({
  error,
  resetErrorBoundary
}) => (
  <div role="alert" className="error-container">
    <h2>Error Loading Results</h2>
    <pre>{error.message}</pre>
    <Button onClick={resetErrorBoundary} variant="contained" color="primary">
      Retry
    </Button>
  </div>
);

// Main Results component
export const Results: React.FC<ResultsProps> = React.memo(({
  className,
  searchId,
  onError
}) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const socketRef = useRef<Socket | null>(null);
  
  // Redux selectors
  const results = useSelector(selectSearchResults);
  const searchStatus = useSelector(selectSearchStatus);

  // WebSocket connection setup
  useEffect(() => {
    socketRef.current = io(process.env.VITE_WS_URL as string, {
      query: { searchId },
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('WebSocket connected');
    });

    socket.on('search_update', (data: SearchResult) => {
      dispatch(setSearchResults([...results, data]));
    });

    socket.on('search_status', (status: SearchStatus) => {
      dispatch(updateSearchStatus(status));
    });

    socket.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
      onError?.(error);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [searchId, dispatch, onError, results]);

  // Handlers
  const handleResultSelect = useCallback((result: SearchResult) => {
    navigate(`/results/${result.id}/details`);
  }, [navigate]);

  const handleExport = useCallback(async (format: string) => {
    try {
      // Implement export logic
      console.log(`Exporting results in ${format} format`);
    } catch (error) {
      onError?.(error as Error);
    }
  }, [onError]);

  const handleCapabilityClick = useCallback((assetType: string, confidence: number) => {
    console.log(`Selected capability: ${assetType} with confidence ${confidence}`);
  }, []);

  // Loading state
  if (searchStatus === 'IN_PROGRESS') {
    return (
      <div className="results-loading" role="status">
        <Loader size="large" ariaLabel="Loading search results" />
      </div>
    );
  }

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => window.location.reload()}
      onError={onError}
    >
      <ResultsContainer className={className}>
        <ResultsHeader>
          <h1>Search Results</h1>
          <Button
            variant="contained"
            color="primary"
            onClick={() => handleExport('csv')}
            disabled={results.length === 0}
            ariaLabel="Export results"
          >
            Export Results
          </Button>
        </ResultsHeader>

        <ResultsContent>
          <div className="results-main">
            <TimelineContainer>
              <Timeline
                height={200}
                width="100%"
                ariaLabel="Collection windows timeline"
              />
            </TimelineContainer>

            <ResultsGrid
              onResultSelect={handleResultSelect}
              onExport={handleExport}
            />
          </div>

          <div className="results-sidebar">
            <CapabilityMatrix
              width={300}
              height={400}
              onCapabilityClick={handleCapabilityClick}
              theme="light"
              accessibility={{
                announceChanges: true,
                keyboardNav: true
              }}
            />
          </div>
        </ResultsContent>
      </ResultsContainer>
    </ErrorBoundary>
  );
});

// Display name for debugging
Results.displayName = 'Results';

export default Results;