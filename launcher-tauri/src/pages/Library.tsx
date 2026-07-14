import { useState, useEffect, useCallback, useRef } from "react";
import apiClient from "../lib/api";
import type { App, AppVersion, UserApp } from "../lib/api";
import { tauriCommands } from "../lib/tauri";
import type { DownloadProgress, Manifest } from "../lib/downloadManager";
import { isDownloadInProgress } from "../lib/downloadManager";
import { useLocale } from "../context/LocaleContext";
import {
  INSTALL_STATE_FILE,
  getBlockingRequiredUpdate,
  getDistributionType,
  hasDistributionMismatch,
  isInstallerVersion,
  toLocalPath,
  type InstallState,
} from "../lib/distribution";
import {
  canSystemUninstall,
  getPartialUninstallNote,
  readLocalInstallMetadata,
  uninstallAppFromDevice,
} from "../lib/appCleanup";
import "./Library.css";

interface LibraryProps {
  downloads: DownloadProgress[];
  onStartDownload: (app: App, version: AppVersion) => void;
}

interface AppInstallStatus {
  isInstalled: boolean;
  installDir?: string;
  entryPoint?: string;
  installerLaunchPath?: string;
  localVersionCode?: number;
  localVersionName?: string;
  latestVersionCode?: number;
  latestVersionName?: string;
  hasUpdate: boolean;
  needsReinstall: boolean;
  hasStaleLocal: boolean;
  forceUpdateRequired: boolean;
  forceUpdateVersionName?: string;
  partialUninstallNote?: string;
  canLaunch: boolean;
  canUninstall: boolean;
  hasDeviceSync: boolean;
  distributionType: "portable" | "installer";
}

