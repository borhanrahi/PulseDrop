use crate::state::{AppState, WireMessage};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tokio::time::sleep;

pub fn start_clipboard_watcher(app_handle: AppHandle, state: Arc<AppState>) {
    tokio::spawn(async move {
        loop {
            sleep(Duration::from_millis(600)).await;

            // 1. Only watch if sync is enabled and at least one peer is connected
            let is_enabled = *state.clipboard_sync_enabled.lock().await;
            let has_peers = !state.paired_peers.lock().await.is_empty();
            if !is_enabled || !has_peers {
                continue;
            }

            // 2. Read clipboard text safely
            let text = match app_handle.clipboard().read_text() {
                Ok(t) => t,
                Err(_) => continue,
            };

            let trimmed = text.trim();
            if trimmed.is_empty() {
                continue;
            }

            // 3. Compute SHA-256 hash to prevent echo loops
            let mut hasher = Sha256::new();
            hasher.update(text.as_bytes());
            let current_hash = hex::encode(hasher.finalize());

            let mut last_hash = state.last_clipboard_hash.lock().await;
            if *last_hash == current_hash {
                continue;
            }

            // Update stored hash
            *last_hash = current_hash.clone();
            drop(last_hash);

            // 4. Broadcast WireMessage::ClipboardSync over all active peer connections
            let sender_name = state.local_device.lock().await.name.clone();
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);

            let sync_message = WireMessage::ClipboardSync {
                text: text.clone(),
                sender_name,
                timestamp,
            };

            if let Ok(serialized) = serde_json::to_string(&sync_message) {
                let _ = state.ws_tx.send(serialized);
            }

            // 5. Emit event to React for history feed
            let _ = app_handle.emit(
                "clipboard-sent",
                serde_json::json!({
                    "text": text,
                    "timestamp": timestamp,
                    "hash": current_hash,
                }),
            );
        }
    });
}
