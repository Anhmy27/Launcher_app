import apiClient from './api';
import type { App, AppVersion } from './api';
import { tauriCommands } from './tauri';

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
}

// ─── Download progress ────────────────────────────────────────────────────
export interface DownloadProgress {
  downloadId?: string;
  appId: string;
  versionId: string;
  appName: string;
  progress: number; // 0-100
  status: 'fetching_manifest' | 'comparing' | 'downloading' | 'completed' | 'failed';
  fileName: string; // current file being processed
  downloadPath?: string; // install directory when completed
  downloadedFiles?: number;
  totalFiles?: number;
}

type DownloadListener = (downloads: DownloadProgress[]) => void;

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
   * Install or update an app using the manifest system.
   *
   * 1. Fetch manifest from version.manifest_url
   * 2. Compare file hashes with local files
   * 3. Download only new/changed files
   * 4. Save manifest locally for future comparisons
   */
  async startDownload(app: App, version: AppVersion) {
    const key = `${app.id}-${version.id}`;
    let serverDownloadId: string | undefined;

    // Already in progress?
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
      // Record download start on server
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
          // ignore backend sync errors
        }
      };

      // 1. Fetch manifest
      await pushBackendProgress('in_progress', { ...progress, downloadId: serverDownloadId }, 0);

      const manifestResp = await fetch(version.manifest_url);
      if (!manifestResp.ok) {
        throw new Error(`Failed to fetch manifest: ${manifestResp.status}`);
      }
      const manifest: Manifest = await manifestResp.json();

      // 2. Get install directory
      const installDir = await tauriCommands.getAppDataDir(app.slug);
      await tauriCommands.ensureDirExists(installDir);

      // 3. Compare with local files
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

      // Try reading cached local manifest for fast comparison
      const localManifestPath = `${installDir}\\manifest.json`;
      try {
        const localManifestStr = await tauriCommands.readTextFile(localManifestPath);
        const localManifest: Manifest = JSON.parse(localManifestStr);

        // For each file in the local manifest, verify the hash of the actual file
        for (const f of localManifest.files) {
          try {
            const filePath = `${installDir}\\${f.path.replace(/\//g, '\\\\')}`;
            const exists = await tauriCommands.checkAppExists(filePath);
            if (exists) {
              const hash = await tauriCommands.calculateFileHash(filePath);
              localHashes.set(f.path, hash);
            }
          } catch {
            // file missing or can't hash → will re-download
          }
        }
      } catch {
        // No local manifest yet (first install) — all files need downloading
      }

      // 4. Determine which files need downloading
      const filesToDownload = manifest.files.filter((f) => {
        const localHash = localHashes.get(f.path);
        return localHash !== f.sha256;
      });

      // 5. Delete files that are no longer in the new manifest
      const newPaths = new Set(manifest.files.map((f) => f.path));
      for (const [localPath] of localHashes) {
        if (!newPaths.has(localPath)) {
          try {
            const fullPath = `${installDir}\\${localPath.replace(/\//g, '\\\\')}`;
            await tauriCommands.deleteFile(fullPath);
          } catch { /* ignore */ }
        }
      }

      // 6. Download files
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
          progress: totalBytes > 0 ? (downloadedBytes / totalBytes) * 95 : (i / filesToDownload.length) * 95,
        };
        this.downloads.set(key, downloadingProgress);
        this.notify();
        await pushBackendProgress('in_progress', downloadingProgress, downloadedBytes);

        await tauriCommands.downloadFileToPath(file.url, destPath);
        downloadedBytes += file.size;
      }

      // 7. Save manifest locally
      await tauriCommands.writeTextFile(localManifestPath, JSON.stringify(manifest, null, 2));

      // 8. Sync version to device on backend
      const deviceId = localStorage.getItem('deviceId');
      if (deviceId) {
        try {
          await apiClient.syncDeviceApps(deviceId, [{
            app_id: app.id,
            installed_version_code: manifest.version_code,
            installed_version_name: manifest.version_name,
          }]);
        } catch { /* ignore */ }
      }

      // 9. Done!
      const completedProgress = {
        ...progress,
        downloadId: serverDownloadId,
        progress: 100,
        status: 'completed' as const,
        fileName: `${filesToDownload.length} files installed`,
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
