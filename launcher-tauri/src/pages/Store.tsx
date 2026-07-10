import { useState, useEffect } from "react";
import apiClient from "../lib/api";
import type { App, AppVersion } from "../lib/api";
import downloadManager from "../lib/downloadManager";
import { distributionLabel, isUrlVersion } from "../lib/distribution";
import "./Store.css";

interface StoreProps {
  onNavigate: (page: "store" | "library" | "downloads") => void;
}

export default function Store({ onNavigate }: StoreProps) {
  const [apps, setApps] = useState<App[]>([]);
  const [selectedApp, setSelectedApp] = useState<App | null>(null);
  const [versions, setVersions] = useState<AppVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadApps();
  }, []);

  const loadApps = async () => {
    try {
      const data = await apiClient.getApps();
      setApps(data || []);
    } catch (err) {
      console.error("Failed to load apps:", err);
    } finally {
      setLoading(false);
    }
  };

  const selectApp = async (app: App) => {
    setSelectedApp(app);
    try {
      const v = await apiClient.getAppVersions(app.id);
      setVersions((v || []).filter((ver) => ver.is_released));
    } catch {
      setVersions([]);
    }
  };

  const handleAddToLibrary = async (app: App) => {
    setInstalling(app.id);
    setMessage("");
    try {
      const latestVersion = versions[0];
      if (!latestVersion) {
        throw new Error("No version available");
      }
      await apiClient.installApp(app.id);

      if (isUrlVersion(latestVersion)) {
        await downloadManager.openUrlApp(app, latestVersion);
        setMessage(`${app.name} added — opening link...`);
      } else {
        setMessage(`${app.name} added to your library!`);
      }

      setTimeout(() => onNavigate("library"), 1500);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Failed to install");
    } finally {
      setInstalling(null);
    }
  };

  const formatSize = (bytes: number, version?: AppVersion) => {
    if (isUrlVersion(version)) return "Web link";
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  if (loading) {
    return (
      <div className="store-loading">
        <div className="spinner" />
        <p>Loading store...</p>
      </div>
    );
  }

  if (selectedApp) {
    const latestVersion = versions[0];
    const isUrl = isUrlVersion(latestVersion);
    return (
      <div className="store-detail">
        <button className="back-btn" onClick={() => setSelectedApp(null)}>
          ← Back to Store
        </button>

        <div className="detail-header">
          <div className="detail-icon">
            {selectedApp.icon_url ? (
              <img src={selectedApp.icon_url} alt={selectedApp.name} />
            ) : (
              <span className="icon-placeholder">🎮</span>
            )}
          </div>
          <div className="detail-info">
            <h1>{selectedApp.name}</h1>
            <span className="detail-category">{selectedApp.category}</span>
            <p className="detail-desc">
              {selectedApp.description || "No description available."}
            </p>
            {latestVersion && (
              <div className="detail-meta">
                <span>Version: {latestVersion.version_name}</span>
                <span>Type: {distributionLabel(latestVersion)}</span>
                <span>Size: {formatSize(latestVersion.file_size, latestVersion)}</span>
                {isUrl && latestVersion.launch_url && (
                  <span>URL: {latestVersion.launch_url}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {message && <div className="store-message">{message}</div>}

        <div className="detail-actions">
          <button
            className="install-btn"
            onClick={() => handleAddToLibrary(selectedApp)}
            disabled={installing === selectedApp.id}
          >
            {installing === selectedApp.id
              ? "Adding..."
              : isUrl
                ? "+ Add & Open"
                : "+ Add to Library"}
          </button>
        </div>

        {versions.length > 0 && (
          <div className="versions-section">
            <h3>Available Versions</h3>
            {versions.map((v) => (
              <div key={v.id} className="version-row">
                <div>
                  <strong>{v.version_name}</strong>
                  {v.is_required && (
                    <span className="required-badge"> · Required</span>
                  )}
                  <span className="version-size">
                    {formatSize(v.file_size, v)} · {distributionLabel(v)}
                  </span>
                </div>
                <span className="version-date">
                  {v.release_date
                    ? new Date(v.release_date).toLocaleDateString()
                    : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="store-page">
      <div className="store-header">
        <h2>🏪 Store</h2>
        <p>Browse and discover applications</p>
      </div>

      {message && <div className="store-message">{message}</div>}

      {apps.length === 0 ? (
        <div className="store-empty">
          <span className="empty-icon">📦</span>
          <p>No applications available yet.</p>
        </div>
      ) : (
        <div className="app-grid">
          {apps.map((app) => (
            <div
              key={app.id}
              className="app-card"
              onClick={() => selectApp(app)}
            >
              <div className="app-card-icon">
                {app.icon_url ? (
                  <img src={app.icon_url} alt={app.name} />
                ) : (
                  <span className="icon-placeholder">🎮</span>
                )}
              </div>
              <div className="app-card-info">
                <h3>{app.name}</h3>
                <span className="app-category">{app.category}</span>
                <p className="app-desc">
                  {app.description
                    ? app.description.length > 60
                      ? app.description.slice(0, 60) + "..."
                      : app.description
                    : "No description"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
