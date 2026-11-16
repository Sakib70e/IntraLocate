import AsyncStorage from '@react-native-async-storage/async-storage';

export const STORAGE_KEY_API_URL = '@intralocate_api_url_v1';
export const STORAGE_KEY_TOKEN = '@intralocate_token_v1';
export const STORAGE_KEY_USER = '@intralocate_user_v1';
export const STORAGE_KEY_ACTIVE_ORG = '@intralocate_active_org_v1';

// Default backend URL (managed internally via env or default LAN IP)
export const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.31.202:3000';

/**
 * Normalizes API URL for local-network development:
 * Enforces http:// (not https://) for local/private network IPs and adds scheme if omitted.
 */
export const normalizeApiUrl = (url) => {
  if (!url) return DEFAULT_API_URL;
  let cleanUrl = String(url).trim().replace(/\/+$/, '');
  // If user entered https:// for a local IP or localhost, rewrite to http://
  if (/^https:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|localhost|127\.0\.0\.1)/i.test(cleanUrl)) {
    cleanUrl = cleanUrl.replace(/^https:\/\//i, 'http://');
  } else if (!/^https?:\/\//i.test(cleanUrl)) {
    cleanUrl = `http://${cleanUrl}`;
  }
  return cleanUrl;
};

class ApiClient {
  constructor() {
    this.baseUrl = DEFAULT_API_URL;
    this.token = null;
    this.init();
  }

  async init() {
    try {
      const savedUrl = await AsyncStorage.getItem(STORAGE_KEY_API_URL);
      if (savedUrl) {
        this.baseUrl = normalizeApiUrl(savedUrl);
      }
      const savedToken = await AsyncStorage.getItem(STORAGE_KEY_TOKEN);
      if (savedToken) {
        this.token = savedToken;
      }
    } catch (e) {
      console.log('Error initializing ApiClient:', e);
    }
  }

  async setBaseUrl(url) {
    if (!url) return;
    const cleanUrl = normalizeApiUrl(url);
    this.baseUrl = cleanUrl;
    await AsyncStorage.setItem(STORAGE_KEY_API_URL, cleanUrl);
  }

