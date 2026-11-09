use crate::client::{connect_to_peer, send_file_to_peer};
use crate::server::PairResponse;
use crate::state::{AppState, DeviceInfo, TransferProgress};
use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub async fn get_local_pairing_info(state: State<'_, Arc<AppState>>) -> Result<DeviceInfo, String> {
    let local = state.local_device.lock().await.clone();
    Ok(local)
}

#[tauri::command]
pub async fn pair_with_qr_payload(
    payload_json: String,
    state: State<'_, Arc<AppState>>,
    app_handle: AppHandle,
) -> Result<DeviceInfo, String> {
    let trimmed = payload_json.trim();

    // 1. Check if it's a URL (from web browser sharing or mobile QR code)
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        if let Ok(parsed_url) = url::Url::parse(trimmed) {
            let host = parsed_url.host_str().unwrap_or("127.0.0.1").to_string();
            let port = parsed_url.port().unwrap_or(1420);
            let mut pair_id = format!("lan-{}-{}", host.replace('.', "-"), port);
            let mut name = format!("Device ({})", host);

            for (k, v) in parsed_url.query_pairs() {
                if k == "pair" && !v.is_empty() {
                    pair_id = v.to_string();
                } else if k == "name" && !v.is_empty() {
                    name = v.to_string();
                }
            }

            let peer_info = DeviceInfo {
                id: pair_id,
                name,
                os: "remote".to_string(),
                ip: host,
                port,
                token: "paired-token".to_string(),
            };

            return pair_with_nearby_peer(peer_info, None, state, app_handle).await;
        }
    }

    // 2. Check if it's a plain IP address or IP:PORT
    let ip_pattern = trimmed.replace("http://", "").replace("https://", "");
    if let Some((ip, port_str)) = ip_pattern.split_once(':') {
        if let Ok(port) = port_str.parse::<u16>() {
            let peer_info = DeviceInfo {
                id: format!("lan-{}-{}", ip.replace('.', "-"), port),
                name: format!("Device ({})", ip),
                os: "remote".to_string(),
                ip: ip.to_string(),
                port,
                token: "paired-token".to_string(),
            };
            return pair_with_nearby_peer(peer_info, None, state, app_handle).await;
        }
    }

    // 3. Parse JSON payload (from PulseDrop desktop app QR code)
    let peer_info: DeviceInfo = serde_json::from_str(trimmed)
        .map_err(|e| format!("Invalid QR code payload: {}", e))?;

    // Validate fields
    if peer_info.ip.is_empty() || peer_info.port == 0 {
        return Err("Malformed peer payload: missing IP or port".to_string());
    }

    // Initiate outbound WebSocket connection & handshake
    connect_to_peer(peer_info.clone(), state.inner().clone(), app_handle)
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    Ok(peer_info)
}

#[tauri::command]
pub async fn pair_with_nearby_peer(
    peer_info: DeviceInfo,
    pin: Option<String>,
    state: State<'_, Arc<AppState>>,
    app_handle: AppHandle,
) -> Result<DeviceInfo, String> {
    let local = state.local_device.lock().await.clone();
    let pair_url = format!("http://{}:{}/pair", peer_info.ip, peer_info.port);

    let client = reqwest::Client::new();
    let resp = client
        .post(&pair_url)
        .json(&serde_json::json!({
            "peer": local,
            "pin": pin,
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to reach peer: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Peer rejected pairing: {}", resp.status()));
    }

    let pair_resp: PairResponse = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response from peer: {}", e))?;

    let resolved_peer = pair_resp.device;
    connect_to_peer(resolved_peer.clone(), state.inner().clone(), app_handle)
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    Ok(resolved_peer)
}

#[tauri::command]
pub async fn get_paired_peers(state: State<'_, Arc<AppState>>) -> Result<Vec<DeviceInfo>, String> {
    let peers = state.paired_peers.lock().await;
    let list: Vec<DeviceInfo> = peers.values().cloned().collect();
    Ok(list)
}

#[tauri::command]
pub async fn disconnect_peer(
    peer_id: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let mut peers = state.paired_peers.lock().await;
    peers.remove(&peer_id);
    Ok(())
}

#[tauri::command]
pub async fn toggle_clipboard_sync(
    enabled: bool,
    state: State<'_, Arc<AppState>>,
) -> Result<bool, String> {
    let mut sync = state.clipboard_sync_enabled.lock().await;
    *sync = enabled;
    Ok(*sync)
}

#[tauri::command]
pub async fn send_files(
    peer_id: String,
    file_paths: Vec<String>,
    on_progress: Channel<TransferProgress>,
    state: State<'_, Arc<AppState>>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let peer = {
        let peers = state.paired_peers.lock().await;
        peers
            .get(&peer_id)
            .cloned()
            .ok_or_else(|| format!("Target peer '{}' is not connected", peer_id))?
    };

    for path in file_paths {
        send_file_to_peer(
            peer.clone(),
            path,
            Some(on_progress.clone()),
            app_handle.clone(),
        )
        .await?;
    }

    Ok(())
}

#[tauri::command]
pub async fn get_download_dir(app_handle: AppHandle) -> Result<String, String> {
    let dir = app_handle
        .path()
        .download_dir()
        .map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

#[cfg(target_os = "android")]
fn open_android_file_via_jni(path: &str) -> Result<(), String> {
    use jni::objects::JValue;

    let ctx = ndk_context::android_context();
    let vm = unsafe { jni::JavaVM::from_raw(ctx.vm().cast()) }
        .map_err(|e| format!("Failed to get Java VM: {:?}", e))?;
    let mut env = vm
        .attach_current_thread()
        .map_err(|e| format!("Failed to attach JNI thread: {:?}", e))?;

    let class = env
        .find_class("com/pulsedrop/client/MainActivity")
        .map_err(|e| format!("Failed to find MainActivity: {:?}", e))?;

    let j_path = env
        .new_string(path)
        .map_err(|e| format!("Failed to create JString: {:?}", e))?;

    let _ = env
        .call_static_method(
            class,
            "openFilePath",
            "(Ljava/lang/String;)Z",
            &[JValue::Object(&j_path)],
        )
        .map_err(|e| format!("Failed to invoke openFilePath: {:?}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn open_file_in_manager(path: String, _app_handle: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let p = std::path::Path::new(&path);
        if p.exists() {
            let _ = std::process::Command::new("explorer")
                .arg(format!("/select,{}", path))
                .spawn();
        } else if let Some(parent) = p.parent() {
            let _ = std::process::Command::new("explorer")
                .arg(parent)
                .spawn();
        } else {
            let _ = std::process::Command::new("explorer")
                .arg(&path)
                .spawn();
        }
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        let p = std::path::Path::new(&path);
        if p.exists() {
            let _ = std::process::Command::new("open")
                .args(["-R", &path])
                .spawn();
        } else if let Some(parent) = p.parent() {
            let _ = std::process::Command::new("open")
                .arg(parent)
                .spawn();
        }
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        let p = std::path::Path::new(&path);
        let target = if p.is_dir() {
            p
        } else {
            p.parent().unwrap_or(p)
        };
        let _ = std::process::Command::new("xdg-open")
            .arg(target)
            .spawn();
        return Ok(());
    }

    #[cfg(target_os = "android")]
    {
        let _ = open_android_file_via_jni(&path);
        return Ok(());
    }

    #[cfg(target_os = "ios")]
    {
        return Ok(());
    }

    #[allow(unreachable_code)]
    Ok(())
}
