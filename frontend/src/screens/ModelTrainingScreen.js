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
  Platform,
} from 'react-native';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function ModelTrainingScreen({ onNavigate }) {
  const { activeOrg } = useAuth();
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState([]);
  const [selectedSite, setSelectedSite] = useState(null);
  const [modelData, setModelData] = useState(null);
  const [stats, setStats] = useState(null);
  const [training, setTraining] = useState(false);

  useEffect(() => {
    loadSites();
  }, [activeOrg]);

  useEffect(() => {
    if (selectedSite) {
      loadSiteData(selectedSite.id);
    }
  }, [selectedSite]);

  const loadSites = async () => {
    if (!activeOrg?.id) return;
    setLoading(true);
    try {
      const res = await api.getSites(activeOrg.id);
      if (res.success && Array.isArray(res.data)) {
        setSites(res.data);
        if (res.data.length > 0) setSelectedSite(res.data[0]);
        else setLoading(false);
      }
    } catch (e) {
      console.log('Error loading sites:', e);
      setLoading(false);
    }
  };

  const loadSiteData = async (siteId) => {
    setLoading(true);
    try {
      const [modelRes, statsRes] = await Promise.all([
        api.getActiveModel(siteId),
        api.getFingerprintStats(activeOrg.id, siteId),
      ]);

      if (modelRes.success) setModelData(modelRes.data);
      if (statsRes.success) setStats(statsRes.data);
    } catch (e) {
      console.log('Error loading site data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleTrainModel = async () => {
    if (!selectedSite) return;

    const sampleCount = stats?.totalSamples || 0;
    const roomCount = stats?.roomDistribution?.length || 0;

    if (sampleCount < 5 || roomCount < 2) {
      Alert.alert(
        'Insufficient Data',
        'Model training requires at least 5 total samples across at least 2 distinct rooms. Please collect more data.'
      );
      return;
    }

    setTraining(true);
    try {
      const res = await api.trainModel(selectedSite.id);
      if (res.success && res.data) {
        const m = res.data.metrics || {};
        const acc = m.accuracy ?? m.cvAccuracy ?? 0;
        Alert.alert(
          'Model Trained Successfully',
          `Model Accuracy (CV): ${acc}%\nRooms: ${m.classesCount || 0}\nTotal Samples: ${m.totalSamples || 0} (100% dataset trained)`
        );
        loadSiteData(selectedSite.id);
      }
    } catch (e) {
      Alert.alert('Training Failed', e.message || 'Model training failed.');
    } finally {
      setTraining(false);
    }
  };


  const topInset = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 44;
  const backScreen = activeOrg?.role === 'ADMIN' ? 'adminDashboard' : 'contributorDashboard';

  const sampleCount = stats?.totalSamples || 0;
  const roomCount = stats?.roomDistribution?.length || 0;
  const isReady = sampleCount >= 5 && roomCount >= 2;

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle={theme.statusBar} backgroundColor={theme.statusBarBg} />
      <ScrollView contentContainerStyle={[s.scroll, { paddingTop: topInset }]}>
        {/* Top Navbar */}
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => onNavigate(backScreen)} style={s.backBtn}>
            <Text style={s.backBtnText}>&lt; Dashboard</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Model Training</Text>
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

        {loading ? (
          <ActivityIndicator color={theme.spinner} size="small" style={{ marginVertical: 30 }} />
        ) : (
          <>
            {/* Data Readiness Card */}
            <View style={s.card}>
              <Text style={s.cardTitle}>Training Data Readiness</Text>
              <Text style={s.cardSubtitle}>
                Requires at least 5 samples across 2 or more rooms.
              </Text>

              <View style={s.statsRow}>
                <View style={s.statBox}>
                  <Text style={s.statNum}>{sampleCount}</Text>
                  <Text style={s.statLbl}>Samples (min 5)</Text>
                </View>
                <View style={s.statBox}>
                  <Text style={s.statNum}>{roomCount}</Text>
                  <Text style={s.statLbl}>Rooms (min 2)</Text>
                </View>
                <View style={s.statBox}>
                  <Text style={[s.statNum, { color: isReady ? theme.text : theme.textMuted }]}>
                    {isReady ? 'READY' : 'NEED DATA'}
                  </Text>
                  <Text style={s.statLbl}>Status</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[s.trainBtn, (!isReady || training) && s.trainBtnDisabled]}
                onPress={handleTrainModel}
                disabled={!isReady || training}
              >
                {training ? (
                  <ActivityIndicator color={theme.textBtnPrimary} size="small" />
                ) : (
                  <Text style={s.trainBtnText}>
                    {isReady ? 'Train Positioning Model' : 'Need More Data to Train'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Active Model Status */}
            <View style={s.card}>
              <Text style={s.cardTitle}>Active Model</Text>
              {modelData?.activeModel ? (
                <View style={s.modelDetails}>
                  <Text style={s.modelRow}>Version: v{modelData.activeModel.version}</Text>
                  <Text style={s.modelRow}>
                    Accuracy (CV): {modelData.activeModel.accuracy != null ? `${modelData.activeModel.accuracy}%` : 'N/A'}
                  </Text>
                  <Text style={s.modelRow}>
                    Training Samples: {modelData.activeModel.sampleCount} (100% of dataset)
                  </Text>
                  <Text style={s.modelRow}>Algorithm: {modelData.activeModel.algorithm}</Text>
                  <Text style={s.modelRow}>Trained: {new Date(modelData.activeModel.createdAt).toLocaleDateString()}</Text>

                  <TouchableOpacity
                    style={s.testBtn}
                    onPress={() => onNavigate('localization')}
                  >
                    <Text style={s.testBtnText}>Test Model Live</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={s.mutedText}>No active model trained for this building yet.</Text>
              )}
            </View>

            {/* Model History */}
            {modelData?.history && modelData.history.length > 0 && (
              <View style={s.card}>
                <Text style={s.cardTitle}>Model History</Text>
                {modelData.history.map((m) => (
                  <View key={m.id} style={s.historyRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.historyVersion}>Version {m.version} {m.isActive ? '(Active)' : ''}</Text>
                      <Text style={s.historyMeta}>
                        Accuracy (CV): {m.accuracy}% • {m.sampleCount} samples • {new Date(m.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

          </>
        )}
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
    card: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      padding: 14,
      backgroundColor: theme.bgCard,
      marginBottom: 14,
    },
    cardTitle: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '700',
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    cardSubtitle: {
      color: theme.textMuted,
      fontSize: 12,
      marginBottom: 12,
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      borderWidth: 1,
      borderColor: theme.borderMuted,
      borderRadius: 4,
      padding: 10,
      backgroundColor: theme.bgBuffer,
      marginBottom: 14,
    },
    statBox: {
      alignItems: 'center',
    },
    statNum: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '800',
    },
    statLbl: {
      color: theme.textMuted,
      fontSize: 11,
      marginTop: 2,
    },
    trainBtn: {
      backgroundColor: theme.bgBtnPrimary,
      borderRadius: 4,
      paddingVertical: 12,
      alignItems: 'center',
    },
    trainBtnDisabled: {
      opacity: 0.5,
    },
    trainBtnText: {
      color: theme.textBtnPrimary,
      fontSize: 14,
      fontWeight: '600',
    },
    modelDetails: {
      gap: 4,
      marginTop: 6,
    },
    modelRow: {
      color: theme.textSub,
      fontSize: 13,
    },
    testBtn: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingVertical: 10,
      alignItems: 'center',
      marginTop: 10,
      backgroundColor: theme.bgBtnSecondary,
    },
    testBtnText: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '600',
    },
    mutedText: {
      color: theme.textFaint,
      fontSize: 12,
      fontStyle: 'italic',
      marginTop: 4,
    },
    historyRow: {
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderFaint,
    },
    historyVersion: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '600',
    },
    historyMeta: {
      color: theme.textMuted,
      fontSize: 11,
      marginTop: 2,
    },
  });
}
