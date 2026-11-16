import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Platform,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';

export default function LandingScreen({ onNavigate }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const topInset = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 44;

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle={theme.statusBar} backgroundColor={theme.statusBarBg} />
      <ScrollView contentContainerStyle={[s.scroll, { paddingTop: topInset }]}>
        <View style={s.header}>
          <Text style={s.brandTitle}>INTRALOCATE</Text>
          <Text style={s.tagline}>Indoor Localization System</Text>
        </View>

        <View style={s.infoCard}>
          <Text style={s.cardHeading}>About IntraLocate</Text>
          <Text style={s.cardBody}>
            IntraLocate determines indoor room-level positions using ambient Wi-Fi signal fingerprinting. No special hardware beacons required.
          </Text>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>How It Works</Text>
          <View style={s.stepRow}>
            <Text style={s.stepIndex}>1.</Text>
            <View style={s.stepContent}>
              <Text style={s.stepTitle}>Manage Spaces</Text>
              <Text style={s.stepDesc}>Admins configure buildings, floors, and rooms.</Text>
            </View>
          </View>
          <View style={s.stepRow}>
            <Text style={s.stepIndex}>2.</Text>
            <View style={s.stepContent}>
              <Text style={s.stepTitle}>Collect Signals</Text>
              <Text style={s.stepDesc}>Contributors record or import Wi-Fi RSSI samples for each room.</Text>
            </View>
          </View>
          <View style={s.stepRow}>
            <Text style={s.stepIndex}>3.</Text>
            <View style={s.stepContent}>
              <Text style={s.stepTitle}>Train Model</Text>
              <Text style={s.stepDesc}>Train an indoor positioning classifier for the building.</Text>
            </View>
          </View>
          <View style={s.stepRow}>
            <Text style={s.stepIndex}>4.</Text>
            <View style={s.stepContent}>
              <Text style={s.stepTitle}>Track & Locate</Text>
              <Text style={s.stepDesc}>Normal users grant tracking permission, and contributors test live positioning.</Text>
            </View>
          </View>
        </View>

        <View style={s.actionButtons}>
          <TouchableOpacity
            style={s.primaryBtn}
            onPress={() => onNavigate('register')}
            activeOpacity={0.8}
          >
            <Text style={s.primaryBtnText}>Create Account</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.secondaryBtn}
            onPress={() => onNavigate('login')}
            activeOpacity={0.8}
          >
            <Text style={s.secondaryBtnText}>Sign In</Text>
          </TouchableOpacity>
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
    header: {
      marginBottom: 20,
      borderBottomWidth: 2,
      borderBottomColor: theme.border,
      paddingBottom: 12,
    },
    brandTitle: {
      color: theme.text,
      fontSize: 24,
      fontWeight: '800',
      letterSpacing: 2,
    },
    tagline: {
      color: theme.textMuted,
      fontSize: 14,
      marginTop: 4,
    },
    infoCard: {
      borderWidth: 1,
      borderColor: theme.borderMuted,
      borderRadius: 4,
      padding: 14,
      backgroundColor: theme.bgCard,
      marginBottom: 20,
    },
    cardHeading: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '700',
      marginBottom: 4,
    },
    cardBody: {
      color: theme.textSub,
      fontSize: 13,
      lineHeight: 18,
    },
    section: {
      marginBottom: 20,
    },
    sectionTitle: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 12,
    },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    stepIndex: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '700',
      width: 24,
    },
    stepContent: {
      flex: 1,
    },
    stepTitle: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '600',
    },
    stepDesc: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    actionButtons: {
      gap: 12,
    },
    primaryBtn: {
      backgroundColor: theme.bgBtnPrimary,
      borderRadius: 4,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryBtnText: {
      color: theme.textBtnPrimary,
      fontSize: 15,
      fontWeight: '600',
    },
    secondaryBtn: {
      backgroundColor: theme.bgBtnSecondary,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingVertical: 14,
      alignItems: 'center',
    },
    secondaryBtnText: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '600',
    },
  });
}
