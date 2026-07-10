import apiClient from './api';
import type { App, AppVersion } from './api';
import { tauriCommands } from './tauri';
import { open as openExternal } from '@tauri-apps/plugin-shell';
import {
  INSTALL_STATE_FILE,
  isInstallerExitSuccess,
  isInstallerVersion,
  isUrlVersion,
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
  progress: number; // 0-100
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

type DownloadListener = (downloads: DownloadProgress[]) => void;

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

  /**
   * Open a URL app and sync device status.
   */
  async openUrlApp(app: App, version: AppVersion) {
    if (!version.launch_url) {
      throw new Error('No launch URL configured for this app');
    }
    await openExternal(version.launch_url);
    await syncDeviceVersion(app.id, version.version_code, version.version_name);
  }

  async startDownload(app: App, version: AppVersion) {
    const key = `${app.id}-${version.id}`;
    let serverDownloadId: string | undefined;

    if (isUrlVersion(version)) {
      await this.openUrlApp(app, version);
      return;
    }

    if (this.downloads.has(key) && this.downloads.get(key)!.status === 'downloading') {
      return;
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
      await tauriCommands.ensureDirExists(installDir);

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
      const localManifestPath = `${installDir}\\manifest.json`;

      try {
        const localManifestStr = await tauriCommands.readTextFile(localManifestPath);
        const localManifest: Manifest = JSON.parse(localManifestStr);

        for (const f of localManifest.files) {
          try {
            const filePath = `${installDir}\\${f.path.replace(/\//g, '\\\\')}`;
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
            const fullPath = `${installDir}\\${localPath.replace(/\//g, '\\\\')}`;
            await tauriCommands.deleteFile(fullPath);
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
        const destPath = `${installDir}\\${file.path.replace(/\//g, '\\\\')}`;

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
        downloadedBytes += file.size;
      }

      const distType = manifest.distribution_type || version.distribution_type || 'portable';
      const isInstaller = distType === 'installer' || isInstallerVersion(version);

      if (isInstaller) {
        const installerKind = manifest.installer_kind || version.installer_kind || '';
        const silentArgs = manifest.installer_silent_args || version.installer_silent_args || '';
        const installerPath = `${installDir}\\${manifest.entry_point.replace(/\//g, '\\\\')}`;

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

        const installStatePath = `${installDir}\\${INSTALL_STATE_FILE}`;
        await tauriCommands.writeTextFile(
          installStatePath,
          JSON.stringify({
            distribution_type: 'installer',
            installer_completed: true,
            version_code: manifest.version_code,
            version_name: manifest.version_name,
            installer_exit_code: exitCode,
          }, null, 2),
        );
      }

      await tauriCommands.writeTextFile(localManifestPath, JSON.stringify(manifest, null, 2));
      await syncDeviceVersion(app.id, manifest.version_code, manifest.version_name);

      const completedProgress = {
        ...progress,
        downloadId: serverDownloadId,
        progress: 100,
        status: 'completed' as const,
        fileName: isInstaller ? 'Installer completed' : `${filesToDownload.length} files installed`,
        downloadPath: installDir,
        downloadedFiles: filesToDownload.length,
        totalFiles: filesToDownload.length,
      };
      this.downloads.set(key, completedProgress);
      this.notify();
      await pushBackendProgress('completed', completedProgress, downloadedBytes);
    } catch (err) {
      console.error('Install error:', err);
      const failedProgress = {
        ...progress,
        downloadId: serverDownloadId,
        status: 'failed' as const,
        fileName: err instanceof Error ? err.message : 'Unknown error',
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
    const key = `${appId}-${versionId}`;
    this.downloads.delete(key);
    this.notify();
  }
}

export const downloadManager = new DownloadManager();
export default downloadManager;
