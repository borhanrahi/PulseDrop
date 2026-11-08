use crate::state::DeviceInfo;
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};

pub const SERVICE_TYPE: &str = "_pulsedrop._tcp.local.";

pub struct DiscoveryManager {
    daemon: ServiceDaemon,
}

impl DiscoveryManager {
    pub fn new() -> Result<Self, String> {
        let daemon = ServiceDaemon::new().map_err(|e| format!("Failed to create mDNS daemon: {}", e))?;
        Ok(Self { daemon })
    }

    pub fn register_service(&self, device: &DeviceInfo) -> Result<(), String> {
        let instance_name = format!("pulsedrop-{}", &device.id[..8.min(device.id.len())]);
        let host_name = format!("{}.local.", instance_name);
        let port = device.port;

        let mut properties = HashMap::new();
        properties.insert("id".to_string(), device.id.clone());
        properties.insert("name".to_string(), device.name.clone());
        properties.insert("os".to_string(), device.os.clone());
        properties.insert("ip".to_string(), device.ip.clone());
        properties.insert("port".to_string(), device.port.to_string());

        let my_service = ServiceInfo::new(
            SERVICE_TYPE,
            &instance_name,
            &host_name,
            device.ip.as_str(),
            port,
            Some(properties),
        )
        .map_err(|e| format!("Failed to create ServiceInfo: {}", e))?;

        self.daemon
            .register(my_service)
            .map_err(|e| format!("Failed to register mDNS service: {}", e))?;

        Ok(())
    }

    pub fn start_browsing(&self, local_id: String, app_handle: AppHandle) -> Result<(), String> {
        let receiver = self
            .daemon
            .browse(SERVICE_TYPE)
            .map_err(|e| format!("Failed to browse mDNS: {}", e))?;

        tokio::spawn(async move {
            while let Ok(event) = receiver.recv_async().await {
                match event {
                    ServiceEvent::ServiceResolved(info) => {
                        let props = info.get_properties();
                        let peer_id = props.get_property_val_str("id").unwrap_or_default().to_string();

                        // Ignore self
                        if peer_id == local_id || peer_id.is_empty() {
                            continue;
                        }

                        let name = props
                            .get_property_val_str("name")
                            .unwrap_or("Unknown")
                            .to_string();
                        let os = props
                            .get_property_val_str("os")
                            .unwrap_or("unknown")
                            .to_string();
                        let ip = props
                            .get_property_val_str("ip")
                            .map(|s| s.to_string())
                            .unwrap_or_else(|| {
                                info.get_addresses()
                                    .iter()
                                    .next()
                                    .map(|a| a.to_string())
                                    .unwrap_or_default()
                            });
                        let port = props
                            .get_property_val_str("port")
                            .and_then(|p| p.parse::<u16>().ok())
                            .unwrap_or_else(|| info.get_port());

                        let peer_info = DeviceInfo {
                            id: peer_id,
                            name,
                            os,
                            ip,
                            port,
                            token: String::new(), // Token is acquired upon pairing
                        };

                        let _ = app_handle.emit("nearby-peer-discovered", peer_info);
                    }
                    ServiceEvent::ServiceRemoved(_, fullname) => {
                        let _ = app_handle.emit("nearby-peer-lost", fullname);
                    }
                    _ => {}
                }
            }
        });

        Ok(())
    }
}
