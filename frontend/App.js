import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, StatusBar, TouchableOpacity, SafeAreaView } from 'react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';

import LandingScreen from './src/screens/LandingScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import OrgSelectScreen from './src/screens/OrgSelectScreen';
import AdminDashboardScreen from './src/screens/AdminDashboardScreen';
import ContributorDashboardScreen from './src/screens/ContributorDashboardScreen';
import UserDashboardScreen from './src/screens/UserDashboardScreen';
import DataCollectorScreen from './src/screens/DataCollectorScreen';
import DatasetReviewScreen from './src/screens/DatasetReviewScreen';
import ModelTrainingScreen from './src/screens/ModelTrainingScreen';
import LiveLocalizationScreen from './src/screens/LiveLocalizationScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  STORAGE_KEY_TRACKING_ENABLED,
  STORAGE_KEY_PERMISSIONS_GRANTED,
  startBackgroundTracking,
} from './src/utils/backgroundTrackingService';

/**
 * AppRouter
 * State-based navigation with strict role-based access.
 */
function AppRouter() {
  const { user, activeOrg, isLoading } = useAuth();
  const { theme } = useTheme();
  const [currentScreen, setCurrentScreen] = useState('landing');

  // Auto-navigate and guard screens based on auth and role state
  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      setCurrentScreen('landing');
    } else if (!activeOrg) {
      setCurrentScreen('orgSelect');
    } else if (activeOrg.role === 'ADMIN') {
      const allowedAdminScreens = [
        'adminDashboard',
        'collector',
        'datasetReview',
        'modelTraining',
        'localization',
        'settings',
      ];
      if (!allowedAdminScreens.includes(currentScreen)) {
        setCurrentScreen('adminDashboard');
      }
    } else if (activeOrg.role === 'CONTRIBUTOR') {
      // Contributors can also access modelTraining
      const allowedContributorScreens = [
        'contributorDashboard',
        'collector',
        'modelTraining',
        'localization',
        'settings',
      ];
      if (!allowedContributorScreens.includes(currentScreen)) {
        setCurrentScreen('contributorDashboard');
      }
    } else {
      // Normal user: Only userDashboard and settings allowed
      const allowedUserScreens = ['userDashboard', 'settings'];
      if (!allowedUserScreens.includes(currentScreen)) {
        setCurrentScreen('userDashboard');
      }
    }
  }, [user, activeOrg, isLoading]);

  // Auto-start background tracking for active members with granted permissions
  useEffect(() => {
    if (!user || !activeOrg) return;
    (async () => {
      try {
        const enabled = await AsyncStorage.getItem(STORAGE_KEY_TRACKING_ENABLED);
        const permGranted = await AsyncStorage.getItem(STORAGE_KEY_PERMISSIONS_GRANTED);
        if (enabled === 'true' || (enabled === null && permGranted === 'true')) {
          await AsyncStorage.setItem(STORAGE_KEY_TRACKING_ENABLED, 'true');
          await startBackgroundTracking().catch((err) => {
            console.log('Background tracking start suppressed:', err?.message);
          });
        }
      } catch (e) {
        console.log('AppRouter background tracking auto-start error:', e.message);
      }
    })();
  }, [user, activeOrg]);

  const navigate = (screen) => {
    // Role-based navigation guard
    if (activeOrg) {
      if (activeOrg.role === 'ADMIN') {
        setCurrentScreen(screen);
      } else if (activeOrg.role === 'CONTRIBUTOR') {
        // Block admin-only screens; contributors can now access modelTraining
        if (['adminDashboard', 'datasetReview'].includes(screen)) {
          setCurrentScreen('contributorDashboard');
        } else {
          setCurrentScreen(screen);
        }
      } else {
        // Normal user
        if (['adminDashboard', 'contributorDashboard', 'collector', 'datasetReview', 'modelTraining', 'localization'].includes(screen)) {
          setCurrentScreen('userDashboard');
        } else {
          setCurrentScreen(screen);
        }
      }
    } else {
      setCurrentScreen(screen);
    }
  };

  // Splash / Loading — themed matching ThemeProvider
  if (isLoading) {
    return (
      <View style={[styles.splash, { backgroundColor: theme.splashBg }]}>
        <StatusBar barStyle={theme.statusBar} backgroundColor={theme.splashBg} />
        <Text style={[styles.splashBrand, { color: theme.splashText }]}>INTRALOCATE</Text>
        <ActivityIndicator color={theme.spinner} size="small" style={{ marginTop: 16 }} />
        <Text style={[styles.splashSub, { color: theme.splashSub }]}>Loading workspace...</Text>
      </View>
    );
  }

  // Screen Router
  switch (currentScreen) {
    case 'landing':
      return <LandingScreen onNavigate={navigate} />;
    case 'login':
      return <LoginScreen onNavigate={navigate} />;
    case 'register':
      return <RegisterScreen onNavigate={navigate} />;
    case 'orgSelect':
      return <OrgSelectScreen onNavigate={navigate} />;
    case 'adminDashboard':
      return <AdminDashboardScreen onNavigate={navigate} />;
    case 'contributorDashboard':
      return <ContributorDashboardScreen onNavigate={navigate} />;
    case 'userDashboard':
      return <UserDashboardScreen onNavigate={navigate} />;
    case 'collector':
      return <DataCollectorScreen onNavigate={navigate} />;
    case 'datasetReview':
      return <DatasetReviewScreen onNavigate={navigate} />;
    case 'modelTraining':
      return <ModelTrainingScreen onNavigate={navigate} />;
    case 'localization':
      return <LiveLocalizationScreen onNavigate={navigate} />;
    case 'settings':
      return <SettingsScreen onNavigate={navigate} />;
    default:
      return <LandingScreen onNavigate={navigate} />;
  }
}

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.warn('[RootErrorBoundary] Caught unhandled React error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Application Encountered an Issue</Text>
          <Text style={styles.errorSub}>
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </Text>
          <TouchableOpacity onPress={this.handleReset} style={styles.errorBtn}>
            <Text style={styles.errorBtnText}>Reload Screen</Text>
          </TouchableOpacity>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <RootErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </ThemeProvider>
    </RootErrorBoundary>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#0d0d0d',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  splashBrand: {
    color: '#f0f0f0',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 2,
  },
  splashSub: {
    color: '#888888',
    fontSize: 12,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorSub: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 18,
  },
  errorBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  errorBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
