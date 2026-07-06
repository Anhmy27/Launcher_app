import { invoke } from '@tauri-apps/api/core';

export interface SystemInfo {
  hostname: string;
  machine_id: string;
  ip_address: string;
}

export const tauriCommands = {
  /**
   * Get system information (hostname, MAC address, IP)
   */
  async getSystemInfo(): Promise<SystemInfo> {
    return invoke<SystemInfo>('get_system_info');
  },

  /**
   * Get Downloads folder path
   */
  async getDownloadsPath(): Promise<string> {
    return invoke<string>('get_downloads_path');
  },

  /**
   * Launch/execute an application
   */
  async launchApp(appPath: string): Promise<void> {
    return invoke<void>('launch_app', { appPath });
  },

  /**
   * Open a file/folder in file explorer
   */
  async openFile(path: string): Promise<void> {
    return invoke<void>('open_file', { path });
  },

  /**
   * Check if a file/app exists
   */
  async checkAppExists(path: string): Promise<boolean> {
    return invoke<boolean>('check_app_exists', { path });
  },

  /**
   * Delete a file (e.g., downloaded file in Downloads folder)
   */
  async deleteFile(path: string): Promise<void> {
    return invoke<void>('delete_file', { path });
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  Manifest-based install system
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get managed app install directory: %LOCALAPPDATA%/LauncherApps/{slug}
   */
  async getAppDataDir(appSlug: string): Promise<string> {
    return invoke<string>('get_app_data_dir', { appSlug });
  },

  /**
   * Ensure a directory exists (creates parents too)
   */
  async ensureDirExists(path: string): Promise<void> {
    return invoke<void>('ensure_dir_exists', { path });
  },

  /**
   * Calculate SHA256 hash of a local file (returns hex string)
   */
  async calculateFileHash(path: string): Promise<string> {
    return invoke<string>('calculate_file_hash', { path });
  },

  /**
   * Download a file from URL to a specific local path
   * Returns the number of bytes written.
   */
  async downloadFileToPath(url: string, destPath: string): Promise<number> {
    return invoke<number>('download_file_to_path', { url, destPath });
  },

  /**
   * Read a file as UTF-8 string (e.g. cached manifest.json)
   */
  async readTextFile(path: string): Promise<string> {
    return invoke<string>('read_text_file', { path });
  },

  /**
   * Write a string to a file
   */
  async writeTextFile(path: string, content: string): Promise<void> {
    return invoke<void>('write_text_file', { path, content });
  },

  /**
   * Delete a directory recursively (used for uninstalling managed apps)
   */
  async deleteDirectory(path: string): Promise<void> {
    return invoke<void>('delete_directory', { path });
  },
};
