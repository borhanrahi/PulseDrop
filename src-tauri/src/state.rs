use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio::sync::{broadcast, Mutex};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
    pub os: String,
    pub ip: String,
    pub port: u16,
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum WireMessage {
    Handshake(DeviceInfo),
    ClipboardSync {
        text: String,
        sender_name: String,
        timestamp: u64,
    },
    FileOffer {
        transfer_id: String,
        file_name: String,
        file_size: u64,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferProgress {
    pub transfer_id: String,
    pub file_name: String,
    pub bytes_transferred: u64,
    pub total_bytes: u64,
    pub status: String, // "transferring" | "completed" | "failed"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speed_bps: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub direction: Option<String>,
}

pub struct AppState {
    pub local_device: Mutex<DeviceInfo>,
    pub paired_peers: Mutex<HashMap<String, DeviceInfo>>,
    pub clipboard_sync_enabled: Mutex<bool>,
    pub last_clipboard_hash: Mutex<String>,
    pub ws_tx: broadcast::Sender<String>,
}

impl AppState {
    pub fn new(local_device: DeviceInfo) -> Self {
        let (ws_tx, _) = broadcast::channel(128);
        Self {
            local_device: Mutex::new(local_device),
            paired_peers: Mutex::new(HashMap::new()),
            clipboard_sync_enabled: Mutex::new(true),
            last_clipboard_hash: Mutex::new(String::new()),
            ws_tx,
        }
    }
}
