import React, { createContext, useState, useContext, useEffect } from 'react';
import { getSecurely, saveSecurely, deleteSecurely } from '../services/StorageService';
import { changeLanguage } from '../services/i18n';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [userToken, setUserToken] = useState(null);
  const [userName, setUserName] = useState(null);
  const [isMfaVerified, setIsMfaVerified] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAuthState();
  }, []);

  const loadAuthState = async () => {
    try {
      const token = await getSecurely('userToken');
      const role = await getSecurely('userRole');
      const name = await getSecurely('userName');
      
      if (token) {
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
      await deleteSecurely('userToken');
      await deleteSecurely('userRole');
      await deleteSecurely('userName');
      await deleteSecurely('userId');
      
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
      verifyMFA
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
