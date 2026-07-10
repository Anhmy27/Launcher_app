const API_BASE = 'http://localhost:8080/api';

interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    const json: APIResponse<T> = await res.json();

    if (!res.ok || !json.success) {
      throw new Error(json.error || `API error: ${res.status}`);
    }

    return json.data as T;
  }

  // ==================== Auth ====================
  async login(email: string, password: string) {
    const data = await this.request<{
      access_token: string;
      refresh_token: string;
      user: User;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    return data;
  }

  async register(email: string, password: string, fullName: string) {
    const data = await this.request<{
      access_token: string;
      refresh_token: string;
      user: User;
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, full_name: fullName }),
    });
    this.setToken(data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    return data;
  }

  async getMe(): Promise<User> {
    return this.request<User>('/auth/me');
  }

  async refresh() {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) throw new Error('No refresh token');
    const data = await this.request<{
      access_token: string;
      refresh_token: string;
    }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    this.setToken(data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    return data;
  }

  logout() {
    this.setToken(null);
    localStorage.removeItem('refresh_token');
  }

  // ==================== Apps ====================
  async getApps(): Promise<App[]> {
    return this.request<App[]>('/apps?published=true');
  }

  async getAppById(id: string): Promise<App> {
    return this.request<App>(`/apps/${id}`);
  }

  async getAppVersions(appId: string): Promise<AppVersion[]> {
    return this.request<AppVersion[]>(`/apps/${appId}/versions`);
  }

  // ==================== User Apps ====================
  async getMyApps(): Promise<UserApp[]> {
    return this.request<UserApp[]>('/me/apps');
  }

  async installApp(appId: string) {
    return this.request(`/me/apps/${appId}/install`, { 
      method: 'POST',
      body: JSON.stringify({})
    });
  }

  async uninstallApp(appId: string) {
    return this.request(`/me/apps/${appId}`, { method: 'DELETE' });
  }

  // ==================== Downloads ====================
  async getMyDownloads(): Promise<DownloadHistoryItem[]> {
    return this.request<DownloadHistoryItem[]>('/downloads');
  }

  async startDownload(appVersionId: string) {
    return this.request<Download>(`/downloads/${appVersionId}/start`, { method: 'POST' });
  }

  async updateDownloadStatus(downloadId: string, status: string, downloadedSize?: number, progressDetail?: string) {
    return this.request(`/downloads/${downloadId}/status`, {
      method: 'PUT',
      body: JSON.stringify({
        download_status: status,
        downloaded_size: downloadedSize,
        progress_detail: progressDetail,
      }),
    });
  }

  async deleteMyDownload(downloadId: string) {
    return this.request(`/downloads/${downloadId}`, { method: 'DELETE' });
  }

  // ==================== Device ====================
  async registerDevice(deviceName: string, hostname: string, machineId: string, ipAddress: string, deviceId?: string | null) {
    return this.request<Device>('/devices/register', {
      method: 'POST',
      body: JSON.stringify({
        device_name: deviceName,
        hostname,
        machine_id: machineId,
        ip_address: ipAddress,
        device_id: deviceId || undefined,
      }),
    });
  }

  async deviceHeartbeat(deviceId: string, ipAddress: string) {
    return this.request(`/devices/${deviceId}/heartbeat`, {
      method: 'POST',
      body: JSON.stringify({ ip_address: ipAddress }),
    });
  }

  async syncDeviceApps(deviceId: string, apps: { app_id: string; installed_version_code: number; installed_version_name: string }[]) {
    return this.request(`/devices/${deviceId}/apps/sync`, {
      method: 'POST',
      body: JSON.stringify({ apps }),
    });
  }

  async deleteDeviceApp(deviceId: string, appId: string) {
    return this.request(`/devices/${deviceId}/apps/${appId}`, { method: 'DELETE' });
  }

  async getDeviceStatus(deviceId: string): Promise<{ device: Device; app_status: DeviceAppStatus[] }> {
    return this.request<{ device: Device; app_status: DeviceAppStatus[] }>(`/devices/${deviceId}/status`);
  }
}

// ==================== Types ====================
export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'customer';
  is_active: boolean;
  created_at: string;
}

export interface App {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon_url: string;
  banner_url: string;
  category: string;
  is_published: boolean;
  created_at: string;
  versions?: AppVersion[];
}

export interface AppVersion {
  id: string;
  app_id: string;
  version_name: string;
  version_code: number;
  description: string;
  file_size: number;
  file_hash: string;
  manifest_url: string;
  distribution_type?: 'portable' | 'installer' | 'url';
  launch_url?: string;
  installer_kind?: string;
  installer_silent_args?: string;
  installer_launch_path?: string;
  installer_product_code?: string;
  installer_uninstall_path?: string;
  installer_uninstall_args?: string;
  is_released: boolean;
  is_required: boolean;
  release_date: string | null;
  created_at: string;
}

export interface UserApp {
  id: string;
  user_id: string;
  app_id: string;
  created_at: string;
  updated_at: string;
  app?: App;
}

export interface DeviceAppStatus {
  id: string;
  device_id: string;
  app_id: string;
  installed_version_code: number;
  installed_version_name: string;
  last_checked: string;
}

export interface Download {
  id: string;
  user_id: string;
  app_version_id: string;
  downloaded_size: number;
  download_status: 'pending' | 'in_progress' | 'completed' | 'failed';
  started_at: string;
  completed_at: string | null;
  app_version?: AppVersion;
}

export interface DownloadHistoryItem {
  id: string;
  app_version_id: string;
  app_id: string;
  app_name: string;
  version_name: string;
  version_code: number;
  downloaded_size: number;
  download_status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress_detail?: string;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface Device {
  id: string;
  device_name: string;
  hostname: string;
  machine_id: string;
  ip_address: string;
  last_seen: string | null;
  is_active: boolean;
}

export const apiClient = new ApiClient();
export default apiClient;
