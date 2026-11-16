import { Platform, PermissionsAndroid, NativeModules, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { scanWifiNetworks, formatWifiDataMap } from './wifiScanner';
import api, {
  STORAGE_KEY_API_URL,
  STORAGE_KEY_TOKEN,
  STORAGE_KEY_ACTIVE_ORG,
  DEFAULT_API_URL,
  normalizeApiUrl,
} from '../api/client';

export const BACKGROUND_TRACKING_TASK = 'INTRALOCATE_BACKGROUND_WIFI_TRACKING';
export const STORAGE_KEY_TRACKING_ENABLED = '@intralocate_tracking_enabled_v1';
export const STORAGE_KEY_PERMISSIONS_GRANTED = '@intralocate_permissions_granted_v1';
export const STORAGE_KEY_SELECTED_SPACE = '@intralocate_selected_space_v1';
export const STORAGE_KEY_LAST_BG_SYNC = '@intralocate_last_background_sync';
export const STORAGE_KEY_LAST_KNOWN_LOC = '@intralocate_last_known_location';

/**
 * Scan Wi-Fi networks safely across Android platforms and native bridges
 */
export async function queryWifiNetworks(forceFresh = true) {
  const res = await scanWifiNetworks({ forceFresh });
  return res.networks || [];
}

/**
 * Build cleaned Wi-Fi RSSI map
 */
export function formatWifiData(networks) {
  return formatWifiDataMap(networks);
}

/**
 * Check all 4 required Android permissions and system service states:
 * 1. Location permission (Fine Location)
 * 2. Background location (ACCESS_BACKGROUND_LOCATION)
 * 3. Wi-Fi scanning (Nearby Wi-Fi devices / WifiManager available)
 * 4. Location services (GPS toggled ON in device settings)
 */
export async function checkAllPermissions() {
  if (Platform.OS !== 'android') {
    return {
      locationPermission: 'Granted',
      bgLocationPermission: 'Granted',
      wifiScanning: 'Available',
      locationServices: 'Enabled',
      allGranted: true,
      canBackground: true,
    };
  }

  let locationPermission = 'Denied';
  let bgLocationPermission = 'Denied';
  let wifiScanning = 'Unavailable';
  let locationServices = 'Disabled';

  // 1. Check Location Services (GPS) toggle on device
  try {
    const servicesEnabled = await Location.hasServicesEnabledAsync();
    locationServices = servicesEnabled ? 'Enabled' : 'Disabled';
  } catch (e) {
    locationServices = 'Enabled'; // fallback
  }

  // 2. Check Foreground Fine Location
  try {
    const hasFine = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    const hasCoarse = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
    locationPermission = (hasFine || hasCoarse) ? 'Granted' : 'Denied';
  } catch (e) {
    locationPermission = 'Denied';
  }

  // 3. Check Background Location
  try {
    const bgStatus = await Location.getBackgroundPermissionsAsync();
    bgLocationPermission = bgStatus.status === 'granted' ? 'Granted' : 'Denied';
  } catch (e) {
    bgLocationPermission = 'Denied';
  }

  // 4. Check Wi-Fi Scanning capability & permissions
  try {
    let nearbyGranted = true;
    if (Platform.Version >= 33 && PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES) {
      nearbyGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES);
    }
    const hasWm = !!(NativeModules.WifiManager);
    wifiScanning = (locationPermission === 'Granted' && nearbyGranted && hasWm && locationServices === 'Enabled')
      ? 'Available'
      : (hasWm ? 'Unavailable' : 'Unavailable');
  } catch (e) {
    wifiScanning = locationPermission === 'Granted' ? 'Available' : 'Unavailable';
  }

  const allGranted = locationPermission === 'Granted' && locationServices === 'Enabled';
  const canBackground = allGranted && bgLocationPermission === 'Granted';

  return {
    locationPermission,
    bgLocationPermission,
    wifiScanning,
    locationServices,
    allGranted,
    canBackground,
  };
}

/**
 * Step 1: Request Foreground Location and Wi-Fi Scanning permissions
 * Required on Android for Wi-Fi scanning.
 */
