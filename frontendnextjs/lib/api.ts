// API client for backend
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080/api';

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

export interface LoginResponse {
  user: User;
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface RunningApp {
  app_id: string;
  name: string;
  slug: string;
  icon_url: string;
  pid: number;
  started_at: string;
}

export interface DevicePresence {
  id: string;
  device_name: string;
  hostname: string;
  machine_id: string;
  ip_address: string;
  current_user_id: string | null;
  current_user?: User | null;
  last_seen: string | null;
  is_active: boolean;
  is_online: boolean;
  running_apps: RunningApp[];
}

export interface InstalledApp {
  app_id: string;
  name: string;
  slug: string;
  icon_url: string;
  installed_version_code: number;
  installed_version_name: string;
  last_checked: string | null;
}

export interface DeviceDetail {
  device: DevicePresence;
  is_online: boolean;
  running_apps: RunningApp[];
  installed_apps: InstalledApp[];
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('access_token', token);
    }
  }

  getToken() {
    if (typeof window === 'undefined') return this.token;
    return this.token || localStorage.getItem('access_token');
  }

  getDevicesWebSocketUrl(): string | null {
    if (typeof window === 'undefined') return null;
    const configuredWsBase = process.env.NEXT_PUBLIC_WS_BASE_URL;
    const wsBase = configuredWsBase && configuredWsBase.trim().length > 0
      ? configuredWsBase.trim().replace(/\/+$/, "")
      : (() => {
          const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || API_BASE_URL).replace(/\/+$/, "");
          const httpBase = apiBase.endsWith("/api") ? apiBase.slice(0, -4) : apiBase;
          return httpBase.replace(/^http/i, "ws");
        })();

    return `${wsBase}/api/ws/devices`;
  }

  getDevicesWebSocketProtocols(): string[] {
    const token = this.getToken();
    if (!token) return [];
    // Browser WebSocket does not allow custom Authorization headers.
    // We pass JWT in subprotocols instead of URL query params.
    return ['launcher-admin-v1', token];
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    }
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (options.headers && typeof options.headers === 'object') {
      Object.assign(headers, options.headers);
    }

    const token = this.getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const parseBody = async () => {
      const text = await response.text();
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(
          response.ok
            ? "Invalid JSON response from server"
            : `HTTP ${response.status}: ${text.slice(0, 200)}`,
        );
      }
    };

    if (!response.ok) {
      const error = await parseBody();
      throw new Error(
        (error && typeof error === "object" && "error" in error
          ? String((error as { error?: string }).error)
          : null) || `HTTP ${response.status}`,
      );
    }

    const json = await parseBody();
    if (json && typeof json === "object" && "data" in json) {
      return (json as { data: unknown }).data;
    }
    return json;
  }

  // Auth endpoints
  async login(email: string, password: string): Promise<LoginResponse> {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(data.access_token);
    return data;
  }

  async register(email: string, password: string, fullName: string): Promise<LoginResponse> {
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, full_name: fullName }),
    });
    this.setToken(data.access_token);
    return data;
  }

  async getMe(): Promise<User> {
    return this.request('/auth/me');
  }

  // Apps endpoints
  async getApps(params?: { search?: string; category?: string; published?: boolean }) {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.category) query.append('category', params.category);
    if (params?.published) query.append('published', 'true');

    return this.request(`/apps?${query.toString()}`);
  }

  async getApp(id: string) {
    return this.request(`/apps/${id}`);
  }

  async createApp(name: string, description: string, category: string) {
    return this.request('/apps', {
      method: 'POST',
      body: JSON.stringify({ name, description, category }),
    });
  }

  async updateApp(
    id: string,
    data: {
      name?: string;
      description?: string;
      icon_url?: string;
      banner_url?: string;
      category?: string;
      is_published?: boolean;
    },
  ) {
    return this.request(`/apps/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteApp(id: string) {
    return this.request(`/apps/${id}`, { method: 'DELETE' });
  }

  // App Versions
  async getAppVersions(appId: string) {
    return this.request(`/apps/${appId}/versions`);
  }

  async uploadVersion(appId: string, formData: FormData) {
    const token = this.getToken();
    const headers: HeadersInit = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/apps/${appId}/versions`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const text = await response.text();
        if (text) {
          const errJson = JSON.parse(text);
          message = errJson?.error || message;
        }
      } catch {
        // ignore
      }
      throw new Error(message);
    }

    const text = await response.text();
    if (!text) return null;
    try {
      const json = JSON.parse(text);
      return json.data ?? json;
    } catch {
      throw new Error("Invalid JSON response from server");
    }
  }

  async releaseVersion(appId: string, versionId: string) {
    return this.request(`/apps/${appId}/versions/${versionId}/release`, {
      method: 'POST',
    });
  }

  async deleteVersion(appId: string, versionId: string) {
    return this.request(`/apps/${appId}/versions/${versionId}`, {
      method: 'DELETE',
    });
  }

  // Devices / presence
  async getDevices(): Promise<DevicePresence[]> {
    return this.request('/devices') as Promise<DevicePresence[]>;
  }

  async getDeviceDetail(id: string): Promise<DeviceDetail> {
    return this.request(`/devices/${id}`) as Promise<DeviceDetail>;
  }

  async deleteDevice(id: string) {
    return this.request(`/devices/${id}`, { method: 'DELETE' });
  }

  // Users
  async getUsers(params?: { search?: string; role?: string }) {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.role) query.append('role', params.role);

    return this.request(`/users?${query.toString()}`);
  }

  async toggleUserActive(userId: string) {
    return this.request(`/users/${userId}/toggle-active`, { method: 'PUT' });
  }
}

export const apiClient = new ApiClient();
