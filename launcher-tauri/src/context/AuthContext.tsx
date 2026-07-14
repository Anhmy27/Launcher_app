import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import apiClient from "../lib/api";
import type { User } from "../lib/api";
import { tauriCommands } from "../lib/tauri";
import { clearRunningApps } from "../lib/presence";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = apiClient.getToken();
    if (token) {
      apiClient
        .getMe()
        .then(setUser)
        .catch(() => {
          apiClient.logout();
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

async function registerDeviceForUser(): Promise<void> {
  try {
    const sysInfo = await tauriCommands.getSystemInfo();
    const savedDeviceId = localStorage.getItem("deviceId");
    const device = await apiClient.registerDevice(
      sysInfo.hostname,
      sysInfo.hostname,
      sysInfo.machine_id,
      sysInfo.ip_address,
      savedDeviceId,
    );
    localStorage.setItem("deviceId", device.id);
  } catch (err) {
    console.error("Failed to register device:", err);
  }
}

  const login = async (email: string, password: string) => {
    const data = await apiClient.login(email, password);
    setUser(data.user);
    await registerDeviceForUser();
  };

  const register = async (
    email: string,
    password: string,
    fullName: string,
  ) => {
    const data = await apiClient.register(email, password, fullName);
    setUser(data.user);
    await registerDeviceForUser();
  };

  const logout = async () => {
    const deviceId = localStorage.getItem("deviceId");
    if (deviceId) {
      try {
        await apiClient.deviceLogout(deviceId);
      } catch (err) {
        console.error("Device logout failed:", err);
      }
    }
    clearRunningApps();
    apiClient.logout();
    localStorage.removeItem("deviceId");
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
