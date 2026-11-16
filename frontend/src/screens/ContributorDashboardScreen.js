import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function ContributorDashboardScreen({ onNavigate }) {
  const { user, activeOrg, setActiveOrg } = useAuth();
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSites();
  }, [activeOrg]);

  const loadSites = async () => {
    if (!activeOrg?.id) return;
    setLoading(true);
    try {
      const res = await api.getSites(activeOrg.id);
      if (res.success && Array.isArray(res.data)) {
        setSites(res.data);
      }
    } catch (e) {
      console.log('Error loading sites:', e);
    } finally {
      setLoading(false);
    }
  };

  const topInset = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 44;

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle={theme.statusBar} backgroundColor={theme.statusBarBg} />
      <ScrollView contentContainerStyle={[s.scroll, { paddingTop: topInset }]}>
        {/* Top Navbar */}
        <View style={s.topBar}>
          <View>
            <Text style={s.orgName}>{activeOrg?.name}</Text>
            <Text style={s.roleLabel}>Contributor Workspace</Text>
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

        {/* Primary Contributor Actions */}
        <View style={s.section}>
          <Text style={s.sectionHeading}>Contributor Tasks</Text>

          <View style={s.card}>
            <Text style={s.cardTitle}>Data Collection</Text>
            <Text style={s.cardDesc}>
              Collect Wi-Fi fingerprint samples for rooms, import/export CSV datasets, or manage room recordings.
            </Text>
            <TouchableOpacity
              style={s.primaryBtn}
              onPress={() => onNavigate('collector')}
              activeOpacity={0.8}
            >
              <Text style={s.primaryBtnText}>Open Data Collector</Text>
            </TouchableOpacity>
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Model Training</Text>
            <Text style={s.cardDesc}>
              Train and inspect indoor localization models across facilities using collected Wi-Fi signal datasets.
            </Text>
            <TouchableOpacity
              style={s.secondaryBtn}
              onPress={() => onNavigate('modelTraining')}
              activeOpacity={0.8}
            >
              <Text style={s.secondaryBtnText}>Open Model Training</Text>
            </TouchableOpacity>
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Test Localization</Text>
            <Text style={s.cardDesc}>
              Test live room positioning using surrounding Wi-Fi signals against trained facility models.
            </Text>
            <TouchableOpacity
              style={s.secondaryBtn}
              onPress={() => onNavigate('localization')}
              activeOpacity={0.8}
            >
              <Text style={s.secondaryBtnText}>Open Test Positioning</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Available Facilities Preview */}
        <View style={s.section}>
          <Text style={s.sectionHeading}>Configured Facilities</Text>
          {loading ? (
            <ActivityIndicator color={theme.spinner} size="small" style={{ marginVertical: 12 }} />
          ) : sites.length === 0 ? (
            <View style={s.emptyCard}>
              <Text style={s.emptyText}>No facilities configured yet by the Admin.</Text>
            </View>
          ) : (
            sites.map((site) => (
              <View key={site.id} style={s.siteRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.siteName}>{site.name}</Text>
                  <Text style={s.siteMeta}>
                    {site.floorCount || 0} floor(s) • {site.roomCount || 0} room(s) • {site.recordingCount || 0} sample(s)
                  </Text>
                </View>
              </View>
            ))
          )}
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
      paddingHorizontal: 20,
      paddingBottom: 40,
    },
    topBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
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
    section: {
      marginBottom: 24,
    },
    sectionHeading: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 12,
    },
    card: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      padding: 16,
      backgroundColor: theme.bgCard,
      marginBottom: 12,
    },
    cardTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 4,
    },
    cardDesc: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 18,
      marginBottom: 14,
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
    emptyCard: {
      borderWidth: 1,
      borderColor: theme.borderMuted,
      borderRadius: 4,
      padding: 14,
      backgroundColor: theme.bgBuffer,
    },
    emptyText: {
      color: theme.textMuted,
      fontSize: 13,
    },
    siteRow: {
      borderWidth: 1,
      borderColor: theme.borderLight,
      borderRadius: 4,
      padding: 12,
      backgroundColor: theme.bgCard,
      marginBottom: 8,
    },
    siteName: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '700',
    },
    siteMeta: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
  });
}
