pub mod client;
pub mod clipboard;
pub mod commands;
pub mod discovery;
pub mod server;
pub mod state;

use rand::RngCore;
use state::{AppState, DeviceInfo};
use std::sync::Arc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 1. Generate local device metadata & session token
    let mut token_bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut token_bytes);
    let session_token = hex::encode(token_bytes);

    let os_name = std::env::consts::OS.to_string();
    let device_name = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| format!("PulseDrop-{}", &os_name));

    let local_ip = local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string());

    let device_id = uuid::Uuid::new_v4().to_string();

    let local_device = DeviceInfo {
        id: device_id.clone(),
        name: device_name,
        os: os_name,
        ip: local_ip,
        port: 0, // Port will be updated by server startup
        token: session_token,
    };

    let app_state = Arc::new(AppState::new(local_device));

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init());

    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        builder = builder
            .plugin(tauri_plugin_barcode_scanner::init())
            .plugin(tauri_plugin_haptics::init());
    }

    let state_for_setup = app_state.clone();

    builder
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::get_local_pairing_info,
            commands::pair_with_qr_payload,
            commands::pair_with_nearby_peer,
            commands::get_paired_peers,
            commands::disconnect_peer,
            commands::toggle_clipboard_sync,
            commands::send_files,
            commands::get_download_dir,
            commands::open_file_in_manager,
        ])
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let state = state_for_setup;

            // Spawn Axum server
            let server_state = state.clone();
            let server_app = app_handle.clone();
            let device_id_discovery = device_id.clone();

            tauri::async_runtime::spawn(async move {
                match server::start_server(server_app.clone(), server_state.clone()).await {
                    Ok(port) => {
                        println!("[PulseDrop] Server started on port {}", port);

                        // Start mDNS advertisement and browsing
                        if let Ok(discovery) = discovery::DiscoveryManager::new() {
                            let local_info = server_state.local_device.lock().await.clone();
                            if let Err(e) = discovery.register_service(&local_info) {
                                eprintln!("[PulseDrop] mDNS register error: {}", e);
                            }
                            if let Err(e) =
                                discovery.start_browsing(device_id_discovery, server_app)
                            {
                                eprintln!("[PulseDrop] mDNS browse error: {}", e);
                            }
                        }
                    }
                    Err(e) => eprintln!("[PulseDrop] Failed to start local server: {}", e),
                }
            });

            // Start background anti-echo clipboard watcher
            clipboard::start_clipboard_watcher(app_handle, state);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running PulseDrop application");
}
