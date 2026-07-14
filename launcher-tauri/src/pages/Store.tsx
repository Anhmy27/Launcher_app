import { useState, useEffect } from "react";
import apiClient from "../lib/api";
import type { App, AppVersion } from "../lib/api";
import { useLocale } from "../context/LocaleContext";
import "./Store.css";

interface StoreProps {
  onNavigate: (page: "store" | "library" | "downloads") => void;
}

export default function Store({ onNavigate }: StoreProps) {
  const { locale, t, distLabel } = useLocale();
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
        throw new Error(t.noVersion);
      }
      await apiClient.installApp(app.id);
      setMessage(`${app.name} ${t.addedToLibrary}`);

      setTimeout(() => onNavigate("library"), 1500);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : t.failedAdd);
    } finally {
      setInstalling(null);
    }
  };

  const formatSize = (bytes: number) => {
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
        <p>{t.loadingStore}</p>
      </div>
    );
  }

  if (selectedApp) {
    const latestVersion = versions[0];
    return (
      <div className="store-detail">
        <button className="back-btn" onClick={() => setSelectedApp(null)}>
          {t.backToStore}
        </button>

        <div className="detail-header">
          <div className="detail-icon">
            {selectedApp.icon_url ? (
              <img src={selectedApp.icon_url} alt={selectedApp.name} />
            ) : (
              <span className="icon-placeholder">📦</span>
            )}
          </div>
          <div className="detail-info">
            <h1>{selectedApp.name}</h1>
            <span className="detail-category">{selectedApp.category}</span>
            <p className="detail-desc">
              {selectedApp.description || t.noDescription}
            </p>
            {latestVersion && (
              <div className="detail-meta">
                <span>{t.version}: {latestVersion.version_name}</span>
                <span>{t.type}: {distLabel(latestVersion.distribution_type)}</span>
                <span>{t.size}: {formatSize(latestVersion.file_size)}</span>
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
            {installing === selectedApp.id ? t.adding : t.addToLibrary}
          </button>
        </div>

        {versions.length > 0 && (
          <div className="versions-section">
            <h3>{t.availableVersions}</h3>
            {versions.map((v) => (
              <div key={v.id} className="version-row">
                <div>
                  <strong>{v.version_name}</strong>
                  {v.is_required && (
                    <span className="required-badge"> · {t.required}</span>
                  )}
                  <span className="version-size">
                    {formatSize(v.file_size)} · {distLabel(v.distribution_type)}
                  </span>
                </div>
                <span className="version-date">
                  {v.release_date
                    ? new Date(v.release_date).toLocaleDateString(locale === "vi" ? "vi-VN" : "en-US")
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
        <h2>{t.storeTitle}</h2>
        <p>{t.storeSubtitle}</p>
      </div>

      {message && <div className="store-message">{message}</div>}

      {apps.length === 0 ? (
        <div className="store-empty">
          <span className="empty-icon">📦</span>
          <p>{t.noApps}</p>
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
                  <span className="icon-placeholder">📦</span>
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
                    : t.noDescription}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
