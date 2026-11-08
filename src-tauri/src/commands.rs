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
    // 1. Parse JSON payload
    let peer_info: DeviceInfo = serde_json::from_str(&payload_json)
        .map_err(|e| format!("Invalid QR code payload: {}", e))?;

    // 2. Validate fields
    if peer_info.ip.is_empty() || peer_info.port == 0 || peer_info.token.is_empty() {
        return Err("Malformed peer payload: missing IP, port, or token".to_string());
    }

    // 3. Initiate outbound WebSocket connection & handshake
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
