/**
 * Main application header component for Matter Platform
 * Implements responsive design, accessibility features, and theme toggling
 * @version 1.0.0
 */

// External imports
import React, { useState, useCallback } from 'react';
import { styled } from '@mui/material/styles';
import { useMediaQuery } from '@mui/material';
import {
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Menu,
  MenuItem,
  Avatar,
  Box,
  Tooltip,
  Badge,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { useDispatch } from 'react-redux';

// Internal imports
import { useAuth } from '../../../hooks/useAuth';
import { Button } from '../../common/Button/Button';
import { uiActions } from '../../../store/slices/uiSlice';

// Styled components with theme integration
const StyledAppBar = styled(AppBar)(({ theme }) => ({
  backgroundColor: theme.palette.background.paper,
  color: theme.palette.text.primary,
  transition: theme.transitions.create(['background-color', 'box-shadow'], {
    duration: theme.transitions.duration.short,
  }),
  boxShadow: 'none',
  borderBottom: `1px solid ${theme.palette.divider}`,
  zIndex: theme.zIndex.appBar,
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
}));

const StyledToolbar = styled(Toolbar)(({ theme }) => ({
  height: 64,
  [theme.breakpoints.up('sm')]: {
    height: 72,
  },
  display: 'flex',
  justifyContent: 'space-between',
  padding: theme.spacing(0, 2),
  gap: theme.spacing(2),
}));

const LogoContainer = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
});

const ActionsContainer = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

/**
 * Header component with responsive behavior and accessibility support
 */
export const Header: React.FC = React.memo(() => {
  const dispatch = useDispatch();
  const { user, isAuthenticated, logout, isLoading } = useAuth();
  const isMobile = useMediaQuery((theme: any) => theme.breakpoints.down('md'));
  
  // State for user menu
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);

  // Handlers
  const handleMenuOpen = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleMenuClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleThemeToggle = useCallback(() => {
    dispatch(uiActions.setTheme((theme: string) => 
      theme === 'light' ? 'dark' : 'light'
    ));
  }, [dispatch]);

  const handleSidebarToggle = useCallback(() => {
    dispatch(uiActions.toggleSidebar());
  }, [dispatch]);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
      handleMenuClose();
    } catch (error) {
      dispatch(uiActions.setError('Logout failed. Please try again.'));
    }
  }, [logout, dispatch, handleMenuClose]);

  return (
    <StyledAppBar>
      <StyledToolbar>
        {/* Left section */}
        <LogoContainer>
          {isMobile && (
            <IconButton
              color="inherit"
              aria-label="open menu"
              edge="start"
              onClick={handleSidebarToggle}
              sx={{ mr: 1 }}
            >
              <MenuIcon />
            </IconButton>
          )}
          <Typography
            variant="h6"
            component="h1"
            sx={{ fontWeight: 600, display: { xs: 'none', sm: 'block' } }}
          >
            Matter Platform
          </Typography>
        </LogoContainer>

        {/* Right section */}
        <ActionsContainer>
          {/* Theme toggle */}
          <Tooltip title="Toggle theme">
            <IconButton
              color="inherit"
              onClick={handleThemeToggle}
              aria-label="toggle theme"
            >
              {theme => theme.palette.mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Tooltip>

          {isAuthenticated ? (
            <>
              {/* Notifications */}
              <Tooltip title="Notifications">
                <IconButton color="inherit" aria-label="notifications">
                  <Badge badgeContent={3} color="error">
                    <NotificationsIcon />
                  </Badge>
                </IconButton>
              </Tooltip>

              {/* User menu */}
              <Tooltip title="Account settings">
                <IconButton
                  onClick={handleMenuOpen}
                  aria-controls={menuOpen ? 'user-menu' : undefined}
                  aria-haspopup="true"
                  aria-expanded={menuOpen ? 'true' : undefined}
                >
                  {user?.email ? (
                    <Avatar
                      alt={user.email}
                      src={`https://avatars.dicebear.com/api/initials/${user.email}.svg`}
                      sx={{ width: 32, height: 32 }}
                    />
                  ) : (
                    <AccountCircleIcon />
                  )}
                </IconButton>
              </Tooltip>

              <Menu
                id="user-menu"
                anchorEl={anchorEl}
                open={menuOpen}
                onClose={handleMenuClose}
                MenuListProps={{
                  'aria-labelledby': 'user-menu-button',
                }}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
              >
                <MenuItem onClick={handleMenuClose}>Profile</MenuItem>
                <MenuItem onClick={handleMenuClose}>Settings</MenuItem>
                <MenuItem onClick={handleLogout} disabled={isLoading}>
                  {isLoading ? 'Logging out...' : 'Logout'}
                </MenuItem>
              </Menu>
            </>
          ) : (
            <Button
              variant="contained"
              color="primary"
              size="medium"
              onClick={() => {/* Handle login */}}
              loading={isLoading}
            >
              Login
            </Button>
          )}
        </ActionsContainer>
      </StyledToolbar>
    </StyledAppBar>
  );
});

Header.displayName = 'Header';

export default Header;