  async setToken(token) {
    this.token = token;
    if (token) {
      await AsyncStorage.setItem(STORAGE_KEY_TOKEN, token);
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY_TOKEN);
    }
  }

  async request(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout || 15000);

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || `Server error ${response.status}`);
      }
      return json;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`Connection timed out. Make sure your phone and computer are on the same Wi-Fi network, then check Settings to verify the server address.`);
      }
      throw err;
    }
  }

  // Health check
  async checkHealth() {
    return this.request('/api/health');
  }

  // Authentication
  async register(email, password, name) {
    const res = await this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
    if (res.data?.token) {
      await this.setToken(res.data.token);
    }
    return res;
  }

  async login(email, password) {
    const res = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (res.data?.token) {
      await this.setToken(res.data.token);
    }
    return res;
  }

  async getMe() {
    return this.request('/api/auth/me');
  }

  // Organizations
  async createOrg(name, description, securityInfo) {
    return this.request('/api/orgs/create', {
      method: 'POST',
      body: JSON.stringify({ name, description, securityInfo }),
    });
  }

  async joinOrg(code, securityInfo) {
    return this.request('/api/orgs/join', {
      method: 'POST',
      body: JSON.stringify({ code, securityInfo }),
    });
  }

  async getMyOrgs() {
    return this.request('/api/orgs/my');
  }

  async getOrgOverview(orgId) {
    return this.request(`/api/orgs/${orgId}/overview`);
  }

  async addMember(orgId, email, role = 'MEMBER') {
    return this.request(`/api/orgs/${encodeURIComponent(orgId)}/members`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    });
  }

  async updateMemberRole(orgId, memberId, role) {
    return this.request(`/api/orgs/${orgId}/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  }

  async removeMember(orgId, memberId) {
    return this.request(`/api/orgs/${orgId}/members/${memberId}`, {
      method: 'DELETE',
    });
  }

  async leaveOrg(orgId) {
    return this.request(`/api/orgs/${orgId}/leave`, {
      method: 'POST',
    });
  }

  async updateOrgCode(orgId, code) {
    return this.request(`/api/orgs/${orgId}/code`, {
      method: 'PATCH',
      body: JSON.stringify({ code }),
    });
  }

  // Sites
  async getSites(orgId) {
    return this.request(`/api/sites?orgId=${encodeURIComponent(orgId)}`);
  }

  async getSiteDetails(siteId) {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}`);
  }

  async createSite(organizationId, name, description, address) {
    return this.request('/api/sites', {
      method: 'POST',
      body: JSON.stringify({ organizationId, name, description, address }),
    });
  }

  async updateSite(siteId, data) {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteSite(siteId) {
    return this.request(`/api/sites/${encodeURIComponent(siteId)}`, {
      method: 'DELETE',
    });
  }

  // Floors
  async getFloors(siteId) {
    return this.request(`/api/floors?siteId=${encodeURIComponent(siteId)}`);
  }

  async createFloor(siteId, name, floorNumber) {
    return this.request('/api/floors', {
      method: 'POST',
      body: JSON.stringify({ siteId, name, floorNumber }),
    });
  }

  async updateFloor(floorId, data) {
    return this.request(`/api/floors/${encodeURIComponent(floorId)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteFloor(floorId) {
    return this.request(`/api/floors/${encodeURIComponent(floorId)}`, {
      method: 'DELETE',
    });
  }

  // Rooms
  async getRooms(floorId) {
    return this.request(`/api/rooms?floorId=${encodeURIComponent(floorId)}`);
  }

  async createRoom(floorId, name, code, description) {
    return this.request('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({ floorId, name, code, description }),
    });
  }

  async updateRoom(roomId, data) {
    return this.request(`/api/rooms/${encodeURIComponent(roomId)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteRoom(roomId) {
    return this.request(`/api/rooms/${encodeURIComponent(roomId)}`, {
      method: 'DELETE',
    });
  }

  async deleteRoomRecordings(roomId) {
    return this.request(`/api/fingerprints/room/${encodeURIComponent(roomId)}`, {
      method: 'DELETE',
    });
  }

  async getRoomSampleCount(roomId) {
    return this.request(`/api/fingerprints/room-count/${encodeURIComponent(roomId)}`);
  }

  // Fingerprint Recordings
  async saveFingerprints(payload) {
    return this.request('/api/fingerprints/record', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async uploadBatchFingerprints(roomId, wifiDataArray) {
    return this.request('/api/fingerprints/batch', {
      method: 'POST',
      body: JSON.stringify({ roomId, samples: wifiDataArray }),
    });
  }

  async importDataset(siteId, organizationId, records) {
    return this.request('/api/fingerprints/import', {
      method: 'POST',
      body: JSON.stringify({ siteId, organizationId, records }),
    });
  }

  async getFingerprints(query = {}) {
    const params = new URLSearchParams(query).toString();
    return this.request(`/api/fingerprints?${params}`);
  }

  async getFingerprintStats(orgId, siteId) {
    let path = `/api/fingerprints/stats?orgId=${encodeURIComponent(orgId)}`;
    if (siteId) {
      path += `&siteId=${encodeURIComponent(siteId)}`;
    }
    return this.request(path);
  }

  async deleteFingerprint(id) {
    return this.request(`/api/fingerprints/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  async clearDataset(query = {}) {
    const params = new URLSearchParams(query).toString();
    return this.request(`/api/fingerprints/dataset/clear?${params}`, {
      method: 'DELETE',
    });
  }

  async updateFingerprint(id, payload) {
    return this.request(`/api/fingerprints/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  // Machine Learning Pipeline
  async trainModel(siteId, options = {}) {
    return this.request(`/api/ml/train/${encodeURIComponent(siteId)}`, {
      method: 'POST',
      body: JSON.stringify(options),
      timeout: 120000, // 2 min timeout for training
    });
  }

  async getActiveModel(siteId) {
    return this.request(`/api/ml/models/${encodeURIComponent(siteId)}`);
  }

  async predictLocation(siteId, wifiData) {
    return this.request(`/api/ml/predict/${encodeURIComponent(siteId)}`, {
      method: 'POST',
      body: JSON.stringify({ wifiData }),
    });
  }

  // Live Continuous Wi-Fi Signal Tracking for Normal Users & Admins
  async sendTrackingSignal(orgId, data) {
    return this.request(`/api/orgs/${encodeURIComponent(orgId)}/tracking`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getTrackingSignals(orgId) {
    return this.request(`/api/orgs/${encodeURIComponent(orgId)}/tracking`);
  }

  async requestTrackingRefresh(orgId) {
    return this.request(`/api/orgs/${encodeURIComponent(orgId)}/tracking/refresh-request`, {
      method: 'POST',
    });
  }

  async getTrackingStatus(orgId) {
    return this.request(`/api/orgs/${encodeURIComponent(orgId)}/tracking/status`);
  }

  // Device & Permission status reporting for organization users
  async sendDeviceStatus(orgId, statusData) {
    return this.request(`/api/orgs/${encodeURIComponent(orgId)}/device-status`, {
      method: 'POST',
      body: JSON.stringify(statusData),
    });
  }

  // Get organization users with online status, permissions & localization for Admin Users Tab
  async getOrgUsers(orgId) {
    return this.request(`/api/orgs/${encodeURIComponent(orgId)}/users`);
  }
}

export const api = new ApiClient();
export default api;
