/**
 * Enhanced Profile Component for Matter Platform
 * @version 1.0.0
 * Implements secure user profile management with role-based access control,
 * comprehensive preference configuration, and advanced security features
 */

// External imports
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  Divider,
  Switch,
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction
} from '@mui/material';
import { useSecurityMonitor } from '@security/monitor';

// Internal imports
import {
  User,
  UserPreferences,
  NotificationSettings,
  SecurityPreferences,
  MFAStatus,
  UserRole
} from '../../types/user.types';
import { useAuth } from '../../hooks/useAuth';

// Interface definitions
interface ProfileProps {
  className?: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

/**
 * Enhanced Profile component with security features and role-based access
 */
const Profile: React.FC<ProfileProps> = ({ className }) => {
  // Hooks and state
  const { user, loading, securityEvents } = useAuth();
  const securityMonitor = useSecurityMonitor();
  const [activeTab, setActiveTab] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Form setup with validation
  const methods = useForm<UserPreferences>({
    defaultValues: user?.preferences,
    mode: 'onChange'
  });

  // Security session monitoring
  useEffect(() => {
    const monitorSession = async () => {
      try {
        await securityMonitor.validateSession();
      } catch (error) {
        console.error('Session validation failed:', error);
      }
    };

    const interval = setInterval(monitorSession, 60000);
    return () => clearInterval(interval);
  }, [securityMonitor]);

  // Memoized security status
  const securityStatus = useMemo(() => ({
    lastLogin: user?.lastLogin,
    mfaEnabled: user?.mfaEnabled,
    activeDevices: securityMonitor.getActiveDevices(),
    recentEvents: securityEvents?.slice(0, 5)
  }), [user, securityEvents, securityMonitor]);

  /**
   * Enhanced preferences update handler with security validation
   */
  const handlePreferencesSubmit = useCallback(async (data: UserPreferences) => {
    setIsSaving(true);
    setSaveError(null);

    try {
      // Validate security context
      await securityMonitor.validateContext();

      // Sanitize input data
      const sanitizedData = securityMonitor.sanitizeInput(data);

      // Update preferences through secure API
      await securityMonitor.updateUserPreferences(sanitizedData);

      // Log security event
      securityMonitor.logEvent({
        type: 'preferences_update',
        details: { success: true }
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to update preferences');
      securityMonitor.logEvent({
        type: 'preferences_update',
        details: { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
      });
    } finally {
      setIsSaving(false);
    }
  }, [securityMonitor]);

  /**
   * Security settings update handler with role validation
   */
  const handleSecuritySettingsUpdate = useCallback(async (settings: SecurityPreferences) => {
    try {
      // Validate admin privileges for security settings
      if (user?.role !== UserRole.ADMIN) {
        throw new Error('Insufficient permissions');
      }

      await securityMonitor.updateSecuritySettings(settings);
      securityMonitor.logEvent({
        type: 'security_settings_update',
        details: { success: true }
      });
    } catch (error) {
      console.error('Security settings update failed:', error);
      securityMonitor.logEvent({
        type: 'security_settings_update',
        details: { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }
  }, [user, securityMonitor]);

  // Loading state
  if (loading || !user) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <FormProvider {...methods}>
      <Box className={className} p={3}>
        {/* Profile Header */}
        <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={8}>
              <Typography variant="h4">Profile Settings</Typography>
              <Typography color="textSecondary">
                Manage your account settings and preferences
              </Typography>
            </Grid>
            <Grid item xs={12} md={4}>
              <Alert severity="info">
                Last login: {new Date(user.lastLogin).toLocaleString()}
              </Alert>
            </Grid>
          </Grid>
        </Paper>

        {/* Navigation Tabs */}
        <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)} sx={{ mb: 3 }}>
          <Tab label="General" />
          <Tab label="Security" />
          <Tab label="Notifications" />
          {user.role === UserRole.ADMIN && <Tab label="Advanced" />}
        </Tabs>

        {/* General Settings */}
        <TabPanel value={activeTab} index={0}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Email"
                value={user.email}
                disabled
                variant="outlined"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Role"
                value={user.role}
                disabled
                variant="outlined"
              />
            </Grid>
            {/* Theme Preferences */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>Theme Preferences</Typography>
              <Switch
                checked={methods.watch('theme') === 'dark'}
                onChange={(e) => methods.setValue('theme', e.target.checked ? 'dark' : 'light')}
                name="theme"
              />
              <Typography variant="body2" color="textSecondary">
                Dark Mode
              </Typography>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Security Settings */}
        <TabPanel value={activeTab} index={1}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>Multi-Factor Authentication</Typography>
              <Switch
                checked={user.mfaEnabled}
                onChange={(e) => handleSecuritySettingsUpdate({ mfaEnabled: e.target.checked })}
                name="mfaEnabled"
              />
              <Typography variant="body2" color="textSecondary">
                Enable 2FA for enhanced security
              </Typography>
            </Grid>
            {/* Security Events */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>Recent Security Events</Typography>
              <List>
                {securityStatus.recentEvents?.map((event, index) => (
                  <ListItem key={index}>
                    <ListItemText
                      primary={event.type}
                      secondary={new Date(event.timestamp).toLocaleString()}
                    />
                    <ListItemSecondaryAction>
                      {event.details.success ? (
                        <Alert severity="success" sx={{ minWidth: 100 }}>Success</Alert>
                      ) : (
                        <Alert severity="error" sx={{ minWidth: 100 }}>Failed</Alert>
                      )}
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Notification Settings */}
        <TabPanel value={activeTab} index={2}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>Email Notifications</Typography>
              {Object.entries(methods.watch('notifications')).map(([key, value]) => (
                <Box key={key} sx={{ mb: 2 }}>
                  <Switch
                    checked={value as boolean}
                    onChange={(e) => 
                      methods.setValue(`notifications.${key}`, e.target.checked)
                    }
                    name={`notifications.${key}`}
                  />
                  <Typography variant="body2" color="textSecondary">
                    {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                  </Typography>
                </Box>
              ))}
            </Grid>
          </Grid>
        </TabPanel>

        {/* Advanced Settings (Admin Only) */}
        {user.role === UserRole.ADMIN && (
          <TabPanel value={activeTab} index={3}>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>System Settings</Typography>
                <Alert severity="warning" sx={{ mb: 2 }}>
                  These settings affect system-wide security policies
                </Alert>
                {/* Admin-only security settings */}
                {/* Add your admin-specific settings here */}
              </Grid>
            </Grid>
          </TabPanel>
        )}

        {/* Action Buttons */}
        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
          <Button
            variant="contained"
            color="primary"
            onClick={methods.handleSubmit(handlePreferencesSubmit)}
            disabled={isSaving}
          >
            {isSaving ? <CircularProgress size={24} /> : 'Save Changes'}
          </Button>
        </Box>

        {/* Error Display */}
        {saveError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {saveError}
          </Alert>
        )}
      </Box>
    </FormProvider>
  );
};

/**
 * Tab Panel component for organizing content
 */
const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <div role="tabpanel" hidden={value !== index}>
    {value === index && children}
  </div>
);

export default Profile;