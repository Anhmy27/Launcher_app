import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import type { App, AppVersion } from "../lib/api";
import apiClient from "../lib/api";
import downloadManager from "../lib/downloadManager";
import type { DownloadProgress } from "../lib/downloadManager";
import { tauriCommands } from "../lib/tauri";
import Store from "../pages/Store";
import Library from "../pages/Library";
import Downloads from "../pages/Downloads.tsx";
import "./Layout.css";

type Page = "store" | "library" | "downloads";

export default function Layout() {
  const { user, logout } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>("store");
  const [downloads, setDownloads] = useState<DownloadProgress[]>([]);

  useEffect(() => {
    const unsub = downloadManager.subscribe(setDownloads);
    return () => {
      unsub();
    };
  }, []);

  // Device heartbeat every 5 minutes
  useEffect(() => {
    const deviceId = localStorage.getItem("deviceId");
    if (!deviceId) return;

    const sendHeartbeat = async () => {
      try {
        const sysInfo = await tauriCommands.getSystemInfo();
        await apiClient.deviceHeartbeat(deviceId, sysInfo.ip_address);
      } catch (err) {
        console.error("Heartbeat failed:", err);
      }
    };

    // Send immediately on mount
    sendHeartbeat();

    // Then send every 5 minutes
    const interval = setInterval(sendHeartbeat, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleStartDownload = (app: App, version: AppVersion) => {
    downloadManager.startDownload(app, version);
    setCurrentPage("downloads");
  };

  const activeDownloads = downloads.filter(
    (d) =>
      d.status === "downloading" ||
      d.status === "fetching_manifest" ||
      d.status === "comparing",
  ).length;

  return (
    <div className="layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-icon">🚀</span>
          <span className="logo-text">Launcher</span>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${currentPage === "store" ? "active" : ""}`}
            onClick={() => setCurrentPage("store")}
          >
            <span className="nav-icon">🏪</span>
            <span>Store</span>
          </button>
          <button
            className={`nav-item ${currentPage === "library" ? "active" : ""}`}
            onClick={() => setCurrentPage("library")}
          >
            <span className="nav-icon">📚</span>
            <span>Library</span>
          </button>
          <button
            className={`nav-item ${currentPage === "downloads" ? "active" : ""}`}
            onClick={() => setCurrentPage("downloads")}
          >
            <span className="nav-icon">⬇️</span>
            <span>Downloads</span>
            {activeDownloads > 0 && (
              <span className="nav-badge">{activeDownloads}</span>
            )}
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              {user?.full_name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div className="user-details">
              <span className="user-name">{user?.full_name}</span>
              <span className="user-email">{user?.email}</span>
            </div>
          </div>
          <button className="logout-btn" onClick={logout} title="Logout">
            🚪
          </button>
        </div>
      </aside>

      {/* Main content */}
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
