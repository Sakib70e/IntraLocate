/**
 * IntraLocate Dataset CSV Generator & Parser
 * Utility functions for generating, parsing, and validating CSV datasets
 * for Indoor Localization using Wi-Fi RSSI fingerprinting.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

// Default RSSI penalty value when a Wi-Fi AP is not detected / out of range
export const MISSING_SIGNAL_RSSI = -110;

/**
 * Normalizes and cleans Wi-Fi SSID to avoid duplicate columns due to
 * surrounding quotes, whitespace, or hidden/unknown network labels.
 * 
 * @param {string} ssid 
 * @param {string} bssid 
 * @returns {string} Clean, consistent column name
 */
export const cleanSSID = (ssid, bssid) => {
  if (!ssid) {
    return bssid ? `AP_${bssid.replace(/[:-\s]/g, '_')}` : 'Unknown_AP';
  }

  let cleaned = String(ssid).trim();
  // Strip surrounding quotes (e.g. "\"HomeWiFi\"" -> "HomeWiFi")
  cleaned = cleaned.replace(/^["']+|["']+$/g, '').trim();

  // If SSID is hidden or unknown, fallback to BSSID or a clean descriptor
  if (
    !cleaned ||
    cleaned.toLowerCase() === '<unknown ssid>' ||
    cleaned.toLowerCase() === '(hidden ssid)' ||
    cleaned.toLowerCase() === 'unknown'
  ) {
    return bssid ? `AP_${bssid.replace(/[:-\s]/g, '_')}` : 'Hidden_Network';
  }

  return cleaned;
};

/**
 * Helper to escape CSV strings with commas or quotes
 */
export const escapeCSVValue = (val) => {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * Converts captured sample records into a standard CSV string format with
 * Location, Floor, Timestamp, and all scanned Wi-Fi AP columns.
 */
export const generateCSV = (samples, missingValue = MISSING_SIGNAL_RSSI) => {
  if (!samples || samples.length === 0) {
    return '';
  }

  // 1. Gather all unique Wi-Fi network identifiers across all samples
  const wifiSet = new Set();
  samples.forEach((sample) => {
    if (sample.wifiData) {
      Object.keys(sample.wifiData).forEach((key) => {
        if (key && key.trim()) {
          wifiSet.add(key.trim());
        }
      });
    }
  });

  // Sort Wi-Fi column names alphabetically for consistent layout
  const wifiList = Array.from(wifiSet).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );

  // 2. Build Header Row: Location, Floor, Timestamp, <WiFi_1>, <WiFi_2>, ...
  const headers = ['Location', 'Floor', 'Timestamp', ...wifiList];
  const csvRows = [headers.map(escapeCSVValue).join(',')];

  // 3. Build Data Rows
  samples.forEach((sample) => {
    // Prefer explicit floorName; fall back to floor string field; 'Unknown Floor' only as last resort
    const floor = sample.floorName || sample.floor || 'Unknown Floor';
    const row = [
      escapeCSVValue(sample.location || sample.roomName || 'Unknown'),
      escapeCSVValue(floor),
      escapeCSVValue(sample.timestamp || new Date().toISOString()),
      ...wifiList.map((wifiKey) => {
        const val = sample.wifiData ? sample.wifiData[wifiKey] : undefined;
        if (val !== undefined && val !== null && !isNaN(val)) {
          return val;
        }
        return missingValue;
      }),
    ];
    csvRows.push(row.join(','));
  });

  return csvRows.join('\n');
};

/**
 * Opens system document picker to select an actual CSV file and reads its content.
 * Compatible with web and React Native/Expo on Android & iOS.
 * 
 * @returns {Promise<{ name: string, size: number, content: string } | null>}
 */
export const pickAndReadCsvFile = async () => {
  if (Platform.OS === 'web') {
    return new Promise((resolve, reject) => {
      try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,text/csv,text/comma-separated-values,text/plain';
        input.onchange = (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) {
            resolve(null);
            return;
          }
          const reader = new FileReader();
          reader.onload = (event) => {
            resolve({
              name: file.name,
              size: file.size,
              content: event.target.result,
            });
          };
          reader.onerror = (err) => reject(err);
          reader.readAsText(file);
        };
        input.click();
      } catch (err) {
        reject(err);
      }
    });
  }

  // Native (Android / iOS)
  let DocumentPicker = null;
  try {
    DocumentPicker = require('expo-document-picker');
  } catch (pickerLoadErr) {
    console.log('expo-document-picker module load failed:', pickerLoadErr?.message);
  }

  if (DocumentPicker && typeof DocumentPicker.getDocumentAsync === 'function') {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return null;
      }

      const asset = result.assets[0];
      let content = '';

      try {
        content = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType?.UTF8 || 'utf8',
        });
      } catch (readErr) {
        // Fallback via File class if available
        try {
          const { File } = require('expo-file-system');
          if (File) {
            const f = new File(asset.uri);
            content = await f.text();
          } else {
            throw readErr;
          }
        } catch (fErr) {
          throw readErr;
        }
      }

      return {
        name: asset.name || 'dataset.csv',
        size: asset.size || content.length,
        content,
      };
    } catch (err) {
      console.log('DocumentPicker.getDocumentAsync error:', err?.message);
      // Fall through to File.pickFileAsync fallback
    }
  }

  // Fallback: Check if expo-file-system File.pickFileAsync is available
  try {
    const { File } = require('expo-file-system');
    if (File && typeof File.pickFileAsync === 'function') {
      const pickRes = await File.pickFileAsync({
        mimeTypes: ['text/csv', 'text/comma-separated-values', 'text/*'],
      });
      if (pickRes && !pickRes.canceled && pickRes.result) {
        const f = pickRes.result;
        const content = typeof f.text === 'function'
          ? await f.text()
          : await FileSystem.readAsStringAsync(f.uri, { encoding: FileSystem.EncodingType?.UTF8 || 'utf8' });
        return {
          name: f.name || 'dataset.csv',
          size: content.length,
          content,
        };
      }
      return null;
    }
  } catch (fallbackErr) {
    console.log('File.pickFileAsync fallback error:', fallbackErr?.message);
  }

  throw new Error(
    "Native file picker is not compiled into the current development build yet. Please rebuild the APK with 'npx expo run:android' or paste CSV text directly."
  );
};

