use crate::state::{AppState, DeviceInfo, TransferProgress, WireMessage};
use futures_util::{SinkExt, StreamExt};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_LENGTH};
use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::protocol::Message as TungsteniteMessage;

pub async fn connect_to_peer(
    peer: DeviceInfo,
    state: Arc<AppState>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let ws_url = format!("ws://{}:{}/ws?token={}", peer.ip, peer.port, peer.token);

    let (ws_stream, _) = connect_async(&ws_url)
        .await
        .map_err(|e| format!("Failed to connect to peer at {}: {}", ws_url, e))?;

    let (mut write, mut read) = ws_stream.split();

    // 1. Send our local handshake
    let local_device = state.local_device.lock().await.clone();
    let handshake_msg = WireMessage::Handshake(local_device);
    let serialized_handshake = serde_json::to_string(&handshake_msg)
        .map_err(|e| format!("Failed to serialize handshake: {}", e))?;

    write
        .send(TungsteniteMessage::Text(serialized_handshake.into()))
        .await
        .map_err(|e| format!("Failed to send handshake: {}", e))?;

    // 2. Register peer in our state
    {
        let mut peers = state.paired_peers.lock().await;
        peers.insert(peer.id.clone(), peer.clone());
    }
    let _ = app_handle.emit("peer-connected", &peer);

    // 3. Task: forward local clipboard and file offers to peer with 5s keepalive ping
    let mut broadcast_rx = state.ws_tx.subscribe();
    let mut ping_interval = tokio::time::interval(std::time::Duration::from_secs(5));
    let mut send_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                res = broadcast_rx.recv() => {
                    match res {
                        Ok(msg_text) => {
                            if write
                                .send(TungsteniteMessage::Text(msg_text.into()))
                                .await
                                .is_err()
                            {
                                break;
                            }
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                    }
                }
                _ = ping_interval.tick() => {
                    if write
                        .send(TungsteniteMessage::Ping(vec![].into()))
                        .await
                        .is_err()
                    {
                        break;
                    }
                }
            }
        }
    });

    // 4. Task: receive incoming messages from peer
    let state_clone = state.clone();
    let app_handle_clone = app_handle.clone();
    let peer_id_clone = peer.id.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(message)) = read.next().await {
            match message {
                TungsteniteMessage::Text(text) => {
                    let text_str = text.as_str();
                    if let Ok(wire_msg) = serde_json::from_str::<WireMessage>(text_str) {
                        match wire_msg {
                            WireMessage::Handshake(remote_info) => {
                                let mut peers = state_clone.paired_peers.lock().await;
                                peers.insert(remote_info.id.clone(), remote_info.clone());
                                let _ = app_handle_clone.emit("peer-connected", &remote_info);
                            }
                            WireMessage::ClipboardSync {
                                text: clip_text,
                                sender_name,
                                timestamp,
                            } => {
                                if !*state_clone.clipboard_sync_enabled.lock().await {
                                    continue;
                                }

                                let mut hasher = Sha256::new();
                                hasher.update(clip_text.as_bytes());
                                let incoming_hash = hex::encode(hasher.finalize());

                                {
                                    let mut last_hash = state_clone.last_clipboard_hash.lock().await;
                                    *last_hash = incoming_hash.clone();
                                }

                                let _ = app_handle_clone.clipboard().write_text(clip_text.clone());
                                let _ = app_handle_clone.emit(
                                    "clipboard-received",
                                    serde_json::json!({
                                        "text": clip_text,
                                        "sender_name": sender_name,
                                        "timestamp": timestamp,
                                        "hash": incoming_hash,
                                    }),
                                );
                            }
                            WireMessage::FileOffer {
                                transfer_id,
                                file_name,
                                file_size,
                            } => {
                                let _ = app_handle_clone.emit(
                                    "file-offer",
                                    serde_json::json!({
                                        "transfer_id": transfer_id,
                                        "file_name": file_name,
                                        "file_size": file_size,
                                    }),
                                );
                            }
                        }
                    }
                }
                TungsteniteMessage::Close(_) => break,
                TungsteniteMessage::Pong(_) => {}
                _ => {}
            }
        }

        // When connection drops, remove peer
        {
            let mut peers = state_clone.paired_peers.lock().await;
            peers.remove(&peer_id_clone);
        }
        let _ = app_handle_clone.emit("peer-disconnected", &peer_id_clone);
    });

    tokio::spawn(async move {
        tokio::select! {
            _ = (&mut send_task) => recv_task.abort(),
            _ = (&mut recv_task) => send_task.abort(),
        }
    });

    Ok(())
}

