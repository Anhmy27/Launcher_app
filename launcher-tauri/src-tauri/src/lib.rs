use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;
use sha2::{Sha256, Digest};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SystemInfo {
    pub hostname: String,
    pub machine_id: String,
    pub ip_address: String,
}

#[tauri::command]
async fn get_system_info() -> Result<SystemInfo, String> {
    // Get hostname using std
    let hostname = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "unknown".to_string());

    // Get Windows Machine GUID from registry (unique per machine, no admin rights needed)
    let machine_id = {
        use winreg::enums::*;
        use winreg::RegKey;
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        hklm.open_subkey("SOFTWARE\\Microsoft\\Cryptography")
            .and_then(|key| key.get_value::<String, _>("MachineGuid"))
            .unwrap_or_else(|_| "unknown".to_string())
    };

    // Get local IP
    let ip_address = local_ip_address::local_ip()
        .map_err(|e| format!("Failed to get IP: {}", e))?
        .to_string();

    Ok(SystemInfo {
        hostname,
        machine_id,
        ip_address,
    })
}

#[tauri::command]
fn get_downloads_path() -> Result<String, String> {
    let downloads = dirs::download_dir()
        .ok_or("Failed to get Downloads directory".to_string())?;
    
    Ok(downloads
        .to_str()
        .ok_or("Path is not valid UTF-8".to_string())?
        .to_string())
}

#[tauri::command]
async fn launch_app(app_path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new("cmd")
            .args(&["/C", "start", "", &app_path])
            .spawn()
            .map_err(|e| format!("Failed to launch app: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        Command::new("open")
            .arg(&app_path)
            .spawn()
            .map_err(|e| format!("Failed to launch app: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        Command::new("xdg-open")
            .arg(&app_path)
            .spawn()
            .map_err(|e| format!("Failed to launch app: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
fn open_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }

    Ok(())
}

/// Delete a file (e.g., from Downloads)
#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    let file_path = PathBuf::from(&path);
    if file_path.exists() {
        fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to delete file: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn check_app_exists(path: String) -> bool {
    PathBuf::from(&path).exists()
}

// ═══════════════════════════════════════════════════════════════════════════
//  Manifest-based install system commands
// ═══════════════════════════════════════════════════════════════════════════

/// Get the managed app data directory: %LOCALAPPDATA%/LauncherApps/{slug}
#[tauri::command]
fn get_app_data_dir(app_slug: String) -> Result<String, String> {
    let local_app_data = dirs::data_local_dir()
        .ok_or("Failed to get local app data directory")?;
    let app_dir = local_app_data.join("LauncherApps").join(&app_slug);
    Ok(app_dir.to_string_lossy().to_string())
}

/// Ensure a directory exists, creating all parent directories as needed
#[tauri::command]
fn ensure_dir_exists(path: String) -> Result<(), String> {
    fs::create_dir_all(&path)
        .map_err(|e| format!("Failed to create directory '{}': {}", path, e))
}

/// Calculate SHA256 hash of a local file (returns hex string)
#[tauri::command]
async fn calculate_file_hash(path: String) -> Result<String, String> {
    let data = tokio::fs::read(&path).await
        .map_err(|e| format!("Failed to read file '{}': {}", path, e))?;
    let mut hasher = Sha256::new();
    hasher.update(&data);
    let result = hasher.finalize();
    Ok(format!("{:x}", result))
}

/// Download a file from a URL and save it to a specific local path.
/// Creates parent directories automatically.
#[tauri::command]
async fn download_file_to_path(url: String, dest_path: String) -> Result<u64, String> {
    let client = reqwest::Client::new();
    let resp = client.get(&url).send().await
        .map_err(|e| format!("Download failed for '{}': {}", url, e))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {} for '{}'", resp.status(), url));
    }

    let bytes = resp.bytes().await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    let len = bytes.len() as u64;

    let path = PathBuf::from(&dest_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    fs::write(&path, &bytes)
        .map_err(|e| format!("Failed to write file '{}': {}", dest_path, e))?;

    Ok(len)
}

/// Read a file as a UTF-8 string (used for reading cached manifest.json)
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file '{}': {}", path, e))
}

/// Write a string to a file, creating parent directories as needed
#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    fs::write(&p, content.as_bytes())
        .map_err(|e| format!("Failed to write file '{}': {}", path, e))
}

/// Delete a directory recursively (used for uninstalling managed apps)
#[tauri::command]
fn delete_directory(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if p.exists() {
        fs::remove_dir_all(&p)
            .map_err(|e| format!("Failed to delete directory '{}': {}", path, e))?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            get_downloads_path,
            launch_app,
            open_file,
            check_app_exists,
            delete_file,
            // Manifest-based install system
            get_app_data_dir,
            ensure_dir_exists,
            calculate_file_hash,
            download_file_to_path,
            read_text_file,
            write_text_file,
            delete_directory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
