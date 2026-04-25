import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { getSecurely, saveSecurely, deleteSecurely } from '../services/StorageService';
import { changeLanguage } from '../services/i18n';

const AuthContext = createContext();

// Inactivity timeout: 10 minutes (in milliseconds)
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [userToken, setUserToken] = useState(null);
  const [userName, setUserName] = useState(null);
  const [isMfaVerified, setIsMfaVerified] = useState(false);
  const [loading, setLoading] = useState(true);

  const inactivityTimerRef = useRef(null);

  // ---- Inactivity Auto-Logout System ----

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const performAutoLogout = useCallback(async () => {
    console.log('[AuthContext] Auto-logout: 10 minutes of inactivity');
    clearInactivityTimer();
    try {
      await deleteSecurely('userToken');
      await deleteSecurely('userRole');
      await deleteSecurely('userName');
      await deleteSecurely('userId');
      await deleteSecurely('lastActivityTime');

      setIsAuthenticated(false);
      setUserRole(null);
      setUserToken(null);
      setUserName(null);
      setIsMfaVerified(false);

      // Redirect to login on web
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.href = '/admin';
      }
    } catch (e) {
      console.error('Auto-logout failed:', e);
    }
  }, [clearInactivityTimer]);

  const startInactivityTimer = useCallback(async () => {
    clearInactivityTimer();
    // Save current time as last activity
    await saveSecurely('lastActivityTime', Date.now().toString());
    // Start the 10-minute countdown
    inactivityTimerRef.current = setTimeout(() => {
      performAutoLogout();
    }, INACTIVITY_TIMEOUT_MS);
  }, [clearInactivityTimer, performAutoLogout]);

  const resetActivityTimer = useCallback(() => {
    // Only reset if user is an admin/owner
    if (isAuthenticated && (userRole === 'owner' || userRole === 'admin')) {
      startInactivityTimer();
    }
  }, [isAuthenticated, userRole, startInactivityTimer]);

  // Attach global event listeners for user activity (web only)
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && isAuthenticated && (userRole === 'owner' || userRole === 'admin')) {
      const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
      
      // Throttled handler to avoid excessive calls
      let lastReset = 0;
      const throttledReset = () => {
        const now = Date.now();
        if (now - lastReset > 30000) { // Throttle: max once per 30 seconds
          lastReset = now;
          resetActivityTimer();
        }
      };

      activityEvents.forEach(event => {
        window.addEventListener(event, throttledReset, { passive: true });
      });

      // Start the initial timer
      startInactivityTimer();

      return () => {
        activityEvents.forEach(event => {
          window.removeEventListener(event, throttledReset);
        });
        clearInactivityTimer();
      };
    }
  }, [isAuthenticated, userRole, resetActivityTimer, startInactivityTimer, clearInactivityTimer]);

  // ---- End Inactivity System ----

  useEffect(() => {
    loadAuthState();
  }, []);

  const loadAuthState = async () => {
    try {
      const token = await getSecurely('userToken');
      const role = await getSecurely('userRole');
      const name = await getSecurely('userName');
      
      if (token) {
        // Check if the session has expired due to inactivity
        if (role === 'owner' || role === 'admin') {
          const lastActivity = await getSecurely('lastActivityTime');
          if (lastActivity) {
            const elapsed = Date.now() - parseInt(lastActivity);
            if (elapsed > INACTIVITY_TIMEOUT_MS) {
              // Session expired while away - auto logout
              console.log('[AuthContext] Session expired while away, logging out');
              await deleteSecurely('userToken');
              await deleteSecurely('userRole');
              await deleteSecurely('userName');
              await deleteSecurely('userId');
              await deleteSecurely('lastActivityTime');
              setLoading(false);
              return;
            }
          }
        }
        
        setIsAuthenticated(true);
        setUserRole(role);
        setUserToken(token);
        setUserName(name);
      }
    } catch (e) {
      console.error('Failed to load auth state:', e);
    } finally {
      setLoading(false);
    }
  };

  const login = async (authData) => {
    try {
      const { token, role, name, id } = authData;
      
      await saveSecurely('userToken', token);
      await saveSecurely('userRole', role);
      await saveSecurely('userName', name);
      await saveSecurely('userId', id);
      await saveSecurely('loginStrikes', '0');

      // Save initial activity time for admin/owner
      if (role === 'owner' || role === 'admin') {
        await saveSecurely('lastActivityTime', Date.now().toString());
      }

      setIsAuthenticated(true);
      setUserRole(role);
      setUserToken(token);
      setUserName(name);

      // By default, MFA is not verified yet
      setIsMfaVerified(false);

      // Requirement: Admin/Owner landing page in French by default
      if (role === 'owner' || role === 'admin') {
        await changeLanguage('fr');
      }

      return true;
    } catch (e) {
      console.error('Login failed:', e);
      return false;
    }
  };

  const logout = async () => {
    try {
      clearInactivityTimer();
      await deleteSecurely('userToken');
      await deleteSecurely('userRole');
      await deleteSecurely('userName');
      await deleteSecurely('userId');
      await deleteSecurely('lastActivityTime');
      
      setIsAuthenticated(false);
      setUserRole(null);
      setUserToken(null);
      setUserName(null);
      setIsMfaVerified(false);
      
      return true;
    } catch (e) {
      console.error('Logout failed:', e);
      return false;
    }
  };

  const verifyMFA = () => {
    setIsMfaVerified(true);
  };

  return (
    <AuthContext.Provider value={{ 
      isAuthenticated, 
      userRole, 
      userToken, 
      userName, 
      isMfaVerified,
      loading, 
      login, 
      logout,
      verifyMFA,
      resetActivityTimer
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
