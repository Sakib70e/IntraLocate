import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { theme } from '../utils/theme';

export default function ProfileScreen({ onNavigate }) {
  const { user, activeOrg, organizations, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out of IntraLocate?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const topInset = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 44;

  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.surface} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topInset }]}>
        <TouchableOpacity
          onPress={() => onNavigate(activeOrg?.role === 'ADMIN' ? 'adminDashboard' : 'memberDashboard')}
          style={styles.backBtn}
        >
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>User Profile</Text>
        <TouchableOpacity onPress={() => onNavigate('settings')} style={styles.iconBtn}>
          <Text style={styles.iconBtnText}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* User Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(user?.name)}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.userName}>{user?.name || 'Authorized Member'}</Text>
            <Text style={styles.userEmail}>{user?.email || '-'}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>
                {activeOrg?.role === 'ADMIN' ? '👑 Workspace Administrator' : '👤 Workspace Contributor'}
              </Text>
            </View>
          </View>
        </View>

        {/* Current Active Workspace */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>ACTIVE WORKSPACE</Text>
          <View style={styles.itemRow}>
            <Text style={styles.itemLabel}>Organization</Text>
            <Text style={styles.itemValue}>{activeOrg?.name || 'None'}</Text>
          </View>
          <View style={styles.itemRow}>
            <Text style={styles.itemLabel}>Join Code</Text>
            <Text style={[styles.itemValue, styles.codeText]}>{activeOrg?.code || '-'}</Text>
          </View>
          <View style={styles.itemRow}>
            <Text style={styles.itemLabel}>Role in Org</Text>
            <Text style={styles.itemValue}>{activeOrg?.role || 'MEMBER'}</Text>
          </View>
          <TouchableOpacity
            style={styles.actionBtnOutline}
            onPress={() => onNavigate('orgSelect')}
          >
            <Text style={styles.actionBtnOutlineText}>Switch Organization</Text>
          </TouchableOpacity>
        </View>

        {/* Workspace Memberships */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>YOUR MEMBERSHIPS ({organizations.length})</Text>
          {organizations.map((org) => (
            <View key={org.id} style={styles.membershipRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.membershipName}>{org.name}</Text>
                <Text style={styles.membershipRole}>
                  {org.role === 'ADMIN' ? 'Administrator' : 'Contributor'} · Code: {org.code}
                </Text>
              </View>
              {org.id === activeOrg?.id ? (
                <View style={styles.activeTag}>
                  <Text style={styles.activeTagText}>Active</Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutBtnText}>Sign Out of IntraLocate</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceContainerHigh,
    backgroundColor: theme.colors.surface,
  },
  backBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceContainerHigh,
  },
  backBtnText: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  headerTitle: {
    color: theme.colors.onSurface,
    fontSize: 16,
    fontWeight: '700',
  },
  iconBtn: {
    padding: 6,
  },
  iconBtnText: {
    fontSize: 18,
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },
  profileCard: {
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.colors.surfaceContainerHigh,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: theme.colors.onPrimaryContainer,
    fontSize: 22,
    fontWeight: '800',
  },
  profileInfo: {
    flex: 1,
    gap: 3,
  },
  userName: {
    color: theme.colors.onSurface,
    fontSize: 18,
    fontWeight: '700',
  },
  userEmail: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 13,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.surfaceContainerHighest,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  roleBadgeText: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: '600',
  },
  sectionCard: {
    backgroundColor: theme.colors.surfaceContainerLow,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.surfaceContainerHigh,
    gap: 10,
  },
  sectionTitle: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceContainer,
  },
  itemLabel: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 13,
  },
  itemValue: {
    color: theme.colors.onSurface,
    fontSize: 13,
    fontWeight: '600',
  },
  codeText: {
    color: theme.colors.tertiary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
  },
  urlText: {
    color: theme.colors.primary,
    maxWidth: '60%',
  },
  actionBtnOutline: {
    marginTop: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.surfaceContainerHighest,
    alignItems: 'center',
  },
  actionBtnOutlineText: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  membershipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceContainer,
  },
  membershipName: {
    color: theme.colors.onSurface,
    fontSize: 14,
    fontWeight: '600',
  },
  membershipRole: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 12,
    marginTop: 2,
  },
  activeTag: {
    backgroundColor: 'rgba(86, 229, 169, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  activeTagText: {
    color: theme.colors.tertiary,
    fontSize: 11,
    fontWeight: '700',
  },
  logoutBtn: {
    backgroundColor: 'rgba(255, 180, 171, 0.12)',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 171, 0.3)',
    marginTop: 8,
  },
  logoutBtnText: {
    color: theme.colors.error,
    fontSize: 14,
    fontWeight: '700',
  },
});
