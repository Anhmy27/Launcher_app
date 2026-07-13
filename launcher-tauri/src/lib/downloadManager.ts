import apiClient from './api';
import type { App, AppVersion } from './api';
import { tauriCommands } from './tauri';
import { open as openExternal } from '@tauri-apps/plugin-shell';
import {
  INSTALL_STATE_FILE,
  getDistributionType,
  hasDistributionMismatch,
  isInstallerExitSuccess,
  isInstallerVersion,
  isUrlVersion,
  toLocalPath,
  type DistributionType,
  type InstallState,
} from './distribution';

// ─── Manifest types (mirrors backend Manifest struct) ─────────────────────
export interface ManifestFile {
  path: string;
  sha256: string;
  size: number;
  url: string;
}

export interface Manifest {
  version: number;
  app_id: string;
  version_id: string;
  version_name: string;
  version_code: number;
  entry_point: string;
  files: ManifestFile[];
  total_size: number;
  created_at: string;
  distribution_type?: 'portable' | 'installer' | 'url';
  installer_kind?: string;
  installer_silent_args?: string;
  installer_launch_path?: string;
  installer_product_code?: string;
  installer_uninstall_path?: string;
  installer_uninstall_args?: string;
}

// ─── Download progress ────────────────────────────────────────────────────
export interface DownloadProgress {
  downloadId?: string;
  appId: string;
  versionId: string;
  appName: string;
  progress: number;
  status:
    | 'fetching_manifest'
    | 'comparing'
    | 'downloading'
    | 'running_installer'
    | 'completed'
    | 'failed';
  fileName: string;
  downloadPath?: string;
  downloadedFiles?: number;
  totalFiles?: number;
}

const IN_PROGRESS_STATUSES: DownloadProgress['status'][] = [
  'fetching_manifest',
  'comparing',
  'downloading',
  'running_installer',
];

type DownloadListener = (downloads: DownloadProgress[]) => void;

/** True when a download blocks starting another install for the same app. */
export function isDownloadInProgress(dl?: DownloadProgress): boolean {
  if (!dl) return false;
  return IN_PROGRESS_STATUSES.includes(dl.status);
}

async function syncDeviceVersion(appId: string, versionCode: number, versionName: string) {
  const deviceId = localStorage.getItem('deviceId');
  if (!deviceId) return;
  try {
    await apiClient.syncDeviceApps(deviceId, [{
      app_id: appId,
      installed_version_code: versionCode,
      installed_version_name: versionName,
    }]);
  } catch {
    // ignore
  }
}

async function readLocalDistributionTypeFromDir(installDir: string): Promise<DistributionType | null> {
  const manifestPath = toLocalPath(installDir, 'manifest.json');
  const installStatePath = toLocalPath(installDir, INSTALL_STATE_FILE);

  try {
    const manifestStr = await tauriCommands.readTextFile(manifestPath);
    const manifest = JSON.parse(manifestStr) as Manifest;
    return manifest.distribution_type || 'portable';
  } catch {
    try {
      const exists = await tauriCommands.checkAppExists(installStatePath);
      if (!exists) return null;
      const stateStr = await tauriCommands.readTextFile(installStatePath);
      const state = JSON.parse(stateStr) as InstallState;
      return state.distribution_type || 'installer';
    } catch {
      return null;
    }
  }
}

