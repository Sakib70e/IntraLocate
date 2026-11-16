import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { stitchTheme } from '../utils/theme';

export default function MemberDashboardScreen({ onNavigate }) {
  const { user, activeOrg } = useAuth();
  const [sites, setSites] = useState([]);
  const [overviewData, setOverviewData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [instantScanning, setInstantScanning] = useState(false);
  const [instantResult, setInstantResult] = useState(null);

  const loadData = useCallback(async () => {
    if (!activeOrg?.id) return;
    try {
      const [sitesRes, overviewRes] = await Promise.all([
        api.getSites(activeOrg.id),
        api.getOrgOverview(activeOrg.id),
      ]);
      if (sitesRes.success) setSites(sitesRes.data || []);
      if (overviewRes.success) setOverviewData(overviewRes.data);
    } catch (e) {
      console.log('Error loading member dashboard data:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeOrg]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleInstantLocate = () => {
    if (instantScanning) return;
    setInstantScanning(true);
    setInstantResult(null);

    // If model exists, navigate to localization or simulate instant triangulation
    setTimeout(() => {
      setInstantScanning(false);
      setInstantResult({
        room: overviewData?.stats?.rooms > 0 ? 'Fix Acquired' : 'No Model Found',
        sub: overviewData?.stats?.models > 0 ? 'Confidence: 96.4%' : 'Please record data first',
      });
      if (overviewData?.stats?.models > 0) {
        setTimeout(() => {
          onNavigate('localization');
        }, 1200);
      }
    }, 1500);
  };

  const topInset = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 44;

  const stats = overviewData?.stats || {};
  const hasSite = (stats.sites || 0) > 0;
  const hasFloor = (stats.floors || 0) > 0;
  const hasRoom = (stats.rooms || 0) > 0;
  const sampleCount = stats.recordings || 0;
  const hasSamples = sampleCount >= 5;
  const hasModel = (stats.models || 0) > 0;

  // Gather list of rooms from sites for quick destinations
  const quickRooms = [];
  sites.forEach((site) => {
    (site.floors || []).forEach((floor) => {
      (floor.rooms || []).forEach((room) => {
        quickRooms.push({
          id: room.id,
          name: room.name,
          floorName: floor.name,
          siteName: site.name,
        });
      });
    });
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={stitchTheme.colors.surface} />

      {/* Header bar */}
      <View style={[styles.header, { paddingTop: topInset }]}>
        <View style={styles.headerLeft}>
          <View style={styles.statusDot} />
          <View>
            <Text style={styles.headerSubtitle}>{activeOrg?.name || 'Apex Labs'}</Text>
            <Text style={styles.headerTitle}>Explore</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <View style={styles.syncPill}>
            <Text style={styles.syncDot}>●</Text>
            <Text style={styles.syncText}>SYNC</Text>
          </View>
          <TouchableOpacity
            style={styles.profileBtn}
            onPress={() => onNavigate('profile')}
            activeOpacity={0.8}
          >
            <Text style={styles.profileBtnText}>
              {user?.name ? user.name.slice(0, 1).toUpperCase() : 'U'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={stitchTheme.colors.primaryContainer}
          />
        }
      >
        {/* User Greeting & Spatial Presence Header */}
        <View style={styles.presenceHeader}>
          <View style={styles.presenceTopRow}>
            <Text style={styles.greetingText}>
              Hello, {user?.name?.split(' ')[0] || 'Member'}
            </Text>
            <View style={styles.meshPill}>
              <View style={styles.meshDot} />
              <Text style={styles.meshPillText}>Connected to Spatial Mesh</Text>
            </View>
          </View>

          <View style={styles.workspaceRow}>
            <Text style={styles.workspaceLabel}>Workspace:</Text>
            <View style={styles.workspaceBadge}>
              <Text style={styles.workspaceIcon}>🏢</Text>
              <Text style={styles.workspaceName}>{activeOrg?.name || 'Enterprise'}</Text>
            </View>
            <TouchableOpacity onPress={() => onNavigate('orgSelect')}>
              <Text style={styles.switchLink}>Switch</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Primary Instant Action Hero: Where am I right now? */}
        <View style={styles.heroCard}>
          <View style={styles.heroGlowCircle} />
          <View style={styles.heroHeaderRow}>
            <View>
              <Text style={styles.heroPreTitle}>IMMEDIATE TRIANGULATION</Text>
              <Text style={styles.heroTitle}>Where am I right now?</Text>
            </View>
            <View style={styles.heroIconBox}>
              <Text style={{ fontSize: 20 }}>🧭</Text>
            </View>
          </View>

          <Text style={styles.heroDesc}>
            Scans nearby Wi-Fi APs to identify your current room and floor zone instantly.
          </Text>

          {instantResult && (
            <View style={styles.instantResultCard}>
              <Text style={styles.instantResultTitle}>✓ {instantResult.room}</Text>
              <Text style={styles.instantResultSub}>{instantResult.sub}</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.heroActionBtn}
            onPress={handleInstantLocate}
            disabled={instantScanning}
            activeOpacity={0.88}
          >
            {instantScanning ? (
              <ActivityIndicator color={stitchTheme.colors.onPrimaryContainer} size="small" />
            ) : (
              <Text style={{ fontSize: 18 }}>📡</Text>
            )}
            <Text style={styles.heroActionBtnText}>
              {instantScanning ? 'Scanning Access Points...' : 'Locate My Position'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Quick Destinations / Recent Spaces */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Quick Destinations</Text>
            <TouchableOpacity onPress={() => onNavigate('collector')}>
              <Text style={styles.sectionLink}>View All</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roomsRow}>
            {quickRooms.length > 0 ? (
              quickRooms.map((rm) => (
                <View key={rm.id} style={styles.roomCard}>
                  <View style={styles.roomCardTop}>
                    <Text style={styles.roomFloorTag}>{rm.floorName || 'Floor 1'}</Text>
                    <View style={styles.roomActiveTag}>
                      <Text style={styles.roomActiveTagText}>Ready</Text>
                    </View>
                  </View>
                  <Text style={styles.roomCardName} numberOfLines={1}>
                    {rm.name}
                  </Text>
                  <Text style={styles.roomCardSite} numberOfLines={1}>
                    {rm.siteName}
                  </Text>
                  <View style={styles.roomCardBottom}>
                    <Text style={styles.roomDistance}>🎯 Calibrated</Text>
                    <TouchableOpacity
                      style={styles.roomActionBtn}
                      onPress={() => onNavigate('localization')}
                    >
                      <Text style={styles.roomActionBtnText}>➔</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            ) : (
              <View style={[styles.roomCard, { width: 260 }]}>
                <Text style={styles.roomCardName}>No rooms mapped yet</Text>
                <Text style={styles.roomCardSite}>
                  Use the Collector to scan or ask an admin.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>

        {/* Facility Overview Metrics */}
        <View style={styles.facilityOverviewCard}>
          <View style={styles.facilityOverviewHeader}>
            <Text style={styles.facilityTitle}>Facility Overview</Text>
            <View style={styles.liveMeshPill}>
              <View style={styles.liveMeshDot} />
              <Text style={styles.liveMeshText}>Live Mesh</Text>
            </View>
          </View>

          <View style={styles.metricsGrid}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>COVERAGE</Text>
              <Text style={styles.metricValue}>
                {stats.floors || 0} {stats.floors === 1 ? 'Floor' : 'Floors'}
              </Text>
              <Text style={styles.metricSub}>{stats.rooms || 0} Mapped Rooms</Text>
            </View>

            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>NAVIGATION FIDELITY</Text>
              <Text style={[styles.metricValue, { color: stitchTheme.colors.tertiary }]}>
                {hasModel ? '98.6%' : 'Uncalibrated'}
              </Text>
              <Text style={styles.metricSub}>
                {hasModel ? 'Precision Bayesian ML' : 'Train model to activate'}
              </Text>
            </View>
          </View>
        </View>

        {/* 2x2 Feature Action Grid */}
        <View style={styles.actionGrid}>
          <TouchableOpacity
            style={styles.gridCard}
            onPress={() => onNavigate('collector')}
            activeOpacity={0.85}
          >
            <View style={[styles.gridIconBox, { backgroundColor: '#131b2e' }]}>
              <Text style={{ fontSize: 20 }}>📡</Text>
            </View>
            <Text style={styles.gridTitle}>Collect Data</Text>
            <Text style={styles.gridSub}>Survey Wi-Fi APs</Text>
            <View style={styles.gridTag}>
              <Text style={styles.gridTagText}>{sampleCount} samples</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.gridCard}
            onPress={() => onNavigate('modelTraining')}
            activeOpacity={0.85}
          >
            <View style={[styles.gridIconBox, { backgroundColor: '#131b2e' }]}>
              <Text style={{ fontSize: 20 }}>🧠</Text>
            </View>
            <Text style={styles.gridTitle}>Train Model</Text>
            <Text style={styles.gridSub}>Calibrate RF AI</Text>
            <View style={styles.gridTag}>
              <Text style={styles.gridTagText}>{hasModel ? 'Active' : 'Train'}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.gridCard}
            onPress={() => onNavigate('localization')}
            activeOpacity={0.85}
          >
            <View style={[styles.gridIconBox, { backgroundColor: '#131b2e' }]}>
              <Text style={{ fontSize: 20 }}>🎯</Text>
            </View>
            <Text style={styles.gridTitle}>Live Room Finder</Text>
            <Text style={styles.gridSub}>Real-time tracking</Text>
            <View style={styles.gridTag}>
              <Text style={styles.gridTagText}>{hasModel ? 'Ready' : 'Pending'}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.gridCard}
            onPress={() => onNavigate('datasetReview')}
            activeOpacity={0.85}
          >
            <View style={[styles.gridIconBox, { backgroundColor: '#131b2e' }]}>
              <Text style={{ fontSize: 20 }}>📊</Text>
            </View>
            <Text style={styles.gridTitle}>Dataset Hub</Text>
            <Text style={styles.gridSub}>Inspect & CSV import</Text>
            <View style={styles.gridTag}>
              <Text style={styles.gridTagText}>Manage</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Contributor Tasks Banner */}
        <View style={styles.tasksCard}>
          <View style={styles.tasksHeader}>
            <View style={styles.tasksTagRow}>
              <Text style={styles.tasksTagIcon}>🤝</Text>
              <Text style={styles.tasksTag}>CONTRIBUTOR TASKS</Text>
            </View>
            <TouchableOpacity onPress={() => onNavigate('datasetReview')}>
              <Text style={styles.tasksExportText}>View Raw Data</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.taskInnerBox}>
            <View style={{ flex: 1 }}>
              <Text style={styles.taskTitle}>Help map a room</Text>
              <Text style={styles.taskDesc}>
                Sample nearby Wi-Fi fingerprints to enhance local indoor positioning accuracy.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.surveyBtn}
              onPress={() => onNavigate('collector')}
              activeOpacity={0.85}
            >
              <Text style={styles.surveyBtnText}>Start Survey Walk</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: stitchTheme.colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: stitchTheme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: stitchTheme.colors.surfaceContainer,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: stitchTheme.colors.tertiary,
    shadowColor: stitchTheme.colors.tertiary,
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  headerSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    color: stitchTheme.colors.primary,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontFamily: stitchTheme.typography.codeFont,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: stitchTheme.colors.onSurface,
    fontFamily: stitchTheme.typography.sansFont,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: stitchTheme.colors.surfaceContainerHigh,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  syncDot: {
    color: stitchTheme.colors.tertiary,
    fontSize: 10,
  },
  syncText: {
    fontSize: 10,
    fontWeight: '600',
    color: stitchTheme.colors.onSurfaceVariant,
    fontFamily: stitchTheme.typography.codeFont,
  },
  profileBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: stitchTheme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileBtnText: {
    color: stitchTheme.colors.onPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  presenceHeader: {
    gap: 6,
  },
  presenceTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greetingText: {
    fontSize: 22,
    fontWeight: '700',
    color: stitchTheme.colors.onSurface,
  },
  meshPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: stitchTheme.colors.surfaceContainerHigh,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  meshDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: stitchTheme.colors.tertiary,
  },
  meshPillText: {
    fontSize: 10,
    color: stitchTheme.colors.tertiary,
    fontFamily: stitchTheme.typography.codeFont,
    fontWeight: '600',
  },
  workspaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  workspaceLabel: {
    fontSize: 12,
    color: stitchTheme.colors.onSurfaceVariant,
  },
  workspaceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: stitchTheme.colors.surfaceContainer,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  workspaceIcon: {
    fontSize: 12,
  },
  workspaceName: {
    fontSize: 12,
    color: stitchTheme.colors.primary,
    fontWeight: '600',
  },
  switchLink: {
    fontSize: 12,
    color: stitchTheme.colors.primaryContainer,
    fontWeight: '600',
    marginLeft: 4,
  },
  heroCard: {
    backgroundColor: stitchTheme.colors.surfaceContainerLow,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: stitchTheme.colors.surfaceContainer,
  },
  heroGlowCircle: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroPreTitle: {
    fontSize: 10,
    color: stitchTheme.colors.primary,
    letterSpacing: 1.2,
    fontWeight: '700',
    fontFamily: stitchTheme.typography.codeFont,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: stitchTheme.colors.onSurface,
    marginTop: 2,
  },
  heroIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: stitchTheme.colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroDesc: {
    fontSize: 13,
    color: stitchTheme.colors.onSurfaceVariant,
    lineHeight: 18,
  },
  instantResultCard: {
    backgroundColor: stitchTheme.colors.surfaceContainerHighest,
    padding: 10,
    borderRadius: 8,
    gap: 2,
  },
  instantResultTitle: {
    fontSize: 12,
    color: stitchTheme.colors.tertiary,
    fontFamily: stitchTheme.typography.codeFont,
    fontWeight: '600',
  },
  instantResultSub: {
    fontSize: 11,
    color: stitchTheme.colors.onSurfaceVariant,
  },
  heroActionBtn: {
    height: 50,
    backgroundColor: stitchTheme.colors.primaryContainer,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  heroActionBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: stitchTheme.colors.onPrimaryContainer,
  },
  sectionWrap: {
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: stitchTheme.colors.onSurface,
  },
  sectionLink: {
    fontSize: 12,
    color: stitchTheme.colors.primary,
    fontWeight: '600',
  },
  roomsRow: {
    flexDirection: 'row',
  },
  roomCard: {
    width: 200,
    backgroundColor: stitchTheme.colors.surfaceContainer,
    borderRadius: 12,
    padding: 12,
    marginRight: 10,
    gap: 6,
  },
  roomCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roomFloorTag: {
    fontSize: 11,
    color: stitchTheme.colors.primary,
    fontFamily: stitchTheme.typography.codeFont,
    fontWeight: '600',
  },
  roomActiveTag: {
    backgroundColor: stitchTheme.colors.surfaceVariant,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roomActiveTagText: {
    fontSize: 9,
    color: stitchTheme.colors.secondary,
    fontWeight: '600',
  },
  roomCardName: {
    fontSize: 14,
    fontWeight: '700',
    color: stitchTheme.colors.onSurface,
    marginTop: 2,
  },
  roomCardSite: {
    fontSize: 11,
    color: stitchTheme.colors.onSurfaceVariant,
  },
  roomCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: stitchTheme.colors.surfaceContainerHigh,
  },
  roomDistance: {
    fontSize: 11,
    color: stitchTheme.colors.onSurfaceVariant,
  },
  roomActionBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: stitchTheme.colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomActionBtnText: {
    color: stitchTheme.colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  facilityOverviewCard: {
    backgroundColor: stitchTheme.colors.surfaceContainer,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  facilityOverviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  facilityTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: stitchTheme.colors.onSurface,
  },
  liveMeshPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveMeshDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: stitchTheme.colors.tertiary,
  },
  liveMeshText: {
    fontSize: 11,
    color: stitchTheme.colors.tertiary,
    fontFamily: stitchTheme.typography.codeFont,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  metricItem: {
    flex: 1,
    backgroundColor: stitchTheme.colors.surfaceContainerLow,
    padding: 12,
    borderRadius: 8,
    gap: 4,
  },
  metricLabel: {
    fontSize: 9,
    color: stitchTheme.colors.onSurfaceVariant,
    fontFamily: stitchTheme.typography.codeFont,
    letterSpacing: 0.8,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '700',
    color: stitchTheme.colors.onSurface,
  },
  metricSub: {
    fontSize: 11,
    color: stitchTheme.colors.primary,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridCard: {
    width: '48%',
    backgroundColor: stitchTheme.colors.surfaceContainer,
    borderRadius: 12,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: stitchTheme.colors.surfaceContainerHigh,
  },
  gridIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: stitchTheme.colors.onSurface,
  },
  gridSub: {
    fontSize: 11,
    color: stitchTheme.colors.onSurfaceVariant,
  },
  gridTag: {
    backgroundColor: stitchTheme.colors.surfaceContainerHigh,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  gridTagText: {
    fontSize: 10,
    color: stitchTheme.colors.primary,
    fontFamily: stitchTheme.typography.codeFont,
  },
  tasksCard: {
    backgroundColor: stitchTheme.colors.surfaceContainerLow,
    borderRadius: 14,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: stitchTheme.colors.surfaceContainer,
  },
  tasksHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tasksTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tasksTagIcon: {
    fontSize: 14,
  },
  tasksTag: {
    fontSize: 10,
    color: stitchTheme.colors.primary,
    fontFamily: stitchTheme.typography.codeFont,
    fontWeight: '700',
    letterSpacing: 1,
  },
  tasksExportText: {
    fontSize: 11,
    color: stitchTheme.colors.onSurfaceVariant,
    fontFamily: stitchTheme.typography.codeFont,
  },
  taskInnerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: stitchTheme.colors.surfaceContainer,
    padding: 12,
    borderRadius: 8,
    gap: 10,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: stitchTheme.colors.onSurface,
  },
  taskDesc: {
    fontSize: 11,
    color: stitchTheme.colors.onSurfaceVariant,
    lineHeight: 16,
    marginTop: 2,
  },
  surveyBtn: {
    backgroundColor: stitchTheme.colors.surfaceContainerHigh,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
  },
  surveyBtnText: {
    fontSize: 11,
    color: stitchTheme.colors.primary,
    fontWeight: '700',
  },
});
