import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Platform,
  Alert,
  Modal,
  ActivityIndicator,
  AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  checkAllPermissions,
  requestForegroundPermissions,
  requestBackgroundPermission,
  openDeviceSettings,
  syncDeviceStatusToBackend,
  startBackgroundTracking,
  stopBackgroundTracking,
  isBackgroundTrackingActive,
  transmitWifiSnapshot,
  STORAGE_KEY_TRACKING_ENABLED,
  STORAGE_KEY_PERMISSIONS_GRANTED,
  STORAGE_KEY_SELECTED_SPACE,
  STORAGE_KEY_LAST_BG_SYNC,
  STORAGE_KEY_LAST_KNOWN_LOC,
} from '../utils/backgroundTrackingService';

export default function UserDashboardScreen({ onNavigate }) {
  const { user, activeOrg, setActiveOrg } = useAuth();
  const { theme } = useTheme();
  const s = makeStyles(theme);

  // Permission statuses
  const [permStates, setPermStates] = useState({
    locationPermission: 'Checking...',
    bgLocationPermission: 'Checking...',
    wifiScanning: 'Checking...',
    locationServices: 'Checking...',
    allGranted: false,
    canBackground: false,
  });

  const [trackingActive, setTrackingActive] = useState(false);
  const [lastTransmitted, setLastTransmitted] = useState(null);
  const [detectedApCount, setDetectedApCount] = useState(0);
  const [permissionError, setPermissionError] = useState(null);
  const [detectedLocation, setDetectedLocation] = useState(null);
  const [sites, setSites] = useState([]);
  const [selectedSpace, setSelectedSpace] = useState(null);
  const [isProcessingPerms, setIsProcessingPerms] = useState(false);

  // Modals
  const [bgRationaleVisible, setBgRationaleVisible] = useState(false);
  const [batteryGuideVisible, setBatteryGuideVisible] = useState(false);

  const trackingTimerRef = useRef(null);
  const heartbeatTimerRef = useRef(null);

  useEffect(() => {
    // 1. Initial check of permissions and spaces
    refreshPermissionsAndStatus(true);
    loadSpaces();

    // 2. Start recurring heartbeat to sync device status with backend every 20s
    heartbeatTimerRef.current = setInterval(() => {
      if (activeOrg?.id) {
        syncDeviceStatusToBackend(activeOrg.id).catch(() => {});
      }
    }, 20000);

    // 3. AppState change listener: automatically recheck and synchronize permissions on every app launch/resume
    const appStateSub = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active') {
        await refreshPermissionsAndStatus(false);
      }
    });

    return () => {
      if (trackingTimerRef.current) clearInterval(trackingTimerRef.current);
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      appStateSub.remove();
    };
  }, [activeOrg]);

  const loadSpaces = async () => {
    if (!activeOrg?.id) return;
    try {
      const res = await api.getSites(activeOrg.id);
      if (res.success && Array.isArray(res.data)) {
        setSites(res.data);
      }
      const savedSpace = await AsyncStorage.getItem(STORAGE_KEY_SELECTED_SPACE);
      if (savedSpace) {
        setSelectedSpace(JSON.parse(savedSpace));
      }
      const savedLoc = await AsyncStorage.getItem(STORAGE_KEY_LAST_KNOWN_LOC);
      if (savedLoc) {
        setDetectedLocation(JSON.parse(savedLoc));
      }
    } catch (e) {
      console.log('Error loading spaces:', e.message);
    }
  };

  const handleSelectSpace = async (space) => {
    setSelectedSpace(space);
    if (space) {
      await AsyncStorage.setItem(STORAGE_KEY_SELECTED_SPACE, JSON.stringify(space));
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY_SELECTED_SPACE);
    }
  };

  /**
   * Check permissions and automatically prompt if missing immediately after joining.
   * Handles permission revocation gracefully.
   */
  const refreshPermissionsAndStatus = async (autoPromptIfMissing = false) => {
    try {
      const states = await checkAllPermissions();
      setPermStates(states);

      if (activeOrg?.id) {
        await syncDeviceStatusToBackend(activeOrg.id);
      }

      // Check if location was revoked while tracking was active
      if (states.locationPermission !== 'Granted' && trackingActive) {
        stopForegroundTimer();
        setTrackingActive(false);
        await AsyncStorage.setItem(STORAGE_KEY_TRACKING_ENABLED, 'false');
        await stopBackgroundTracking();
        if (activeOrg?.id) {
          await api.sendTrackingSignal(activeOrg.id, { enabled: false }).catch(() => {});
          await syncDeviceStatusToBackend(activeOrg.id, { isTrackingActive: false, locationPermission: 'Denied' }).catch(() => {});
        }
        Alert.alert(
          'Location Permission Revoked',
          'Location permission has been revoked. Wi-Fi scanning and tracking have been disabled.'
        );
      }

      const enabled = await AsyncStorage.getItem(STORAGE_KEY_TRACKING_ENABLED);
      const lastSync = await AsyncStorage.getItem(STORAGE_KEY_LAST_BG_SYNC);
      if (lastSync) {
        setLastTransmitted(new Date(lastSync).toLocaleTimeString());
      }

      // Automatically initiate required permission flow if missing
      if (autoPromptIfMissing && states.locationPermission !== 'Granted') {
        setTimeout(() => {
          handleInitiatePermissionFlow();
        }, 500);
      } else if (enabled === 'true' && states.allGranted) {
        // Auto-resume active tracking
        setTrackingActive(true);
        await startBackgroundTracking();
        startForegroundTimer();
        doTransmit('foreground-init');
      }
    } catch (e) {
      console.log('Error refreshing permissions:', e);
    }
  };

  /**
   * Automated, compliant Android Permission Flow:
   * 1. Foreground Location (Fine + Coarse) + Nearby Wi-Fi Devices (Android 13+) + Notifications
   * 2. If granted, prompt with educational rationale for Background Location (Android 11+)
   * 3. Sync verified statuses to backend
   */
  const handleInitiatePermissionFlow = async () => {
    if (isProcessingPerms) return;
    setIsProcessingPerms(true);
    setPermissionError(null);

    try {
      // Step 1: Foreground location & Wi-Fi scanning permissions
      const fgOk = await requestForegroundPermissions();
      const updatedStates = await checkAllPermissions();
      setPermStates(updatedStates);

      if (!fgOk || updatedStates.locationPermission !== 'Granted') {
        setPermissionError('Precise Location permission is required for Wi-Fi scanning and indoor localization.');
        Alert.alert(
          'Permission Required',
          'IntraLocate needs Precise Location access to scan ambient Wi-Fi signals for indoor localization. Please grant Location permission.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: openDeviceSettings },
          ]
        );
        setIsProcessingPerms(false);
        return;
      }

      // Check if location services (GPS toggle) are enabled
      if (updatedStates.locationServices !== 'Enabled') {
        Alert.alert(
          'Location Services Disabled',
          'Please turn ON Location (GPS) in your phone\'s settings so Wi-Fi scanning can detect ambient signals.'
        );
      }

      // Step 2: Separate Background Location flow (Android 11+)
      if (updatedStates.bgLocationPermission !== 'Granted') {
        setBgRationaleVisible(true);
      } else {
        await AsyncStorage.setItem(STORAGE_KEY_PERMISSIONS_GRANTED, 'true');
        await syncDeviceStatusToBackend(activeOrg.id);
        Alert.alert('Permissions Configured', 'All required permissions are granted. Wi-Fi scanning and localization are ready.');
      }
    } catch (err) {
      console.log('Permission flow error:', err);
      setPermissionError(err.message || 'Error configuring permissions');
    } finally {
      setIsProcessingPerms(false);
    }
  };

  const handleConfirmBackgroundPermission = async () => {
    setBgRationaleVisible(false);
    setIsProcessingPerms(true);

    try {
      const bgOk = await requestBackgroundPermission();
      const finalStates = await checkAllPermissions();
      setPermStates(finalStates);

      if (bgOk || finalStates.bgLocationPermission === 'Granted') {
        await AsyncStorage.setItem(STORAGE_KEY_PERMISSIONS_GRANTED, 'true');
        await syncDeviceStatusToBackend(activeOrg.id);
        Alert.alert('Background Location Enabled', 'Continuous background Wi-Fi signal tracking is now ready.');
      } else {
        // On Android 11+, users must select "Allow all the time" in Settings
        Alert.alert(
          'Background Access (Android 11+)',
          'To keep localization running when the app is minimized or the screen is turned off, Android requires you to set Location permission to "Allow all the time" in Settings.',
          [
            { text: 'Keep Foreground Only', style: 'cancel' },
            { text: 'Open Settings', onPress: openDeviceSettings },
          ]
        );
      }
    } catch (e) {
      console.log('Background permission request error:', e);
    } finally {
      setIsProcessingPerms(false);
      if (activeOrg?.id) {
        syncDeviceStatusToBackend(activeOrg.id).catch(() => {});
      }
    }
  };

  const doTransmit = async (mode = 'foreground') => {
    const res = await transmitWifiSnapshot(mode);
    if (res.success) {
      setDetectedApCount(res.apsCount || 0);
      setLastTransmitted(new Date().toLocaleTimeString());
      if (res.data?.detectedRoom) {
        setDetectedLocation(res.data.detectedRoom);
      }
    }
  };

  const startForegroundTimer = () => {
    if (trackingTimerRef.current) clearInterval(trackingTimerRef.current);
    trackingTimerRef.current = setInterval(async () => {
      await doTransmit('foreground');
    }, 15000);
  };

  const stopForegroundTimer = () => {
    if (trackingTimerRef.current) {
      clearInterval(trackingTimerRef.current);
      trackingTimerRef.current = null;
    }
  };

  const startTracking = async () => {
    // Ensure foreground location is granted first
    const states = await checkAllPermissions();
    if (states.locationPermission !== 'Granted') {
      await handleInitiatePermissionFlow();
      return;
    }

    setPermissionError(null);
    setTrackingActive(true);
    await AsyncStorage.setItem(STORAGE_KEY_TRACKING_ENABLED, 'true');

    // Start Android Foreground Service for continuous background execution
    await startBackgroundTracking();

    // Start foreground interval
    startForegroundTimer();
    await doTransmit('foreground');
    if (activeOrg?.id) {
      syncDeviceStatusToBackend(activeOrg.id, { isTrackingActive: true }).catch(() => {});
    }
  };

  const stopTracking = async () => {
    stopForegroundTimer();
    setTrackingActive(false);
    await AsyncStorage.setItem(STORAGE_KEY_TRACKING_ENABLED, 'false');

    await stopBackgroundTracking();

    if (activeOrg?.id) {
      try {
        await api.sendTrackingSignal(activeOrg.id, { enabled: false });
        await syncDeviceStatusToBackend(activeOrg.id, { isTrackingActive: false });
      } catch (e) {}
    }
  };

  const toggleTracking = () => {
    if (trackingActive) {
      stopTracking();
    } else {
      startTracking();
    }
  };

  const topInset = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 44;

  // Flatten rooms for space selector
  const allRooms = [];
  sites.forEach((site) => {
    (site.floors || []).forEach((floor) => {
      (floor.rooms || []).forEach((room) => {
        allRooms.push({
          siteId: site.id,
          siteName: site.name,
          floorId: floor.id,
          floorName: floor.name,
          roomId: room.id,
          roomName: room.name,
        });
      });
    });
  });

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle={theme.statusBar} backgroundColor={theme.statusBarBg} />
      <ScrollView contentContainerStyle={[s.scroll, { paddingTop: topInset }]}>
        {/* Top Navbar */}
        <View style={s.topBar}>
          <View>
            <Text style={s.orgName}>{activeOrg?.name}</Text>
            <Text style={s.roleLabel}>Normal User • Connected Device</Text>
          </View>
          <View style={s.navActions}>
            <TouchableOpacity onPress={() => onNavigate('settings')} style={s.navBtn}>
              <Text style={s.navBtnText}>Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setActiveOrg(null)} style={s.navBtn}>
              <Text style={s.navBtnText}>Switch Org</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* User Profile Card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Account Details</Text>
          <Text style={s.cardRow}>Name: {user?.name}</Text>
          <Text style={s.cardRow}>User ID: {user?.id}</Text>
          <Text style={s.cardRow}>Email: {user?.email}</Text>
          <Text style={s.cardRow}>Organization Code: {activeOrg?.code}</Text>
        </View>

        {/* 1. REQUIRED PERMISSION STATUS SECTION */}
        <View style={s.permCard}>
          <View style={s.permHeaderRow}>
            <Text style={s.sectionTitle}>Device Permission Status</Text>
            <TouchableOpacity
              style={s.refreshIconBtn}
              onPress={() => refreshPermissionsAndStatus(false)}
            >
              <Text style={s.refreshIconText}>Re-check</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.description}>
            Live permission diagnostics required for Wi-Fi scanning and continuous indoor positioning.
          </Text>

          {permissionError && (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{permissionError}</Text>
            </View>
          )}

          <View style={s.permGrid}>
            {/* Location Permission */}
            <View style={s.permItem}>
              <Text style={s.permLabel}>Location permission:</Text>
              <View
                style={[
                  s.statusPill,
                  permStates.locationPermission === 'Granted' ? s.pillGreen : s.pillRed,
                ]}
              >
                <Text
                  style={[
                    s.statusPillText,
                    permStates.locationPermission === 'Granted' ? s.textGreen : s.textRed,
                  ]}
                >
                  {permStates.locationPermission}
                </Text>
              </View>
            </View>

            {/* Background Location */}
            <View style={s.permItem}>
              <Text style={s.permLabel}>Background location:</Text>
              <View
                style={[
                  s.statusPill,
                  permStates.bgLocationPermission === 'Granted' ? s.pillGreen : s.pillAmber,
                ]}
              >
                <Text
                  style={[
                    s.statusPillText,
                    permStates.bgLocationPermission === 'Granted' ? s.textGreen : s.textAmber,
                  ]}
                >
                  {permStates.bgLocationPermission}
                </Text>
              </View>
            </View>

            {/* Wi-Fi Scanning */}
            <View style={s.permItem}>
              <Text style={s.permLabel}>Wi-Fi scanning:</Text>
              <View
                style={[
                  s.statusPill,
                  permStates.wifiScanning === 'Available' ? s.pillGreen : s.pillRed,
                ]}
              >
                <Text
                  style={[
                    s.statusPillText,
                    permStates.wifiScanning === 'Available' ? s.textGreen : s.textRed,
                  ]}
                >
                  {permStates.wifiScanning}
                </Text>
              </View>
            </View>

            {/* Location Services (GPS) */}
            <View style={s.permItem}>
              <Text style={s.permLabel}>Location services:</Text>
              <View
                style={[
                  s.statusPill,
                  permStates.locationServices === 'Enabled' ? s.pillGreen : s.pillRed,
                ]}
              >
                <Text
                  style={[
                    s.statusPillText,
                    permStates.locationServices === 'Enabled' ? s.textGreen : s.textRed,
                  ]}
                >
                  {permStates.locationServices}
                </Text>
              </View>
            </View>
          </View>

          {/* Action button to enable or fix missing permissions */}
          <TouchableOpacity
            style={s.fixPermsBtn}
            onPress={handleInitiatePermissionFlow}
            disabled={isProcessingPerms}
          >
            {isProcessingPerms ? (
              <ActivityIndicator color={theme.textBtnPrimary} size="small" />
            ) : (
              <Text style={s.fixPermsBtnText}>
                {permStates.locationPermission === 'Granted' && permStates.bgLocationPermission === 'Granted'
                  ? 'Re-configure / Fix Permissions'
                  : 'Enable / Fix Missing Permissions'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* 2. BACKGROUND OPERATION & LOCALIZATION SECTION */}
        <View style={s.trackingCard}>
          <Text style={s.sectionTitle}>Background Wi-Fi Localization</Text>
          <Text style={s.description}>
            Continues localization and ambient Wi-Fi sync when this app is minimized or the screen is turned off using an Android Foreground Service.
          </Text>

          <View style={s.statusRow}>
            <Text style={s.statusLabel}>Tracking Status:</Text>
            <View style={[s.statusBadge, trackingActive ? s.statusActive : s.statusInactive]}>
              <Text style={[s.statusBadgeText, trackingActive ? s.textWhite : s.textBlack]}>
                {trackingActive ? 'ACTIVE (Foreground Service Running)' : 'REVOKED (Inactive)'}
              </Text>
            </View>
          </View>

          {/* Current Space Selector */}
          {allRooms.length > 0 && (
            <View style={s.spacePickerBox}>
              <Text style={s.spacePickerLabel}>Current Space / Tagging:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pillRow}>
                <TouchableOpacity
                  style={[s.spacePill, !selectedSpace && s.spacePillActive]}
                  onPress={() => handleSelectSpace(null)}
                >
                  <Text style={[s.spacePillText, !selectedSpace && s.spacePillTextActive]}>
                    Auto-Detect Space (Recommended)
                  </Text>
                </TouchableOpacity>
                {allRooms.map((room) => {
                  const isSelected = selectedSpace?.roomId === room.roomId;
                  return (
                    <TouchableOpacity
                      key={room.roomId}
                      style={[s.spacePill, isSelected && s.spacePillActive]}
                      onPress={() => handleSelectSpace(room)}
                    >
                      <Text style={[s.spacePillText, isSelected && s.spacePillTextActive]}>
                        {room.siteName} • {room.roomName}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Telemetry info */}
          {trackingActive && (
            <View style={s.telemetryBox}>
              <Text style={s.telemetryText}>Last Synced: {lastTransmitted || 'Syncing...'}</Text>
              <Text style={s.telemetryText}>Wi-Fi Networks Detected: {detectedApCount}</Text>
              <Text style={s.telemetryText}>
                Background Service: Persistent Notification Active
              </Text>
              <Text style={s.telemetryText}>
                State: Minimized &amp; Screen-off Supported
              </Text>
              {detectedLocation && (
                <Text style={s.telemetryTextHighlight}>
                  Current Location: {detectedLocation.roomName || 'Classifying...'}
                  {detectedLocation.floorName ? `, ${detectedLocation.floorName}` : ''}
                  {detectedLocation.confidence ? ` (${detectedLocation.confidence}% conf)` : ''}
                </Text>
              )}
            </View>
          )}

          <TouchableOpacity
            style={[s.toggleBtn, trackingActive ? s.btnRevoke : s.btnGrant]}
            onPress={toggleTracking}
            activeOpacity={0.8}
          >
            <Text style={[s.toggleBtnText, trackingActive ? s.textBlack : s.textWhite]}>
              {trackingActive ? 'Revoke Permission & Stop Background Sync' : 'Grant Permission & Start Background Sync'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 3. LIFECYCLE & BATTERY OPTIMIZATION GUIDE */}
        <View style={s.noticeCard}>
          <Text style={s.noticeHeading}>Android Background Lifecycle Guide</Text>
          <Text style={s.noticeBody}>
            • <Text style={s.bold}>Minimized / Screen Off:</Text> Localization continues in background via the persistent Foreground Service notification.{"\n"}
            • <Text style={s.bold}>Swiped Away:</Text> Foreground service continues scanning ambient signals according to Android system policies.{"\n"}
            • <Text style={s.bold}>Force-Stopped:</Text> Android terminates all app background tasks until manually relaunched.{"\n"}
            • <Text style={s.bold}>Wi-Fi Scan Throttling:</Text> Android 9+ enforces hardware scan throttling. Cached signals are utilized seamlessly to guarantee continuous localization.
          </Text>

          <TouchableOpacity
            style={s.batteryBtn}
            onPress={() => setBatteryGuideVisible(true)}
          >
            <Text style={s.batteryBtnText}>Battery Optimization Info &amp; Fix</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>© 2026 IntraLocate. All rights reserved.</Text>
        </View>

        {/* MODAL: Background Location Educational Rationale (Android 11+) */}
        <Modal
          visible={bgRationaleVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setBgRationaleVisible(false)}
        >
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <Text style={s.modalTitle}>Continuous Background Localization</Text>
              <Text style={s.modalBody}>
                IntraLocate needs background location permission to collect ambient Wi-Fi signals and maintain accurate indoor room localization when the app is minimized or your phone screen is locked.
              </Text>
              <Text style={s.modalSub}>
                On Android 11 and above, please select <Text style={s.bold}>"Allow all the time"</Text> when prompted or in Settings.
              </Text>

              <View style={s.modalButtons}>
                <TouchableOpacity
                  style={s.modalCancelBtn}
                  onPress={() => setBgRationaleVisible(false)}
                >
                  <Text style={s.modalCancelText}>Foreground Only</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.modalSaveBtn}
                  onPress={handleConfirmBackgroundPermission}
                >
                  <Text style={s.modalSaveText}>Continue</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* MODAL: Manufacturer Battery Optimization Guide */}
        <Modal
          visible={batteryGuideVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setBatteryGuideVisible(false)}
        >
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <Text style={s.modalTitle}>Prevent Background Termination</Text>
              <Text style={s.modalBody}>
                Some device manufacturers (Xiaomi / MIUI, Samsung, OnePlus, Huawei) aggressively terminate background apps even when a Foreground Service is active.
              </Text>
              <Text style={s.modalSub}>
                To ensure uninterrupted background localization:{"\n"}
                1. Go to App Info &gt; Battery / App Battery Usage.{"\n"}
                2. Set to <Text style={s.bold}>"Unrestricted"</Text> or disable "Battery Optimization".{"\n"}
                3. On Xiaomi/HyperOS, enable "Autostart".
              </Text>

              <View style={s.modalButtons}>
                <TouchableOpacity
                  style={s.modalCancelBtn}
                  onPress={() => setBatteryGuideVisible(false)}
                >
                  <Text style={s.modalCancelText}>Dismiss</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.modalSaveBtn}
                  onPress={() => {
                    setBatteryGuideVisible(false);
                    openDeviceSettings();
                  }}
                >
                  <Text style={s.modalSaveText}>Open Settings</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    scroll: {
      paddingHorizontal: 16,
      paddingBottom: 40,
    },
    topBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderMuted,
      paddingBottom: 12,
    },
    orgName: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '800',
    },
    roleLabel: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    navActions: {
      flexDirection: 'row',
      gap: 8,
    },
    navBtn: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingVertical: 6,
      paddingHorizontal: 10,
      backgroundColor: theme.bgBtnSecondary,
    },
    navBtnText: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '600',
    },
    card: {
      borderWidth: 1,
      borderColor: theme.borderMuted,
      borderRadius: 4,
      padding: 14,
      backgroundColor: theme.bgCard,
      marginBottom: 14,
    },
    cardTitle: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '700',
      marginBottom: 8,
    },
    cardRow: {
      color: theme.textSub,
      fontSize: 13,
      marginBottom: 4,
    },
    permCard: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      padding: 14,
      backgroundColor: theme.bgCard,
      marginBottom: 14,
    },
    permHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    refreshIconBtn: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      backgroundColor: theme.bgBtnSecondary,
    },
    refreshIconText: {
      color: theme.text,
      fontSize: 11,
      fontWeight: '600',
    },
    permGrid: {
      marginVertical: 10,
      gap: 8,
    },
    permItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderFaint,
    },
    permLabel: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '600',
    },
    statusPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 4,
    },
    pillGreen: {
      backgroundColor: '#10b98120',
      borderWidth: 1,
      borderColor: '#10b981',
    },
    pillRed: {
      backgroundColor: '#ef444420',
      borderWidth: 1,
      borderColor: '#ef4444',
    },
    pillAmber: {
      backgroundColor: '#f59e0b20',
      borderWidth: 1,
      borderColor: '#f59e0b',
    },
    statusPillText: {
      fontSize: 11,
      fontWeight: '700',
    },
    textGreen: {
      color: '#10b981',
    },
    textRed: {
      color: '#ef4444',
    },
    textAmber: {
      color: '#f59e0b',
    },
    fixPermsBtn: {
      backgroundColor: theme.bgBtnPrimary,
      borderRadius: 4,
      paddingVertical: 10,
      alignItems: 'center',
      marginTop: 8,
    },
    fixPermsBtnText: {
      color: theme.textBtnPrimary,
      fontSize: 13,
      fontWeight: '600',
    },
    trackingCard: {
      borderWidth: 2,
      borderColor: theme.border,
      borderRadius: 4,
      padding: 16,
      backgroundColor: theme.bgCard,
      marginBottom: 14,
    },
    sectionTitle: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '700',
      marginBottom: 4,
    },
    description: {
      color: theme.textSub,
      fontSize: 12,
      lineHeight: 17,
      marginBottom: 12,
    },
    errorBox: {
      borderWidth: 1,
      borderColor: '#ef4444',
      backgroundColor: theme.isDark ? '#3b1818' : '#fef2f2',
      padding: 10,
      borderRadius: 4,
      marginBottom: 12,
    },
    errorText: {
      color: theme.isDark ? '#fca5a5' : '#b91c1c',
      fontSize: 12,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    statusLabel: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '600',
    },
    statusBadge: {
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 4,
    },
    statusActive: {
      backgroundColor: theme.bgBadgeActive,
    },
    statusInactive: {
      backgroundColor: theme.bgBadgeInactive,
    },
    statusBadgeText: {
      fontSize: 11,
      fontWeight: '700',
    },
    textWhite: {
      color: theme.isDark ? '#111111' : '#ffffff',
    },
    textBlack: {
      color: theme.isDark ? '#eeeeee' : '#000000',
    },
    telemetryBox: {
      borderWidth: 1,
      borderColor: theme.borderMuted,
      borderRadius: 4,
      padding: 12,
      backgroundColor: theme.bgBuffer,
      marginBottom: 14,
      gap: 4,
    },
    telemetryText: {
      color: theme.textSub,
      fontSize: 12,
    },
    telemetryTextHighlight: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '700',
      marginTop: 2,
    },
    toggleBtn: {
      borderRadius: 4,
      paddingVertical: 12,
      alignItems: 'center',
    },
    btnGrant: {
      backgroundColor: theme.bgBtnPrimary,
    },
    btnRevoke: {
      backgroundColor: theme.bgBtnSecondary,
      borderWidth: 1,
      borderColor: theme.border,
    },
    toggleBtnText: {
      fontSize: 13,
      fontWeight: '700',
    },
    noticeCard: {
      borderWidth: 1,
      borderColor: theme.borderLight,
      borderRadius: 4,
      padding: 12,
      backgroundColor: theme.bgPreview,
      marginBottom: 16,
    },
    noticeHeading: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '700',
      marginBottom: 4,
    },
    noticeBody: {
      color: theme.textMuted,
      fontSize: 11,
      lineHeight: 16,
    },
    bold: {
      fontWeight: '700',
      color: theme.text,
    },
    batteryBtn: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingVertical: 6,
      paddingHorizontal: 10,
      backgroundColor: theme.bgBtnSecondary,
      alignItems: 'center',
      marginTop: 8,
    },
    batteryBtnText: {
      color: theme.text,
      fontSize: 11,
      fontWeight: '600',
    },
    spacePickerBox: {
      marginBottom: 14,
    },
    spacePickerLabel: {
      color: theme.textSub,
      fontSize: 12,
      fontWeight: '600',
      marginBottom: 6,
    },
    pillRow: {
      flexDirection: 'row',
      gap: 8,
      paddingVertical: 2,
    },
    spacePill: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bgBtnSecondary,
    },
    spacePillActive: {
      backgroundColor: theme.bgBtnPrimary,
      borderColor: theme.border,
    },
    spacePillText: {
      color: theme.textSub,
      fontSize: 11,
      fontWeight: '600',
    },
    spacePillTextActive: {
      color: theme.textBtnPrimary,
      fontWeight: '700',
    },
    footer: {
      alignItems: 'center',
      paddingVertical: 12,
    },
    footerText: {
      color: theme.textMuted,
      fontSize: 11,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.65)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalBox: {
      width: '100%',
      backgroundColor: theme.bgModal,
      borderRadius: 4,
      padding: 20,
      borderWidth: 1,
      borderColor: theme.border,
      gap: 12,
    },
    modalTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '700',
    },
    modalBody: {
      color: theme.textSub,
      fontSize: 13,
      lineHeight: 18,
    },
    modalSub: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 17,
    },
    modalButtons: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
      marginTop: 8,
    },
    modalCancelBtn: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingVertical: 8,
      paddingHorizontal: 12,
      backgroundColor: theme.bgBtnSecondary,
    },
    modalCancelText: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '600',
    },
    modalSaveBtn: {
      backgroundColor: theme.bgBtnPrimary,
      borderRadius: 4,
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    modalSaveText: {
      color: theme.textBtnPrimary,
      fontSize: 12,
      fontWeight: '600',
    },
  });
}