async function clearStaleInstallIfMismatch(
  appSlug: string,
  latestType: DistributionType,
): Promise<boolean> {
  try {
    const installDir = await tauriCommands.getAppDataDir(appSlug);
    const localType = await readLocalDistributionTypeFromDir(installDir);
    if (!hasDistributionMismatch(localType, latestType)) return false;

    const exists = await tauriCommands.checkAppExists(installDir);
    if (exists) {
      await tauriCommands.deleteDirectory(installDir);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

async function recordUrlOpen(_app: App, version: AppVersion): Promise<void> {
  let serverDownloadId: string | undefined;
  try {
    const download = await apiClient.startDownload(version.id);
    serverDownloadId = download.id;
  } catch {
    return;
  }

  const detail = JSON.stringify({
    stage: 'completed',
    file_name: version.launch_url || 'Opened URL',
    progress: 100,
    downloaded_files: 0,
    total_files: 0,
    download_path: '',
  });

  try {
    await apiClient.updateDownloadStatus(serverDownloadId, 'completed', 0, detail);
  } catch {
    // ignore
  }
}

async function readLocalInstallState(installDir: string): Promise<InstallState | null> {
  const installStatePath = toLocalPath(installDir, INSTALL_STATE_FILE);
  try {
    const exists = await tauriCommands.checkAppExists(installStatePath);
    if (!exists) return null;
    const stateStr = await tauriCommands.readTextFile(installStatePath);
    return JSON.parse(stateStr) as InstallState;
  } catch {
    return null;
  }
}

class DownloadManager {
  private downloads: Map<string, DownloadProgress> = new Map();
  private listeners: Set<DownloadListener> = new Set();

  subscribe(listener: DownloadListener) {
    this.listeners.add(listener);
    listener(this.getDownloads());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const list = Array.from(this.downloads.values());
    this.listeners.forEach((l) => l(list));
  }

  getDownloads(): DownloadProgress[] {
    return Array.from(this.downloads.values());
  }

  getDownloadForApp(appId: string): DownloadProgress | undefined {
    return this.getDownloads().find((d) => d.appId === appId);
  }

  clearDownload(appId: string, versionId: string) {
    const key = `${appId}-${versionId}`;
    this.downloads.delete(key);
    this.notify();
  }

  async openUrlApp(app: App, version: AppVersion) {
    if (!version.launch_url) {
      throw new Error('No launch URL configured for this app');
    }
    await openExternal(version.launch_url);
    await syncDeviceVersion(app.id, version.version_code, version.version_name);
    await recordUrlOpen(app, version);
  }

  async startDownload(app: App, version: AppVersion) {
    const key = `${app.id}-${version.id}`;
    let serverDownloadId: string | undefined;

    if (isUrlVersion(version)) {
      await this.openUrlApp(app, version);
      return;
    }

    const existing = this.downloads.get(key);
    if (existing && isDownloadInProgress(existing)) {
      return;
    }

    // Allow retry after failed/completed by clearing stale entry
    if (existing && (existing.status === 'failed' || existing.status === 'completed')) {
      this.downloads.delete(key);
    }

    const progress: DownloadProgress = {
      appId: app.id,
      versionId: version.id,
      appName: app.name,
      progress: 0,
      status: 'fetching_manifest',
      fileName: 'manifest.json',
    };
    this.downloads.set(key, progress);
    this.notify();

    try {
      try {
        const download = await apiClient.startDownload(version.id);
        serverDownloadId = download.id;
      } catch {
        // ignore
      }

      const pushBackendProgress = async (
        status: 'in_progress' | 'completed' | 'failed',
        current: DownloadProgress,
        downloadedSize: number,
      ) => {
        if (!serverDownloadId) return;
        const detail = JSON.stringify({
          stage: current.status,
          file_name: current.fileName,
          progress: current.progress,
          downloaded_files: current.downloadedFiles ?? 0,
          total_files: current.totalFiles ?? 0,
          download_path: current.downloadPath || '',
        });
        try {
          await apiClient.updateDownloadStatus(serverDownloadId, status, downloadedSize, detail);
        } catch {
          // ignore
        }
      };

      await pushBackendProgress('in_progress', { ...progress, downloadId: serverDownloadId }, 0);

      const manifestResp = await fetch(version.manifest_url);
      if (!manifestResp.ok) {
        throw new Error(`Failed to fetch manifest: ${manifestResp.status}`);
      }
      const manifest: Manifest = await manifestResp.json();

      const installDir = await tauriCommands.getAppDataDir(app.slug);
      const latestDist = getDistributionType(version);
      await clearStaleInstallIfMismatch(app.slug, latestDist);
      await tauriCommands.ensureDirExists(installDir);
      const localManifestPath = toLocalPath(installDir, 'manifest.json');

      const comparingProgress = {
        ...progress,
        downloadId: serverDownloadId,
        status: 'comparing' as const,
        fileName: 'Comparing files...',
      };
      this.downloads.set(key, comparingProgress);
      this.notify();
      await pushBackendProgress('in_progress', comparingProgress, 0);

      const localHashes = new Map<string, string>();

      try {
        const localManifestStr = await tauriCommands.readTextFile(localManifestPath);
        const localManifest: Manifest = JSON.parse(localManifestStr);

        for (const f of localManifest.files) {
          try {
            const filePath = toLocalPath(installDir, f.path);
            const exists = await tauriCommands.checkAppExists(filePath);
            if (exists) {
              const hash = await tauriCommands.calculateFileHash(filePath);
              localHashes.set(f.path, hash);
            }
          } catch {
            // file missing
          }
        }
      } catch {
        // first install
      }

      const filesToDownload = manifest.files.filter((f) => {
        const localHash = localHashes.get(f.path);
        return localHash !== f.sha256;
      });

      const newPaths = new Set(manifest.files.map((f) => f.path));
      for (const [localPath] of localHashes) {
        if (!newPaths.has(localPath)) {
          try {
            await tauriCommands.deleteFile(toLocalPath(installDir, localPath));
          } catch { /* ignore */ }
        }
      }

      const totalBytes = filesToDownload.reduce((acc, f) => acc + f.size, 0);
      let downloadedBytes = 0;

      const downloadingStartProgress = {
        ...progress,
        downloadId: serverDownloadId,
        status: 'downloading' as const,
        fileName: filesToDownload.length > 0 ? filesToDownload[0].path : '',
        downloadedFiles: 0,
        totalFiles: filesToDownload.length,
      };
      this.downloads.set(key, downloadingStartProgress);
      this.notify();
      await pushBackendProgress('in_progress', downloadingStartProgress, 0);

      for (let i = 0; i < filesToDownload.length; i++) {
        const file = filesToDownload[i];
        const destPath = toLocalPath(installDir, file.path);

        const downloadingProgress = {
          ...progress,
          downloadId: serverDownloadId,
          status: 'downloading' as const,
          fileName: file.path,
          downloadedFiles: i,
          totalFiles: filesToDownload.length,
          progress: totalBytes > 0
            ? (downloadedBytes / totalBytes) * 85
            : (i / filesToDownload.length) * 85,
        };
        this.downloads.set(key, downloadingProgress);
        this.notify();
        await pushBackendProgress('in_progress', downloadingProgress, downloadedBytes);

        await tauriCommands.downloadFileToPath(file.url, destPath);

        const actualHash = await tauriCommands.calculateFileHash(destPath);
        if (actualHash !== file.sha256) {
          await tauriCommands.deleteFile(destPath);
          throw new Error(`Hash mismatch for ${file.path}`);
        }

        downloadedBytes += file.size;
      }

      const distType = manifest.distribution_type || version.distribution_type || 'portable';
      const isInstaller = distType === 'installer' || isInstallerVersion(version);
      let installerExitCode: number | undefined;

      if (isInstaller) {
        const localState = await readLocalInstallState(installDir);
        const alreadyInstalled =
          localState?.installer_completed === true &&
          localState.version_code === manifest.version_code &&
          filesToDownload.length === 0;

        if (!alreadyInstalled) {
          const installerKind = (manifest.installer_kind || version.installer_kind || '').toLowerCase();
          const silentArgs = manifest.installer_silent_args || version.installer_silent_args || '';
          const installerPath = toLocalPath(installDir, manifest.entry_point);

          const runningInstallerProgress = {
            ...progress,
            downloadId: serverDownloadId,
            status: 'running_installer' as const,
            fileName: 'Running installer...',
            progress: 90,
            downloadPath: installDir,
          };
          this.downloads.set(key, runningInstallerProgress);
          this.notify();
          await pushBackendProgress('in_progress', runningInstallerProgress, downloadedBytes);

          const exitCode = await tauriCommands.runInstaller(
            installerKind,
            installerPath,
            silentArgs,
          );

          if (!isInstallerExitSuccess(exitCode)) {
            throw new Error(`Installer failed with exit code ${exitCode}`);
          }

          installerExitCode = exitCode;

          const installStatePath = toLocalPath(installDir, INSTALL_STATE_FILE);
          const installState: InstallState = {
            distribution_type: 'installer',
            installer_completed: true,
            version_id: manifest.version_id,
            version_code: manifest.version_code,
            version_name: manifest.version_name,
            installer_exit_code: exitCode,
            installer_kind: installerKind,
            installer_product_code: manifest.installer_product_code || version.installer_product_code,
            installer_uninstall_path: manifest.installer_uninstall_path || version.installer_uninstall_path,
            installer_uninstall_args: manifest.installer_uninstall_args || version.installer_uninstall_args,
            installer_launch_path: manifest.installer_launch_path || version.installer_launch_path,
          };
          await tauriCommands.writeTextFile(
            installStatePath,
            JSON.stringify(installState, null, 2),
          );
        }
      }

      await tauriCommands.writeTextFile(localManifestPath, JSON.stringify(manifest, null, 2));
      await syncDeviceVersion(app.id, manifest.version_code, manifest.version_name);

      const installerCompletedMessage =
        installerExitCode === 3010 || installerExitCode === 1641
          ? 'Installer completed — reboot required'
          : 'Installer completed';

      const completedProgress = {
        ...progress,
        downloadId: serverDownloadId,
        progress: 100,
        status: 'completed' as const,
        fileName: isInstaller
          ? installerCompletedMessage
          : `${filesToDownload.length} files installed`,
        downloadPath: installDir,
        downloadedFiles: filesToDownload.length,
        totalFiles: filesToDownload.length,
      };
      this.downloads.set(key, completedProgress);
      this.notify();
      await pushBackendProgress('completed', completedProgress, downloadedBytes);

      setTimeout(() => {
        if (this.downloads.get(key)?.status === 'completed') {
          this.downloads.delete(key);
          this.notify();
        }
      }, 4000);
    } catch (err) {
      console.error('Install error:', err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : err && typeof err === 'object' && 'message' in err
              ? String((err as { message: unknown }).message)
              : String(err ?? 'Unknown error');
      const failedProgress = {
        ...progress,
        downloadId: serverDownloadId,
        status: 'failed' as const,
        fileName: errorMessage,
      };
      this.downloads.set(key, failedProgress);
      this.notify();

      if (failedProgress.downloadId) {
        const detail = JSON.stringify({
          stage: failedProgress.status,
          file_name: failedProgress.fileName,
          progress: failedProgress.progress,
          downloaded_files: failedProgress.downloadedFiles ?? 0,
          total_files: failedProgress.totalFiles ?? 0,
          download_path: failedProgress.downloadPath || '',
        });
        try {
          await apiClient.updateDownloadStatus(
            failedProgress.downloadId,
            'failed',
            0,
            detail,
          );
        } catch {
          // ignore
        }
      }
    }
  }

  removeDownload(appId: string, versionId: string) {
    this.clearDownload(appId, versionId);
  }
}

export const downloadManager = new DownloadManager();
export default downloadManager;
