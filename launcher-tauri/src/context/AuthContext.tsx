import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import apiClient from "../lib/api";
import type { User } from "../lib/api";
import { tauriCommands } from "../lib/tauri";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<void>;
  logout: () => void;
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

  const login = async (email: string, password: string) => {
    const data = await apiClient.login(email, password);
    setUser(data.user);

    // Register device after successful login
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
      // Don't fail login if device registration fails
    }
  };

  const register = async (
    email: string,
    password: string,
    fullName: string,
  ) => {
    const data = await apiClient.register(email, password, fullName);
    setUser(data.user);
  };

  const logout = () => {
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
