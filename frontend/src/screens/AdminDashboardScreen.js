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
  Alert,
  TextInput,
  Modal,
  Share,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function AdminDashboardScreen({ onNavigate }) {
  const { user, activeOrg, setActiveOrg } = useAuth();
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const [activeTab, setActiveTab] = useState('spaces'); // 'spaces' | 'users' | 'members' | 'tools'
  const [loading, setLoading] = useState(true);

  // Overview Data
  const [sites, setSites] = useState([]);
  const [members, setMembers] = useState([]);
  const [trackedSignals, setTrackedSignals] = useState([]);
  const [orgUsers, setOrgUsers] = useState([]);
  const [userStats, setUserStats] = useState({ total: 0, online: 0, offline: 0, activeTracking: 0 });
  const [lastSyncTime, setLastSyncTime] = useState(null);

  // Search and Filter for Users Tab
  const [userSearchText, setUserSearchText] = useState('');
  const [userFilter, setUserFilter] = useState('all'); // 'all' | 'online' | 'offline'

  // Search for Contributors Tab
  const [contributorSearchText, setContributorSearchText] = useState('');

  // Modals for Building (Site)
  const [siteModalVisible, setSiteModalVisible] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  const [siteName, setSiteName] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [siteDesc, setSiteDesc] = useState('');

  // Modals for Floor
  const [floorModalVisible, setFloorModalVisible] = useState(false);
  const [floorTargetSiteId, setFloorTargetSiteId] = useState(null);
  const [editingFloor, setEditingFloor] = useState(null);
  const [floorName, setFloorName] = useState('');
  const [floorNumber, setFloorNumber] = useState('1');

  // Modals for Room
  const [roomModalVisible, setRoomModalVisible] = useState(false);
  const [roomTargetFloorId, setRoomTargetFloorId] = useState(null);
  const [editingRoom, setEditingRoom] = useState(null);
  const [roomName, setRoomName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [roomDesc, setRoomDesc] = useState('');

  // Expanded site and floor IDs for accordion (rooms are non-expandable)
  const [expandedSites, setExpandedSites] = useState({});
  const [expandedFloors, setExpandedFloors] = useState({});

  useEffect(() => {
    loadDashboardData();
  }, [activeOrg]);

  const loadDashboardData = async () => {
    if (!activeOrg?.id) return;
    setLoading(true);
    try {
      const [sitesRes, overviewRes, trackingRes, usersRes] = await Promise.all([
        api.getSites(activeOrg.id),
        api.getOrgOverview(activeOrg.id),
        api.getTrackingSignals(activeOrg.id).catch(() => ({ success: true, data: [] })),
        api.getOrgUsers(activeOrg.id).catch(() => ({ success: true, data: [] })),
      ]);

      if (sitesRes.success && Array.isArray(sitesRes.data)) {
        setSites(sitesRes.data);
        // Expand first site and its first floor by default if not set
        if (sitesRes.data.length > 0 && Object.keys(expandedSites).length === 0) {
          setExpandedSites({ [sitesRes.data[0].id]: true });
          const firstFloor = sitesRes.data[0]?.floors?.[0];
          if (firstFloor) {
            setExpandedFloors({ [firstFloor.id]: true });
          }
        }
      }

      if (overviewRes.success && overviewRes.data?.members) {
        setMembers(overviewRes.data.members);
      }

      if (trackingRes.success && Array.isArray(trackingRes.data)) {
        setTrackedSignals(trackingRes.data);
      }

      if (usersRes.success && Array.isArray(usersRes.data)) {
        setOrgUsers(usersRes.data);
        if (usersRes.stats) {
          setUserStats(usersRes.stats);
        }
      }
      setLastSyncTime(new Date().toLocaleTimeString());
    } catch (e) {
      console.log('Error loading dashboard data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (!activeOrg?.code) return;
    try {
      await Clipboard.setStringAsync(activeOrg.code);
      Alert.alert('Copied', `Organization join code "${activeOrg.code}" copied to clipboard.`);
    } catch (e) {
      Alert.alert('Error', 'Failed to copy join code.');
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

  const toggleExpandSite = (siteId) => {
    setExpandedSites((prev) => ({
      ...prev,
      [siteId]: !prev[siteId],
    }));
  };

  const toggleExpandFloor = (floorId) => {
    setExpandedFloors((prev) => ({
      ...prev,
      [floorId]: !prev[floorId],
    }));
  };

  // --- Building (Site) CRUD ---
  const openAddSiteModal = () => {
    setEditingSite(null);
    setSiteName('');
    setSiteAddress('');
    setSiteDesc('');
    setSiteModalVisible(true);
  };

  const openEditSiteModal = (site) => {
    setEditingSite(site);
    setSiteName(site.name || '');
    setSiteAddress(site.address || '');
    setSiteDesc(site.description || '');
    setSiteModalVisible(true);
  };

  const handleSaveSite = async () => {
    if (!siteName.trim()) {
      Alert.alert('Required', 'Please enter a building name.');
      return;
    }
    try {
      if (editingSite) {
        await api.updateSite(editingSite.id, {
          name: siteName.trim(),
          address: siteAddress.trim(),
          description: siteDesc.trim(),
        });
      } else {
        await api.createSite(activeOrg.id, siteName.trim(), siteDesc.trim(), siteAddress.trim());
      }
      setSiteModalVisible(false);
      loadDashboardData();
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to save building.');
    }
  };

  const handleDeleteSite = (site) => {
    Alert.alert(
      'Delete Building',
      `Are you sure you want to delete "${site.name}"? All nested floors, rooms, and collected samples will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteSite(site.id);
              loadDashboardData();
            } catch (e) {
              Alert.alert('Error', e.message || 'Failed to delete building.');
            }
          },
        },
      ]
    );
  };

  // --- Floor CRUD ---
  const openAddFloorModal = (siteId) => {
    setFloorTargetSiteId(siteId);
    setEditingFloor(null);
    setFloorName('');
    setFloorNumber('1');
    setFloorModalVisible(true);
  };

  const openEditFloorModal = (floor) => {
    setEditingFloor(floor);
    setFloorTargetSiteId(floor.siteId);
    setFloorName(floor.name || '');
    setFloorNumber(String(floor.floorNumber || '1'));
    setFloorModalVisible(true);
  };

  const handleSaveFloor = async () => {
    if (!floorName.trim()) {
      Alert.alert('Required', 'Please enter a floor name.');
      return;
    }
    try {
      if (editingFloor) {
        await api.updateFloor(editingFloor.id, {
          name: floorName.trim(),
          floorNumber: parseInt(floorNumber, 10) || 1,
        });
      } else {
        await api.createFloor(floorTargetSiteId, floorName.trim(), parseInt(floorNumber, 10) || 1);
      }
      setFloorModalVisible(false);
      loadDashboardData();
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to save floor.');
    }
  };

  const handleDeleteFloor = (floor) => {
    Alert.alert(
      'Delete Floor',
      `Delete floor "${floor.name}" and all its rooms?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteFloor(floor.id);
              loadDashboardData();
            } catch (e) {
              Alert.alert('Error', e.message || 'Failed to delete floor.');
            }
          },
        },
      ]
    );
  };

  // --- Room CRUD ---
  const openAddRoomModal = (floorId) => {
    setRoomTargetFloorId(floorId);
    setEditingRoom(null);
    setRoomName('');
    setRoomCode('');
    setRoomDesc('');
    setRoomModalVisible(true);
  };

  const openEditRoomModal = (room) => {
    setEditingRoom(room);
    setRoomTargetFloorId(room.floorId);
    setRoomName(room.name || '');
    setRoomCode(room.code || '');
    setRoomDesc(room.description || '');
    setRoomModalVisible(true);
  };

  const handleSaveRoom = async () => {
    if (!roomName.trim()) {
      Alert.alert('Required', 'Please enter a room name.');
      return;
    }
    try {
      if (editingRoom) {
        await api.updateRoom(editingRoom.id, {
          name: roomName.trim(),
          code: roomCode.trim(),
          description: roomDesc.trim(),
        });
      } else {
        await api.createRoom(roomTargetFloorId, roomName.trim(), roomCode.trim(), roomDesc.trim());
      }
      setRoomModalVisible(false);
      loadDashboardData();
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to save room.');
    }
  };

  const handleDeleteRoom = (room) => {
    Alert.alert(
      'Delete Room',
      `Delete room "${room.name}" and its collected fingerprint samples?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteRoom(room.id);
              loadDashboardData();
            } catch (e) {
              Alert.alert('Error', e.message || 'Failed to delete room.');
            }
          },
        },
      ]
    );
  };

  // --- Member Management ---
  const handleRemoveMember = (member) => {
    Alert.alert(
      'Remove Member',
      `Remove ${member.name} (${member.email}) from this organization?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.removeMember(activeOrg.id, member.id);
              loadDashboardData();
            } catch (e) {
              Alert.alert('Error', e.message || 'Failed to remove member.');
            }
          },
        },
      ]
    );
  };

  const handleRefreshAll = async () => {
    try {
      setLoading(true);
      // Fetch latest stored device, permission, overview and user data directly from backend
      const [sitesRes, overviewRes, trackingRes, usersRes] = await Promise.all([
        api.getSites(activeOrg.id).catch(() => ({ success: false })),
        api.getOrgOverview(activeOrg.id).catch(() => ({ success: false })),
        api.getTrackingSignals(activeOrg.id).catch(() => ({ success: true, data: [] })),
        api.getOrgUsers(activeOrg.id).catch(() => ({ success: true, data: [] })),
      ]);

      if (sitesRes.success && Array.isArray(sitesRes.data)) {
        setSites(sitesRes.data);
      }
      if (overviewRes.success && overviewRes.data?.members) {
        setMembers(overviewRes.data.members);
      }
      if (trackingRes.success && Array.isArray(trackingRes.data)) {
        setTrackedSignals(trackingRes.data);
      }
      if (usersRes.success && Array.isArray(usersRes.data)) {
        setOrgUsers(usersRes.data);
        if (usersRes.stats) {
          setUserStats(usersRes.stats);
        }
      }
      setLastSyncTime(new Date().toLocaleTimeString());
    } catch (e) {
      Alert.alert('Refresh Error', e.message || 'Failed to refresh data.');
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
            <Text style={s.roleLabel}>Admin Workspace</Text>
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

        {/* Organization Invite Code Card */}
        <View style={s.codeCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.codeLabel}>Organization Join Code</Text>
            <Text style={s.codeValue}>{activeOrg?.code}</Text>
            {lastSyncTime ? (
              <Text style={s.syncTimeText}>Last synchronized: {lastSyncTime}</Text>
            ) : null}
          </View>
          <View style={s.codeActionsRow}>
            <TouchableOpacity style={s.codeBtn} onPress={handleCopyCode}>
              <Text style={s.codeBtnText}>Copy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.codeBtn} onPress={handleShareCode}>
              <Text style={s.codeBtnText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.refreshBtn} onPress={handleRefreshAll}>
              <Text style={s.refreshBtnText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Segmented Navigation Tabs */}
        <View style={s.tabBar}>
          <TouchableOpacity
            style={[s.tabItem, activeTab === 'spaces' && s.tabItemActive]}
            onPress={() => setActiveTab('spaces')}
          >
            <Text style={[s.tabText, activeTab === 'spaces' && s.tabTextActive]}>
              Spaces
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.tabItem, activeTab === 'users' && s.tabItemActive]}
            onPress={() => setActiveTab('users')}
          >
            <Text style={[s.tabText, activeTab === 'users' && s.tabTextActive]}>
              Users ({orgUsers.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.tabItem, activeTab === 'members' && s.tabItemActive]}
            onPress={() => setActiveTab('members')}
          >
            <Text style={[s.tabText, activeTab === 'members' && s.tabTextActive]}>
              Contributors ({members.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.tabItem, activeTab === 'tools' && s.tabItemActive]}
            onPress={() => setActiveTab('tools')}
          >
            <Text style={[s.tabText, activeTab === 'tools' && s.tabTextActive]}>
              Tools & Data
            </Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={theme.spinner} size="small" style={{ marginVertical: 20 }} />
        ) : (
          <>
            {/* TAB 1: SPACES MANAGEMENT (BUILDINGS, FLOORS, ROOMS) */}
            {activeTab === 'spaces' && (
              <View>
                <View style={s.sectionHeaderRow}>
                  <Text style={s.sectionTitle}>Buildings & Spaces</Text>
                  <TouchableOpacity style={s.actionBtn} onPress={openAddSiteModal}>
                    <Text style={s.actionBtnText}>+ Add Building</Text>
                  </TouchableOpacity>
                </View>

                {sites.length === 0 ? (
                  <View style={s.emptyCard}>
                    <Text style={s.emptyText}>No buildings added yet. Add a building to start.</Text>
                  </View>
                ) : (
                  sites.map((site) => {
                    const isExpanded = !!expandedSites[site.id];
                    return (
                      <View key={site.id} style={s.buildingCard}>
                        <View style={s.buildingHeader}>
                          <TouchableOpacity
                            style={{ flex: 1 }}
                            onPress={() => toggleExpandSite(site.id)}
                          >
                            <Text style={s.buildingTitle}>
                              {isExpanded ? '[-] ' : '[+] '}
                              {site.name}
                            </Text>
                            {site.address ? (
                              <Text style={s.buildingSubtitle}>{site.address}</Text>
                            ) : null}
                          </TouchableOpacity>
                          <View style={s.btnRow}>
                            <TouchableOpacity
                              style={s.smallOutlineBtn}
                              onPress={() => openEditSiteModal(site)}
                            >
                              <Text style={s.smallOutlineBtnText}>Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={s.smallOutlineBtn}
                              onPress={() => handleDeleteSite(site)}
                            >
                              <Text style={s.smallOutlineBtnText}>Delete</Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* Collapsible content: Floors & Rooms */}
                        {isExpanded && (
                          <View style={s.floorsWrap}>
                            <View style={s.floorHeaderRow}>
                              <Text style={s.floorSectionTitle}>Floors</Text>
                              <TouchableOpacity
                                style={s.smallBtn}
                                onPress={() => openAddFloorModal(site.id)}
                              >
                                <Text style={s.smallBtnText}>+ Floor</Text>
                              </TouchableOpacity>
                            </View>

                            {(!site.floors || site.floors.length === 0) ? (
                              <Text style={s.mutedText}>No floors in this building yet.</Text>
                            ) : (
                              site.floors.map((floor) => {
                                const isFloorExpanded = !!expandedFloors[floor.id];
                                return (
                                  <View key={floor.id} style={s.floorCard}>
                                    <View style={s.floorTitleRow}>
                                      <TouchableOpacity
                                        style={{ flex: 1 }}
                                        onPress={() => toggleExpandFloor(floor.id)}
                                      >
                                        <Text style={s.floorName}>
                                          {isFloorExpanded ? '[-] ' : '[+] '}
                                          {floor.name} (Level {floor.floorNumber})
                                        </Text>
                                      </TouchableOpacity>
                                      <View style={s.btnRow}>
                                        <TouchableOpacity
                                          style={s.smallOutlineBtn}
                                          onPress={() => openEditFloorModal(floor)}
                                        >
                                          <Text style={s.smallOutlineBtnText}>Edit</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                          style={s.smallOutlineBtn}
                                          onPress={() => handleDeleteFloor(floor)}
                                        >
                                          <Text style={s.smallOutlineBtnText}>Delete</Text>
                                        </TouchableOpacity>
                                      </View>
                                    </View>

                                    {/* Rooms on this Floor (Collapsible floor container, non-expandable room items) */}
                                    {isFloorExpanded && (
                                      <View style={s.roomsContainer}>
                                        <View style={s.roomHeaderRow}>
                                          <Text style={s.roomSectionTitle}>Rooms</Text>
                                          <TouchableOpacity
                                            style={s.smallBtn}
                                            onPress={() => openAddRoomModal(floor.id)}
                                          >
                                            <Text style={s.smallBtnText}>+ Room</Text>
                                          </TouchableOpacity>
                                        </View>

                                        {(!floor.rooms || floor.rooms.length === 0) ? (
                                          <Text style={s.mutedText}>No rooms on this floor.</Text>
                                        ) : (
                                          floor.rooms.map((room) => (
                                            <View key={room.id} style={s.roomWrapper}>
                                              <View style={s.roomRow}>
                                                <View style={{ flex: 1 }}>
                                                  <Text style={s.roomName}>{room.name}</Text>
                                                  {room.code ? (
                                                    <Text style={s.roomCode}>Code: {room.code}</Text>
                                                  ) : null}
                                                </View>
                                                <View style={s.btnRow}>
                                                  <TouchableOpacity
                                                    style={s.smallOutlineBtn}
                                                    onPress={() => openEditRoomModal(room)}
                                                  >
                                                    <Text style={s.smallOutlineBtnText}>Edit</Text>
                                                  </TouchableOpacity>
                                                  <TouchableOpacity
                                                    style={s.smallOutlineBtn}
                                                    onPress={() => handleDeleteRoom(room)}
                                                  >
                                                    <Text style={s.smallOutlineBtnText}>Delete</Text>
                                                  </TouchableOpacity>
                                                </View>
                                              </View>
                                            </View>
                                          ))
                                        )}
                                      </View>
                                    )}
                                  </View>
                                );
                              })
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {/* TAB: USERS TAB (ONLY USER NAME, ONLINE/OFFLINE, LOCATION PERMISSION, BACKGROUND PERMISSION) */}
            {activeTab === 'users' && (
              <View>
                <View style={s.sectionHeaderRow}>
                  <Text style={s.sectionTitle}>Organization Users ({orgUsers.length})</Text>
                  <TouchableOpacity style={s.actionBtn} onPress={handleRefreshAll}>
                    <Text style={s.actionBtnText}>Refresh</Text>
                  </TouchableOpacity>
                </View>

                {/* Name Search Bar */}
                <View style={s.searchBarContainer}>
                  <TextInput
                    style={s.searchInput}
                    placeholder="Search users by name..."
                    placeholderTextColor={theme.textMuted}
                    value={userSearchText}
                    onChangeText={setUserSearchText}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {userSearchText ? (
                    <TouchableOpacity onPress={() => setUserSearchText('')} style={s.searchClearBtn}>
                      <Text style={s.searchClearText}>✕</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* Online / Offline Filter Pills */}
                <View style={s.filterPillsRow}>
                  <TouchableOpacity
                    style={[s.filterPill, userFilter === 'all' && s.filterPillActive]}
                    onPress={() => setUserFilter('all')}
                  >
                    <Text style={[s.filterPillText, userFilter === 'all' && s.filterPillTextActive]}>
                      All ({orgUsers.length})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.filterPill, userFilter === 'online' && s.filterPillActive]}
                    onPress={() => setUserFilter('online')}
                  >
                    <Text style={[s.filterPillText, userFilter === 'online' && s.filterPillTextActive]}>
                      Online ({userStats.online})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.filterPill, userFilter === 'offline' && s.filterPillActive]}
                    onPress={() => setUserFilter('offline')}
                  >
                    <Text style={[s.filterPillText, userFilter === 'offline' && s.filterPillTextActive]}>
                      Offline ({userStats.offline})
                    </Text>
                  </TouchableOpacity>
                </View>

                {(() => {
                  const filteredUsers = orgUsers.filter((u) => {
                    const matchesSearch = !userSearchText || (u.name || '').toLowerCase().includes(userSearchText.toLowerCase());
                    if (!matchesSearch) return false;
                    if (userFilter === 'online') return !!u.isOnline;
                    if (userFilter === 'offline') return !u.isOnline;
                    return true;
                  });

                  if (filteredUsers.length === 0) {
                    return (
                      <View style={s.emptyCard}>
                        <Text style={s.emptyText}>
                          {userSearchText || userFilter !== 'all'
                            ? 'No users match the search or filter.'
                            : 'No users registered in this organization yet.'}
                        </Text>
                      </View>
                    );
                  }

                  return filteredUsers.map((u) => {
                    const isOnline = !!u.isOnline;
                    const userSignal = trackedSignals.find(
                      (ts) => ts.userId === u.userId || ts.userId === u.id
                    );
                    const loc = u.lastLocalization || userSignal?.detectedRoom || null;

                    let locationString = 'Location not detected yet';
                    if (loc && (loc.roomName || loc.floorName || loc.siteName)) {
                      const parts = [];
                      if (loc.roomName) parts.push(loc.roomName);
                      if (loc.floorName) parts.push(loc.floorName);
                      if (loc.siteName) parts.push(loc.siteName);
                      locationString = parts.join(' • ');
                      if (loc.confidence != null) {
                        locationString += ` (${Math.round(loc.confidence)}% match)`;
                      }
                    }

                    return (
                      <View key={u.id} style={s.simpleUserCard}>
                        <View style={s.simpleUserHeader}>
                          <Text style={s.simpleUserName}>{u.name}</Text>
                          <View style={[s.statusBadge, isOnline ? s.statusOnline : s.statusOffline]}>
                            <Text style={[s.statusBadgeText, isOnline ? s.statusOnlineText : s.statusOfflineText]}>
                              {isOnline ? '● Online' : '○ Offline'}
                            </Text>
                          </View>
                        </View>
                        <View style={s.simpleLocRow}>
                          <Text style={s.simpleLocLabel}>Location:</Text>
                          <Text style={[s.simpleLocValue, !loc && { color: theme.textMuted, fontStyle: 'italic' }]}>
                            {locationString}
                          </Text>
                        </View>
                      </View>
                    );
                  });
                })()}
              </View>
            )}

            {/* TAB 3: MEMBERS & CONTRIBUTORS */}
            {activeTab === 'members' && (
              <View>
                <View style={s.sectionHeaderRow}>
                  <Text style={s.sectionTitle}>Organization Contributors</Text>
                  <Text style={s.mutedText}>{members.length} contributor(s)</Text>
                </View>

                {/* Name Search Bar for Contributors */}
                <View style={s.searchBarContainer}>
                  <TextInput
                    style={s.searchInput}
                    placeholder="Search contributors by name..."
                    placeholderTextColor={theme.textMuted}
                    value={contributorSearchText}
                    onChangeText={setContributorSearchText}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {contributorSearchText ? (
                    <TouchableOpacity onPress={() => setContributorSearchText('')} style={s.searchClearBtn}>
                      <Text style={s.searchClearText}>✕</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {(() => {
                  const filteredMembers = members.filter((m) => {
                    return !contributorSearchText || (m.name || '').toLowerCase().includes(contributorSearchText.toLowerCase());
                  });

                  if (filteredMembers.length === 0) {
                    return (
                      <View style={s.emptyCard}>
                        <Text style={s.emptyText}>
                          {contributorSearchText ? 'No contributors match the search.' : 'No contributors found.'}
                        </Text>
                      </View>
                    );
                  }

                  return (
                    <View style={s.membersList}>
                      {filteredMembers.map((m) => (
                        <View key={m.id} style={s.memberCard}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.memberName}>{m.name}</Text>
                            <Text style={s.memberEmail}>{m.email}</Text>
                            <Text style={s.memberRole}>Role: {m.role}</Text>
                          </View>
                          {m.userId !== user?.id && (
                            <View style={s.btnRow}>
                              <TouchableOpacity
                                style={s.smallOutlineBtn}
                                onPress={() => handleRemoveMember(m)}
                              >
                                <Text style={s.smallOutlineBtnText}>Remove</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      ))}
                    </View>
                  );
                })()}

                {/* Tracked Users Live Telemetry */}
                <View style={{ marginTop: 20 }}>
                  <View style={s.sectionHeaderRow}>
                    <Text style={s.sectionTitle}>Live Tracking Devices</Text>
                    <TouchableOpacity style={s.actionBtn} onPress={handleRefreshAll}>
                      <Text style={s.actionBtnText}>Refresh Locations</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={s.mutedText}>Signals received from users who granted tracking:</Text>

                  {trackedSignals.length === 0 ? (
                    <View style={[s.emptyCard, { marginTop: 8 }]}>
                      <Text style={s.emptyText}>No users are currently transmitting tracking signals.</Text>
                    </View>
                  ) : (
                    trackedSignals.map((ts) => {
                      const isConnected = !!ts.enabled && (Date.now() - new Date(ts.updatedAt).getTime() < 60000);
                      return (
                        <View key={ts.userId} style={[s.memberCard, { marginTop: 8 }]}>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text style={s.memberName}>{ts.userName} ({ts.userEmail})</Text>
                              <View style={[s.roleBadge, { backgroundColor: isConnected ? '#10b981' : '#64748b' }]}>
                                <Text style={[s.roleBadgeText, { color: '#ffffff', fontSize: 10 }]}>
                                  {isConnected ? 'Connected' : 'Disconnected'}
                                </Text>
                              </View>
                            </View>
                            <Text style={s.memberRole}>APs: {ts.apsCount} networks detected • Mode: {ts.mode || 'background'}</Text>
                            {ts.detectedRoom ? (
                              <Text style={s.memberEmail}>
                                {isConnected ? 'Location: ' : 'Last Known: '}
                                {ts.detectedRoom.roomName}
                                {ts.detectedRoom.floorName ? `, ${ts.detectedRoom.floorName}` : ''}
                                {ts.detectedRoom.confidence != null ? ` (${Math.round(ts.detectedRoom.confidence)}% conf)` : ''}
                              </Text>
                            ) : (
                              <Text style={[s.memberEmail, { color: '#94a3b8' }]}>
                                Location: {isConnected ? 'Undetermined (No matching room found)' : 'Unknown (Offline)'}
                              </Text>
                            )}
                            <Text style={[s.memberEmail, { color: isConnected ? '#10b981' : '#94a3b8', fontWeight: '600' }]}>
                              {isConnected ? '● Live Location Active' : '○ Standby / Offline'}
                            </Text>
                            <Text style={s.mutedText}>Last Seen: {new Date(ts.updatedAt).toLocaleTimeString()}</Text>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              </View>
            )}

            {/* TAB 3: TOOLS & DATA MANAGEMENT */}
            {activeTab === 'tools' && (
              <View style={s.toolsList}>
                <View style={s.card}>
                  <Text style={s.cardTitle}>Data Collection</Text>
                  <Text style={s.cardDesc}>
                    Collect Wi-Fi fingerprint signals, import/export CSV files, and delete records for individual rooms.
                  </Text>
                  <TouchableOpacity
                    style={s.primaryBtn}
                    onPress={() => onNavigate('collector')}
                  >
                    <Text style={s.primaryBtnText}>Open Collector</Text>
                  </TouchableOpacity>
                </View>

                <View style={s.card}>
                  <Text style={s.cardTitle}>Dataset Management</Text>
                  <Text style={s.cardDesc}>
                    Inspect collected recordings grouped by room, edit records, delete room-level data, and export CSVs.
                  </Text>
                  <TouchableOpacity
                    style={s.secondaryBtn}
                    onPress={() => onNavigate('datasetReview')}
                  >
                    <Text style={s.secondaryBtnText}>Inspect Dataset</Text>
                  </TouchableOpacity>
                </View>

                <View style={s.card}>
                  <Text style={s.cardTitle}>Machine Learning Training</Text>
                  <Text style={s.cardDesc}>
                    Train room localization models for buildings with recorded fingerprint data.
                  </Text>
                  <TouchableOpacity
                    style={s.secondaryBtn}
                    onPress={() => onNavigate('modelTraining')}
                  >
                    <Text style={s.secondaryBtnText}>Train Model</Text>
                  </TouchableOpacity>
                </View>

                <View style={s.card}>
                  <Text style={s.cardTitle}>Test Localization</Text>
                  <Text style={s.cardDesc}>
                    Test room-level predictions live in the building using current Wi-Fi signals.
                  </Text>
                  <TouchableOpacity
                    style={s.secondaryBtn}
                    onPress={() => onNavigate('localization')}
                  >
                    <Text style={s.secondaryBtnText}>Test Localization</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}

        {/* MODAL: Building (Site) Add/Edit */}
        <Modal
          visible={siteModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setSiteModalVisible(false)}
        >
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <Text style={s.modalTitle}>
                {editingSite ? 'Edit Building' : 'Add Building'}
              </Text>
              <View style={s.inputGroup}>
                <Text style={s.label}>Building Name</Text>
                <TextInput
                  style={s.input}
                  value={siteName}
                  onChangeText={setSiteName}
                  placeholder="e.g. Science Complex"
                  placeholderTextColor={theme.textPlaceholder}
                />
              </View>
              <View style={s.inputGroup}>
                <Text style={s.label}>Address (optional)</Text>
                <TextInput
                  style={s.input}
                  value={siteAddress}
                  onChangeText={setSiteAddress}
                  placeholder="e.g. 100 Main St"
                  placeholderTextColor={theme.textPlaceholder}
                />
              </View>
              <View style={s.inputGroup}>
                <Text style={s.label}>Description (optional)</Text>
                <TextInput
                  style={s.input}
                  value={siteDesc}
                  onChangeText={setSiteDesc}
                  placeholder="Short description"
                  placeholderTextColor={theme.textPlaceholder}
                />
              </View>
              <View style={s.modalButtons}>
                <TouchableOpacity
                  style={s.modalCancelBtn}
                  onPress={() => setSiteModalVisible(false)}
                >
                  <Text style={s.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.modalSaveBtn}
                  onPress={handleSaveSite}
                >
                  <Text style={s.modalSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* MODAL: Floor Add/Edit */}
        <Modal
          visible={floorModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setFloorModalVisible(false)}
        >
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <Text style={s.modalTitle}>
                {editingFloor ? 'Edit Floor' : 'Add Floor'}
              </Text>
              <View style={s.inputGroup}>
                <Text style={s.label}>Floor Name</Text>
                <TextInput
                  style={s.input}
                  value={floorName}
                  onChangeText={setFloorName}
                  placeholder="e.g. Ground Floor, Level 2"
                  placeholderTextColor={theme.textPlaceholder}
                />
              </View>
              <View style={s.inputGroup}>
                <Text style={s.label}>Floor Number (integer)</Text>
                <TextInput
                  style={s.input}
                  value={floorNumber}
                  onChangeText={setFloorNumber}
                  placeholder="1"
                  placeholderTextColor={theme.textPlaceholder}
                  keyboardType="numeric"
                />
              </View>
              <View style={s.modalButtons}>
                <TouchableOpacity
                  style={s.modalCancelBtn}
                  onPress={() => setFloorModalVisible(false)}
                >
                  <Text style={s.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.modalSaveBtn}
                  onPress={handleSaveFloor}
                >
                  <Text style={s.modalSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* MODAL: Room Add/Edit */}
        <Modal
          visible={roomModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setRoomModalVisible(false)}
        >
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <Text style={s.modalTitle}>
                {editingRoom ? 'Edit Room' : 'Add Room'}
              </Text>
              <View style={s.inputGroup}>
                <Text style={s.label}>Room Name</Text>
                <TextInput
                  style={s.input}
                  value={roomName}
                  onChangeText={setRoomName}
                  placeholder="e.g. Conference Room A"
                  placeholderTextColor={theme.textPlaceholder}
                />
              </View>
              <View style={s.inputGroup}>
                <Text style={s.label}>Room Code (optional)</Text>
                <TextInput
                  style={s.input}
                  value={roomCode}
                  onChangeText={setRoomCode}
                  placeholder="e.g. CR-101"
                  placeholderTextColor={theme.textPlaceholder}
                />
              </View>
              <View style={s.inputGroup}>
                <Text style={s.label}>Description (optional)</Text>
                <TextInput
                  style={s.input}
                  value={roomDesc}
                  onChangeText={setRoomDesc}
                  placeholder="Short description"
                  placeholderTextColor={theme.textPlaceholder}
                />
              </View>
              <View style={s.modalButtons}>
                <TouchableOpacity
                  style={s.modalCancelBtn}
                  onPress={() => setRoomModalVisible(false)}
                >
                  <Text style={s.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.modalSaveBtn}
                  onPress={handleSaveRoom}
                >
                  <Text style={s.modalSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

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
    codeCard: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
      backgroundColor: theme.bgCard,
    },
    codeLabel: {
      color: theme.textMuted,
      fontSize: 11,
      textTransform: 'uppercase',
    },
    codeValue: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '700',
      marginTop: 2,
    },
    codeActionsRow: {
      flexDirection: 'row',
      gap: 6,
      alignItems: 'center',
    },
    codeBtn: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingVertical: 6,
      paddingHorizontal: 10,
      backgroundColor: theme.bgBtnSecondary,
    },
    codeBtnText: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '600',
    },
    refreshBtn: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingVertical: 6,
      paddingHorizontal: 10,
      backgroundColor: theme.bgBtnSecondary,
    },
    refreshBtnText: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '600',
    },
    tabBar: {
      flexDirection: 'row',
      borderBottomWidth: 2,
      borderBottomColor: theme.tabBarBorderBottom,
      marginBottom: 16,
    },
    tabItem: {
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    tabItemActive: {
      borderBottomWidth: 3,
      borderBottomColor: theme.border,
    },
    tabText: {
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: '600',
    },
    tabTextActive: {
      color: theme.text,
      fontWeight: '700',
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    sectionTitle: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    actionBtn: {
      backgroundColor: theme.bgBtnPrimary,
      borderRadius: 4,
      paddingVertical: 6,
      paddingHorizontal: 12,
    },
    actionBtnText: {
      color: theme.textBtnPrimary,
      fontSize: 12,
      fontWeight: '600',
    },
    emptyCard: {
      borderWidth: 1,
      borderColor: theme.borderMuted,
      borderRadius: 4,
      padding: 14,
      backgroundColor: theme.bgBuffer,
      marginBottom: 12,
    },
    emptyText: {
      color: theme.textMuted,
      fontSize: 13,
    },
    buildingCard: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      marginBottom: 12,
      backgroundColor: theme.bgCard,
      overflow: 'hidden',
    },
    buildingHeader: {
      padding: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: theme.bgBuilding,
    },
    buildingTitle: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '700',
    },
    buildingSubtitle: {
      color: theme.textMuted,
      fontSize: 12,
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
    smallBtn: {
      backgroundColor: theme.bgBtnPrimary,
      borderRadius: 4,
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    smallBtnText: {
      color: theme.textBtnPrimary,
      fontSize: 11,
      fontWeight: '600',
    },
    smallOutlineBtnText: {
      color: theme.text,
      fontSize: 11,
      fontWeight: '600',
    },
    floorsWrap: {
      padding: 12,
      borderTopWidth: 1,
      borderTopColor: theme.borderMuted,
      backgroundColor: theme.bgCard,
    },
    floorHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    floorSectionTitle: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '700',
    },
    floorCard: {
      borderWidth: 1,
      borderColor: theme.borderLight,
      borderRadius: 4,
      padding: 10,
      marginBottom: 10,
      backgroundColor: theme.bgCard,
    },
    floorTitleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    floorName: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '700',
    },
    roomsContainer: {
      paddingLeft: 8,
      borderLeftWidth: 2,
      borderLeftColor: theme.borderMuted,
      marginTop: 4,
    },
    roomHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    roomSectionTitle: {
      color: theme.textSub,
      fontSize: 12,
      fontWeight: '600',
    },
    roomWrapper: {
      borderBottomWidth: 1,
      borderBottomColor: theme.borderFaint,
      paddingVertical: 2,
    },
    roomRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
    },
    roomName: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '600',
    },
    roomCode: {
      color: theme.textMuted,
      fontSize: 11,
    },
    mutedText: {
      color: theme.textFaint,
      fontSize: 12,
      fontStyle: 'italic',
    },
    membersList: {
      gap: 8,
    },
    memberCard: {
      borderWidth: 1,
      borderColor: theme.borderLight,
      borderRadius: 4,
      padding: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: theme.bgCard,
    },
    memberName: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '700',
    },
    memberEmail: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    memberRole: {
      color: theme.text,
      fontSize: 11,
      fontWeight: '600',
      marginTop: 4,
    },
    toolsList: {
      gap: 12,
    },
    card: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      padding: 14,
      backgroundColor: theme.bgCard,
    },
    cardTitle: {
      color: theme.text,
      fontSize: 15,
      fontWeight: '700',
      marginBottom: 4,
    },
    cardDesc: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 16,
      marginBottom: 12,
    },
    primaryBtn: {
      backgroundColor: theme.bgBtnPrimary,
      borderRadius: 4,
      paddingVertical: 10,
      alignItems: 'center',
    },
    primaryBtnText: {
      color: theme.textBtnPrimary,
      fontSize: 13,
      fontWeight: '600',
    },
    secondaryBtn: {
      backgroundColor: theme.bgBtnSecondary,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingVertical: 10,
      alignItems: 'center',
    },
    secondaryBtnText: {
      color: theme.text,
      fontSize: 13,
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
    roleOptionBtn: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      paddingVertical: 10,
      paddingHorizontal: 12,
      backgroundColor: theme.bgBtnSecondary,
      marginBottom: 8,
    },
    roleOptionBtnActive: {
      backgroundColor: theme.bgBadgeActive,
      borderColor: theme.border,
    },
    roleOptionText: {
      color: theme.text,
      fontSize: 13,
      fontWeight: '600',
    },
    roleOptionTextActive: {
      color: theme.textBtnPrimary,
      fontWeight: '700',
    },
    userStatsRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    statBadgeBox: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.borderLight,
      borderRadius: 4,
      padding: 8,
      alignItems: 'center',
      backgroundColor: theme.bgCard,
    },
    statBadgeNum: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.text,
    },
    statBadgeLabel: {
      fontSize: 10,
      color: theme.textMuted,
      marginTop: 2,
      textTransform: 'uppercase',
    },
    userCard: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 4,
      padding: 12,
      marginBottom: 12,
      backgroundColor: theme.bgCard,
    },
    userCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    userNameText: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.text,
    },
    userIdText: {
      fontSize: 11,
      color: theme.textMuted,
      marginTop: 2,
    },
    userEmailText: {
      fontSize: 12,
      color: theme.textSub,
      marginTop: 1,
    },
    rolePill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 4,
      backgroundColor: theme.bgBadgeActive,
      borderWidth: 1,
      borderColor: theme.border,
    },
    rolePillText: {
      color: theme.textBtnPrimary,
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    statusBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
      marginBottom: 10,
    },
    indicatorPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 4,
      borderWidth: 1,
    },
    indicatorPillText: {
      fontSize: 11,
      fontWeight: '700',
    },
    pillOnline: {
      backgroundColor: '#10b98120',
      borderColor: '#10b981',
    },
    textOnline: {
      color: '#10b981',
    },
    pillOffline: {
      backgroundColor: '#64748b20',
      borderColor: '#64748b',
    },
    textOffline: {
      color: '#64748b',
    },
    pillActiveTracking: {
      backgroundColor: '#3b82f620',
      borderColor: '#3b82f6',
    },
    textActiveTracking: {
      color: '#3b82f6',
    },
    pillInactiveTracking: {
      backgroundColor: theme.bgBadgeInactive,
      borderColor: theme.borderMuted,
    },
    textInactiveTracking: {
      color: theme.textMuted,
    },
    lastSeenText: {
      fontSize: 11,
      color: theme.textMuted,
    },
    userPermBox: {
      borderWidth: 1,
      borderColor: theme.borderMuted,
      borderRadius: 4,
      padding: 10,
      backgroundColor: theme.bgBuffer,
      marginBottom: 8,
    },
    userPermHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    userPermTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.text,
    },
    userPermModeText: {
      fontSize: 11,
      fontWeight: '700',
    },
    textAmber: {
      color: '#f59e0b',
    },
    staleNoticeText: {
      fontSize: 11,
      color: '#f59e0b',
      marginBottom: 6,
      fontStyle: 'italic',
    },
    permDetailGrid: {
      gap: 4,
    },
    permDetailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    permDetailLabel: {
      fontSize: 12,
      color: theme.textSub,
    },
    permDetailValue: {
      fontSize: 12,
      fontWeight: '600',
    },
    userLocBox: {
      borderWidth: 1,
      borderColor: theme.borderLight,
      borderRadius: 4,
      padding: 10,
      backgroundColor: theme.bgPreview,
      marginBottom: 8,
    },
    userLocTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.text,
      textTransform: 'uppercase',
    },
    userLocValue: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.text,
      marginTop: 2,
    },
    userLocTime: {
      fontSize: 11,
      color: theme.textMuted,
      marginTop: 2,
    },
    userLocEmpty: {
      fontSize: 12,
      color: theme.textMuted,
      fontStyle: 'italic',
      marginTop: 2,
    },
    userActionsRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 6,
      marginTop: 4,
    },
    syncTimeText: {
      color: theme.textMuted,
      fontSize: 10,
      marginTop: 4,
    },
    searchBarContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.bgCard,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 6,
      paddingHorizontal: 12,
      marginBottom: 12,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 8,
      color: theme.text,
      fontSize: 13,
    },
    searchClearBtn: {
      padding: 6,
    },
    searchClearText: {
      color: theme.textMuted,
      fontSize: 14,
      fontWeight: '700',
    },
    filterPillsRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 14,
    },
    filterPill: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 16,
      backgroundColor: theme.bgBtnSecondary,
      borderWidth: 1,
      borderColor: theme.border,
    },
    filterPillActive: {
      backgroundColor: theme.accent,
      borderColor: theme.accent,
    },
    filterPillText: {
      fontSize: 12,
      color: theme.textSub,
      fontWeight: '600',
    },
    filterPillTextActive: {
      color: '#ffffff',
      fontWeight: '700',
    },
    simpleUserCard: {
      backgroundColor: theme.bgCard,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 6,
      padding: 14,
      marginBottom: 10,
    },
    simpleUserHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderMuted,
    },
    simpleUserName: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.text,
    },
    statusBadge: {
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 4,
    },
    statusOnline: {
      backgroundColor: 'rgba(16, 185, 129, 0.15)',
    },
    statusOffline: {
      backgroundColor: 'rgba(148, 163, 184, 0.15)',
    },
    statusBadgeText: {
      fontSize: 11,
      fontWeight: '700',
    },
    statusOnlineText: {
      color: '#10b981',
    },
    statusOfflineText: {
      color: '#94a3b8',
    },
    simplePermRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 3,
    },
    simplePermLabel: {
      fontSize: 13,
      color: theme.textSub,
    },
    simplePermValue: {
      fontSize: 13,
      fontWeight: '600',
    },
    simpleLocRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 4,
    },
    simpleLocLabel: {
      fontSize: 13,
      color: theme.textMuted,
      marginRight: 6,
      fontWeight: '600',
    },
    simpleLocValue: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.text,
      flex: 1,
    },
    footer: {
      alignItems: 'center',
      paddingVertical: 16,
    },
    footerText: {
      color: theme.textMuted,
      fontSize: 11,
    },
  });
}
