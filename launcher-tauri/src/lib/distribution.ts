import type { AppVersion } from './api';

export type DistributionType = 'portable' | 'installer' | 'url';

export function getDistributionType(version?: { distribution_type?: DistributionType }): DistributionType {
  return version?.distribution_type || 'portable';
}

export function isUrlVersion(version?: { distribution_type?: DistributionType }): boolean {
  return getDistributionType(version) === 'url';
}

export function isInstallerVersion(version?: { distribution_type?: DistributionType }): boolean {
  return getDistributionType(version) === 'installer';
}

export function hasDistributionMismatch(
  localType: DistributionType | null | undefined,
  latestType: DistributionType,
): boolean {
  if (!localType) return false;
  return localType !== latestType;
}

/** Block launch when a newer required version exists. */
export function getBlockingRequiredUpdate(
  versions: Array<{ version_code: number; version_name: string; is_required: boolean; is_released?: boolean }>,
  localVersionCode?: number,
): { version_code: number; version_name: string } | null {
  if (localVersionCode === undefined) return null;

  const blocking = versions
    .filter((v) => v.is_released !== false && v.is_required && v.version_code > localVersionCode)
    .sort((a, b) => b.version_code - a.version_code)[0];

  return blocking
    ? { version_code: blocking.version_code, version_name: blocking.version_name }
    : null;
}

export function distributionLabel(version?: AppVersion): string {
  switch (getDistributionType(version)) {
    case 'url':
      return 'Web link';
    case 'installer':
      return 'Installer';
    default:
      return 'Portable';
  }
}

/** MSI success codes: 0 OK, 3010/1641 reboot required */
export function isInstallerExitSuccess(code: number): boolean {
  return code === 0 || code === 3010 || code === 1641;
}

export interface InstallState {
  distribution_type: 'installer';
  installer_completed: boolean;
  version_id?: string;
  version_code: number;
  version_name: string;
  installer_exit_code?: number;
  installer_kind?: string;
  installer_product_code?: string;
  installer_uninstall_path?: string;
  installer_uninstall_args?: string;
  installer_launch_path?: string;
}

export const INSTALL_STATE_FILE = 'install-state.json';

/** Join install dir + manifest-relative path using Windows separators. */
export function toLocalPath(installDir: string, relativePath: string): string {
  return `${installDir}\\${relativePath.replace(/\//g, '\\')}`;
}
