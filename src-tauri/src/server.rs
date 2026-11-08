use crate::state::{AppState, DeviceInfo, TransferProgress, WireMessage};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, Request, State,
    },
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tokio::io::AsyncWriteExt;

#[derive(Deserialize)]
pub struct WsQuery {
    pub token: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub device: DeviceInfo,
}

#[derive(Deserialize)]
pub struct PairRequest {
    pub peer: DeviceInfo,
    pub pin: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct PairResponse {
    pub success: bool,
    pub device: DeviceInfo,
    pub message: String,
}

pub async fn start_server(
    app_handle: AppHandle,
    state: Arc<AppState>,
) -> Result<u16, Box<dyn std::error::Error + Send + Sync>> {
    // Bind to 0.0.0.0 on a random port
    let listener = tokio::net::TcpListener::bind("0.0.0.0:0").await?;
    let port = listener.local_addr()?.port();

    // Update port in state
    {
        let mut local = state.local_device.lock().await;
        local.port = port;
    }

    let shared_state = (state.clone(), app_handle.clone());

    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/pair", post(pair_handler))
        .route("/ws", get(ws_handler))
        .route("/upload", post(upload_handler))
        .with_state(shared_state);

    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            eprintln!("[PulseDrop Server] Server error: {}", e);
        }
    });

    Ok(port)
}

async fn health_handler(
    State((state, _)): State<(Arc<AppState>, AppHandle)>,
) -> Json<HealthResponse> {
    let device = state.local_device.lock().await.clone();
    Json(HealthResponse {
        status: "ok".to_string(),
        device,
    })
}

async fn pair_handler(
    State((state, app_handle)): State<(Arc<AppState>, AppHandle)>,
    Json(payload): Json<PairRequest>,
) -> Result<Json<PairResponse>, StatusCode> {
    let local = state.local_device.lock().await.clone();

    // Register peer
    {
        let mut peers = state.paired_peers.lock().await;
        peers.insert(payload.peer.id.clone(), payload.peer.clone());
    }

    let _ = app_handle.emit("peer-connected", &payload.peer);

    Ok(Json(PairResponse {
        success: true,
        device: local,
        message: "Paired successfully".to_string(),
    }))
}