pub async fn send_file_to_peer(
    peer: DeviceInfo,
    file_path: String,
    channel: Option<Channel<TransferProgress>>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    let file_name = path
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or("file.bin")
        .to_string();

    let file = tokio::fs::File::open(&file_path)
        .await
        .map_err(|e| format!("Failed to open file: {}", e))?;

    let metadata = file
        .metadata()
        .await
        .map_err(|e| format!("Failed to read file metadata: {}", e))?;
    let total_bytes = metadata.len();

    let transfer_id = uuid::Uuid::new_v4().to_string();
    let upload_url = format!("http://{}:{}/upload", peer.ip, peer.port);

    let bytes_transferred = Arc::new(AtomicU64::new(0));
    let last_emit_instant = Arc::new(tokio::sync::Mutex::new((Instant::now(), 0u64)));

    let stream = tokio_util::io::ReaderStream::new(file);

    let transfer_id_clone = transfer_id.clone();
    let file_name_clone = file_name.clone();
    let bytes_counter = bytes_transferred.clone();
    let app_clone = app_handle.clone();
    let channel_clone = channel.clone();
    let last_emit = last_emit_instant.clone();

    let progress_stream = stream.map(move |chunk_res| {
        if let Ok(ref chunk) = chunk_res {
            let transferred = bytes_counter.fetch_add(chunk.len() as u64, Ordering::Relaxed)
                + (chunk.len() as u64);

            let app_h = app_clone.clone();
            let chan = channel_clone.clone();
            let le = last_emit.clone();
            let t_id = transfer_id_clone.clone();
            let f_name = file_name_clone.clone();

            tokio::spawn(async move {
                let mut guard = le.lock().await;
                let elapsed = guard.0.elapsed();
                if elapsed.as_millis() >= 120 || transferred >= total_bytes {
                    let elapsed_secs = elapsed.as_secs_f64();
                    let speed = if elapsed_secs > 0.0 && transferred > guard.1 {
                        ((transferred - guard.1) as f64 / elapsed_secs) as u64
                    } else {
                        0
                    };
                    *guard = (Instant::now(), transferred);

                    let progress = TransferProgress {
                        transfer_id: t_id,
                        file_name: f_name,
                        bytes_transferred: transferred,
                        total_bytes,
                        status: if transferred >= total_bytes {
                            "completed".to_string()
                        } else {
                            "transferring".to_string()
                        },
                        speed_bps: Some(speed),
                        direction: Some("outgoing".to_string()),
                    };

                    if let Some(ch) = &chan {
                        let _ = ch.send(progress.clone());
                    }
                    let _ = app_h.emit("transfer-progress", &progress);
                }
            });
        }
        chunk_res
    });

    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {}", peer.token))
            .map_err(|e| format!("Invalid auth header: {}", e))?,
    );
    headers.insert(
        "x-file-name",
        HeaderValue::from_str(&file_name).unwrap_or(HeaderValue::from_static("file.bin")),
    );
    headers.insert(
        "x-transfer-id",
        HeaderValue::from_str(&transfer_id).map_err(|e| format!("Invalid transfer id: {}", e))?,
    );
    headers.insert(CONTENT_LENGTH, HeaderValue::from(total_bytes));

    let body = reqwest::Body::wrap_stream(progress_stream);

    let response = client
        .post(&upload_url)
        .headers(headers)
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Upload HTTP request failed: {}", e))?;

    if !response.status().is_success() {
        let err_text = response.text().await.unwrap_or_default();
        let fail_progress = TransferProgress {
            transfer_id: transfer_id.clone(),
            file_name: file_name.clone(),
            bytes_transferred: bytes_transferred.load(Ordering::Relaxed),
            total_bytes,
            status: "failed".to_string(),
            speed_bps: Some(0),
            direction: Some("outgoing".to_string()),
        };
        if let Some(ch) = &channel {
            let _ = ch.send(fail_progress.clone());
        }
        let _ = app_handle.emit("transfer-progress", &fail_progress);
        return Err(format!("Peer rejected upload: {}", err_text));
    }

    // Final completed emission
    let final_progress = TransferProgress {
        transfer_id,
        file_name,
        bytes_transferred: total_bytes,
        total_bytes,
        status: "completed".to_string(),
        speed_bps: Some(0),
        direction: Some("outgoing".to_string()),
    };
    if let Some(ch) = &channel {
        let _ = ch.send(final_progress.clone());
    }
    let _ = app_handle.emit("transfer-progress", &final_progress);

    Ok(())
}