/**
 * Parses raw CSV text into structured sample objects.
 * Accurately extracts Floor, Room, Timestamp, and Wi-Fi RSSI mappings.
 * 
 * @param {string} csvText 
 * @returns {Array<{ floorName: string, roomName: string, location: string, timestamp: string, wifiData: Object }>}
 */
export const parseCSVToSamples = (csvText) => {
  if (!csvText || typeof csvText !== 'string') return [];
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  // Parse CSV line handling quotes & commas
  const parseRow = (line) => {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  if (headers.length < 2) return [];

  // Identify index of key semantic columns
  const floorIdx = headers.findIndex((h) =>
    /^(floor|floor_name|floor_number|floor_num|level|storey|floorid)$/i.test(h)
  );
  const locIdx = headers.findIndex((h) =>
    /^(location|room|room_name|room_id|space|spaceid|zone|area|label)$/i.test(h)
  );
  const timeIdx = headers.findIndex((h) =>
    /^(time|timestamp|date|datetime|recorded_at)$/i.test(h)
  );
  const siteIdx = headers.findIndex((h) =>
    /^(site|site_id|building|building_name|home|buildingid)$/i.test(h)
  );

  const samples = [];
  for (let r = 1; r < lines.length; r++) {
    const row = parseRow(lines[r]);
    if (row.length < 2) continue;

    let rawLoc = locIdx !== -1 ? row[locIdx] : '';
    let rawFloor = floorIdx !== -1 ? row[floorIdx] : '';
    const rawTime = timeIdx !== -1 ? row[timeIdx] : '';

    // Clean strings
    rawLoc = (rawLoc || '').replace(/^["']+|["']+$/g, '').trim();
    rawFloor = (rawFloor || '').replace(/^["']+|["']+$/g, '').trim();

    // If floor column is missing or empty, attempt extraction from location string
    // e.g. "Floor 1 - Living Room", "Level 2 / Office", "Floor 2: Kitchen"
    if (!rawFloor && rawLoc) {
      const floorMatch = rawLoc.match(/^(?:floor|level|storey)\s*(\d+|[a-zA-Z]+)[\s\-_\/:]+(.+)$/i);
      if (floorMatch) {
        rawFloor = `Floor ${floorMatch[1]}`;
        rawLoc = floorMatch[2].trim();
      }
    }

    // Default floor to "Floor 1" if still not resolved
    if (!rawFloor) {
      rawFloor = 'Floor 1';
    } else if (/^\d+$/.test(rawFloor)) {
      rawFloor = `Floor ${rawFloor}`;
    }

    // Default room to "Room" if missing
    if (!rawLoc) {
      rawLoc = `Room ${r}`;
    }

    const timestamp = rawTime ? new Date(rawTime).toISOString() : new Date().toISOString();

    const wifiData = {};
    for (let c = 0; c < headers.length; c++) {
      if (c === locIdx || c === floorIdx || c === timeIdx || c === siteIdx) continue;
      const colName = cleanSSID(headers[c]);
      const rawVal = row[c];
      const val = parseFloat(rawVal);

      // Standard negative RSSI values (e.g. -105 dBm to -10 dBm)
      if (!isNaN(val) && val > -110 && val <= 0) {
        wifiData[colName] = Math.round(val);
      } else if (!isNaN(val) && val > 0 && val <= 100) {
        // Some datasets use positive values (e.g. signal strength percentage or +dBm)
        wifiData[colName] = -Math.round(val);
      }
    }

    if (rawLoc && Object.keys(wifiData).length > 0) {
      samples.push({
        floorName: rawFloor,
        roomName: rawLoc,
        location: rawLoc,
        timestamp,
        wifiData,
      });
    }
  }

  return samples;
};

/**
 * Validates parsed CSV samples to ensure dataset integrity before merging.
 * 
 * @param {Array} samples 
 * @returns {{ valid: boolean, error?: string, totalSamples?: number, floors?: Object, rooms?: Object, uniqueFloorsCount?: number, uniqueRoomsCount?: number, uniqueApsCount?: number }}
 */
export const validateCSVData = (samples) => {
  if (!samples || !Array.isArray(samples) || samples.length === 0) {
    return {
      valid: false,
      error: 'No valid Wi-Fi fingerprint records found in the CSV file. Verify headers include room/location and Wi-Fi columns.',
      samples: [],
    };
  }

  const roomMap = {};
  const floorMap = {};
  const apSet = new Set();
  let totalApSignals = 0;

  samples.forEach((s) => {
    const f = s.floorName || 'Floor 1';
    const r = s.roomName || 'Room';
    floorMap[f] = (floorMap[f] || 0) + 1;
    roomMap[r] = (roomMap[r] || 0) + 1;

    if (s.wifiData) {
      Object.keys(s.wifiData).forEach((ap) => {
        apSet.add(ap);
        totalApSignals++;
      });
    }
  });

  if (apSet.size === 0) {
    return {
      valid: false,
      error: 'No valid Wi-Fi Access Point columns or RSSI signals detected in the CSV file.',
      samples: [],
    };
  }

  return {
    valid: true,
    totalSamples: samples.length,
    floors: floorMap,
    rooms: roomMap,
    uniqueFloorsCount: Object.keys(floorMap).length,
    uniqueRoomsCount: Object.keys(roomMap).length,
    uniqueApsCount: apSet.size,
    avgApsPerSample: (totalApSignals / samples.length).toFixed(1),
    samples,
  };
};
