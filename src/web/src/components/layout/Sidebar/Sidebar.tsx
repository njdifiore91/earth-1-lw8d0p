// React v18.2.0
import React from 'react';
// react-redux v8.1.0
import { useSelector, useDispatch } from 'react-redux';
// @mui/material v5.x
import {
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  IconButton,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { styled } from '@mui/material/styles';
// @mui/icons-material v5.x
import {
  Dashboard as DashboardIcon,
  Search as SearchIcon,
  Assessment as AssessmentIcon,
  AdminPanelSettings as AdminPanelSettingsIcon,
  ChevronLeft as ChevronLeftIcon,
} from '@mui/icons-material';

// Internal imports
import { Button, ButtonProps } from '../../common/Button/Button';
import { toggleSidebar } from '../../../store/slices/uiSlice';
import { UserRole } from '../../../types/user.types';

/**
 * Props interface for the Sidebar component with optional styling
 */
interface SidebarProps {
  className?: string;
}

/**
 * Interface for navigation menu items with role-based access
 */
interface NavigationItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  roles: UserRole[];
}

/**
 * Fixed width of the sidebar drawer in pixels for desktop view
 */
const DRAWER_WIDTH = 280;

/**
 * Navigation items configuration with role-based access control
 */
const NAVIGATION_ITEMS: NavigationItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <DashboardIcon aria-hidden="true" />,
    path: '/dashboard',
    roles: [UserRole.CUSTOMER, UserRole.ADMIN],
  },
  {
    id: 'search',
    label: 'New Search',
    icon: <SearchIcon aria-hidden="true" />,
    path: '/search',
    roles: [UserRole.CUSTOMER, UserRole.ADMIN],
  },
  {
    id: 'results',
    label: 'Results',
    icon: <AssessmentIcon aria-hidden="true" />,
    path: '/results',
    roles: [UserRole.CUSTOMER, UserRole.ADMIN],
  },
  {
    id: 'admin',
    label: 'Admin Panel',
    icon: <AdminPanelSettingsIcon aria-hidden="true" />,
    path: '/admin',
    roles: [UserRole.ADMIN],
  },
];

/**
 * Styled Material UI Drawer component with theme integration
 */
const StyledDrawer = styled(Drawer)(({ theme }) => ({
  width: DRAWER_WIDTH,
  flexShrink: 0,
  whiteSpace: 'nowrap',
  boxSizing: 'border-box',
  '& .MuiDrawer-paper': {
    width: DRAWER_WIDTH,
    boxSizing: 'border-box',
    borderRight: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
    transition: theme.transitions.create(['width', 'margin'], {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.enteringScreen,
    }),
    [theme.breakpoints.down('md')]: {
      position: 'fixed',
      width: DRAWER_WIDTH,
    },
  },
  '& .MuiListItem-root': {
    marginBottom: theme.spacing(0.5),
    borderRadius: theme.shape.borderRadius,
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
    '&.Mui-selected': {
      backgroundColor: theme.palette.primary.main,
      color: theme.palette.primary.contrastText,
      '&:hover': {
        backgroundColor: theme.palette.primary.dark,
      },
      '& .MuiListItemIcon-root': {
        color: theme.palette.primary.contrastText,
      },
    },
  },
}));

/**
 * Styled List component for navigation items
 */
const StyledList = styled(List)(({ theme }) => ({
  padding: theme.spacing(2),
  '& .MuiListItemIcon-root': {
    minWidth: 40,
    color: theme.palette.text.secondary,
  },
  '& .MuiListItemText-primary': {
    fontSize: '0.875rem',
    fontWeight: 500,
  },
}));

/**
 * Main sidebar component with role-based navigation and accessibility
 */
export const Sidebar = React.memo<SidebarProps>(({ className }) => {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Get current sidebar state and user role from Redux store
  const isOpen = useSelector((state: any) => state.ui.sidebarOpen);
  const userRole = useSelector((state: any) => state.auth.user?.role);

  // Filter navigation items based on user role
  const filteredNavItems = React.useMemo(() => 
    NAVIGATION_ITEMS.filter(item => item.roles.includes(userRole)),
    [userRole]
  );

  // Handle sidebar toggle
  const handleToggle = React.useCallback(() => {
    dispatch(toggleSidebar());
  }, [dispatch]);

  // Handle navigation with analytics tracking
  const handleNavigation = React.useCallback((path: string) => {
    // Track navigation event
    if (window.analytics) {
      window.analytics.track('Navigation', { path });
    }
    // Close sidebar on mobile after navigation
    if (isMobile) {
      dispatch(toggleSidebar());
    }
  }, [dispatch, isMobile]);

  return (
    <StyledDrawer
      variant={isMobile ? 'temporary' : 'permanent'}
      open={isOpen}
      onClose={handleToggle}
      className={className}
      // Accessibility attributes
      aria-label="Main navigation"
      role="navigation"
    >
      <div role="presentation">
        <IconButton
          onClick={handleToggle}
          aria-label={isOpen ? 'Close navigation' : 'Open navigation'}
          sx={{ ml: 1, mt: 1 }}
        >
          <ChevronLeftIcon />
        </IconButton>
      </div>
      <Divider />
      <StyledList>
        {filteredNavItems.map((item) => (
          <ListItem
            key={item.id}
            button
            onClick={() => handleNavigation(item.path)}
            // Accessibility enhancements
            role="menuitem"
            aria-label={item.label}
            tabIndex={0}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText 
              primary={item.label}
              primaryTypographyProps={{
                variant: 'body2',
                color: 'inherit',
              }}
            />
          </ListItem>
        ))}
      </StyledList>
    </StyledDrawer>
  );
});

// Display name for debugging
Sidebar.displayName = 'Sidebar';

export default Sidebar;