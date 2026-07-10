import type { AppVersion } from './api';

export type DistributionType = 'portable' | 'installer' | 'url';

export function getDistributionType(version?: AppVersion): DistributionType {
  return version?.distribution_type || 'portable';
}

export function isUrlVersion(version?: AppVersion): boolean {
  return getDistributionType(version) === 'url';
}

export function isInstallerVersion(version?: AppVersion): boolean {
  return getDistributionType(version) === 'installer';
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
  version_code: number;
  version_name: string;
  installer_exit_code?: number;
}

export const INSTALL_STATE_FILE = 'install-state.json';
