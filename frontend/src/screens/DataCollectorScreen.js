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
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  PermissionsAndroid,
  NativeModules,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
// Use legacy FileSystem API (expo-file-system v57 — writeAsStringAsync lives in /legacy)
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Location from 'expo-location';
import WifiManager from 'react-native-wifi-reborn';

import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { generateCSV, parseCSVToSamples, pickAndReadCsvFile, validateCSVData } from '../utils/csvHelper';
import { scanWifiNetworks, formatWifiDataMap } from '../utils/wifiScanner';

const STORAGE_KEY_OFFLINE_BUFFER = '@intralocate_pending_samples_v2';

export default function DataCollectorScreen({ onNavigate }) {
  const { user, activeOrg } = useAuth();
  const { theme } = useTheme();
  const isAdmin = activeOrg?.role === 'ADMIN';

  // Hierarchy State
  const [sites, setSites] = useState([]);
  const [floors, setFloors] = useState([]);
  const [rooms, setRooms] = useState([]);

  const [selectedSite, setSelectedSite] = useState(null);
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);

  // Hierarchy Dropdown Modals
  const [sitePickerVisible, setSitePickerVisible] = useState(false);
  const [floorPickerVisible, setFloorPickerVisible] = useState(false);
  const [roomPickerVisible, setRoomPickerVisible] = useState(false);

  // Add Room Modal State (admin only)
  const [addRoomModalVisible, setAddRoomModalVisible] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomCode, setNewRoomCode] = useState('');
  const [addingRoom, setAddingRoom] = useState(false);

  // Scanning & Buffer State
  const [wifiList, setWifiList] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isAutoCollecting, setIsAutoCollecting] = useState(false);
  const [pendingSamples, setPendingSamples] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Room Data Statistics & Inspection
  const [roomStats, setRoomStats] = useState([]); // [{ id, name, floorName, count }]
  const [inspectRoom, setInspectRoom] = useState(null);
  const [inspectRecords, setInspectRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [inspectModalVisible, setInspectModalVisible] = useState(false);

  // CSV Import Modal State
  const [csvModalVisible, setCsvModalVisible] = useState(false);
  const [selectedCsvFile, setSelectedCsvFile] = useState(null);
  const [csvParsedPreview, setCsvParsedPreview] = useState(null);
  const [importingCsv, setImportingCsv] = useState(false);
  const [csvRawText, setCsvRawText] = useState('');
  const [showPasteInput, setShowPasteInput] = useState(false);

  // Refs
  const autoCollectIntervalRef = useRef(null);
  const isScanningRef = useRef(false);
  const pendingSamplesRef = useRef([]);
  const selectedRoomRef = useRef(selectedRoom);
  const selectedFloorRef = useRef(selectedFloor);
  const selectedSiteRef = useRef(selectedSite);
  const activeOrgRef = useRef(activeOrg);

  useEffect(() => {
    pendingSamplesRef.current = pendingSamples;
  }, [pendingSamples]);
  useEffect(() => {
    selectedRoomRef.current = selectedRoom;
  }, [selectedRoom]);
  useEffect(() => {
    selectedFloorRef.current = selectedFloor;
  }, [selectedFloor]);
  useEffect(() => {
    selectedSiteRef.current = selectedSite;
  }, [selectedSite]);
  useEffect(() => {
    activeOrgRef.current = activeOrg;
  }, [activeOrg]);

  useEffect(() => {
    loadSites();
    loadOfflineBuffer();
    requestPermissions();

    return () => {
      stopAutoCollect();
    };
  }, [activeOrg]);

  useEffect(() => {
    if (selectedSite) {
      loadFloors(selectedSite.id);
      loadSiteRoomStats(selectedSite.id);
    } else {
      setFloors([]);
      setSelectedFloor(null);
      setRooms([]);
      setSelectedRoom(null);
      setRoomStats([]);
    }
  }, [selectedSite]);

  useEffect(() => {
    if (selectedFloor) {
      loadRooms(selectedFloor.id);
    } else {
      setRooms([]);
      setSelectedRoom(null);
    }
  }, [selectedFloor]);

  // Load offline buffer
  const loadOfflineBuffer = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY_OFFLINE_BUFFER);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          pendingSamplesRef.current = parsed;
          setPendingSamples(parsed);
        }
      }
    } catch (e) {}
  };

  const saveOfflineBuffer = async (samples) => {
    try {
      if (!samples || samples.length === 0) {
        await AsyncStorage.removeItem(STORAGE_KEY_OFFLINE_BUFFER);
      } else {
        await AsyncStorage.setItem(STORAGE_KEY_OFFLINE_BUFFER, JSON.stringify(samples));
      }
    } catch (e) {}
  };

  const requestPermissions = async () => {
    try {
      if (Platform.OS === 'android') {
        const perms = [
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ];
        if (PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES) {
          perms.push(PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES);
        }
        await PermissionsAndroid.requestMultiple(perms);
      } else {
        await Location.requestForegroundPermissionsAsync();
      }
    } catch (e) {}
  };

  // --- Hierarchy API Loaders ---
  const loadSites = async () => {
    if (!activeOrg?.id) return;
    try {
      const res = await api.getSites(activeOrg.id);
      if (res.success && Array.isArray(res.data)) {
        setSites(res.data);
        if (res.data.length > 0 && !selectedSite) {
          setSelectedSite(res.data[0]);
        }
      }
    } catch (e) {
      console.log('Error loading sites:', e);
    }
  };

  const loadFloors = async (siteId) => {
    try {
      const res = await api.getFloors(siteId);
      if (res.success && Array.isArray(res.data)) {
        setFloors(res.data);
        if (res.data.length > 0) {
          setSelectedFloor(res.data[0]);
        } else {
          setSelectedFloor(null);
          setRooms([]);
          setSelectedRoom(null);
        }
      }
    } catch (e) {
      console.log('Error loading floors:', e);
    }
  };

  const loadRooms = async (floorId) => {
    try {
      const res = await api.getRooms(floorId);
      if (res.success && Array.isArray(res.data)) {
        setRooms(res.data);
        if (res.data.length > 0) {
          setSelectedRoom(res.data[0]);
        } else {
          setSelectedRoom(null);
        }
      }
    } catch (e) {
      console.log('Error loading rooms:', e);
    }
  };

  const loadSiteRoomStats = async (siteId) => {
    if (!activeOrg?.id || !siteId) return;
    try {
      const res = await api.getSiteDetails(siteId);
      if (res.success && res.data?.floors) {
        const stats = [];
        res.data.floors.forEach((f) => {
          (f.rooms || []).forEach((r) => {
            stats.push({
              id: r.id,
              name: r.name,
              code: r.code,
              floorId: f.id,
              floorName: f.name,
              count: r._count?.recordings || 0,
            });
          });
        });
        setRoomStats(stats);
      }
    } catch (e) {
      console.log('Error loading room stats:', e);
    }
  };

  // --- Add Room Implementation ---
  const handleCreateRoom = async () => {
    if (!isAdmin) {
      Alert.alert('Permission Denied', 'Only organization administrators can create new rooms.');
      return;
    }
    if (!selectedFloor) {
      Alert.alert('Floor Required', 'Please select a building and floor before adding a room.');
      return;
    }
    if (!newRoomName.trim()) {
      Alert.alert('Name Required', 'Please enter a name for the new room.');
      return;
    }

    setAddingRoom(true);
    try {
      const res = await api.createRoom(
        selectedFloor.id,
        newRoomName.trim(),
        newRoomCode.trim(),
        ''
      );

      if (res.success && res.data) {
        setAddRoomModalVisible(false);
        setNewRoomName('');
        setNewRoomCode('');

        // Reload rooms and immediately select the new room
        const updatedRoomsRes = await api.getRooms(selectedFloor.id);
        if (updatedRoomsRes.success && Array.isArray(updatedRoomsRes.data)) {
          setRooms(updatedRoomsRes.data);
          const found = updatedRoomsRes.data.find((r) => r.id === res.data.id);
          setSelectedRoom(found || res.data);
        }

        // Refresh room counts
        if (selectedSite) loadSiteRoomStats(selectedSite.id);

        Alert.alert('Room Created', `Room "${res.data.name}" added to floor "${selectedFloor.name}".`);
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not create room.');
    } finally {
      setAddingRoom(false);
    }
  };

  // --- Wi-Fi Scanning Logic ---
  const queryWifi = async () => {
    const res = await scanWifiNetworks({ forceFresh: true });
    if (!res.success && res.locationServicesDisabled) {
      if (!autoCollectIntervalRef.current) {
        Alert.alert('Location Services Required', res.error);
      }
    }
    return res.networks || [];
  };

  const captureSingleSample = async () => {
    const currentRoom = selectedRoomRef.current || selectedRoom;
    const currentFloor = selectedFloorRef.current || selectedFloor;
    const currentSite = selectedSiteRef.current || selectedSite;
    const currentOrg = activeOrgRef.current || activeOrg;

    if (!currentRoom || !currentFloor || !currentSite) {
      if (!autoCollectIntervalRef.current) {
        Alert.alert('Selection Required', 'Please select a building, floor, and room before capturing Wi-Fi samples.');
      }
      return;
    }

    if (isScanningRef.current) return;
    isScanningRef.current = true;
    setIsScanning(true);

    try {
      const networks = await queryWifi();
      setWifiList(networks);

      const wifiMap = formatWifiDataMap(networks);

      if (Object.keys(wifiMap).length === 0) {
        if (!autoCollectIntervalRef.current) {
          Alert.alert('No Signals', 'No Wi-Fi signals detected. Make sure Wi-Fi and Location are turned on.');
        }
        return;
      }

      const sample = {
        sampleId: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        organizationId: currentOrg.id,
        siteId: currentSite.id,
        floorId: currentFloor.id,
        roomId: currentRoom.id,
        roomName: currentRoom.name,
        timestamp: new Date().toISOString(),
        wifiData: wifiMap,
      };

      const updated = [...pendingSamplesRef.current, sample];
      pendingSamplesRef.current = updated;
      setPendingSamples(updated);
      await saveOfflineBuffer(updated);
    } catch (e) {
      if (!autoCollectIntervalRef.current) {
        Alert.alert('Scan Failed', e.message || 'Unable to scan Wi-Fi.');
      }
    } finally {
      isScanningRef.current = false;
      setIsScanning(false);
    }
  };

  const startAutoCollect = () => {
    if (!selectedRoom) {
      Alert.alert('Room Required', 'Please select a room before starting auto-collect.');
      return;
    }

    setIsAutoCollecting(true);
    // Initial scan
    captureSingleSample();

    autoCollectIntervalRef.current = setInterval(() => {
      captureSingleSample();
    }, 2500);
  };

  const stopAutoCollect = () => {
    if (autoCollectIntervalRef.current) {
      clearInterval(autoCollectIntervalRef.current);
      autoCollectIntervalRef.current = null;
    }
    setIsAutoCollecting(false);
  };

  // --- Cloud Sync ---
  const syncToCloud = async () => {
    const toSync = [...pendingSamplesRef.current];
    if (toSync.length === 0 || isSyncing) return;
    setIsSyncing(true);

    try {
      // Group by room
      const byRoom = {};
      toSync.forEach((s) => {
        if (!byRoom[s.roomId]) byRoom[s.roomId] = [];
        byRoom[s.roomId].push(s.wifiData);
      });

      for (const roomId of Object.keys(byRoom)) {
        await api.uploadBatchFingerprints(roomId, byRoom[roomId]);
      }

      // Filter out ONLY the samples that were synced, preserving any captured during sync
      const syncedIdSet = new Set(toSync.map((s) => s.sampleId));
      const remaining = pendingSamplesRef.current.filter((s) => !syncedIdSet.has(s.sampleId));

      pendingSamplesRef.current = remaining;
      setPendingSamples(remaining);
      await saveOfflineBuffer(remaining);

      if (selectedSite) loadSiteRoomStats(selectedSite.id);

      Alert.alert(
        'Sync Complete',
        remaining.length > 0
          ? `Synced ${toSync.length} samples. ${remaining.length} new sample(s) collected during sync remain in buffer.`
          : 'All offline samples have been saved to the database.'
      );
    } catch (e) {
      Alert.alert('Sync Incomplete', e.message || 'Failed to sync some samples.');
    } finally {
      setIsSyncing(false);
    }
  };

  // --- CSV Import ---
  const handleSelectCsvFile = async () => {
    try {
      const fileData = await pickAndReadCsvFile();
      if (!fileData) return; // Cancelled

      setSelectedCsvFile(fileData);

      const parsed = parseCSVToSamples(fileData.content);
      const validation = validateCSVData(parsed);

      if (!validation.valid) {
        Alert.alert('CSV Validation Failed', validation.error);
        setCsvParsedPreview(null);
        return;
      }

      setCsvParsedPreview(validation);
    } catch (e) {
      Alert.alert(
        'File Selector Notice',
        (e.message || 'Failed to read CSV file.') +
        '\n\nYou can also paste CSV text directly below.',
        [
          { text: 'OK' },
          { text: 'Paste CSV', onPress: () => setShowPasteInput(true) },
        ]
      );
    }
  };

  const handleParsePastedText = () => {
    if (!csvRawText.trim()) {
      Alert.alert('Required', 'Please paste CSV content first.');
      return;
    }
    const parsed = parseCSVToSamples(csvRawText.trim());
    const validation = validateCSVData(parsed);
    if (!validation.valid) {
      Alert.alert('CSV Validation Failed', validation.error);
      setCsvParsedPreview(null);
      return;
    }
    setSelectedCsvFile({ name: 'pasted_dataset.csv', size: csvRawText.length });
    setCsvParsedPreview(validation);
  };

  const handleExecuteCsvImport = async () => {
    if (!csvParsedPreview || !selectedSite) {
      Alert.alert('Select Building', 'Please select a building before importing.');
      return;
    }

    setImportingCsv(true);
    try {
      const res = await api.importDataset(selectedSite.id, activeOrg.id, csvParsedPreview.samples);

      setCsvModalVisible(false);
      setSelectedCsvFile(null);
      setCsvParsedPreview(null);

      if (selectedSite) {
        await loadFloors(selectedSite.id);
        await loadSiteRoomStats(selectedSite.id);
      }

      Alert.alert(
        'Import Successful',
        res.message || `Successfully merged ${csvParsedPreview.totalSamples} records into "${selectedSite.name}".`
      );
    } catch (e) {
      Alert.alert('Import Failed', e.message || 'Failed to upload CSV records.');
    } finally {
      setImportingCsv(false);
    }
  };

  // --- CSV Export ---
  const handleExportCsv = async () => {
    if (!selectedSite) {
      Alert.alert('Select Building', 'Please select a building to export.');
      return;
    }

    try {
      const res = await api.getFingerprints({
        orgId: activeOrg.id,
        siteId: selectedSite.id,
        limit: 500,
      });

      if (!res.success || !res.data?.recordings || res.data.recordings.length === 0) {
        Alert.alert('No Data', 'No fingerprint records found for this building to export.');
        return;
      }

      const formatted = res.data.recordings.map((r) => ({
        id: r.id,
        location: r.room?.name || 'Unknown',
        roomName: r.room?.name || 'Unknown',
        floorName: r.floor?.name || (r.floor?.floorNumber != null ? `Floor ${r.floor.floorNumber}` : undefined),
        timestamp: r.timestamp,
        wifiData: r.wifiData || {},
      }));

      const csvString = generateCSV(formatted);
      const fileName = `IntraLocate_${selectedSite.name.replace(/[^a-zA-Z0-9]/g, '_')}_dataset.csv`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(filePath, csvString, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'text/csv',
          dialogTitle: 'Export Wi-Fi Fingerprint Dataset',
        });
      } else {
        Alert.alert('Saved', `CSV saved to ${filePath}`);
      }
    } catch (e) {
      Alert.alert('Export Error', e.message || 'Failed to generate or share CSV.');
    }
  };

  // --- Room-Level Record Deletion & Recollection ---
  const handleDeleteRoomData = (room) => {
    Alert.alert(
      'Delete Room Data',
      `Delete all ${room.count} collected records for room "${room.name}"? This will NOT delete other rooms or the entire dataset.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Records',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteRoomRecordings(room.id);
              if (selectedSite) loadSiteRoomStats(selectedSite.id);
              Alert.alert('Deleted', `All records for room "${room.name}" deleted.`);
            } catch (e) {
              Alert.alert('Error', e.message || 'Failed to delete room records.');
            }
          },
        },
      ]
    );
  };

  const handleRecollectRoomData = (room) => {
    Alert.alert(
      'Recollect Room Data',
      `Clear all existing data for room "${room.name}" and select it for immediate new collection?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear & Recollect',
          onPress: async () => {
            try {
              await api.deleteRoomRecordings(room.id);

              // Find and select this room and floor
              const targetFloor = floors.find((f) => f.id === room.floorId);
              if (targetFloor) setSelectedFloor(targetFloor);

              const roomObj = rooms.find((r) => r.id === room.id) || { id: room.id, name: room.name };
              setSelectedRoom(roomObj);

              if (selectedSite) loadSiteRoomStats(selectedSite.id);
              Alert.alert('Ready to Recollect', `Room "${room.name}" cleared. You can now capture new samples.`);
            } catch (e) {
              Alert.alert('Error', e.message || 'Failed to clear room data.');
            }
          },
        },
      ]
    );
  };

  // --- Inspect Room Records ---
  const handleOpenInspectRoom = async (room) => {
    setInspectRoom(room);
    setInspectModalVisible(true);
    setLoadingRecords(true);

    try {
      const res = await api.getFingerprints({
        orgId: activeOrg.id,
        roomId: room.id,
        limit: 100,
      });

      if (res.success && res.data?.recordings) {
        setInspectRecords(res.data.recordings);
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to fetch records.');
    } finally {
      setLoadingRecords(false);
    }
  };

  const handleDeleteSingleRecord = async (recordId) => {
    try {
      await api.deleteFingerprint(recordId);
      setInspectRecords((prev) => prev.filter((r) => r.id !== recordId));
      if (selectedSite) loadSiteRoomStats(selectedSite.id);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to delete record.');
    }
  };

  const topInset = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 44;
  const backScreen = activeOrg?.role === 'ADMIN' ? 'adminDashboard' : 'contributorDashboard';

  // Clear offline buffer without syncing
  const handleClearOfflineBuffer = () => {
    const count = pendingSamplesRef.current.length;
    if (count === 0) return;
    Alert.alert(
      'Clear Offline Samples',
      `Delete all ${count} unsynced sample(s) from the offline buffer? They will NOT be uploaded to the cloud.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Samples',
          style: 'destructive',
          onPress: async () => {
            pendingSamplesRef.current = [];
            setPendingSamples([]);
            await saveOfflineBuffer([]);
            Alert.alert('Cleared', 'All offline samples have been removed.');
          },
        },
      ]
    );
  };

  const s = makeStyles(theme);

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle={theme.statusBar} backgroundColor={theme.statusBarBg} />
      <ScrollView contentContainerStyle={[s.scroll, { paddingTop: topInset }]}>
        {/* Top Navbar */}
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => onNavigate(backScreen)} style={s.backBtn}>
            <Text style={s.backBtnText}>{'<'} Dashboard</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Data Collection</Text>
          <TouchableOpacity onPress={handleExportCsv} style={s.exportBtn}>
            <Text style={s.exportBtnText}>Export CSV</Text>
          </TouchableOpacity>
        </View>

        {/* SECTION 1: SPACE SELECTION */}
        <View style={s.card}>
          <Text style={s.sectionHeading}>Target Location</Text>

          {/* Building Selector */}
          <View style={s.pickerRow}>
            <Text style={s.pickerLabel}>Building:</Text>
            <TouchableOpacity
              style={s.pickerDropdown}
              onPress={() => setSitePickerVisible(true)}
            >
              <Text style={s.pickerValueText}>
                {selectedSite ? selectedSite.name : 'Select Building'}
              </Text>
              <Text style={s.pickerArrow}>▼</Text>
            </TouchableOpacity>
          </View>

          {/* Floor Selector */}
          <View style={s.pickerRow}>
            <Text style={s.pickerLabel}>Floor:</Text>
            <TouchableOpacity
              style={s.pickerDropdown}
              onPress={() => setFloorPickerVisible(true)}
              disabled={floors.length === 0}
            >
              <Text style={s.pickerValueText}>
                {selectedFloor ? selectedFloor.name : (floors.length === 0 ? 'No Floors Added' : 'Select Floor')}
              </Text>
              <Text style={s.pickerArrow}>▼</Text>
            </TouchableOpacity>
          </View>

          {/* Room Selector + Add Room (admin only) */}
          <View style={s.pickerRow}>
            <Text style={s.pickerLabel}>Room:</Text>
            <TouchableOpacity
              style={[s.pickerDropdown, { flex: 1 }]}
              onPress={() => setRoomPickerVisible(true)}
              disabled={rooms.length === 0}
            >
              <Text style={s.pickerValueText}>
                {selectedRoom ? selectedRoom.name : (rooms.length === 0 ? 'No Rooms Added' : 'Select Room')}
              </Text>
              <Text style={s.pickerArrow}>▼</Text>
            </TouchableOpacity>

            {isAdmin && (
              <TouchableOpacity
                style={s.addRoomBtn}
                onPress={() => setAddRoomModalVisible(true)}
                disabled={!selectedFloor}
              >
                <Text style={s.addRoomBtnText}>+ Add Room</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* SECTION 2: SIGNAL CAPTURE CONTROLS */}
        <View style={s.card}>
          <Text style={s.sectionHeading}>Record Wi-Fi Signals</Text>
          <Text style={s.cardDesc}>
            Target: {selectedRoom ? selectedRoom.name : 'None selected'} ({selectedFloor ? selectedFloor.name : '-'})
          </Text>

          <View style={s.telemetryRow}>
            <Text style={s.telemetryLabel}>Networks in range: {wifiList.length}</Text>
            {isScanning && <ActivityIndicator color={theme.spinner} size="small" />}
          </View>

          <View style={s.buttonGrid}>
            <TouchableOpacity
              style={s.actionBtnSolid}
              onPress={captureSingleSample}
              disabled={isScanning || isAutoCollecting}
            >
              <Text style={s.actionBtnSolidText}>Capture Single Sample</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={isAutoCollecting ? s.actionBtnDanger : s.actionBtnOutline}
              onPress={isAutoCollecting ? stopAutoCollect : startAutoCollect}
            >
              <Text style={isAutoCollecting ? s.actionBtnDangerText : s.actionBtnOutlineText}>
                {isAutoCollecting ? 'Stop Auto-Collect' : 'Start Auto-Collect'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Offline Buffer: Sync + Clear */}
          {pendingSamples.length > 0 && (
            <View style={s.bufferBox}>
              <View style={{ flex: 1 }}>
                <Text style={s.bufferTitle}>Offline Buffer: {pendingSamples.length} sample(s)</Text>
                <Text style={s.bufferSubtitle}>Buffered locally. Sync when collection is finished.</Text>
              </View>
              <View style={s.bufferBtns}>
                <TouchableOpacity
                  style={s.syncBtn}
                  onPress={syncToCloud}
                  disabled={isSyncing}
                >
                  {isSyncing ? (
                    <ActivityIndicator color={theme.textBtnPrimary} size="small" />
                  ) : (
                    <Text style={s.syncBtnText}>Sync</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.clearBtn}
                  onPress={handleClearOfflineBuffer}
                  disabled={isSyncing}
                >
                  <Text style={s.clearBtnText}>Clear</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={s.csvImportBtn}
            onPress={() => setCsvModalVisible(true)}
          >
            <Text style={s.csvImportBtnText}>+ Import CSV Dataset</Text>
          </TouchableOpacity>
        </View>

        {/* SECTION 3: ROOM DATA MANAGEMENT */}
        <View style={s.card}>
          <View style={s.sectionHeaderRow}>
            <Text style={s.sectionHeading}>Collected Data by Room</Text>
            <TouchableOpacity onPress={() => selectedSite && loadSiteRoomStats(selectedSite.id)}>
              <Text style={s.linkText}>Refresh</Text>
            </TouchableOpacity>
          </View>

          {roomStats.length === 0 ? (
            <Text style={s.mutedText}>No room data recorded for this building.</Text>
          ) : (
            roomStats.map((room) => (
              <View key={room.id} style={s.roomDataCard}>
                <View style={{ flex: 1 }}>
                  <Text style={s.roomDataTitle}>{room.name}</Text>
                  <Text style={s.roomDataMeta}>
                    {room.floorName} • {room.count} record(s)
                  </Text>
                </View>

                <View style={s.roomActionsRow}>
                  {room.count > 0 && (
                    <TouchableOpacity
                      style={s.roomActionBtn}
                      onPress={() => handleOpenInspectRoom(room)}
                    >
                      <Text style={s.roomActionBtnText}>Inspect</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={s.roomActionBtn}
                    onPress={() => handleRecollectRoomData(room)}
                  >
                    <Text style={s.roomActionBtnText}>Recollect</Text>
                  </TouchableOpacity>

                  {room.count > 0 && (
                    <TouchableOpacity
                      style={s.roomActionBtn}
                      onPress={() => handleDeleteRoomData(room)}
                    >
                      <Text style={s.roomActionBtnText}>Delete Data</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}
        </View>

        {/* MODAL: Building Picker */}
        <Modal visible={sitePickerVisible} transparent animationType="fade" onRequestClose={() => setSitePickerVisible(false)}>
          <View style={s.modalOverlay}>
            <View style={s.pickerModalBox}>
              <Text style={s.modalTitle}>Select Building</Text>
              <ScrollView style={{ maxHeight: 250 }}>
                {sites.map((siteItem) => (
                  <TouchableOpacity
                    key={siteItem.id}
                    style={s.pickerItem}
                    onPress={() => {
                      setSelectedSite(siteItem);
                      setSitePickerVisible(false);
                    }}
                  >
                    <Text style={s.pickerItemText}>{siteItem.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setSitePickerVisible(false)}>
                <Text style={s.modalCancelText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* MODAL: Floor Picker */}
        <Modal visible={floorPickerVisible} transparent animationType="fade" onRequestClose={() => setFloorPickerVisible(false)}>
          <View style={s.modalOverlay}>
            <View style={s.pickerModalBox}>
              <Text style={s.modalTitle}>Select Floor</Text>
              <ScrollView style={{ maxHeight: 250 }}>
                {floors.map((floorItem) => (
                  <TouchableOpacity
                    key={floorItem.id}
                    style={s.pickerItem}
                    onPress={() => {
                      setSelectedFloor(floorItem);
                      setFloorPickerVisible(false);
                    }}
                  >
                    <Text style={s.pickerItemText}>{floorItem.name} (Level {floorItem.floorNumber})</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setFloorPickerVisible(false)}>
                <Text style={s.modalCancelText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* MODAL: Room Picker */}
        <Modal visible={roomPickerVisible} transparent animationType="fade" onRequestClose={() => setRoomPickerVisible(false)}>
          <View style={s.modalOverlay}>
            <View style={s.pickerModalBox}>
              <Text style={s.modalTitle}>Select Room</Text>
              <ScrollView style={{ maxHeight: 250 }}>
                {rooms.map((roomItem) => (
                  <TouchableOpacity
                    key={roomItem.id}
                    style={s.pickerItem}
                    onPress={() => {
                      setSelectedRoom(roomItem);
                      setRoomPickerVisible(false);
                    }}
                  >
                    <Text style={s.pickerItemText}>{roomItem.name} {roomItem.code ? `(${roomItem.code})` : ''}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setRoomPickerVisible(false)}>
                <Text style={s.modalCancelText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* MODAL: Add Room */}
        <Modal visible={addRoomModalVisible} transparent animationType="fade" onRequestClose={() => setAddRoomModalVisible(false)}>
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <Text style={s.modalTitle}>Add Room to {selectedFloor?.name}</Text>
              <View style={s.inputGroup}>
                <Text style={s.label}>Room Name</Text>
                <TextInput
                  style={s.input}
                  value={newRoomName}
                  onChangeText={setNewRoomName}
                  placeholder="e.g. Room 204"
                  placeholderTextColor={theme.textPlaceholder}
                />
              </View>
              <View style={s.inputGroup}>
                <Text style={s.label}>Room Code (optional)</Text>
                <TextInput
                  style={s.input}
                  value={newRoomCode}
                  onChangeText={setNewRoomCode}
                  placeholder="e.g. R-204"
                  placeholderTextColor={theme.textPlaceholder}
                />
              </View>
              <View style={s.modalButtons}>
                <TouchableOpacity style={s.modalCancelBtn} onPress={() => setAddRoomModalVisible(false)}>
                  <Text style={s.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.modalSaveBtn} onPress={handleCreateRoom} disabled={addingRoom}>
                  {addingRoom ? (
                    <ActivityIndicator color={theme.textBtnPrimary} size="small" />
                  ) : (
                    <Text style={s.modalSaveText}>Create Room</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* MODAL: CSV Import */}
        <Modal visible={csvModalVisible} transparent animationType="fade" onRequestClose={() => setCsvModalVisible(false)}>
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <Text style={s.modalTitle}>Import CSV Dataset</Text>
              <Text style={s.modalSub}>
                Upload a CSV file containing Wi-Fi fingerprint signals with floor and room labels to merge into {selectedSite?.name || 'this building'}.
              </Text>

              {/* File Upload Selector */}
              <TouchableOpacity
                style={s.fileUploadBtn}
                onPress={handleSelectCsvFile}
                disabled={importingCsv}
              >
                <Text style={s.fileUploadIcon}>📁</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.fileUploadTitle}>
                    {selectedCsvFile ? selectedCsvFile.name : 'Select CSV File'}
                  </Text>
                  <Text style={s.fileUploadSub}>
                    {selectedCsvFile
                      ? `${(selectedCsvFile.size / 1024).toFixed(1)} KB • Tap to choose a different file`
                      : 'Tap to browse and select a .csv file'}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Optional Paste Text Fallback */}
              <TouchableOpacity
                style={{ marginTop: 8, marginBottom: 10, alignSelf: 'flex-start' }}
                onPress={() => setShowPasteInput(!showPasteInput)}
              >
                <Text style={{ color: theme.textLink, fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' }}>
                  {showPasteInput ? '▲ Hide manual text input' : '▼ Or paste CSV text directly'}
                </Text>
              </TouchableOpacity>

              {showPasteInput && (
                <View style={{ marginBottom: 12 }}>
                  <TextInput
                    style={{
                      borderWidth: 1,
                      borderColor: theme.border,
                      borderRadius: 4,
                      padding: 8,
                      fontSize: 11,
                      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                      height: 90,
                      textAlignVertical: 'top',
                      backgroundColor: theme.bgInput,
                      color: theme.text,
                    }}
                    multiline
                    placeholder="Location,Floor,Timestamp,AP_1,AP_2..."
                    placeholderTextColor={theme.textPlaceholder}
                    value={csvRawText}
                    onChangeText={setCsvRawText}
                  />
                  <TouchableOpacity
                    style={{
                      backgroundColor: theme.bgBtnPrimary,
                      borderRadius: 4,
                      paddingVertical: 6,
                      alignItems: 'center',
                      marginTop: 6,
                    }}
                    onPress={handleParsePastedText}
                  >
                    <Text style={{ color: theme.textBtnPrimary, fontSize: 11, fontWeight: '600' }}>
                      Parse & Validate Text
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Parsed & Validated Preview */}
              {csvParsedPreview && (
                <View style={s.previewBox}>
                  <Text style={s.previewTitle}>
                    ✓ Validated: {csvParsedPreview.totalSamples} samples across {csvParsedPreview.uniqueRoomsCount} room(s) & {csvParsedPreview.uniqueFloorsCount} floor(s)
                  </Text>
                  <Text style={s.previewText}>
                    • Access Points detected: {csvParsedPreview.uniqueApsCount} APs
                  </Text>
                  <Text style={s.previewText}>
                    • Average APs / sample: {csvParsedPreview.avgApsPerSample}
                  </Text>
                  <Text style={[s.previewText, { marginTop: 4, fontWeight: '700' }]}>
                    Floors: {Object.keys(csvParsedPreview.floors).join(', ')}
                  </Text>
                  <Text style={[s.previewText, { marginTop: 2, fontWeight: '700' }]}>
                    Rooms: {Object.entries(csvParsedPreview.rooms).map(([rm, cnt]) => `${rm} (${cnt})`).slice(0, 5).join(', ')}
                    {Object.keys(csvParsedPreview.rooms).length > 5 ? ' ...' : ''}
                  </Text>
                </View>
              )}

              <View style={s.modalButtons}>
                <TouchableOpacity
                  style={s.modalCancelBtn}
                  onPress={() => {
                    setCsvModalVisible(false);
                    setSelectedCsvFile(null);
                    setCsvParsedPreview(null);
                  }}
                >
                  <Text style={s.modalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.modalSaveBtn, (!csvParsedPreview || importingCsv) && { opacity: 0.5 }]}
                  onPress={handleExecuteCsvImport}
                  disabled={importingCsv || !csvParsedPreview}
                >
                  {importingCsv ? (
                    <ActivityIndicator color={theme.textBtnPrimary} size="small" />
                  ) : (
                    <Text style={s.modalSaveText}>Import & Merge</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* MODAL: Inspect Room Records */}
        <Modal visible={inspectModalVisible} transparent animationType="fade" onRequestClose={() => setInspectModalVisible(false)}>
          <View style={s.modalOverlay}>
            <View style={[s.modalBox, { maxHeight: '80%' }]}>
              <Text style={s.modalTitle}>Records: {inspectRoom?.name}</Text>
              <Text style={s.modalSub}>{inspectRecords.length} sample(s) recorded</Text>

              {loadingRecords ? (
                <ActivityIndicator color={theme.spinner} size="small" style={{ marginVertical: 20 }} />
              ) : (
                <ScrollView style={{ maxHeight: 350 }}>
                  {inspectRecords.map((rec, i) => (
                    <View key={rec.id} style={s.recordRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.recordTimestamp}>#{i + 1} - {new Date(rec.timestamp).toLocaleString()}</Text>
                        <Text style={s.recordAps}>{rec.apsCount} APs recorded</Text>
                      </View>
                      <TouchableOpacity
                        style={s.deleteRecordBtn}
                        onPress={() => handleDeleteSingleRecord(rec.id)}
                      >
                        <Text style={s.deleteRecordText}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}

              <TouchableOpacity
                style={[s.modalCancelBtn, { alignSelf: 'flex-end', marginTop: 10 }]}
                onPress={() => setInspectModalVisible(false)}
              >
                <Text style={s.modalCancelText}>Close</Text>
              </TouchableOpacity>
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
    backBtn: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingVertical: 6,
      paddingHorizontal: 10,
      backgroundColor: theme.bgBtnSecondary,
    },
    backBtnText: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '600',
    },
    headerTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '800',
    },
    exportBtn: {
      backgroundColor: theme.bgBtnPrimary,
      borderRadius: 4,
      paddingVertical: 6,
      paddingHorizontal: 10,
    },
    exportBtnText: {
      color: theme.textBtnPrimary,
      fontSize: 12,
      fontWeight: '600',
    },
    card: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      padding: 14,
      backgroundColor: theme.bgCard,
      marginBottom: 14,
    },
    sectionHeading: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '700',
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    cardDesc: {
      color: theme.textMuted,
      fontSize: 13,
      marginBottom: 10,
    },
    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
      gap: 8,
    },
    pickerLabel: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '600',
      width: 65,
    },
    pickerDropdown: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingHorizontal: 10,
      paddingVertical: 8,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: theme.bgInput,
    },
    pickerValueText: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '500',
    },
    pickerArrow: {
      fontSize: 10,
      color: theme.text,
    },
    addRoomBtn: {
      backgroundColor: theme.bgBtnPrimary,
      borderRadius: 4,
      paddingVertical: 8,
      paddingHorizontal: 10,
    },
    addRoomBtnText: {
      color: theme.textBtnPrimary,
      fontSize: 12,
      fontWeight: '600',
    },
    telemetryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    telemetryLabel: {
      color: theme.textMuted,
      fontSize: 12,
    },
    buttonGrid: {
      gap: 8,
      marginBottom: 12,
    },
    actionBtnSolid: {
      backgroundColor: theme.bgBtnPrimary,
      borderRadius: 4,
      paddingVertical: 12,
      alignItems: 'center',
    },
    actionBtnSolidText: {
      color: theme.textBtnPrimary,
      fontSize: 13,
      fontWeight: '700',
    },
    actionBtnOutline: {
      backgroundColor: theme.bgCard,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingVertical: 12,
      alignItems: 'center',
    },
    actionBtnOutlineText: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '700',
    },
    actionBtnDanger: {
      backgroundColor: '#dc2626',
      borderRadius: 4,
      paddingVertical: 12,
      alignItems: 'center',
    },
    actionBtnDangerText: {
      color: '#ffffff',
      fontSize: 13,
      fontWeight: '700',
    },
    bufferBox: {
      borderWidth: 1,
      borderColor: theme.borderMuted,
      borderRadius: 4,
      padding: 10,
      backgroundColor: theme.bgBuffer,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    bufferTitle: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '700',
    },
    bufferSubtitle: {
      color: theme.textMuted,
      fontSize: 11,
      marginTop: 2,
    },
    bufferBtns: {
      flexDirection: 'row',
      gap: 6,
      alignItems: 'center',
    },
    syncBtn: {
      backgroundColor: theme.bgBtnPrimary,
      borderRadius: 4,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    syncBtnText: {
      color: theme.textBtnPrimary,
      fontSize: 12,
      fontWeight: '600',
    },
    clearBtn: {
      borderWidth: 1,
      borderColor: theme.borderMuted,
      borderRadius: 4,
      paddingVertical: 8,
      paddingHorizontal: 12,
      backgroundColor: theme.bgBtnSecondary,
    },
    clearBtnText: {
      color: theme.textSub,
      fontSize: 12,
      fontWeight: '600',
    },
    csvImportBtn: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingVertical: 10,
      alignItems: 'center',
      backgroundColor: theme.bgBtnSecondary,
    },
    csvImportBtnText: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '600',
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    linkText: {
      color: theme.textLink,
      fontSize: 12,
      fontWeight: '600',
      textDecorationLine: 'underline',
    },
    mutedText: {
      color: theme.textFaint,
      fontSize: 12,
      fontStyle: 'italic',
    },
    roomDataCard: {
      borderWidth: 1,
      borderColor: theme.borderLight,
      borderRadius: 4,
      padding: 10,
      marginBottom: 8,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: theme.bgCard,
    },
    roomDataTitle: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '700',
    },
    roomDataMeta: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    roomActionsRow: {
      flexDirection: 'row',
      gap: 6,
    },
    roomActionBtn: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingVertical: 4,
      paddingHorizontal: 8,
      backgroundColor: theme.bgBtnSecondary,
    },
    roomActionBtnText: {
      color: theme.text,
      fontSize: 11,
      fontWeight: '600',
    },
    // Modals
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.65)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    pickerModalBox: {
      width: '100%',
      backgroundColor: theme.bgModal,
      borderRadius: 4,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
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
      marginBottom: 4,
    },
    modalSub: {
      color: theme.textMuted,
      fontSize: 12,
      marginBottom: 4,
    },
    pickerItem: {
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderFaint,
    },
    pickerItemText: {
      color: theme.text,
      fontSize: 14,
    },
    inputGroup: {
      gap: 4,
    },
    label: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '600',
    },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 13,
      color: theme.text,
      backgroundColor: theme.bgInput,
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
      paddingHorizontal: 14,
      backgroundColor: theme.bgBtnSecondary,
    },
    modalCancelText: {
      color: theme.text,
      fontSize: 13,
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
      fontSize: 13,
      fontWeight: '600',
    },
    parseBtn: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingVertical: 8,
      alignItems: 'center',
      backgroundColor: theme.bgBtnSecondary,
    },
    parseBtnText: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '600',
    },
    fileUploadBtn: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: theme.bgInput,
      marginVertical: 10,
    },
    fileUploadIcon: {
      fontSize: 26,
    },
    fileUploadTitle: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '700',
    },
    fileUploadSub: {
      color: theme.textMuted,
      fontSize: 11,
      marginTop: 2,
    },
    previewBox: {
      borderWidth: 1,
      borderColor: theme.borderMuted,
      borderRadius: 4,
      padding: 10,
      backgroundColor: theme.bgPreview,
    },
    previewTitle: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '700',
      marginBottom: 4,
    },
    previewText: {
      color: theme.textSub,
      fontSize: 12,
    },
    recordRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderFaint,
    },
    recordTimestamp: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '600',
    },
    recordAps: {
      color: theme.textMuted,
      fontSize: 11,
    },
    deleteRecordBtn: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingVertical: 4,
      paddingHorizontal: 8,
      backgroundColor: theme.bgBtnSecondary,
    },
    deleteRecordText: {
      color: theme.text,
      fontSize: 11,
      fontWeight: '600',
    },
  });
}
