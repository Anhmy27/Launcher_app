import { useState, useEffect, useRef, type ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useLocale } from "../context/LocaleContext";
import type { App, AppVersion } from "../lib/api";
import apiClient from "../lib/api";
import downloadManager from "../lib/downloadManager";
import type { DownloadProgress } from "../lib/downloadManager";
import { tauriCommands } from "../lib/tauri";
import { getActiveRunningApps } from "../lib/presence";
import Logo from "./Logo";
import Store from "../pages/Store";
import Library from "../pages/Library";
import Downloads from "../pages/Downloads.tsx";
import "./Layout.css";

type Page = "store" | "library" | "downloads";

const NavIcon = ({ children }: { children: ReactNode }) => (
  <span className="nav-icon">{children}</span>
);

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { locale, setLocale, t } = useLocale();
  const [currentPage, setCurrentPage] = useState<Page>("store");
  const [downloads, setDownloads] = useState<DownloadProgress[]>([]);
  const lastPresenceKeyRef = useRef<string>("");
  const closingRef = useRef(false);

  const buildPresenceKey = (apps: { app_id: string; pid: number }[]) =>
    apps
      .slice()
      .sort((a, b) => a.app_id.localeCompare(b.app_id))
      .map((a) => `${a.app_id}:${a.pid}`)
      .join("|");

  useEffect(() => {
    const unsub = downloadManager.subscribe(setDownloads);
    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    const deviceId = localStorage.getItem("deviceId");
    if (!deviceId) return;

    const sendHeartbeat = async (activeAppsOverride?: { app_id: string; pid: number }[]) => {
      try {
        const sysInfo = await tauriCommands.getSystemInfo();
        const activeApps = activeAppsOverride ?? (await getActiveRunningApps());
        lastPresenceKeyRef.current = buildPresenceKey(activeApps);
        await apiClient.deviceHeartbeat(deviceId, sysInfo.ip_address, activeApps);
      } catch (err) {
        console.error("Heartbeat failed:", err);
      }
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 45 * 1000);

    // Fast watcher for child process exits: if running-app set changes, push
    // heartbeat immediately instead of waiting up to 45 seconds.
    const appWatcher = setInterval(async () => {
      try {
        const activeApps = await getActiveRunningApps();
        const nextKey = buildPresenceKey(activeApps);
        if (nextKey !== lastPresenceKeyRef.current) {
          await sendHeartbeat(activeApps);
        }
      } catch {
        // Ignore watcher errors; periodic heartbeat is still active.
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      clearInterval(appWatcher);
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    // Best-effort logout on window close so admin sees offline faster.
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        unlisten = await win.onCloseRequested(async (event) => {
          if (closingRef.current) return;
          closingRef.current = true;
          event.preventDefault();
          const deviceId = localStorage.getItem("deviceId");
          if (!deviceId) {
            await win.close();
            return;
          }
          try {
            await apiClient.deviceLogout(deviceId);
          } catch {
            // ignore close logout failures; timeout fallback still works
          }
          await win.close();
        });
      } catch {
        // Non-tauri environments or API mismatch: skip close hook.
      }
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleStartDownload = (app: App, version: AppVersion) => {
    downloadManager.startDownload(app, version);
    setCurrentPage("downloads");
  };

  const activeDownloads = downloads.filter(
    (d) =>
      d.status === "downloading" ||
      d.status === "fetching_manifest" ||
      d.status === "comparing" ||
      d.status === "running_installer",
  ).length;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Logo size={36} />
          <div>
            <span className="logo-text">{t.appName}</span>
            <span className="logo-sub">{t.appTagline}</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${currentPage === "store" ? "active" : ""}`}
            onClick={() => setCurrentPage("store")}
          >
            <NavIcon>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </NavIcon>
            <span>{t.store}</span>
          </button>
          <button
            className={`nav-item ${currentPage === "library" ? "active" : ""}`}
            onClick={() => setCurrentPage("library")}
          >
            <NavIcon>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
              </svg>
            </NavIcon>
            <span>{t.library}</span>
          </button>
          <button
            className={`nav-item ${currentPage === "downloads" ? "active" : ""}`}
            onClick={() => setCurrentPage("downloads")}
          >
            <NavIcon>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </NavIcon>
            <span>{t.downloads}</span>
            {activeDownloads > 0 && (
              <span className="nav-badge">{activeDownloads}</span>
            )}
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="lang-toggle-group" style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              className={`lang-toggle ${locale === "vi" ? "active" : ""}`}
              style={{ flex: 1, marginBottom: 0 }}
              onClick={() => setLocale("vi")}
            >
              VI
            </button>
            <button
              type="button"
              className={`lang-toggle ${locale === "en" ? "active" : ""}`}
              style={{ flex: 1, marginBottom: 0 }}
              onClick={() => setLocale("en")}
            >
              EN
            </button>
          </div>
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            title={theme === "dark" ? t.themeLight : t.themeDark}
          >
            {theme === "dark" ? "☀️" : "🌙"}
            <span>{theme === "dark" ? t.themeLight : t.themeDark}</span>
          </button>
          <div className="user-info">
            <div className="user-avatar">
              {user?.full_name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div className="user-details">
              <span className="user-name">{user?.full_name}</span>
              <span className="user-email">{user?.email}</span>
            </div>
          </div>
          <button className="logout-btn" onClick={logout} title={t.logout}>
            {t.logout}
          </button>
        </div>
      </aside>

      <main className="main-content">
        {currentPage === "store" && <Store onNavigate={setCurrentPage} />}
        {currentPage === "library" && (
          <Library
            downloads={downloads}
            onStartDownload={handleStartDownload}
          />
        )}
        {currentPage === "downloads" && <Downloads />}
      </main>
    </div>
  );
}
