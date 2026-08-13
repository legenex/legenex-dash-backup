import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';
import { ROLE_PRESETS, sanitizePermissions } from '@/lib/permissions';

// Exported so the Progress Control Center's offscreen capture can render pages
// in a separate React root using the auth value this tree has already resolved.
// Mounting a second AuthProvider there would re-run the network auth check once
// per captured page and race the sidebar's permissions.
export const AuthContext = createContext();

// Resolve the effective permission map for a user record.
// Falls back to their base_role preset when no explicit permissions object is stored.
export function resolvePermissions(user) {
  if (!user) return { role: null, perms: {} };
  const role = user.base_role || (user.role === 'admin' ? 'admin' : 'manager');
  let perms = {};
  if (user.permissions) {
    try { perms = JSON.parse(user.permissions) || {}; } catch { perms = {}; }
  }
  if (!perms || Object.keys(perms).length === 0) {
    perms = { ...(ROLE_PRESETS[role]?.permissions || {}) };
  }
  return { role, perms: sanitizePermissions(role, perms) };
}

const PREVIEW_ROLE_KEY = 'legenex_preview_role';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [previewRole, setPreviewRoleState] = useState(() => {
    try { return localStorage.getItem(PREVIEW_ROLE_KEY) || null; } catch { return null; }
  });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null); // Contains only { id, public_settings }

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      
      // First, check app public settings (with token if available)
      // This will tell us if auth is required, user not registered, etc.
      const appClient = createAxiosClient({
        baseURL: `/api/apps/public`,
        headers: {
          'X-App-Id': appParams.appId
        },
        token: appParams.token, // Include token if available
        interceptResponses: true
      });
      
      try {
        const publicSettings = await appClient.get(`/prod/public-settings/by-id/${appParams.appId}`);
        setAppPublicSettings(publicSettings);
        
        // If we got the app public settings successfully, check if user is authenticated
        if (appParams.token) {
          await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
          setAuthChecked(true);
        }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        console.error('App state check failed:', appError);
        
        // Handle app-level errors
        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;
          if (reason === 'auth_required') {
            setAuthError({
              type: 'auth_required',
              message: 'Authentication required'
            });
          } else if (reason === 'user_not_registered') {
            setAuthError({
              type: 'user_not_registered',
              message: 'User not registered for this app'
            });
          } else {
            setAuthError({
              type: reason,
              message: appError.message
            });
          }
        } else {
          setAuthError({
            type: 'unknown',
            message: appError.message || 'Failed to load app'
          });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      // Now check if the user is authenticated
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthChecked(true);
      
      // If user auth fails, it might be an expired token
      if (error.status === 401 || error.status === 403) {
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required'
        });
      }
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    
    if (shouldRedirect) {
      // Use the SDK's logout method which handles token cleanup and redirect
      base44.auth.logout(window.location.href);
    } else {
      // Just remove the token without redirect
      base44.auth.logout();
    }
  };

  const navigateToLogin = () => {
    // Use the SDK's redirectToLogin method
    base44.auth.redirectToLogin(window.location.href);
  };

  // View-As: temporarily preview the app as another role (Owner/Admin only).
  const setPreviewRole = (role) => {
    setPreviewRoleState(role);
    try {
      if (role) localStorage.setItem(PREVIEW_ROLE_KEY, role);
      else localStorage.removeItem(PREVIEW_ROLE_KEY);
    } catch {}
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      previewRole,
      setPreviewRole,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    // This should never happen at runtime since App wraps everything in
    // AuthProvider. It can transiently occur during a Vite hot reload when the
    // context module is swapped out from under a stale render. Rather than
    // crash the whole app, return a safe loading-state shape so the tree
    // re-renders cleanly once the provider is re-established.
    return {
      user: null,
      isAuthenticated: false,
      isLoadingAuth: true,
      isLoadingPublicSettings: true,
      authError: null,
      appPublicSettings: null,
      authChecked: false,
      previewRole: null,
      setPreviewRole: () => {},
      logout: () => {},
      navigateToLogin: () => {},
      checkUserAuth: () => {},
      checkAppState: () => {},
    };
  }
  return context;
};

// Access control hook: returns the current user's role and a can(key) checker.
// Owner always passes. No user yet -> deny everything.
// When an Owner/Admin has a preview role active, can() is evaluated as that role.
export const usePermissions = () => {
  const { user, previewRole } = useAuth();
  const real = resolvePermissions(user);
  const canPreview = real.role === 'owner' || real.role === 'admin';
  const previewing = canPreview && previewRole && previewRole !== real.role;

  const preview = previewing
    ? { role: previewRole, perms: sanitizePermissions(previewRole, { ...(ROLE_PRESETS[previewRole]?.permissions || {}) }) }
    : null;

  const role = preview ? preview.role : real.role;
  const perms = preview ? preview.perms : real.perms;

  const can = (key) => {
    if (!user) return false;
    if (role === 'owner') return true;
    return !!perms[key];
  };
  return { role, perms, can, realRole: real.role, previewing: !!previewing, canPreview };
};