async fn ws_handler(
    Query(params): Query<WsQuery>,
    State((state, app_handle)): State<(Arc<AppState>, AppHandle)>,
    ws: WebSocketUpgrade,
) -> Response {
    let local_token = state.local_device.lock().await.token.clone();

    // Authenticate token
    if params.token.as_deref() != Some(&local_token) {
        return (StatusCode::UNAUTHORIZED, "Invalid authentication token").into_response();
    }

    ws.on_upgrade(move |socket| handle_socket(socket, state, app_handle))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>, app_handle: AppHandle) {
    let (mut sender, mut receiver) = socket.split();
    let mut broadcast_rx = state.ws_tx.subscribe();

    // Task 1: forward local broadcast events to this peer socket
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg_text) = broadcast_rx.recv().await {
            if sender.send(Message::Text(msg_text.into())).await.is_err() {
                break;
            }
        }
    });

    // Task 2: receive incoming wire messages from this peer socket
    let state_clone = state.clone();
    let app_handle_clone = app_handle.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(message)) = receiver.next().await {
            if let Message::Text(text) = message {
                if let Ok(wire_msg) = serde_json::from_str::<WireMessage>(&text) {
                    match wire_msg {
                        WireMessage::Handshake(peer_info) => {
                            {
                                let mut peers = state_clone.paired_peers.lock().await;
                                peers.insert(peer_info.id.clone(), peer_info.clone());
                            }
                            let _ = app_handle_clone.emit("peer-connected", &peer_info);
                        }
                        WireMessage::ClipboardSync {
                            text: clip_text,
                            sender_name,
                            timestamp,
                        } => {
                            if !*state_clone.clipboard_sync_enabled.lock().await {
                                continue;
                            }

                            // Loop prevention: hash incoming content
                            let mut hasher = Sha256::new();
                            hasher.update(clip_text.as_bytes());
                            let incoming_hash = hex::encode(hasher.finalize());

                            // Set hash BEFORE writing so clipboard watcher doesn't re-broadcast
                            {
                                let mut last_hash = state_clone.last_clipboard_hash.lock().await;
                                *last_hash = incoming_hash.clone();
                            }

                            // Write to OS clipboard
                            let _ = app_handle_clone.clipboard().write_text(clip_text.clone());

                            // Notify React UI
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
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };
}

async fn upload_handler(
    State((state, app_handle)): State<(Arc<AppState>, AppHandle)>,
    headers: HeaderMap,
    req: Request,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    // 1. Validate Bearer Token
    let local_token = state.local_device.lock().await.token.clone();
    let auth_header = headers
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .unwrap_or_default();

    let expected_auth = format!("Bearer {}", local_token);
    if auth_header != expected_auth {
        return Err((StatusCode::UNAUTHORIZED, "Unauthorized".to_string()));
    }

    // 2. Extract transfer headers
    let raw_file_name = headers
        .get("x-file-name")
        .and_then(|h| h.to_str().ok())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            format!("drop_{}.bin", now)
        });

    let transfer_id = headers
        .get("x-transfer-id")
        .and_then(|h| h.to_str().ok())
        .map(|s| s.to_string())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let total_bytes = headers
        .get(header::CONTENT_LENGTH)
        .and_then(|h| h.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);

    // Sanitize file name to prevent traversal
    let safe_file_name = std::path::Path::new(&raw_file_name)
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or("drop_file.bin")
        .to_string();

    // 3. Resolve target download directory
    let download_dir = app_handle
        .path()
        .download_dir()
        .unwrap_or_else(|_| std::env::temp_dir());

    // Generate non-colliding destination path
    let mut target_path = download_dir.join(&safe_file_name);
    let mut counter = 1;
    while target_path.exists() {
        let stem = std::path::Path::new(&safe_file_name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("file");
        let ext = std::path::Path::new(&safe_file_name)
            .extension()
            .and_then(|s| s.to_str())
            .map(|e| format!(".{}", e))
            .unwrap_or_default();
        target_path = download_dir.join(format!("{}_{}{}", stem, counter, ext));
        counter += 1;
    }

    // 4. Stream incoming chunks directly to disk
    let mut file = tokio::fs::File::create(&target_path)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create file: {}", e)))?;

    let mut body_stream = req.into_body().into_data_stream();
    let mut bytes_transferred: u64 = 0;
    let mut last_emit = std::time::Instant::now();

    while let Some(chunk_res) = body_stream.next().await {
        let chunk = chunk_res
            .map_err(|e| (StatusCode::BAD_REQUEST, format!("Error reading body chunk: {}", e)))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Disk write error: {}", e)))?;

        bytes_transferred += chunk.len() as u64;

        if last_emit.elapsed().as_millis() >= 120 {
            let _ = app_handle.emit(
                "transfer-progress",
                TransferProgress {
                    transfer_id: transfer_id.clone(),
                    file_name: safe_file_name.clone(),
                    bytes_transferred,
                    total_bytes: if total_bytes > 0 { total_bytes } else { bytes_transferred },
                    status: "transferring".to_string(),
                },
            );
            last_emit = std::time::Instant::now();
        }
    }

    file.flush()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Flush error: {}", e)))?;

    // Emit completed event
    let _ = app_handle.emit(
        "transfer-progress",
        TransferProgress {
            transfer_id: transfer_id.clone(),
            file_name: safe_file_name.clone(),
            bytes_transferred,
            total_bytes: bytes_transferred,
            status: "completed".to_string(),
        },
    );

    let saved_path_str = target_path.to_string_lossy().to_string();
    let _ = app_handle.emit(
        "file-received",
        serde_json::json!({
            "transfer_id": transfer_id,
            "file_name": safe_file_name,
            "path": saved_path_str,
            "bytes": bytes_transferred,
        }),
    );

    Ok(Json(serde_json::json!({
        "status": "ok",
        "saved_path": saved_path_str,
        "bytes": bytes_transferred,
    })))
}
