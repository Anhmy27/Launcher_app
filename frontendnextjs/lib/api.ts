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

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const json = await response.json();
    // Backend returns { success: true, data: {...} }, unwrap it
    return json.data || json;
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
      let message = 'Failed to upload version';
      try {
        const errJson = await response.json();
        message = errJson?.error || message;
      } catch {
        // ignore
      }
      throw new Error(message);
    }

    return response.json();
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
