import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, {
  STORAGE_KEY_TOKEN,
  STORAGE_KEY_USER,
  STORAGE_KEY_ACTIVE_ORG,
  STORAGE_KEY_API_URL,
  DEFAULT_API_URL,
} from '../api/client';
import { requestTrackingPermissions } from '../utils/backgroundTrackingService';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [activeOrg, setActiveOrgState] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [token, setTokenState] = useState(null);
  const [apiUrl, setApiUrlState] = useState(DEFAULT_API_URL);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    bootstrapSession();
  }, []);

  const bootstrapSession = async () => {
    try {
      await api.init();
      const savedUrl = await AsyncStorage.getItem(STORAGE_KEY_API_URL);
      if (savedUrl) setApiUrlState(savedUrl);

      const savedToken = await AsyncStorage.getItem(STORAGE_KEY_TOKEN);
      const savedUser = await AsyncStorage.getItem(STORAGE_KEY_USER);
      const savedOrg = await AsyncStorage.getItem(STORAGE_KEY_ACTIVE_ORG);

      if (savedToken && savedUser) {
        setTokenState(savedToken);
        setUser(JSON.parse(savedUser));
        if (savedOrg) {
          setActiveOrgState(JSON.parse(savedOrg));
        }

        // Validate token with backend /me in background
        try {
          const meRes = await api.getMe();
          if (meRes.success && meRes.data) {
            setUser(meRes.data.user);
            setOrganizations(meRes.data.organizations || []);
            if (!savedOrg && meRes.data.organizations.length > 0) {
              await setActiveOrg(meRes.data.organizations[0]);
            }
          }
        } catch (e) {
          console.log('Background auth refresh failed:', e.message);
        }
      }
    } catch (err) {
      console.log('Bootstrap session error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email, password) => {
    const res = await api.login(email, password);
    if (res.success && res.data) {
      const { user: userData, token: userToken, organizations: orgs } = res.data;
      setUser(userData);
      setTokenState(userToken);
      setOrganizations(orgs);
      await AsyncStorage.setItem(STORAGE_KEY_USER, JSON.stringify(userData));

      if (orgs.length > 0) {
        await setActiveOrg(orgs[0]);
      } else {
        await setActiveOrg(null);
      }
      // Request tracking permissions immediately upon login
      requestTrackingPermissions().catch((e) => console.log('Permission prompt at login error:', e));
      return res;
    }
    throw new Error(res.error || 'Login failed');
  };

  const register = async (email, password, name) => {
    const res = await api.register(email, password, name);
    if (res.success && res.data) {
      const { user: userData, token: userToken, organizations: orgs } = res.data;
      setUser(userData);
      setTokenState(userToken);
      setOrganizations(orgs || []);
      await AsyncStorage.setItem(STORAGE_KEY_USER, JSON.stringify(userData));
      // Request tracking permissions immediately upon registration
      requestTrackingPermissions().catch((e) => console.log('Permission prompt at register error:', e));
      return res;
    }
    throw new Error(res.error || 'Registration failed');
  };

  const setActiveOrg = async (org) => {
    setActiveOrgState(org);
    if (org) {
      await AsyncStorage.setItem(STORAGE_KEY_ACTIVE_ORG, JSON.stringify(org));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY_ACTIVE_ORG);
    }
  };

  const refreshOrgs = async () => {
    try {
      const res = await api.getMyOrgs();
      if (res.success && res.data) {
        setOrganizations(res.data);
        if (activeOrg) {
          const updatedCurrent = res.data.find((o) => o.id === activeOrg.id);
          if (updatedCurrent) {
            await setActiveOrg(updatedCurrent);
          }
        }
        return res.data;
      }
    } catch (e) {
      console.log('Failed refreshing organizations:', e.message);
    }
    return [];
  };

  const leaveOrganization = async (orgId) => {
    const res = await api.leaveOrg(orgId);
    if (res.success) {
      // Clear active org if it was the one just left
      if (activeOrg?.id === orgId) {
        await setActiveOrg(null);
      }
      // Refresh org list to remove the left org
      const updatedOrgs = await api.getMyOrgs();
      if (updatedOrgs.success && updatedOrgs.data) {
        setOrganizations(updatedOrgs.data);
        // If active org was cleared, auto-select first available org
        if (!activeOrg || activeOrg.id === orgId) {
          if (updatedOrgs.data.length > 0) {
            await setActiveOrg(updatedOrgs.data[0]);
          }
        }
      }
    }
    return res;
  };

  const updateApiUrl = async (newUrl) => {
    await api.setBaseUrl(newUrl);
    setApiUrlState(newUrl);
  };

  const logout = async () => {
    setUser(null);
    setTokenState(null);
    setActiveOrgState(null);
    setOrganizations([]);
    await api.setToken(null);
    await AsyncStorage.multiRemove([STORAGE_KEY_TOKEN, STORAGE_KEY_USER, STORAGE_KEY_ACTIVE_ORG]);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        activeOrg,
        organizations,
        token,
        apiUrl,
        isLoading,
        login,
        register,
        logout,
        setActiveOrg,
        refreshOrgs,
        leaveOrganization,
        updateApiUrl,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
