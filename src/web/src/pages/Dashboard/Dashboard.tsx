/**
 * Main Dashboard Component for Matter Satellite Data Product Matching Platform
 * @version 1.0.0
 * Implements real-time search updates, responsive design, and enhanced user experience
 */

// External imports
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Grid,
  Paper,
  Typography,
  Box,
  Skeleton,
  CircularProgress,
  useMediaQuery,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import { ErrorBoundary } from 'react-error-boundary';

// Internal imports
import { Header } from '../../components/layout/Header/Header';
import { Sidebar } from '../../components/layout/Sidebar/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { SearchService } from '../../services/search.service';

// Styled components with enhanced theme integration
const StyledContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
  backgroundColor: theme.palette.background.default,
  transition: theme.transitions.create(['background-color'], {
    duration: theme.transitions.duration.standard,
  }),
  padding: theme.spacing(3),
  paddingTop: theme.spacing(10),
  [theme.breakpoints.down('md')]: {
    padding: theme.spacing(2),
    paddingTop: theme.spacing(9),
  },
}));

const StyledPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  borderRadius: theme.shape.borderRadius,
  boxShadow: theme.shadows[2],
  transition: theme.transitions.create(['box-shadow', 'background-color'], {
    duration: theme.transitions.duration.short,
  }),
  '&:hover': {
    boxShadow: theme.shadows[4],
  },
  [theme.breakpoints.down('md')]: {
    padding: theme.spacing(2),
  },
}));

const StyledGrid = styled(Grid)(({ theme }) => ({
  gap: theme.spacing(3),
  [theme.breakpoints.down('md')]: {
    gap: theme.spacing(2),
  },
}));

// Interfaces
interface RecentActivity {
  id: string;
  timestamp: Date;
  type: 'search' | 'update' | 'completion';
  description: string;
  status: 'success' | 'pending' | 'error';
  progress?: number;
}

interface SearchSummary {
  id: string;
  name: string;
  status: 'completed' | 'in_progress' | 'failed';
  lastUpdated: Date;
  location: string;
  progress: number;
  estimatedCompletion?: Date;
}

// Error Fallback component
const ErrorFallback = ({ error, resetErrorBoundary }) => (
  <Box p={3} textAlign="center">
    <Typography variant="h6" color="error" gutterBottom>
      Something went wrong
    </Typography>
    <Typography variant="body2" color="textSecondary" paragraph>
      {error.message}
    </Typography>
    <Button onClick={resetErrorBoundary} variant="contained" color="primary">
      Retry
    </Button>
  </Box>
);

/**
 * Enhanced Dashboard component with real-time updates and responsive design
 */
export const Dashboard: React.FC = React.memo(() => {
  // Hooks
  const { user, isAuthenticated } = useAuth();
  const isMobile = useMediaQuery((theme) => theme.breakpoints.down('md'));
  
  // State
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [searches, setSearches] = useState<SearchSummary[]>([]);
  const [loading, setLoading] = useState({
    activities: true,
    searches: true,
  });

  // Real-time updates hook
  const useSearchUpdates = useCallback((userId: string) => {
    const searchService = new SearchService();

    useEffect(() => {
      if (!userId) return;

      const handleSearchUpdate = (searchData) => {
        setSearches((prev) =>
          prev.map((search) =>
            search.id === searchData.id
              ? { ...search, ...searchData }
              : search
          )
        );

        setRecentActivities((prev) => [
          {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            type: 'update',
            description: `Search ${searchData.name} updated`,
            status: 'success',
          },
          ...prev.slice(0, 9),
        ]);
      };

      // Subscribe to search updates
      const subscriptions = searches.map((search) =>
        searchService.subscribeToUpdates(search.id, handleSearchUpdate)
      );

      return () => {
        // Cleanup subscriptions
        subscriptions.forEach((unsubscribe) => unsubscribe());
      };
    }, [userId, searches]);
  }, []);

  // Initialize data
  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!isAuthenticated) return;

      try {
        const searchService = new SearchService();
        
        // Fetch recent searches
        const recentSearches = await searchService.getRecentSearches(user.id);
        setSearches(recentSearches);
        setLoading((prev) => ({ ...prev, searches: false }));

        // Initialize activities
        setRecentActivities(
          recentSearches.map((search) => ({
            id: crypto.randomUUID(),
            timestamp: search.lastUpdated,
            type: 'search',
            description: `Search created for ${search.location}`,
            status: search.status === 'completed' ? 'success' : 'pending',
            progress: search.progress,
          }))
        );
        setLoading((prev) => ({ ...prev, activities: false }));
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        setLoading({ activities: false, searches: false });
      }
    };

    fetchDashboardData();
  }, [isAuthenticated, user]);

  // Setup real-time updates
  useSearchUpdates(user?.id);

  // Render loading skeletons
  const renderSkeletons = (count: number) => (
    Array(count).fill(0).map((_, index) => (
      <Skeleton
        key={index}
        variant="rectangular"
        height={100}
        animation="wave"
        sx={{ mb: 2, borderRadius: 1 }}
      />
    ))
  );

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Header />
      <Sidebar />
      <StyledContainer>
        <StyledGrid container spacing={3}>
          {/* Search History Section */}
          <Grid item xs={12} md={8}>
            <StyledPaper>
              <Typography variant="h6" gutterBottom>
                Recent Searches
              </Typography>
              {loading.searches ? (
                renderSkeletons(3)
              ) : (
                searches.map((search) => (
                  <Box key={search.id} mb={2}>
                    <Typography variant="subtitle1">
                      {search.name}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      {search.location}
                    </Typography>
                    {search.status === 'in_progress' && (
                      <Box display="flex" alignItems="center" mt={1}>
                        <CircularProgress
                          variant="determinate"
                          value={search.progress}
                          size={24}
                          sx={{ mr: 1 }}
                        />
                        <Typography variant="body2">
                          {search.progress}% Complete
                        </Typography>
                      </Box>
                    )}
                  </Box>
                ))
              )}
            </StyledPaper>
          </Grid>

          {/* Activity Feed Section */}
          <Grid item xs={12} md={4}>
            <StyledPaper>
              <Typography variant="h6" gutterBottom>
                Recent Activity
              </Typography>
              {loading.activities ? (
                renderSkeletons(5)
              ) : (
                recentActivities.map((activity) => (
                  <Box key={activity.id} mb={2}>
                    <Typography variant="subtitle2">
                      {activity.description}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {new Date(activity.timestamp).toLocaleString()}
                    </Typography>
                    {activity.progress && (
                      <Box display="flex" alignItems="center" mt={1}>
                        <CircularProgress
                          variant="determinate"
                          value={activity.progress}
                          size={20}
                          sx={{ mr: 1 }}
                        />
                        <Typography variant="body2">
                          {activity.progress}% Complete
                        </Typography>
                      </Box>
                    )}
                  </Box>
                ))
              )}
            </StyledPaper>
          </Grid>
        </StyledGrid>
      </StyledContainer>
    </ErrorBoundary>
  );
});

Dashboard.displayName = 'Dashboard';

export default Dashboard;