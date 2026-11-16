import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  TextInput,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { generateCSV, parseCSVToSamples, pickAndReadCsvFile, validateCSVData } from '../utils/csvHelper';

export default function DatasetReviewScreen({ onNavigate }) {
  const { activeOrg } = useAuth();
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState([]);
  const [selectedSiteId, setSelectedSiteId] = useState(null);
  const [stats, setStats] = useState(null);
  const [recordings, setRecordings] = useState([]);
  const [rooms, setRooms] = useState([]);

  // Edit / Inspect Modal
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [editRoomId, setEditRoomId] = useState('');

  // CSV Import Modal
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [selectedCsvFile, setSelectedCsvFile] = useState(null);
  const [csvParsedPreview, setCsvParsedPreview] = useState(null);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    loadSites();
  }, [activeOrg]);

  useEffect(() => {
    if (selectedSiteId) {
      loadStatsAndRecordings(selectedSiteId);
    }
  }, [selectedSiteId]);

  const loadSites = async () => {
    if (!activeOrg?.id) return;
    try {
      const res = await api.getSites(activeOrg.id);
      if (res.success && Array.isArray(res.data)) {
        setSites(res.data);
        if (res.data.length > 0 && !selectedSiteId) {
          setSelectedSiteId(res.data[0].id);
        }
      }
    } catch (e) {
      console.log('Error loading sites:', e);
    }
  };

  const loadStatsAndRecordings = async (siteId) => {
    setLoading(true);
    try {
      const [statsRes, recRes, siteDetailRes] = await Promise.all([
        api.getFingerprintStats(activeOrg.id, siteId),
        api.getFingerprints({ orgId: activeOrg.id, siteId, limit: 100 }),
        api.getSiteDetails(siteId),
      ]);

      if (statsRes.success) setStats(statsRes.data);
      if (recRes.success && recRes.data?.recordings) setRecordings(recRes.data.recordings);

      if (siteDetailRes.success && siteDetailRes.data?.floors) {
        const rList = [];
        siteDetailRes.data.floors.forEach((f) => {
          (f.rooms || []).forEach((r) => {
            rList.push({ ...r, floorName: f.name });
          });
        });
        setRooms(rList);
      }
    } catch (e) {
      console.log('Error loading stats/recordings:', e);
    } finally {
      setLoading(false);
    }
  };

  // Delete individual room's records
  const handleDeleteRoomRecords = (roomId, roomName) => {
    Alert.alert(
      'Delete Room Data',
      `Delete all records for "${roomName}"? Other rooms in this dataset will not be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteRoomRecordings(roomId);
              loadStatsAndRecordings(selectedSiteId);
              Alert.alert('Deleted', `Records for "${roomName}" deleted.`);
            } catch (e) {
              Alert.alert('Error', e.message || 'Failed to delete records.');
            }
          },
        },
      ]
    );
  };

  // Delete single record
  const handleDeleteSingleRecord = async (id) => {
    try {
      await api.deleteFingerprint(id);
      setRecordings((prev) => prev.filter((r) => r.id !== id));
      if (selectedSiteId) loadStatsAndRecordings(selectedSiteId);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to delete sample.');
    }
  };

  // Update record's room assignment
  const handleSaveEditRecord = async () => {
    if (!editingRecord || !editRoomId) return;
    try {
      await api.updateFingerprint(editingRecord.id, { roomId: editRoomId });
      setEditingRecord(null);
      if (selectedSiteId) loadStatsAndRecordings(selectedSiteId);
      Alert.alert('Updated', 'Sample room assignment updated.');
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to update record.');
    }
  };

  // Export full CSV
  const handleExportCSV = async () => {
    if (!selectedSiteId) return;
    try {
      const allRes = await api.getFingerprints({ orgId: activeOrg.id, siteId: selectedSiteId, limit: 1000 });
      if (!allRes.success || !allRes.data?.recordings || allRes.data.recordings.length === 0) {
        Alert.alert('No Data', 'No fingerprint data to export.');
        return;
      }

      const formatted = allRes.data.recordings.map((r) => ({
        id: r.id,
        location: r.room?.name || 'Unknown',
        roomName: r.room?.name || 'Unknown',
        floorName: r.floor?.name || (r.floor?.floorNumber != null ? `Floor ${r.floor.floorNumber}` : undefined),
        timestamp: r.timestamp,
        wifiData: r.wifiData || {},
      }));

      const csvString = generateCSV(formatted);
      const selSite = sites.find((site) => site.id === selectedSiteId);
      const fileName = `Dataset_${selSite ? selSite.name.replace(/[^a-zA-Z0-9]/g, '_') : 'Site'}.csv`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(filePath, csvString, { encoding: FileSystem.EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, { mimeType: 'text/csv', dialogTitle: 'Export Dataset CSV' });
      } else {
        Alert.alert('Saved', `CSV file saved to ${filePath}`);
      }
    } catch (e) {
      Alert.alert('Export Error', e.message || 'Failed to export CSV.');
    }
  };

  // File Selection and CSV Import
  const handleSelectCsvFile = async () => {
    try {
      const fileData = await pickAndReadCsvFile();
      if (!fileData) return;

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
      Alert.alert('File Error', e.message || 'Failed to read CSV file.');
    }
  };

  const handleImportCSV = async () => {
    if (!csvParsedPreview || !selectedSiteId) {
      Alert.alert('Selection Required', 'Please select a building and choose a valid CSV file.');
      return;
    }

    setIsImporting(true);
    try {
      const res = await api.importDataset(selectedSiteId, activeOrg.id, csvParsedPreview.samples);

      setImportModalVisible(false);
      setSelectedCsvFile(null);
      setCsvParsedPreview(null);

      if (selectedSiteId) loadStatsAndRecordings(selectedSiteId);

      Alert.alert(
        'Import Successful',
        res.message || `Successfully imported and merged ${csvParsedPreview.totalSamples} records.`
      );
    } catch (e) {
      Alert.alert('Import Error', e.message || 'Failed to import CSV.');
    } finally {
      setIsImporting(false);
    }
  };

  const topInset = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 44;
  const backScreen = activeOrg?.role === 'ADMIN' ? 'adminDashboard' : 'contributorDashboard';

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle={theme.statusBar} backgroundColor={theme.statusBarBg} />
      <ScrollView contentContainerStyle={[s.scroll, { paddingTop: topInset }]}>
        {/* Top Navbar */}
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => onNavigate(backScreen)} style={s.backBtn}>
            <Text style={s.backBtnText}>&lt; Dashboard</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Dataset Management</Text>
          <TouchableOpacity onPress={handleExportCSV} style={s.exportBtn}>
            <Text style={s.exportBtnText}>Export CSV</Text>
          </TouchableOpacity>
        </View>

        {/* Building Selector */}
        <View style={s.sitePickerCard}>
          <Text style={s.label}>Building:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.sitePillRow}>
            {sites.map((siteItem) => (
              <TouchableOpacity
                key={siteItem.id}
                style={[s.sitePill, selectedSiteId === siteItem.id && s.sitePillActive]}
                onPress={() => setSelectedSiteId(siteItem.id)}
              >
                <Text style={[s.sitePillText, selectedSiteId === siteItem.id && s.sitePillTextActive]}>
                  {siteItem.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {loading ? (
          <ActivityIndicator color={theme.spinner} size="small" style={{ marginVertical: 30 }} />
        ) : (
          <>
            {/* Overview Metrics */}
            <View style={s.statsCard}>
              <View style={s.statBox}>
                <Text style={s.statNumber}>{stats?.totalSamples || 0}</Text>
                <Text style={s.statLabel}>Total Samples</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statNumber}>{stats?.uniqueApsCount || 0}</Text>
                <Text style={s.statLabel}>Unique APs</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statNumber}>{stats?.avgApsPerSample || 0}</Text>
                <Text style={s.statLabel}>Avg APs/Sample</Text>
              </View>
            </View>

            {/* Room Distribution & Deletion */}
            <View style={s.card}>
              <View style={s.cardHeaderRow}>
                <Text style={s.cardTitle}>Data Grouped by Room</Text>
                <TouchableOpacity
                  style={s.smallOutlineBtn}
                  onPress={() => setImportModalVisible(true)}
                >
                  <Text style={s.smallBtnText}>+ Import CSV</Text>
                </TouchableOpacity>
              </View>

              {(!stats?.roomDistribution || stats.roomDistribution.length === 0) ? (
                <Text style={s.mutedText}>No samples collected for this building yet.</Text>
              ) : (
                stats.roomDistribution.map((item) => (
                  <View key={item.name} style={s.roomRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.roomName}>{item.name}</Text>
                      <Text style={s.roomCountText}>
                        {item.count} samples ({item.percentage}%)
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={s.deleteBtn}
                      onPress={() => handleDeleteRoomRecords(item.roomId, item.name)}
                    >
                      <Text style={s.deleteBtnText}>Delete Room Data</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>

            {/* Recent Samples Inspection */}
            <View style={s.card}>
              <Text style={s.cardTitle}>Recent Recorded Samples</Text>
              <Text style={s.mutedText}>Tap a sample to view AP details or edit room assignment.</Text>

              {recordings.length === 0 ? (
                <Text style={[s.mutedText, { marginTop: 8 }]}>No recent samples.</Text>
              ) : (
                recordings.map((rec) => (
                  <TouchableOpacity
                    key={rec.id}
                    style={s.sampleRow}
                    onPress={() => setSelectedRecord(rec)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.sampleRoom}>{rec.room?.name || 'Unknown Room'}</Text>
                      <Text style={s.sampleMeta}>
                        {rec.apsCount} APs • {new Date(rec.timestamp).toLocaleTimeString()}
                      </Text>
                    </View>
                    <View style={s.btnRow}>
                      <TouchableOpacity
                        style={s.smallOutlineBtn}
                        onPress={() => {
                          setEditingRecord(rec);
                          setEditRoomId(rec.roomId);
                        }}
                      >
                        <Text style={s.smallBtnText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={s.smallOutlineBtn}
                        onPress={() => handleDeleteSingleRecord(rec.id)}
                      >
                        <Text style={s.smallBtnText}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </>
        )}

        {/* MODAL: Signal Details */}
        <Modal visible={!!selectedRecord} transparent animationType="fade" onRequestClose={() => setSelectedRecord(null)}>
          <View style={s.modalOverlay}>
            <View style={[s.modalBox, { maxHeight: '80%' }]}>
              <Text style={s.modalTitle}>Sample Signal Details</Text>
              <Text style={s.modalSub}>
                Room: {selectedRecord?.room?.name} • Recorded: {selectedRecord?.timestamp ? new Date(selectedRecord.timestamp).toLocaleString() : ''}
              </Text>
              <ScrollView style={{ maxHeight: 300, marginVertical: 8 }}>
                {selectedRecord?.wifiData &&
                  Object.entries(selectedRecord.wifiData).map(([ap, rssi]) => (
                    <View key={ap} style={s.apRow}>
                      <Text style={s.apName} numberOfLines={1}>{ap}</Text>
                      <Text style={s.apRssi}>{rssi} dBm</Text>
                    </View>
                  ))}
              </ScrollView>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setSelectedRecord(null)}>
                <Text style={s.modalCancelText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* MODAL: Edit Record Room Assignment */}
        <Modal visible={!!editingRecord} transparent animationType="fade" onRequestClose={() => setEditingRecord(null)}>
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <Text style={s.modalTitle}>Reassign Sample Room</Text>
              <Text style={s.modalSub}>Move this sample to a different room.</Text>
              <ScrollView style={{ maxHeight: 200, marginVertical: 8 }}>
                {rooms.map((roomItem) => (
                  <TouchableOpacity
                    key={roomItem.id}
                    style={[s.pickerItem, editRoomId === roomItem.id && s.pickerItemActive]}
                    onPress={() => setEditRoomId(roomItem.id)}
                  >
                    <Text style={s.pickerItemText}>{roomItem.name} ({roomItem.floorName})</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={s.modalButtons}>
                <TouchableOpacity style={s.modalCancelBtn} onPress={() => setEditingRecord(null)}>
                  <Text style={s.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.modalSaveBtn} onPress={handleSaveEditRecord}>
                  <Text style={s.modalSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* MODAL: Import CSV */}
        <Modal visible={importModalVisible} transparent animationType="fade" onRequestClose={() => setImportModalVisible(false)}>
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <Text style={s.modalTitle}>Import CSV Dataset</Text>
              <Text style={s.modalSub}>
                Upload a CSV file containing Wi-Fi signals with floor and room labels to merge into this building dataset.
              </Text>

              {/* File Upload Selector */}
              <TouchableOpacity
                style={s.fileUploadBtn}
                onPress={handleSelectCsvFile}
                disabled={isImporting}
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
                    setImportModalVisible(false);
                    setSelectedCsvFile(null);
                    setCsvParsedPreview(null);
                  }}
                >
                  <Text style={s.modalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.modalSaveBtn, (!csvParsedPreview || isImporting) && { opacity: 0.5 }]}
                  onPress={handleImportCSV}
                  disabled={isImporting || !csvParsedPreview}
                >
                  {isImporting ? (
                    <ActivityIndicator color={theme.textBtnPrimary} size="small" />
                  ) : (
                    <Text style={s.modalSaveText}>Import & Merge</Text>
                  )}
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
    sitePickerCard: {
      marginBottom: 14,
    },
    label: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '600',
      marginBottom: 6,
    },
    sitePillRow: {
      gap: 8,
    },
    sitePill: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: theme.bgPill,
    },
    sitePillActive: {
      backgroundColor: theme.bgPillActive,
    },
    sitePillText: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '600',
    },
    sitePillTextActive: {
      color: theme.textPillActive,
    },
    statsCard: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      padding: 12,
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginBottom: 14,
      backgroundColor: theme.bgBuffer,
    },
    statBox: {
      alignItems: 'center',
    },
    statNumber: {
      color: theme.text,
      fontSize: 20,
      fontWeight: '800',
    },
    statLabel: {
      color: theme.textMuted,
      fontSize: 11,
      marginTop: 2,
      textTransform: 'uppercase',
    },
    card: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      padding: 14,
      backgroundColor: theme.bgCard,
      marginBottom: 14,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    cardTitle: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '700',
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    mutedText: {
      color: theme.textFaint,
      fontSize: 12,
      fontStyle: 'italic',
    },
    roomRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderFaint,
    },
    roomName: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '700',
    },
    roomCountText: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    deleteBtn: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingVertical: 4,
      paddingHorizontal: 8,
      backgroundColor: theme.bgBtnSecondary,
    },
    deleteBtnText: {
      color: theme.text,
      fontSize: 11,
      fontWeight: '600',
    },
    sampleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderFaint,
    },
    sampleRoom: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '600',
    },
    sampleMeta: {
      color: theme.textMuted,
      fontSize: 11,
      marginTop: 2,
    },
    btnRow: {
      flexDirection: 'row',
      gap: 6,
    },
    smallOutlineBtn: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingVertical: 4,
      paddingHorizontal: 8,
      backgroundColor: theme.bgBtnSecondary,
    },
    smallBtnText: {
      color: theme.text,
      fontSize: 11,
      fontWeight: '600',
    },
    // Modal styles
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
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
      gap: 10,
    },
    modalTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '700',
    },
    modalSub: {
      color: theme.textMuted,
      fontSize: 12,
    },
    apRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderFaint,
    },
    apName: {
      color: theme.text,
      fontSize: 12,
      flex: 1,
    },
    apRssi: {
      color: theme.textSub,
      fontSize: 12,
      fontWeight: '600',
    },
    pickerItem: {
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderFaint,
    },
    pickerItemActive: {
      backgroundColor: theme.bgBadgeActive,
    },
    pickerItemText: {
      color: theme.text,
      fontSize: 13,
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
      alignSelf: 'flex-end',
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
      marginBottom: 8,
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
  });
}
