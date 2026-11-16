import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Platform,
  Alert,
  Switch,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import api from '../api/client';

export default function SettingsScreen({ onNavigate }) {
  const { user, logout, activeOrg, leaveOrganization, setActiveOrg, refreshOrgs } = useAuth();
  const { theme, isDark, toggleTheme } = useTheme();

  const isAdmin = activeOrg?.role === 'ADMIN';

  // Org code state (admin only)
  const [editingCode, setEditingCode] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [savingCode, setSavingCode] = useState(false);

  // Leave org state
  const [leaving, setLeaving] = useState(false);

  const topInset = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 44;
  const backScreen = activeOrg
    ? activeOrg.role === 'ADMIN'
      ? 'adminDashboard'
      : activeOrg.role === 'CONTRIBUTOR'
      ? 'contributorDashboard'
      : 'userDashboard'
    : 'orgSelect';

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: logout },
      ]
    );
  };

  const handleCopyCode = async () => {
    if (!activeOrg?.code) return;
    try {
      await Clipboard.setStringAsync(activeOrg.code);
      Alert.alert('Copied', `Organization code "${activeOrg.code}" copied to clipboard.`);
    } catch (e) {
      Alert.alert('Error', 'Failed to copy code.');
    }
  };

  const handleShareCode = async () => {
    if (!activeOrg?.code) return;
    try {
      await Share.share({
        message: `Join my organization "${activeOrg.name}" on IntraLocate using code: ${activeOrg.code}`,
        title: `IntraLocate Join Code: ${activeOrg.code}`,
      });
    } catch (e) {}
  };

  const handleStartEditCode = () => {
    setNewCode(activeOrg?.code || '');
    setEditingCode(true);
  };

  const handleCancelEditCode = () => {
    setEditingCode(false);
    setNewCode('');
  };

  const handleSaveCode = async () => {
    if (!newCode.trim()) {
      Alert.alert('Invalid Code', 'Please enter a join code.');
      return;
    }
    setSavingCode(true);
    try {
      const res = await api.updateOrgCode(activeOrg.id, newCode.trim());
      if (res.success && res.data?.organization) {
        // Update active org in context with new code
        await setActiveOrg({ ...activeOrg, code: res.data.organization.code });
        setEditingCode(false);
        setNewCode('');
        Alert.alert('Success', `Organization code updated to "${res.data.organization.code}".`);
      } else {
        Alert.alert('Error', res.error || 'Failed to update code.');
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to update code.');
    } finally {
      setSavingCode(false);
    }
  };

  const handleLeaveOrg = () => {
    if (!activeOrg) return;
    Alert.alert(
      'Leave Organization',
      `Are you sure you want to leave "${activeOrg.name}"? You will lose access to all data and features for this organization.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: confirmLeaveOrg,
        },
      ]
    );
  };

  const confirmLeaveOrg = async () => {
    setLeaving(true);
    try {
      const res = await leaveOrganization(activeOrg.id);
      if (res.success) {
        const msg = res.orgDeleted
          ? 'You have left the organization. Since you were the only member, the organization has been deleted.'
          : 'You have successfully left the organization.';
        Alert.alert('Left Organization', msg, [
          { text: 'OK', onPress: () => onNavigate('orgSelect') },
        ]);
      } else {
        Alert.alert('Cannot Leave', res.error || 'Failed to leave organization.');
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to leave organization.');
    } finally {
      setLeaving(false);
    }
  };

  const s = makeStyles(theme);

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle={theme.statusBar} backgroundColor={theme.statusBarBg} />
      <ScrollView contentContainerStyle={[s.scroll, { paddingTop: topInset }]}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => onNavigate(backScreen)} style={s.backBtn}>
            <Text style={s.backBtnText}>{'<'} Back</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Settings</Text>
        </View>

        {/* Appearance */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Appearance</Text>
          <Text style={s.cardSub}>Choose your preferred display theme.</Text>
          <View style={s.themeRow}>
            <View style={s.themeRowLabel}>
              <Text style={s.themeLabel}>{isDark ? 'Dark Mode' : 'Light Mode'}</Text>
              <Text style={s.themeSub}>{isDark ? 'Dark theme active' : 'Light theme active'}</Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: theme.borderMuted, true: '#555555' }}
              thumbColor={isDark ? '#e0e0e0' : '#ffffff'}
              ios_backgroundColor={theme.borderMuted}
            />
          </View>
        </View>

        {/* Account Details */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Account Details</Text>
          <Text style={s.cardRow}>Name: {user ? user.name : ''}</Text>
          <Text style={s.cardRow}>Email: {user ? user.email : ''}</Text>
          <Text style={s.cardRow}>Active Organization: {activeOrg ? activeOrg.name : 'None'}</Text>
          <Text style={s.cardRow}>Organization Role: {activeOrg ? activeOrg.role : 'None'}</Text>
        </View>

        {/* Admin Settings: Organization Join Code */}
        {isAdmin && activeOrg && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Organization Join Code</Text>
            <Text style={s.cardSub}>
              Share this code with members to let them join your organization.
            </Text>

            {editingCode ? (
              <>
                <TextInput
                  style={s.codeInput}
                  value={newCode}
                  onChangeText={(t) => setNewCode(t.toUpperCase())}
                  placeholder="Enter new code (3-24 chars)"
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={24}
                />
                <Text style={s.codeHint}>
                  3-24 characters. Letters, numbers, hyphens, and underscores only.
                </Text>
                <View style={s.codeActionRow}>
                  <TouchableOpacity
                    style={[s.codeBtn, s.codeBtnPrimary]}
                    onPress={handleSaveCode}
                    disabled={savingCode}
                  >
                    {savingCode ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={s.codeBtnPrimaryText}>Save Code</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.codeBtn}
                    onPress={handleCancelEditCode}
                    disabled={savingCode}
                  >
                    <Text style={s.codeBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={s.codeValue}>{activeOrg.code}</Text>
                <View style={s.codeActionRow}>
                  <TouchableOpacity style={s.codeBtn} onPress={handleCopyCode}>
                    <Text style={s.codeBtnText}>Copy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.codeBtn} onPress={handleShareCode}>
                    <Text style={s.codeBtnText}>Share</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.codeBtn} onPress={handleStartEditCode}>
                    <Text style={s.codeBtnText}>Edit</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}


        {/* Leave Organization */}
        {activeOrg && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Organization</Text>
            <Text style={s.cardSub}>
              Leaving will remove your access to all data and features for this organization.
              {isAdmin
                ? ' As an admin, you must promote another member first if you are the sole administrator.'
                : ''}
            </Text>
            <TouchableOpacity
              style={[s.leaveBtn, leaving && s.leaveBtnDisabled]}
              onPress={handleLeaveOrg}
              disabled={leaving}
            >
              {leaving ? (
                <ActivityIndicator color="#ff6b6b" size="small" />
              ) : (
                <Text style={s.leaveBtnText}>Leave Organization</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity onPress={handleSignOut} style={s.signOutBtn}>
          <Text style={s.signOutBtnText}>Sign Out</Text>
        </TouchableOpacity>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>© 2026 IntraLocate. All rights reserved.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    scroll: { paddingHorizontal: 16, paddingBottom: 40 },
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
    },
    backBtnText: { color: theme.text, fontSize: 12, fontWeight: '600' },
    headerTitle: { color: theme.text, fontSize: 16, fontWeight: '800' },
    card: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 6,
      padding: 16,
      backgroundColor: theme.bgCard,
      marginBottom: 16,
    },
    cardTitle: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '700',
      textTransform: 'uppercase',
      marginBottom: 10,
    },
    cardRow: { color: theme.textSub, fontSize: 13, marginBottom: 6 },
    cardSub: { color: theme.textMuted, fontSize: 12, marginBottom: 14 },
    themeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    themeRowLabel: { flex: 1 },
    themeLabel: { color: theme.text, fontSize: 14, fontWeight: '600' },
    themeSub: { color: theme.textMuted, fontSize: 11, marginTop: 2 },
    // Org code
    codeValue: {
      color: theme.text,
      fontSize: 20,
      fontWeight: '800',
      letterSpacing: 2,
      marginBottom: 14,
      fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    },
    codeInput: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 6,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: theme.text,
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 1.5,
      backgroundColor: theme.bg,
      marginBottom: 6,
      fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    },
    codeHint: {
      color: theme.textMuted,
      fontSize: 11,
      marginBottom: 12,
    },
    codeActionRow: {
      flexDirection: 'row',
      gap: 8,
      flexWrap: 'wrap',
    },
    codeBtn: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 5,
      paddingVertical: 8,
      paddingHorizontal: 14,
      backgroundColor: theme.bg,
    },
    codeBtnText: { color: theme.text, fontSize: 12, fontWeight: '600' },
    codeBtnPrimary: {
      backgroundColor: theme.text,
      borderColor: theme.text,
      minWidth: 100,
      alignItems: 'center',
    },
    codeBtnPrimaryText: { color: theme.bg, fontSize: 12, fontWeight: '700' },
    // Leave
    leaveBtn: {
      borderWidth: 1,
      borderColor: '#ff6b6b',
      borderRadius: 6,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 4,
    },
    leaveBtnDisabled: { opacity: 0.5 },
    leaveBtnText: { color: '#ff6b6b', fontSize: 13, fontWeight: '600' },
    // Sign out
    signOutBtn: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 6,
      paddingVertical: 13,
      alignItems: 'center',
      marginTop: 8,
      backgroundColor: theme.bgCard,
    },
    signOutBtnText: { color: theme.text, fontSize: 13, fontWeight: '600' },
    footer: {
      alignItems: 'center',
      paddingVertical: 20,
    },
    footerText: {
      color: theme.textMuted,
      fontSize: 11,
    },
  });
}
