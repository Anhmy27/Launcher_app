import type { AppVersion } from './api';
import apiClient from './api';
import type { Manifest } from './downloadManager';
import { tauriCommands } from './tauri';
import {
  INSTALL_STATE_FILE,
  hasDistributionMismatch,
  isInstallerExitSuccess,
  isInstallerVersion,
  isUrlVersion,
  toLocalPath,
  type DistributionType,
  type InstallState,
} from './distribution';

/**
 * Local install cleanup — used when freeing disk space while keeping the app in library.
 * Not used for "remove from library" (that only updates user_apps on the server).
 */

export function canSystemUninstall(version?: Partial<AppVersion>): boolean {
  if (!version || version.distribution_type !== 'installer') return false;
  const kind = (version.installer_kind || '').toLowerCase();
  if (kind === 'msi') return Boolean(version.installer_product_code?.trim());
  if (kind === 'exe') return Boolean(version.installer_uninstall_path?.trim());
  return false;
}

/** Human-readable note when uninstall only clears launcher cache. */
export function getPartialUninstallNote(version?: Partial<AppVersion>): string | null {
  if (!version || version.distribution_type !== 'installer') return null;
  if (canSystemUninstall(version)) return null;
  const kind = (version.installer_kind || '').toLowerCase();
  if (kind === 'exe') {
    return 'EXE installer has no uninstall path — only launcher cache will be removed.';
  }
  if (kind === 'msi') {
    return 'MSI product code missing — only launcher cache will be removed.';
  }
  return 'System uninstall unavailable — only launcher cache will be removed.';
}

/** Read local distribution type from manifest or install-state. */
export async function readLocalDistributionType(
  appSlug: string,
): Promise<DistributionType | null> {
  const meta = await readLocalInstallMetadata(appSlug);
  return meta?.distribution_type ?? null;
}

/** Remove stale local install when distribution type changed between versions. */
export async function clearStaleInstallIfMismatch(
  appSlug: string,
  latestType: DistributionType,
): Promise<boolean> {
  const localType = await readLocalDistributionType(appSlug);
  if (!hasDistributionMismatch(localType, latestType)) return false;
  return deleteLocalAppFiles(appSlug);
}

/** Read uninstall metadata from local manifest / install-state (installed version). */
export async function readLocalInstallMetadata(
  appSlug: string,
): Promise<Partial<AppVersion> | null> {
  try {
    const installDir = await tauriCommands.getAppDataDir(appSlug);
    const manifestPath = toLocalPath(installDir, 'manifest.json');

    try {
      const manifestStr = await tauriCommands.readTextFile(manifestPath);
      const manifest: Manifest = JSON.parse(manifestStr);
      return {
        id: manifest.version_id,
        version_code: manifest.version_code,
        version_name: manifest.version_name,
        distribution_type: manifest.distribution_type || 'portable',
        installer_kind: manifest.installer_kind,
        installer_product_code: manifest.installer_product_code,
        installer_uninstall_path: manifest.installer_uninstall_path,
        installer_uninstall_args: manifest.installer_uninstall_args,
        installer_launch_path: manifest.installer_launch_path,
      };
    } catch {
      const statePath = toLocalPath(installDir, INSTALL_STATE_FILE);
      const stateStr = await tauriCommands.readTextFile(statePath);
      const state: InstallState = JSON.parse(stateStr);
      return {
        id: state.version_id,
        version_code: state.version_code,
        version_name: state.version_name,
        distribution_type: 'installer',
        installer_kind: state.installer_kind,
        installer_product_code: state.installer_product_code,
        installer_uninstall_path: state.installer_uninstall_path,
        installer_uninstall_args: state.installer_uninstall_args,
        installer_launch_path: state.installer_launch_path,
      };
    }
  } catch {
    return null;
  }
}

function mergeVersionMetadata(
  latest?: AppVersion,
  local?: Partial<AppVersion> | null,
): AppVersion | undefined {
  if (!latest && !local) return undefined;
  return {
    ...(latest || {}),
    ...(local || {}),
    distribution_type: local?.distribution_type || latest?.distribution_type,
    installer_kind: local?.installer_kind || latest?.installer_kind,
    installer_product_code: local?.installer_product_code || latest?.installer_product_code,
    installer_uninstall_path: local?.installer_uninstall_path || latest?.installer_uninstall_path,
    installer_uninstall_args: local?.installer_uninstall_args || latest?.installer_uninstall_args,
    installer_launch_path: local?.installer_launch_path || latest?.installer_launch_path,
    version_code: local?.version_code ?? latest?.version_code ?? 0,
    version_name: local?.version_name || latest?.version_name || '',
  } as AppVersion;
}

/** Delete managed local folder for an app (%LOCALAPPDATA%/LauncherApps/{slug}). */
export async function deleteLocalAppFiles(appSlug: string): Promise<boolean> {
  try {
    const installDir = await tauriCommands.getAppDataDir(appSlug);
    const exists = await tauriCommands.checkAppExists(installDir);
    if (exists) {
      await tauriCommands.deleteDirectory(installDir);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Clear device_app_status on the backend for the current device. */
export async function deleteDeviceAppStatus(appId: string): Promise<void> {
  const deviceId = localStorage.getItem('deviceId');
  if (!deviceId) return;

  try {
    await apiClient.deleteDeviceApp(deviceId, appId);
  } catch (err) {
    console.error('Failed to delete device app status:', err);
  }
}

export interface UninstallResult {
  removedSystemApp: boolean;
  removedLocalCache: boolean;
  removedDeviceSync: boolean;
}

/**
 * Uninstall from this device while keeping the app in library.
 * Uses locally installed version metadata when available.
 */
export async function uninstallAppFromDevice(
  appSlug: string,
  appId: string,
  latestVersion?: AppVersion,
): Promise<UninstallResult> {
  const result: UninstallResult = {
    removedSystemApp: false,
    removedLocalCache: false,
    removedDeviceSync: false,
  };

  if (isUrlVersion(latestVersion)) {
    await deleteDeviceAppStatus(appId);
    result.removedDeviceSync = true;
    return result;
  }

  const localMeta = await readLocalInstallMetadata(appSlug);
  const versionForUninstall = mergeVersionMetadata(latestVersion, localMeta);

  if (isInstallerVersion(versionForUninstall) && versionForUninstall && canSystemUninstall(versionForUninstall)) {
    const exitCode = await tauriCommands.runUninstaller(
      (versionForUninstall.installer_kind || '').toLowerCase(),
      versionForUninstall.installer_product_code?.trim() || '',
      versionForUninstall.installer_uninstall_path?.trim() || '',
      versionForUninstall.installer_uninstall_args?.trim() || '',
    );
    if (!isInstallerExitSuccess(exitCode)) {
      throw new Error(`Uninstaller failed with exit code ${exitCode}`);
    }
    result.removedSystemApp = true;
  }

  result.removedLocalCache = await deleteLocalAppFiles(appSlug);
  await deleteDeviceAppStatus(appId);
  result.removedDeviceSync = true;

  return result;
}
