import { useState, useEffect, useCallback } from "react";
import apiClient from "../lib/api";
import type { App, AppVersion, UserApp } from "../lib/api";
import { tauriCommands } from "../lib/tauri";
import type { DownloadProgress, Manifest } from "../lib/downloadManager";
import "./Library.css";

interface LibraryProps {
  downloads: DownloadProgress[];
  onStartDownload: (app: App, version: AppVersion) => void;
}

interface AppInstallStatus {
  isInstalled: boolean; // local manifest.json exists
  installDir?: string; // %LOCALAPPDATA%/LauncherApps/{slug}
  entryPoint?: string; // from cached manifest
  localVersionCode?: number; // version_code from cached manifest
  localVersionName?: string; // version_name from cached manifest
  latestVersionCode?: number; // latest version_code on server
  latestVersionName?: string; // latest version_name on server
  hasUpdate: boolean; // true if latestVersionCode > localVersionCode
}

export default function Library({ downloads, onStartDownload }: LibraryProps) {
  const [myApps, setMyApps] = useState<UserApp[]>([]);
  const [appDetails, setAppDetails] = useState<
    Map<string, { app: App; versions: AppVersion[] }>
  >(new Map());
  const [fileStatuses, setFileStatuses] = useState<
    Map<string, AppInstallStatus>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadLibrary = useCallback(async () => {
    try {
      const apps = await apiClient.getMyApps();
      setMyApps(apps || []);
      const details = new Map<string, { app: App; versions: AppVersion[] }>();
      for (const ua of apps || []) {
        try {
          const [app, versions] = await Promise.all([
            apiClient.getAppById(ua.app_id),
            apiClient.getAppVersions(ua.app_id),
          ]);
          details.set(ua.app_id, {
            app,
            versions: (versions || []).filter((v) => v.is_released),
          });
        } catch {
          // skip
        }
      }
      setAppDetails(details);
    } catch (err) {
      console.error("Failed to load library:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Check install status for every app by looking at local managed directory
  const checkFileStatuses = useCallback(async () => {
    const statuses = new Map<string, AppInstallStatus>();

    for (const [appId, detail] of appDetails.entries()) {
      const latestVersion = detail.versions[0];
      if (!latestVersion) continue;

      try {
        const installDir = await tauriCommands.getAppDataDir(detail.app.slug);
        const manifestPath = `${installDir}\\manifest.json`;

        let isInstalled = false;
        let entryPoint: string | undefined;
        let localVersionCode: number | undefined;
        let localVersionName: string | undefined;

        // Try reading the local cached manifest
        try {
          const exists = await tauriCommands.checkAppExists(manifestPath);
          if (exists) {
            const manifestStr = await tauriCommands.readTextFile(manifestPath);
            const manifest: Manifest = JSON.parse(manifestStr);
            isInstalled = true;
            entryPoint = manifest.entry_point;
            localVersionCode = manifest.version_code;
            localVersionName = manifest.version_name;
          }
        } catch {
          isInstalled = false;
        }

        const latestVersionCode = latestVersion.version_code;
        const latestVersionName = latestVersion.version_name;
        const hasUpdate =
          isInstalled &&
          localVersionCode !== undefined &&
          localVersionCode < latestVersionCode;

        statuses.set(appId, {
          isInstalled,
          installDir,
          entryPoint,
          localVersionCode,
          localVersionName,
          latestVersionCode,
          latestVersionName,
          hasUpdate,
        });
      } catch {
        statuses.set(appId, {
          isInstalled: false,
          hasUpdate: false,
        });
      }
    }

    setFileStatuses(statuses);
  }, [appDetails]);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    if (appDetails.size > 0) {
      checkFileStatuses();
    }
  }, [appDetails, downloads, checkFileStatuses]);

  // Re-check after install completes
  useEffect(() => {
    const hasCompleted = downloads.some((d) => d.status === "completed");
    if (!hasCompleted || appDetails.size === 0) return;

    const timers = [2000, 5000].map((delay) =>
      setTimeout(() => checkFileStatuses(), delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [downloads, appDetails, checkFileStatuses]);

  const handleLaunch = async (
    appName: string,
    installDir: string,
    entryPoint: string,
  ) => {
    try {
      const normalizePath = (value: string) => value.replace(/\//g, "\\");
      const manifestPath = `${installDir}\\manifest.json`;

      const candidateRelativePaths: string[] = [];
      if (entryPoint?.trim()) {
        candidateRelativePaths.push(entryPoint.trim());
      }

      try {
        const manifestStr = await tauriCommands.readTextFile(manifestPath);
        const manifest: Manifest = JSON.parse(manifestStr);

        const exeCandidatesFromManifest = (manifest.files || [])
          .map((file) => file.path)
          .filter((path) => /\.exe$/i.test(path));

        exeCandidatesFromManifest.sort((left, right) => {
          const leftDepth = left.split(/[\\/]/).length;
          const rightDepth = right.split(/[\\/]/).length;
          if (leftDepth !== rightDepth) return leftDepth - rightDepth;
          return left.length - right.length;
        });

        for (const exePath of exeCandidatesFromManifest) {
          if (!candidateRelativePaths.includes(exePath)) {
            candidateRelativePaths.push(exePath);
          }
        }
      } catch {
        // Ignore manifest parse/read issues and try with original entry point only
      }

      let resolvedExePath: string | undefined;
      let resolvedEntryPoint: string | undefined;

      for (const relPath of candidateRelativePaths) {
        const fullPath = `${installDir}\\${normalizePath(relPath)}`;
        const exists = await tauriCommands.checkAppExists(fullPath);
        if (exists) {
          resolvedExePath = fullPath;
          resolvedEntryPoint = relPath;
          break;
        }
      }

      if (!resolvedExePath) {
        setMessage(
          `Executable not found. Checked: ${candidateRelativePaths.join(" | ") || entryPoint}`,
        );
        return;
      }

      // Self-heal local manifest entry_point if launcher had to fallback
      if (resolvedEntryPoint && entryPoint !== resolvedEntryPoint) {
        try {
          const manifestStr = await tauriCommands.readTextFile(manifestPath);
          const manifest: Manifest = JSON.parse(manifestStr);
          manifest.entry_point = resolvedEntryPoint;
          await tauriCommands.writeTextFile(
            manifestPath,
            JSON.stringify(manifest, null, 2),
          );
        } catch {
          // ignore self-heal failure
        }
      }

      await tauriCommands.launchApp(resolvedExePath);
      setMessage(`Launching ${appName}...`);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Failed to launch app");
    }
  };

  const handleUninstall = async (appId: string, appName: string) => {
    const status = fileStatuses.get(appId);
    if (!confirm(`Uninstall ${appName}? This will delete all app files.`))
      return;

    try {
      if (status?.installDir) {
        await tauriCommands.deleteDirectory(status.installDir);
      }

      // Remove device app record from backend
      const deviceId = localStorage.getItem("deviceId");
      if (deviceId) {
        try {
          await apiClient.deleteDeviceApp(deviceId, appId);
        } catch (err) {
          console.error("Failed to delete device app status:", err);
        }
      }

      setMessage(`${appName} uninstalled.`);
      await checkFileStatuses();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Failed to uninstall");
    }
  };

  const handleRemoveFromLibrary = async (appId: string, appName: string) => {
    if (!confirm(`Remove ${appName} from your library?`)) return;
    try {
      await apiClient.uninstallApp(appId);
      setMyApps((prev) => prev.filter((a) => a.app_id !== appId));
      setMessage(`${appName} removed from library.`);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Failed to remove");
    }
  };

  const handleOpenFolder = async (installDir: string) => {
    try {
      await tauriCommands.openFile(installDir);
    } catch {
      /* ignore */
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const getDownload = (appId: string) => {
    return downloads.find((d) => d.appId === appId);
  };

  if (loading) {
    return (
      <div className="store-loading">
        <div className="spinner" />
        <p>Loading library...</p>
      </div>
    );
  }

  return (
    <div className="library-page">
      <div className="library-header">
        <h2>📚 My Library</h2>
        <p>Your applications</p>
      </div>

      {message && <div className="store-message">{message}</div>}

      {myApps.length === 0 ? (
        <div className="store-empty">
          <span className="empty-icon">📭</span>
          <p>Your library is empty. Browse the Store to add apps!</p>
        </div>
      ) : (
        <div className="library-list">
          {myApps.map((ua) => {
            const detail = appDetails.get(ua.app_id);
            const app = detail?.app;
            const latestVersion = detail?.versions?.[0];
            const dl = getDownload(ua.app_id);
            const status = fileStatuses.get(ua.app_id);

            return (
              <div key={ua.id} className="library-item">
                <div className="library-icon">
                  {app?.icon_url ? (
                    <img src={app.icon_url} alt={app.name} />
                  ) : (
                    <span className="icon-placeholder">🎮</span>
                  )}
                </div>
                <div className="library-info">
                  <h3>{app?.name || "Unknown App"}</h3>
                  <div className="library-meta">
                    {latestVersion && (
                      <>
                        <span>v{latestVersion.version_name}</span>
                        <span className="dot">·</span>
                        <span>{formatSize(latestVersion.file_size)}</span>
                      </>
                    )}
                    {status?.isInstalled && !status?.hasUpdate && (
                      <span className="installed-badge">
                        ✅ Installed
                        {status.localVersionName
                          ? ` (v${status.localVersionName})`
                          : ""}
                      </span>
                    )}
                    {status?.isInstalled && status?.hasUpdate && (
                      <span className="update-badge">
                        🔄 Update available (v{status.localVersionName} → v
                        {status.latestVersionName})
                      </span>
                    )}
                  </div>
                  {/* Download / install progress */}
                  {dl && dl.status !== "completed" && (
                    <div className="download-progress">
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{ width: `${dl.progress}%` }}
                        />
                      </div>
                      <span className="progress-text">
                        {dl.status === "fetching_manifest"
                          ? "Fetching manifest..."
                          : dl.status === "comparing"
                            ? "Comparing files..."
                            : dl.status === "downloading"
                              ? `Installing... ${dl.downloadedFiles ?? 0}/${dl.totalFiles ?? "?"} files (${dl.progress.toFixed(0)}%)`
                              : "❌ Failed"}
                      </span>
                    </div>
                  )}
                </div>
                <div className="library-actions">
                  {/* Not installed, not in progress → Install button */}
                  {!status?.isInstalled && !dl && latestVersion && (
                    <button
                      className="install-btn"
                      onClick={() => app && onStartDownload(app, latestVersion)}
                    >
                      📦 Install
                    </button>
                  )}

                  {/* Installed → Launch button */}
                  {status?.isInstalled &&
                    status.entryPoint &&
                    status.installDir && (
                      <button
                        className="launch-btn"
                        onClick={() =>
                          handleLaunch(
                            app?.name || "",
                            status.installDir!,
                            status.entryPoint!,
                          )
                        }
                      >
                        ▶ Launch
                      </button>
                    )}

                  {/* Update available → Update button */}
                  {status?.hasUpdate && latestVersion && app && (
                    <button
                      className="update-btn"
                      onClick={() => onStartDownload(app, latestVersion)}
                    >
                      🔄 Update
                    </button>
                  )}

                  {/* Installed → Open folder */}
                  {status?.isInstalled && status.installDir && (
                    <button
                      className="folder-btn"
                      onClick={() => handleOpenFolder(status.installDir!)}
                      title="Open install folder"
                    >
                      📂
                    </button>
                  )}

                  {/* Installed → Uninstall */}
                  {status?.isInstalled && (
                    <button
                      className="delete-btn"
                      onClick={() =>
                        handleUninstall(ua.app_id, app?.name || "")
                      }
                      title="Uninstall"
                    >
                      🗑
                    </button>
                  )}

                  {/* Remove from library */}
                  <button
                    className="remove-btn"
                    onClick={() =>
                      handleRemoveFromLibrary(ua.app_id, app?.name || "")
                    }
                    title="Remove from library"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
