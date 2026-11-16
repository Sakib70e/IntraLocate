import { Platform, PermissionsAndroid, NativeModules } from 'react-native';
import WifiManager from 'react-native-wifi-reborn';
import * as Location from 'expo-location';

// Module-level cache and scan mutex to prevent concurrent scan race conditions and memory leaks
let activeScanPromise = null;
let lastKnownValidNetworks = [];
let lastScanTimestamp = 0;

/**
 * Scan Wi-Fi networks safely and reliably across Android versions.
 * Prioritizes a real hardware Wi-Fi scan (reScanAndLoadWifiList) to return
 * fresh, real-world signals instead of stale cached data.
 * Falls back to cached results (loadWifiList) if the OS throttles, times out, or blocks background scans.
 * Never throws unhandled exceptions.
 */
export async function scanWifiNetworks(options = {}) {
  const { forceFresh = true, timeoutMs = 4500 } = options;

  if (Platform.OS !== 'android') {
    return { success: true, networks: [], fresh: false, reason: 'non-android' };
  }

  const wm = WifiManager || NativeModules.WifiManager;
  if (!wm) {
    return {
      success: false,
      networks: lastKnownValidNetworks,
      fresh: false,
      error: 'WifiManager native module unavailable',
    };
  }

  // 1. Check Location Services (GPS) toggle on the device
  let servicesEnabled = true;
  try {
    servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      return {
        success: false,
        networks: lastKnownValidNetworks,
        fresh: false,
        locationServicesDisabled: true,
        error: 'Location Services (GPS) are turned off. Please turn ON Location in Android settings to scan Wi-Fi networks.',
      };
    }
  } catch (e) {
    // If check fails, assume true to let native layer handle
  }

  // 2. Check Fine Location permission
  try {
    const hasFine = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    if (!hasFine) {
      return {
        success: false,
        networks: [],
        fresh: false,
        permissionDenied: true,
        error: 'Location permission (ACCESS_FINE_LOCATION) is required to scan Wi-Fi networks.',
      };
    }
  } catch (e) {
    // Continue
  }

  let results = [];
  let isFresh = false;
  let isThrottled = false;

  // 3. Attempt hardware scan if requested, with concurrency mutex
  if (forceFresh && typeof wm.reScanAndLoadWifiList === 'function') {
    try {
      if (activeScanPromise) {
        // Reuse ongoing scan if already executing
        const res = await activeScanPromise;
        if (Array.isArray(res) && res.length > 0) {
          results = res;
          isFresh = true;
        }
      } else {
        const scanAction = async () => {
          try {
            return await wm.reScanAndLoadWifiList();
          } catch (e) {
            return null;
          }
        };

        const timeoutAction = new Promise((resolve) =>
          setTimeout(() => resolve(null), timeoutMs)
        );

        activeScanPromise = Promise.race([scanAction(), timeoutAction]);
        const res = await activeScanPromise;
        activeScanPromise = null;

        if (Array.isArray(res) && res.length > 0) {
          results = res;
          isFresh = true;
          lastScanTimestamp = Date.now();
        } else {
          isThrottled = true;
        }
      }
    } catch (scanErr) {
      activeScanPromise = null;
      isThrottled = true;
    }
  }

  // 4. Fallback to cached scan results if reScan didn't return results
  if (!results.length && typeof wm.loadWifiList === 'function') {
    try {
      const cached = await wm.loadWifiList();
      if (Array.isArray(cached) && cached.length > 0) {
        results = cached;
        isFresh = false;
      }
    } catch (loadErr) {
      // Fallback failed
    }
  }

  // 5. Clean, filter, and normalize networks defensively
  const validNetworks = (results || [])
    .filter((n) => n && (n.SSID || n.BSSID))
    .map((n) => ({
      SSID: n.SSID && typeof n.SSID === 'string'
        ? n.SSID.trim().replace(/^["']+|["']+$/g, '')
        : '',
      BSSID: n.BSSID && typeof n.BSSID === 'string'
        ? n.BSSID.trim()
        : '',
      level: parseInt(n.level, 10) || -100,
      frequency: parseInt(n.frequency, 10) || 0,
      capabilities: n.capabilities || '',
    }));

  if (validNetworks.length > 0) {
    lastKnownValidNetworks = validNetworks;
  }

  // If OS returned 0 APs due to aggressive throttling, use last known valid results
  const returnNetworks = validNetworks.length > 0 ? validNetworks : lastKnownValidNetworks;

  return {
    success: true,
    networks: returnNetworks,
    fresh: isFresh,
    throttled: isThrottled || (validNetworks.length === 0 && lastKnownValidNetworks.length > 0),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format scanned networks into clean RSSI map for ML models and backend API
 */
export function formatWifiDataMap(networks) {
  const wifiData = {};
  (networks || []).forEach((n) => {
    const key = n.SSID && n.SSID.trim() ? n.SSID.trim() : `AP_${n.BSSID}`;
    const level = parseInt(n.level, 10);
    if (!isNaN(level) && level > -110 && level <= 0) {
      wifiData[key] = level;
    }
  });
  return wifiData;
}
