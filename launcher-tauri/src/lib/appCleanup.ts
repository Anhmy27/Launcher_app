import type { AppVersion } from './api';
import apiClient from './api';
import { tauriCommands } from './tauri';
import {
  isInstallerExitSuccess,
  isInstallerVersion,
  isUrlVersion,
} from './distribution';

/**
 * Local install cleanup — used when freeing disk space while keeping the app in library.
 * Not used for "remove from library" (that only updates user_apps on the server).
 */

export function canSystemUninstall(version?: AppVersion): boolean {
  if (!isInstallerVersion(version) || !version) return false;
  const kind = (version.installer_kind || '').toLowerCase();
  if (kind === 'msi') return Boolean(version.installer_product_code?.trim());
  if (kind === 'exe') return Boolean(version.installer_uninstall_path?.trim());
  return false;
}

/** Delete managed local folder for an app (%LOCALAPPDATA%/LauncherApps/{slug}). */
export async function deleteLocalAppFiles(appSlug: string): Promise<void> {
  try {
    const installDir = await tauriCommands.getAppDataDir(appSlug);
    const exists = await tauriCommands.checkAppExists(installDir);
    if (exists) {
      await tauriCommands.deleteDirectory(installDir);
    }
  } catch {
    // Directory may not exist
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
 * - URL: clear device sync only
 * - Portable: delete local files + device sync
 * - Installer: optional Windows uninstall + always clear local cache + device sync
 */
export async function uninstallAppFromDevice(
  appSlug: string,
  appId: string,
  version?: AppVersion,
): Promise<UninstallResult> {
  const result: UninstallResult = {
    removedSystemApp: false,
    removedLocalCache: false,
    removedDeviceSync: false,
  };

  if (isUrlVersion(version)) {
    await deleteDeviceAppStatus(appId);
    result.removedDeviceSync = true;
    return result;
  }

  if (isInstallerVersion(version) && version && canSystemUninstall(version)) {
    const exitCode = await tauriCommands.runUninstaller(
      version.installer_kind || '',
      version.installer_product_code?.trim() || '',
      version.installer_uninstall_path?.trim() || '',
      version.installer_uninstall_args?.trim() || '',
    );
    if (!isInstallerExitSuccess(exitCode)) {
      throw new Error(`Uninstaller failed with exit code ${exitCode}`);
    }
    result.removedSystemApp = true;
  }

  await deleteLocalAppFiles(appSlug);
  result.removedLocalCache = true;
  await deleteDeviceAppStatus(appId);
  result.removedDeviceSync = true;

  return result;
}

/** @deprecated Use uninstallAppFromDevice */
export async function cleanupAppOnDevice(appSlug: string, appId: string): Promise<void> {
  await uninstallAppFromDevice(appSlug, appId);
}
