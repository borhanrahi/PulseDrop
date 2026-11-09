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
        .route("/health", get(health_handler).options(options_handler))
        .route("/pair", post(pair_handler).options(options_handler))
        .route("/ws", get(ws_handler))
        .route("/upload", post(upload_handler).options(options_handler))
        .route("/download/{*file_name}", get(download_file_handler).options(options_handler))
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
    let connected_peer_id = Arc::new(tokio::sync::Mutex::new(None::<String>));

    // Task 1: forward local broadcast events + 5s heartbeat Ping to detect disconnected/sleeping peers
    let mut send_task = tokio::spawn(async move {
        let mut ping_interval = tokio::time::interval(std::time::Duration::from_secs(5));
        loop {
            tokio::select! {
                _ = ping_interval.tick() => {
                    if sender.send(Message::Ping(vec![].into())).await.is_err() {
                        break;
                    }
                }
                msg_res = broadcast_rx.recv() => {
                    match msg_res {
                        Ok(msg_text) => {
                            if sender.send(Message::Text(msg_text.into())).await.is_err() {
                                break;
                            }
                        }
                        Err(_) => break,
                    }
                }
            }
        }
    });

    // Task 2: receive incoming wire messages from this peer socket
    let state_clone = state.clone();
    let app_handle_clone = app_handle.clone();
    let peer_tracker = connected_peer_id.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(message)) = receiver.next().await {
            match message {
                Message::Text(text) => {
                    if let Ok(wire_msg) = serde_json::from_str::<WireMessage>(&text) {
                        match wire_msg {
                            WireMessage::Handshake(peer_info) => {
                                {
                                    let mut id_guard = peer_tracker.lock().await;
                                    *id_guard = Some(peer_info.id.clone());
                                }
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
                Message::Close(_) => break,
                Message::Pong(_) => {}
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };

    // Clean up peer state and notify UI when socket disconnects (e.g. mobile screen off / sleep)
    let peer_id_opt = connected_peer_id.lock().await.clone();
    if let Some(peer_id) = peer_id_opt {
        {
            let mut peers = state.paired_peers.lock().await;
            peers.remove(&peer_id);
        }
        let _ = app_handle.emit("peer-disconnected", &peer_id);
    }
}

fn percent_decode_filename(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut decoded = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""), 16) {
                decoded.push(byte);
                i += 3;
                continue;
            }
        }
        decoded.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(decoded).unwrap_or_else(|_| s.to_string())
}

async fn options_handler() -> impl axum::response::IntoResponse {
    (
        StatusCode::OK,
        [
            (header::ACCESS_CONTROL_ALLOW_ORIGIN, "*"),
            (header::ACCESS_CONTROL_ALLOW_METHODS, "GET, POST, OPTIONS"),
            (header::ACCESS_CONTROL_ALLOW_HEADERS, "*"),
        ],
        "",
    )
}

async fn upload_handler(
    State((state, app_handle)): State<(Arc<AppState>, AppHandle)>,
    headers: HeaderMap,
    req: Request,
) -> Result<impl axum::response::IntoResponse, (StatusCode, String)> {
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
        .map(|s| percent_decode_filename(s))
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
    #[cfg(target_os = "android")]
    let download_dir = {
        let pub_dl = std::path::PathBuf::from("/storage/emulated/0/Download");
        if pub_dl.exists() {
            pub_dl
        } else {
            let sd_dl = std::path::PathBuf::from("/sdcard/Download");
            if sd_dl.exists() {
                sd_dl
            } else {
                app_handle
                    .path()
                    .download_dir()
                    .unwrap_or_else(|_| std::env::temp_dir())
            }
        }
    };

    #[cfg(not(target_os = "android"))]
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

    // 4. Stream incoming chunks directly to disk with 512KB buffer for maximum I/O performance
    let file = tokio::fs::File::create(&target_path)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create file: {}", e)))?;
    let mut writer = tokio::io::BufWriter::with_capacity(512 * 1024, file);

    let mut body_stream = req.into_body().into_data_stream();
    let mut bytes_transferred: u64 = 0;
    let mut last_emit = std::time::Instant::now();
    let mut last_bytes: u64 = 0;
    let mut smoothed_speed: u64 = 0;

    while let Some(chunk_res) = body_stream.next().await {
        let chunk = chunk_res
            .map_err(|e| (StatusCode::BAD_REQUEST, format!("Error reading body chunk: {}", e)))?;
        writer.write_all(&chunk)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Disk write error: {}", e)))?;

        bytes_transferred += chunk.len() as u64;

        let elapsed = last_emit.elapsed();
        // Throttle progress events to 250ms to keep network pipeline saturated without event-loop lag
        if elapsed.as_millis() >= 250 {
            let elapsed_secs = elapsed.as_secs_f64();
            let instant_speed = if elapsed_secs > 0.0 && bytes_transferred > last_bytes {
                ((bytes_transferred - last_bytes) as f64 / elapsed_secs) as u64
            } else {
                smoothed_speed
            };
            smoothed_speed = if smoothed_speed > 0 {
                ((instant_speed as f64 * 0.7) + (smoothed_speed as f64 * 0.3)) as u64
            } else {
                instant_speed
            };
            last_bytes = bytes_transferred;
            last_emit = std::time::Instant::now();

            let _ = app_handle.emit(
                "transfer-progress",
                TransferProgress {
                    transfer_id: transfer_id.clone(),
                    file_name: safe_file_name.clone(),
                    bytes_transferred,
                    total_bytes: if total_bytes > 0 { total_bytes } else { bytes_transferred },
                    status: "transferring".to_string(),
                    speed_bps: Some(smoothed_speed),
                    direction: Some("incoming".to_string()),
                },
            );
        }
    }

    writer.flush()
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
            speed_bps: Some(0),
            direction: Some("incoming".to_string()),
        },
    );

    let saved_path_str = target_path.to_string_lossy().to_string();
    let port = state.local_device.lock().await.port;
    let _ = app_handle.emit(
        "file-received",
        serde_json::json!({
            "transfer_id": transfer_id,
            "file_name": safe_file_name,
            "path": saved_path_str,
            "bytes": bytes_transferred,
            "download_url": format!("http://127.0.0.1:{}/download/{}", port, safe_file_name),
        }),
    );

    let res_headers = [
        (header::ACCESS_CONTROL_ALLOW_ORIGIN, "*"),
    ];

    Ok((
        res_headers,
        Json(serde_json::json!({
            "status": "ok",
            "saved_path": saved_path_str,
            "bytes": bytes_transferred,
        })),
    ))
}