export async function requestForegroundPermissions() {
  if (Platform.OS !== 'android') return true;

  try {
    const permsToRequest = [
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    ];

    // Android 13+ (API 33+) requires NEARBY_WIFI_DEVICES for Wi-Fi scanning
    if (Platform.Version >= 33 && PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES) {
      permsToRequest.push(PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES);
    }

    // Android 13+ requires POST_NOTIFICATIONS for foreground service notification
    if (Platform.Version >= 33 && PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS) {
      permsToRequest.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    }

    const granted = await PermissionsAndroid.requestMultiple(permsToRequest);
    const fineGranted = granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
    const coarseGranted = granted[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;

    return fineGranted || coarseGranted;
  } catch (err) {
    console.log('requestForegroundPermissions error:', err);
    return false;
  }
}

/**
 * Step 2: Request Background Location permission in a separate flow.
 * On Android 11+ (API 30+), background location MUST be requested separately
 * after foreground location is already granted.
 */
export async function requestBackgroundPermission() {
  if (Platform.OS !== 'android') return true;

  try {
    // Check if foreground is granted first
    const hasFine = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    const hasCoarse = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
    if (!hasFine && !hasCoarse) {
      const fgOk = await requestForegroundPermissions();
      if (!fgOk) return false;
    }

    // Check existing background status
    const bgStatus = await Location.getBackgroundPermissionsAsync();
    if (bgStatus.status === 'granted') {
      return true;
    }

    // On Android 11+, request background location through Expo Location
    const res = await Location.requestBackgroundPermissionsAsync();
    return res.status === 'granted';
  } catch (err) {
    console.log('requestBackgroundPermission error:', err.message);
    return false;
  }
}

/**
 * Open device App Settings so user can enable "Allow all the time" or missing permissions
 */
export async function openDeviceSettings() {
  try {
    await Linking.openSettings();
  } catch (e) {
    console.log('Error opening settings:', e);
  }
}

/**
 * Synchronize live device status and permissions to backend server
 */
export async function syncDeviceStatusToBackend(orgId, extra = {}) {
  try {
    if (!orgId) return { success: false };

    const permStates = await checkAllPermissions();
    const trackingEnabledStored = (await AsyncStorage.getItem(STORAGE_KEY_TRACKING_ENABLED)) === 'true';
    const isTrackingActive = permStates.locationPermission === 'Granted' ? trackingEnabledStored : false;

    let lastKnownLoc = null;
    try {
      const locStr = await AsyncStorage.getItem(STORAGE_KEY_LAST_KNOWN_LOC);
      if (locStr) lastKnownLoc = JSON.parse(locStr);
    } catch (e) {}

    const payload = {
      locationPermission: permStates.locationPermission,
      bgLocationPermission: permStates.bgLocationPermission,
      wifiScanStatus: permStates.wifiScanning,
      locationServicesStatus: permStates.locationServices,
      isTrackingActive,
      deviceModel: `${Platform.OS} ${Platform.Version}`,
      osVersion: String(Platform.Version),
      detectedRoom: extra.detectedRoom || lastKnownLoc,
      ...extra,
    };

    const res = await api.sendDeviceStatus(orgId, payload);
    return res;
  } catch (err) {
    console.log('syncDeviceStatusToBackend error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Transmit Wi-Fi data snapshot to backend with robust timeouts, retries, and error handling
 */
export async function transmitWifiSnapshot(mode = 'foreground') {
  try {
    const token = await AsyncStorage.getItem(STORAGE_KEY_TOKEN);
    const activeOrgStr = await AsyncStorage.getItem(STORAGE_KEY_ACTIVE_ORG);

    if (!token || !activeOrgStr) return { success: false, error: 'No active session' };

    const activeOrg = JSON.parse(activeOrgStr);

    // Verify permission is still granted before scanning
    const perms = await checkAllPermissions();
    if (perms.locationPermission !== 'Granted') {
      // Permission was revoked: report Denied to backend immediately
      await syncDeviceStatusToBackend(activeOrg.id, {
        isTrackingActive: false,
        locationPermission: 'Denied',
      });
      return { success: false, error: 'Location permission revoked' };
    }

    // Attempt scan (fresh for foreground, safe fallback for background)
    const scanRes = await queryWifiNetworks(mode !== 'background');
    const wifiData = formatWifiData(scanRes);
    const apsCount = Object.keys(wifiData).length;

    let selectedSpace = null;
    const spaceStr = await AsyncStorage.getItem(STORAGE_KEY_SELECTED_SPACE);
    if (spaceStr) {
      try { selectedSpace = JSON.parse(spaceStr); } catch (e) {}
    }

    const payload = {
      enabled: true,
      mode,
      wifiData,
      apsCount,
      siteId: selectedSpace?.siteId || null,
      floorId: selectedSpace?.floorId || null,
      roomId: selectedSpace?.roomId || null,
    };

    // Send with automatic retry on transient network drops
    let res = null;
    try {
      res = await api.sendTrackingSignal(activeOrg.id, payload);
    } catch (firstErr) {
      // Retry once after brief pause (1.5s) for transient Wi-Fi drops
      await new Promise((r) => setTimeout(r, 1500));
      res = await api.sendTrackingSignal(activeOrg.id, payload).catch((secondErr) => {
        return { success: false, error: secondErr.message };
      });
    }

    if (!res || !res.success) {
      return { success: false, error: res?.error || 'Failed to transmit tracking signal' };
    }

    const nowIso = new Date().toISOString();
    await AsyncStorage.setItem(STORAGE_KEY_LAST_BG_SYNC, nowIso);

    if (res.data?.detectedRoom) {
      await AsyncStorage.setItem(
        STORAGE_KEY_LAST_KNOWN_LOC,
        JSON.stringify(res.data.detectedRoom)
      );
    }

    // Keep device status & permissions synchronized
    syncDeviceStatusToBackend(activeOrg.id, {
      detectedRoom: res.data?.detectedRoom || null,
      lastSyncAt: nowIso,
    }).catch(() => {});

    return {
      success: true,
      apsCount,
      wifiData,
      data: res.data || null,
    };
  } catch (err) {
    console.log('transmitWifiSnapshot error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Top-level TaskManager task definition
 * Executes safely in background without blocking or leaking.
 */
TaskManager.defineTask(BACKGROUND_TRACKING_TASK, async ({ data, error }) => {
  if (error) {
    console.log('[BackgroundTrackingTask] Error:', error.message);
    return;
  }

  try {
    const trackingEnabled = await AsyncStorage.getItem(STORAGE_KEY_TRACKING_ENABLED);
    if (trackingEnabled !== 'true') {
      return;
    }

    await transmitWifiSnapshot('background');
  } catch (err) {
    console.log('[BackgroundTrackingTask] Execution error:', err.message);
  }
});

/**
 * Start background location & Wi-Fi collection updates via Foreground Service
 * Handles Android version requirements, persistent notification, and error safety.
 */
export async function startBackgroundTracking() {
  try {
    if (Platform.OS === 'android') {
      const hasFine = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      const hasCoarse = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
      if (!hasFine && !hasCoarse) {
        console.log('startBackgroundTracking aborted: location permission not granted yet');
        return false;
      }
    }

    const isStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TRACKING_TASK).catch(() => false);
    if (isStarted) return true;

    await Location.startLocationUpdatesAsync(BACKGROUND_TRACKING_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 15000,
      distanceInterval: 0,
      deferredUpdatesInterval: 0,
      deferredUpdatesDistance: 0,
      foregroundService: {
        notificationTitle: 'IntraLocate Indoor Positioning',
        notificationBody: 'Ambient Wi-Fi signal tracking is running in the background',
        notificationColor: '#1E293B',
        killServiceOnDestroy: true,
      },
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
    });

    return true;
  } catch (err) {
    console.log('startBackgroundTracking error:', err.message);
    return false;
  }
}

/**
 * Stop background tracking task
 */
export async function stopBackgroundTracking() {
  try {
    const isStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TRACKING_TASK).catch(() => false);
    if (isStarted) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_TRACKING_TASK);
    }
    return true;
  } catch (err) {
    console.log('stopBackgroundTracking error:', err.message);
    return false;
  }
}

/**
 * Check if background tracking is currently active
 */
export async function isBackgroundTrackingActive() {
  try {
    return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TRACKING_TASK);
  } catch (e) {
    return false;
  }
}
