import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function OrgSelectScreen({ onNavigate }) {
  const { user, organizations, setActiveOrg, refreshOrgs, logout } = useAuth();
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const [mode, setMode] = useState(organizations.length > 0 ? 'list' : 'welcome');
  const [loading, setLoading] = useState(false);

  // Create Org Form State
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createSecurity, setCreateSecurity] = useState('');

  // Join Org Form State
  const [joinCode, setJoinCode] = useState('');
  const [joinSecurity, setJoinSecurity] = useState('');

  const handleCreateOrg = async () => {
    if (!createName.trim()) {
      Alert.alert('Name Required', 'Please enter a name for your organization.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.createOrg(createName.trim(), createDesc.trim(), createSecurity.trim());
      if (res.success && res.data?.organization) {
        await refreshOrgs();
        await setActiveOrg(res.data.organization);
        Alert.alert(
          'Organization Created',
          `Organization "${res.data.organization.name}" created.\nInvite code: ${res.data.organization.code}`
        );
      }
    } catch (err) {
      Alert.alert('Creation Failed', err.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinOrg = async () => {
    if (!joinCode.trim()) {
      Alert.alert('Code Required', 'Please enter the organization code.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.joinOrg(joinCode.trim().toUpperCase(), joinSecurity.trim());
      if (res.success && res.data?.organization) {
        await refreshOrgs();
        await setActiveOrg(res.data.organization);
        Alert.alert('Joined Organization', `You joined "${res.data.organization.name}" as a Normal User.`);
      }
    } catch (err) {
      Alert.alert('Join Failed', err.message || 'Invalid code or wrong passphrase.');
    } finally {
      setLoading(false);
    }
  };

  const topInset = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 44;

  const renderRoleLabel = (role) => {
    if (role === 'ADMIN') return 'Admin';
    if (role === 'CONTRIBUTOR') return 'Contributor';
    return 'User';
  };

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle={theme.statusBar} backgroundColor={theme.statusBarBg} />
      <ScrollView contentContainerStyle={[s.scroll, { paddingTop: topInset }]}>
        {/* Top Navbar */}
        <View style={s.topBar}>
          <View>
            <Text style={s.brandTitle}>INTRALOCATE</Text>
            <Text style={s.userEmail}>{user?.name} ({user?.email})</Text>
          </View>
          <TouchableOpacity onPress={logout} style={s.signOutBtn}>
            <Text style={s.signOutBtnText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* View Mode: List */}
        {mode === 'list' && (
          <View>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Your Organizations</Text>
              <Text style={s.sectionDesc}>Select an organization to enter your workspace.</Text>
            </View>

            <View style={s.orgList}>
              {organizations.map((org) => (
                <TouchableOpacity
                  key={org.id}
                  style={s.orgCard}
                  onPress={() => setActiveOrg(org)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.orgName}>{org.name}</Text>
                    <Text style={s.orgCode}>Code: {org.code}</Text>
                  </View>
                  <View style={s.roleBadge}>
                    <Text style={s.roleBadgeText}>{renderRoleLabel(org.role)}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.bottomActions}>
              <TouchableOpacity
                style={s.actionBtn}
                onPress={() => setMode('join')}
              >
                <Text style={s.actionBtnText}>+ Join with Code</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.actionBtnSecondary}
                onPress={() => setMode('create')}
              >
                <Text style={s.actionBtnSecondaryText}>+ Create Organization</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* View Mode: Welcome (no orgs) */}
        {mode === 'welcome' && (
          <View>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Get Started</Text>
              <Text style={s.sectionDesc}>You do not belong to any organizations yet. Join one or create a new one.</Text>
            </View>

            <View style={s.bottomActions}>
              <TouchableOpacity
                style={s.primaryBtn}
                onPress={() => setMode('join')}
              >
                <Text style={s.primaryBtnText}>Join with Code</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.secondaryBtn}
                onPress={() => setMode('create')}
              >
                <Text style={s.secondaryBtnText}>Create Organization</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* View Mode: Join */}
        {mode === 'join' && (
          <View>
            <TouchableOpacity onPress={() => setMode(organizations.length > 0 ? 'list' : 'welcome')} style={s.backLink}>
              <Text style={s.backLinkText}>&lt; Back to Organizations</Text>
            </TouchableOpacity>

            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Join Organization</Text>
              <Text style={s.sectionDesc}>Enter the 6-character code provided by your organization admin.</Text>
            </View>

            <View style={s.form}>
              <View style={s.inputGroup}>
                <Text style={s.label}>Organization Code</Text>
                <TextInput
                  style={s.input}
                  value={joinCode}
                  onChangeText={setJoinCode}
                  placeholder="ORG-XXXXXX"
                  placeholderTextColor={theme.textPlaceholder}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              </View>

              <View style={s.inputGroup}>
                <Text style={s.label}>Security Passphrase (if required)</Text>
                <TextInput
                  style={s.input}
                  value={joinSecurity}
                  onChangeText={setJoinSecurity}
                  placeholder="Optional passphrase"
                  placeholderTextColor={theme.textPlaceholder}
                  secureTextEntry
                />
              </View>

              <TouchableOpacity
                style={s.primaryBtn}
                onPress={handleJoinOrg}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={theme.textBtnPrimary} size="small" />
                ) : (
                  <Text style={s.primaryBtnText}>Join Organization</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* View Mode: Create */}
        {mode === 'create' && (
          <View>
            <TouchableOpacity onPress={() => setMode(organizations.length > 0 ? 'list' : 'welcome')} style={s.backLink}>
              <Text style={s.backLinkText}>&lt; Back to Organizations</Text>
            </TouchableOpacity>

            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Create Organization</Text>
              <Text style={s.sectionDesc}>You will become the Admin of this organization.</Text>
            </View>

            <View style={s.form}>
              <View style={s.inputGroup}>
                <Text style={s.label}>Organization Name</Text>
                <TextInput
                  style={s.input}
                  value={createName}
                  onChangeText={setCreateName}
                  placeholder="e.g. Science Complex"
                  placeholderTextColor={theme.textPlaceholder}
                />
              </View>

              <View style={s.inputGroup}>
                <Text style={s.label}>Description (optional)</Text>
                <TextInput
                  style={s.input}
                  value={createDesc}
                  onChangeText={setCreateDesc}
                  placeholder="Short description"
                  placeholderTextColor={theme.textPlaceholder}
                />
              </View>

              <View style={s.inputGroup}>
                <Text style={s.label}>Join Passphrase (optional)</Text>
                <TextInput
                  style={s.input}
                  value={createSecurity}
                  onChangeText={setCreateSecurity}
                  placeholder="Optional security passphrase for joiners"
                  placeholderTextColor={theme.textPlaceholder}
                  secureTextEntry
                />
              </View>

              <TouchableOpacity
                style={s.primaryBtn}
                onPress={handleCreateOrg}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={theme.textBtnPrimary} size="small" />
                ) : (
                  <Text style={s.primaryBtnText}>Create Organization</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={{ alignItems: 'center', marginTop: 24, paddingBottom: 16 }}>
          <Text style={{ color: theme.textMuted, fontSize: 11 }}>© 2026 IntraLocate. All rights reserved.</Text>
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
      marginBottom: 24,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderMuted,
      paddingBottom: 12,
    },
    brandTitle: {
      color: theme.text,
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: 1,
    },
    userEmail: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    signOutBtn: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingVertical: 6,
      paddingHorizontal: 10,
      backgroundColor: theme.bgBtnSecondary,
    },
    signOutBtnText: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '600',
    },
    sectionHeader: {
      marginBottom: 16,
    },
    sectionTitle: {
      color: theme.text,
      fontSize: 20,
      fontWeight: '700',
    },
    sectionDesc: {
      color: theme.textMuted,
      fontSize: 13,
      marginTop: 4,
    },
    orgList: {
      gap: 10,
      marginBottom: 20,
    },
    orgCard: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      padding: 14,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: theme.bgCard,
    },
    orgName: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '700',
    },
    orgCode: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    roleBadge: {
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 4,
      backgroundColor: theme.bgBadgeActive,
    },
    roleBadgeText: {
      color: theme.textBtnPrimary,
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    bottomActions: {
      gap: 10,
      marginTop: 8,
    },
    actionBtn: {
      backgroundColor: theme.bgBtnPrimary,
      borderRadius: 4,
      paddingVertical: 12,
      alignItems: 'center',
    },
    actionBtnText: {
      color: theme.textBtnPrimary,
      fontSize: 14,
      fontWeight: '600',
    },
    actionBtnSecondary: {
      backgroundColor: theme.bgBtnSecondary,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingVertical: 12,
      alignItems: 'center',
    },
    actionBtnSecondaryText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '600',
    },
    backLink: {
      marginBottom: 16,
    },
    backLinkText: {
      color: theme.textLink,
      fontSize: 13,
      fontWeight: '600',
    },
    form: {
      gap: 14,
      marginTop: 8,
    },
    inputGroup: {
      gap: 6,
    },
    label: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '600',
    },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: theme.text,
      backgroundColor: theme.bgInput,
    },
    primaryBtn: {
      backgroundColor: theme.bgBtnPrimary,
      borderRadius: 4,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 8,
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
      paddingVertical: 14,
      alignItems: 'center',
    },
    secondaryBtnText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '600',
    },
  });
}