async fn download_file_handler(
    State((_state, app_handle)): State<(Arc<AppState>, AppHandle)>,
    axum::extract::Path(file_name): axum::extract::Path<String>,
) -> Result<impl axum::response::IntoResponse, (StatusCode, String)> {
    let download_dir = app_handle
        .path()
        .download_dir()
        .unwrap_or_else(|_| std::env::temp_dir());

    let safe_file_name = std::path::Path::new(&file_name)
        .file_name()
        .and_then(|f| f.to_str())
        .ok_or_else(|| (StatusCode::BAD_REQUEST, "Invalid file name".to_string()))?
        .to_string();

    let target_path = download_dir.join(&safe_file_name);
    if !target_path.exists() {
        return Err((StatusCode::NOT_FOUND, "File not found".to_string()));
    }

    let file = tokio::fs::File::open(&target_path)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to read file: {}", e)))?;

    // High throughput 512KB buffer for gigabit transfers
    let stream = tokio_util::io::ReaderStream::with_capacity(file, 512 * 1024);
    let body = axum::body::Body::from_stream(stream);

    let content_disposition = format!("attachment; filename=\"{}\"", safe_file_name);

    let headers = [
        (header::CONTENT_TYPE, "application/octet-stream".to_string()),
        (header::CONTENT_DISPOSITION, content_disposition),
        (header::ACCESS_CONTROL_ALLOW_ORIGIN, "*".to_string()),
    ];

    Ok((headers, body))
}