export default function Library({ downloads, onStartDownload }: LibraryProps) {
  const { t, distLabel } = useLocale();
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

  const statusCheckRef = useRef(0);

  // Check install status for every app by looking at local managed directory
  const checkFileStatuses = useCallback(async () => {
    const checkId = ++statusCheckRef.current;
    const statuses = new Map<string, AppInstallStatus>();

    let syncedAppIds = new Set<string>();
    const deviceId = localStorage.getItem("deviceId");
    if (deviceId) {
      try {
        const { app_status } = await apiClient.getDeviceStatus(deviceId);
        syncedAppIds = new Set((app_status || []).map((s) => s.app_id));
      } catch {
        // ignore
      }
    }

    for (const [appId, detail] of appDetails.entries()) {
      const latestVersion = detail.versions[0];
      if (!latestVersion) continue;

      const distType = getDistributionType(latestVersion);
      const hasDeviceSync = syncedAppIds.has(appId);
      const localMeta = await readLocalInstallMetadata(detail.app.slug);
      const localDist = localMeta?.distribution_type ?? null;

      try {
        if (hasDistributionMismatch(localDist, distType)) {
          statuses.set(appId, {
            isInstalled: false,
            latestVersionCode: latestVersion.version_code,
            latestVersionName: latestVersion.version_name,
            hasUpdate: false,
            needsReinstall: true,
            hasStaleLocal: true,
            forceUpdateRequired: false,
            canLaunch: false,
            canUninstall: true,
            hasDeviceSync,
            distributionType: distType,
          });
          continue;
        }

        const installDir = await tauriCommands.getAppDataDir(detail.app.slug);
        const manifestPath = toLocalPath(installDir, 'manifest.json');
        const installStatePath = toLocalPath(installDir, INSTALL_STATE_FILE);

        let isInstalled = false;
        let canLaunch = false;
        let entryPoint: string | undefined;
        let localVersionCode: number | undefined;
        let localVersionName: string | undefined;

        let installerLaunchPath: string | undefined;

        if (isInstallerVersion(latestVersion)) {
          let stateLaunchPath: string | undefined;
          try {
            const stateExists = await tauriCommands.checkAppExists(installStatePath);
            if (stateExists) {
              const stateStr = await tauriCommands.readTextFile(installStatePath);
              const state: InstallState = JSON.parse(stateStr);
              stateLaunchPath = state.installer_launch_path?.trim();
              if (state.installer_completed) {
                isInstalled = true;
                localVersionCode = state.version_code;
                localVersionName = state.version_name;
              }
            }
          } catch {
            isInstalled = false;
          }

          installerLaunchPath =
            stateLaunchPath || latestVersion.installer_launch_path?.trim();
          if (installerLaunchPath) {
            canLaunch = await tauriCommands.checkAppExists(installerLaunchPath);
          }
        } else {
          try {
            const exists = await tauriCommands.checkAppExists(manifestPath);
            if (exists) {
              const manifestStr = await tauriCommands.readTextFile(manifestPath);
              const manifest: Manifest = JSON.parse(manifestStr);
              isInstalled = true;
              entryPoint = manifest.entry_point;
              localVersionCode = manifest.version_code;
              localVersionName = manifest.version_name;
              canLaunch = true;
            }
          } catch {
            isInstalled = false;
          }
        }

        const latestVersionCode = latestVersion.version_code;
        const latestVersionName = latestVersion.version_name;
        const hasUpdate =
          isInstalled &&
          localVersionCode !== undefined &&
          localVersionCode < latestVersionCode;

        const blockingUpdate = getBlockingRequiredUpdate(detail.versions, localVersionCode);
        const forceUpdateRequired = blockingUpdate !== null;
        if (forceUpdateRequired) {
          canLaunch = false;
        }

        const versionForUninstall = {
          ...latestVersion,
          ...localMeta,
          distribution_type: latestVersion.distribution_type,
        } as AppVersion;

        const canUninstall = isInstallerVersion(latestVersion)
          ? isInstalled || canLaunch || hasDeviceSync
          : isInstalled || hasDeviceSync;

        statuses.set(appId, {
          isInstalled,
          installDir,
          entryPoint,
          installerLaunchPath,
          localVersionCode,
          localVersionName,
          latestVersionCode,
          latestVersionName,
          hasUpdate,
          needsReinstall: false,
          hasStaleLocal: false,
          forceUpdateRequired,
          forceUpdateVersionName: blockingUpdate?.version_name,
          partialUninstallNote: getPartialUninstallNote(versionForUninstall) ?? undefined,
          canLaunch,
          canUninstall,
          hasDeviceSync,
          distributionType: distType,
        });
      } catch {
        statuses.set(appId, {
          isInstalled: false,
          hasUpdate: false,
          needsReinstall: false,
          hasStaleLocal: false,
          forceUpdateRequired: false,
          canLaunch: false,
          canUninstall: hasDeviceSync,
          hasDeviceSync,
          distributionType: distType,
        });
      }
    }

    if (checkId !== statusCheckRef.current) return;
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
    appSlug: string,
    installDir: string,
    entryPoint: string,
    latestVersion?: AppVersion,
    status?: AppInstallStatus,
  ) => {
    try {
      if (status?.forceUpdateRequired) {
        setMessage(t.forceUpdateBeforeLaunch.replace("{version}", status.forceUpdateVersionName || ""));
        return;
      }

      if (latestVersion?.distribution_type === "installer") {
        const localMeta = await readLocalInstallMetadata(appSlug);
        const launchPath =
          status?.installerLaunchPath?.trim() ||
          localMeta?.installer_launch_path?.trim() ||
          latestVersion.installer_launch_path?.trim();
        if (!launchPath) {
          setMessage(t.launchPathMissing);
          return;
        }
        const exists = await tauriCommands.checkAppExists(launchPath);
        if (!exists) {
          setMessage(`${t.appNotFoundAt}: ${launchPath}`);
          return;
        }
        await tauriCommands.launchApp(launchPath);
        setMessage(`${t.launching} ${appName}...`);
        return;
      }

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
      setMessage(err instanceof Error ? err.message : t.failedLaunch);
    }
  };

  const handleUninstall = async (
    appId: string,
    appName: string,
    appSlug: string,
    latestVersion?: AppVersion,
  ) => {
    const isInstaller = isInstallerVersion(latestVersion);

    const localMeta = isInstaller ? await readLocalInstallMetadata(appSlug) : null;
    const versionForPrompt = {
      ...latestVersion,
      ...localMeta,
      distribution_type: latestVersion?.distribution_type,
    } as AppVersion;
    const systemUninstall = canSystemUninstall(versionForPrompt);

    const partialNote = getPartialUninstallNote(versionForPrompt);

    let prompt: string;
    if (isInstaller && systemUninstall) {
      prompt = t.uninstallWindows.replace("{name}", appName);
    } else if (partialNote) {
      prompt = `${partialNote}\n\n${t.uninstallLocal.replace("{name}", appName)}`;
    } else {
      prompt = t.uninstallLocal.replace("{name}", appName);
    }

    if (!confirm(prompt)) return;

    try {
      const result = await uninstallAppFromDevice(appSlug, appId, latestVersion);

      if (result.removedSystemApp) {
        setMessage(`${appName} ${t.uninstalledWindows}`);
      } else {
        setMessage(`${appName} ${t.localFilesRemoved}`);
      }

      await checkFileStatuses();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : t.failedUninstall);
    }
  };

  const handleRemoveFromLibrary = async (appId: string, appName: string) => {
    if (!confirm(t.removeFromLibraryConfirm.replace("{name}", appName))) {
      return;
    }

    try {
      await apiClient.uninstallApp(appId);
      setMyApps((prev) => prev.filter((a) => a.app_id !== appId));
      setAppDetails((prev) => {
        const next = new Map(prev);
        next.delete(appId);
        return next;
      });
      setFileStatuses((prev) => {
        const next = new Map(prev);
        next.delete(appId);
        return next;
      });
      setMessage(`${appName} ${t.removedFromLibrary}`);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : t.failedRemove);
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
        <p>{t.loadingLibrary}</p>
      </div>
    );
  }

  return (
    <div className="library-page">
      <div className="library-header">
        <h2>{t.libraryTitle}</h2>
        <p>{t.librarySubtitle}</p>
      </div>

      {message && <div className="store-message">{message}</div>}

      {myApps.length === 0 ? (
        <div className="store-empty">
          <span className="empty-icon">📭</span>
          <p>{t.libraryEmpty}</p>
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
                  <h3>{app?.name || t.unknownApp}</h3>
                  <div className="library-meta">
                    {latestVersion && (
                      <>
                        <span>v{latestVersion.version_name}</span>
                        <span className="dot">·</span>
                        <span>{formatSize(latestVersion.file_size)}</span>
                        <span className="dot">·</span>
                        <span>{distLabel(latestVersion.distribution_type)}</span>
                      </>
                    )}
                    {status?.needsReinstall && (
                      <span className="update-badge">⚠ {t.needsReinstall}</span>
                    )}
                    {status?.forceUpdateRequired && (
                      <span className="update-badge">⛔ {t.forceUpdate} v{status.forceUpdateVersionName}</span>
                    )}
                    {status?.partialUninstallNote && (
                      <span className="progress-text" title={status.partialUninstallNote}>
                        ℹ️ {t.partialUninstall}
                      </span>
                    )}
                    {status?.isInstalled && !status?.hasUpdate && (
                      <span className="installed-badge">
                        ✅ {t.installed}
                        {status.localVersionName
                          ? ` (v${status.localVersionName})`
                          : ""}
                      </span>
                    )}
                    {status?.isInstalled && status?.hasUpdate && (
                      <span className="update-badge">
                        🔄 {t.updateAvailable} (v{status.localVersionName} → v
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
                          ? t.fetchingManifest
                          : dl.status === "comparing"
                            ? t.comparingFiles
                            : dl.status === "downloading"
                              ? `${t.installing}... ${dl.downloadedFiles ?? 0}/${dl.totalFiles ?? "?"} file (${dl.progress.toFixed(0)}%)`
                              : dl.status === "running_installer"
                                ? t.runningInstaller
                                : dl.status === "failed"
                                  ? `❌ ${dl.fileName} — ${t.installFailed}`
                              : t.failed}
                      </span>
                    </div>
                  )}
                </div>
                <div className="library-actions">
                  {(!status?.isInstalled || status?.needsReinstall) &&
                    !isDownloadInProgress(dl) &&
                    latestVersion && (
                    <button
                      className="install-btn"
                      onClick={() => app && onStartDownload(app, latestVersion)}
                    >
                      {status?.needsReinstall
                        ? `🔄 ${t.reinstall}`
                        : isInstallerVersion(latestVersion)
                          ? `📥 ${t.runInstaller}`
                          : `📦 ${t.install}`}
                    </button>
                  )}

                  {status?.isInstalled &&
                    status.canLaunch &&
                    !status.forceUpdateRequired && (
                      <button
                        className="launch-btn"
                        onClick={() =>
                          handleLaunch(
                            app?.name || "",
                            app?.slug || ua.app_id,
                            status.installDir || "",
                            status.entryPoint || "",
                            latestVersion,
                            status,
                          )
                        }
                      >
                        ▶ {t.launch}
                      </button>
                    )}

                  {status?.isInstalled &&
                    isInstallerVersion(latestVersion) &&
                    !status.canLaunch && (
                      <span className="progress-text" title="Set installer_launch_path in admin">
                        ⚠ {t.launchPathNotFound}
                      </span>
                    )}

                  {/* Update available or required → Update button */}
                  {(status?.hasUpdate || status?.forceUpdateRequired) &&
                    latestVersion &&
                    app && (
                    <button
                      className="update-btn"
                      onClick={() => onStartDownload(app, latestVersion)}
                    >
                      {status?.forceUpdateRequired ? `⛔ ${t.forceUpdateBtn}` : `🔄 ${t.update}`}
                    </button>
                  )}

                  {/* Installed → Open folder */}
                  {status?.isInstalled && status.installDir && (
                    <button
                      className="folder-btn"
                      onClick={() => handleOpenFolder(status.installDir!)}
                      title={t.openFolder}
                    >
                      📂
                    </button>
                  )}

                  {/* Uninstall from device (keep in library) */}
                  {status?.canUninstall && (
                    <button
                      className="delete-btn"
                      onClick={() =>
                        handleUninstall(
                          ua.app_id,
                          app?.name || "",
                          app?.slug || ua.app_id,
                          latestVersion,
                        )
                      }
                      title={status?.partialUninstallNote || t.removeFromDevice}
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
                    title={t.removeFromLibrary}
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
