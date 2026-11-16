import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Platform,
  NativeModules,
  Alert,
} from 'react-native';
import WifiManager from 'react-native-wifi-reborn';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { scanWifiNetworks, formatWifiDataMap } from '../utils/wifiScanner';

export default function LiveLocalizationScreen({ onNavigate }) {
  const { activeOrg } = useAuth();
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const [sites, setSites] = useState([]);
  const [selectedSite, setSelectedSite] = useState(null);
  const [hasModel, setHasModel] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [alternatives, setAlternatives] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [lastScanAps, setLastScanAps] = useState(0);
  const [scanCount, setScanCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState(null);

  const liveActiveRef = useRef(false);

  useEffect(() => {
    loadSites();
    return () => {
      liveActiveRef.current = false;
    };
  }, [activeOrg]);

  useEffect(() => {
    if (selectedSite) {
      checkModel(selectedSite.id);
    }
  }, [selectedSite]);

  const loadSites = async () => {
    if (!activeOrg?.id) return;
    try {
      const res = await api.getSites(activeOrg.id);
      if (res.success && Array.isArray(res.data)) {
        setSites(res.data);
        if (res.data.length > 0) setSelectedSite(res.data[0]);
      }
    } catch (e) {
      console.log('Error loading sites:', e);
    }
  };

  const checkModel = async (siteId) => {
    try {
      const res = await api.getActiveModel(siteId);
      setHasModel(res.success && !!res.data?.activeModel);
    } catch (e) {
      setHasModel(false);
    }
  };

  const queryWifi = async () => {
    const res = await scanWifiNetworks({ forceFresh: true });
    if (!res.success && res.locationServicesDisabled) {
      setErrorMsg(res.error);
    }
    return res.networks || [];
  };

  const performPrediction = async () => {
    if (!selectedSite) return;
    setIsScanning(true);
    setErrorMsg(null);

    try {
      const networks = await queryWifi();
      setLastScanAps(networks.length);

      const wifiMap = formatWifiDataMap(networks);

      if (Object.keys(wifiMap).length === 0) {
        throw new Error('No Wi-Fi signals detected. Ensure Wi-Fi and Location are enabled.');
      }

      const res = await api.predictLocation(selectedSite.id, wifiMap);
      if (res.success && res.data) {
        if (res.data.prediction) {
          setPrediction(res.data.prediction);
          setAlternatives(res.data.alternatives || []);
          setErrorMsg(null);
        } else {
          setPrediction(null);
          setAlternatives([]);
          setErrorMsg(res.data.message || 'No matching room detected for current Wi-Fi signals.');
        }
        setScanCount((prev) => prev + 1);
      } else {
        throw new Error(res.error || 'Prediction failed');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error scanning position');
    } finally {
      setIsScanning(false);
    }
  };

  const startContinuousMode = () => {
    liveActiveRef.current = true;
    setIsLiveMode(true);
    runLiveLoop();
  };

  const stopContinuousMode = () => {
    liveActiveRef.current = false;
    setIsLiveMode(false);
  };

  const runLiveLoop = async () => {
    if (!liveActiveRef.current) return;
    await performPrediction();
    if (liveActiveRef.current) {
      setTimeout(runLiveLoop, 2500);
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
          <Text style={s.headerTitle}>Position Testing</Text>
        </View>

        {/* Building Selector */}
        <View style={s.sitePickerCard}>
          <Text style={s.label}>Building:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.sitePillRow}>
            {sites.map((site) => (
              <TouchableOpacity
                key={site.id}
                style={[s.sitePill, selectedSite?.id === site.id && s.sitePillActive]}
                onPress={() => setSelectedSite(site)}
              >
                <Text style={[s.sitePillText, selectedSite?.id === site.id && s.sitePillTextActive]}>
                  {site.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {hasModel === false && (
          <View style={s.warningCard}>
            <Text style={s.warningTitle}>No Model Trained</Text>
            <Text style={s.warningText}>
              This building does not have an active trained positioning model yet. An admin or contributor must collect data and train a model first.
            </Text>
            <TouchableOpacity
              style={s.actionBtnOutline}
              onPress={() => onNavigate('modelTraining')}
            >
              <Text style={s.actionBtnOutlineText}>Go to Model Training</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Prediction Results Card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Location Result</Text>

          {prediction ? (
            <View style={s.resultBox}>
              <Text style={s.roomName}>{prediction.roomName || 'Unknown Room'}</Text>
              <Text style={s.floorName}>Floor: {prediction.floorName || 'Floor 1'}</Text>
              <View style={s.confidenceRow}>
                <Text style={s.confidenceLabel}>Confidence:</Text>
                <Text style={s.confidenceValue}>
                  {prediction.confidence !== undefined ? `${prediction.confidence}%` : 'Estimated'}
                </Text>
              </View>
            </View>
          ) : (
            <View style={s.emptyBox}>
              <Text style={s.mutedText}>
                No scan performed yet. Tap "Single Scan" or "Start Live Tracking" below.
              </Text>
            </View>
          )}

          {/* Alternatives */}
          {alternatives.length > 0 && (
            <View style={s.altBox}>
              <Text style={s.altHeading}>Alternative Predictions:</Text>
              {alternatives.map((alt) => (
                <View key={alt.roomId || alt.roomName} style={s.altRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.altName}>{alt.roomName}</Text>
                    <Text style={s.altFloor}>Floor: {alt.floorName || 'Floor 1'}</Text>
                  </View>
                  <Text style={s.altConf}>
                    {alt.confidence !== undefined ? `${alt.confidence}%` : (alt.probability !== undefined ? `${alt.probability}%` : '')}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {errorMsg && (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{errorMsg}</Text>
            </View>
          )}

          <View style={s.telemetryRow}>
            <Text style={s.telemetryText}>APs Detected: {lastScanAps}</Text>
            <Text style={s.telemetryText}>Scans Completed: {scanCount}</Text>
          </View>

          {/* Action Buttons */}
          <View style={s.actions}>
            <TouchableOpacity
              style={s.primaryBtn}
              onPress={performPrediction}
              disabled={isScanning || isLiveMode || hasModel === false}
            >
              {isScanning && !isLiveMode ? (
                <ActivityIndicator color={theme.textBtnPrimary} size="small" />
              ) : (
                <Text style={s.primaryBtnText}>Scan Current Position</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={isLiveMode ? s.dangerBtn : s.secondaryBtn}
              onPress={isLiveMode ? stopContinuousMode : startContinuousMode}
              disabled={hasModel === false}
            >
              <Text style={isLiveMode ? s.dangerBtnText : s.secondaryBtnText}>
                {isLiveMode ? 'Stop Continuous Tracking' : 'Start Continuous Tracking'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
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
    warningCard: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      padding: 12,
      backgroundColor: theme.bgBuffer,
      marginBottom: 14,
    },
    warningTitle: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '700',
      marginBottom: 4,
    },
    warningText: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 16,
      marginBottom: 8,
    },
    actionBtnOutline: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingVertical: 8,
      alignItems: 'center',
      backgroundColor: theme.bgBtnSecondary,
    },
    actionBtnOutlineText: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '600',
    },
    card: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      padding: 16,
      backgroundColor: theme.bgCard,
      marginBottom: 14,
    },
    cardTitle: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '700',
      textTransform: 'uppercase',
      marginBottom: 12,
    },
    resultBox: {
      borderWidth: 2,
      borderColor: theme.border,
      borderRadius: 4,
      padding: 16,
      backgroundColor: theme.bgPreview,
      alignItems: 'center',
      marginBottom: 14,
    },
    roomName: {
      color: theme.text,
      fontSize: 22,
      fontWeight: '800',
    },
    floorName: {
      color: theme.textMuted,
      fontSize: 13,
      marginTop: 4,
    },
    confidenceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
      gap: 6,
    },
    confidenceLabel: {
      color: theme.textMuted,
      fontSize: 12,
    },
    confidenceValue: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '700',
    },
    emptyBox: {
      paddingVertical: 20,
      alignItems: 'center',
    },
    mutedText: {
      color: theme.textFaint,
      fontSize: 12,
      fontStyle: 'italic',
    },
    altBox: {
      borderTopWidth: 1,
      borderTopColor: theme.borderLight,
      paddingTop: 10,
      marginBottom: 12,
    },
    altHeading: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '700',
      marginBottom: 6,
    },
    altRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 4,
    },
    altName: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '600',
    },
    altFloor: {
      color: theme.textMuted,
      fontSize: 11,
      marginTop: 1,
    },
    altConf: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '600',
    },
    errorBox: {
      borderWidth: 1,
      borderColor: '#ef4444',
      backgroundColor: theme.isDark ? '#3b1818' : '#fef2f2',
      padding: 8,
      borderRadius: 4,
      marginBottom: 12,
    },
    errorText: {
      color: theme.isDark ? '#fca5a5' : '#b91c1c',
      fontSize: 12,
    },
    telemetryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    telemetryText: {
      color: theme.textMuted,
      fontSize: 11,
    },
    actions: {
      gap: 10,
    },
    primaryBtn: {
      backgroundColor: theme.bgBtnPrimary,
      borderRadius: 4,
      paddingVertical: 12,
      alignItems: 'center',
    },
    primaryBtnText: {
      color: theme.textBtnPrimary,
      fontSize: 14,
      fontWeight: '600',
    },
    secondaryBtn: {
      backgroundColor: theme.bgBtnSecondary,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingVertical: 12,
      alignItems: 'center',
    },
    secondaryBtnText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '600',
    },
    dangerBtn: {
      backgroundColor: '#dc2626',
      borderRadius: 4,
      paddingVertical: 12,
      alignItems: 'center',
    },
    dangerBtnText: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '700',
    },
  });
}
