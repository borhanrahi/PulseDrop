# PulseDrop — Cross-Platform QR-Paired LAN File Drop & Live Clipboard Sync

> **AI Agent Directive:** Follow this specification step-by-step to scaffold, configure, and implement **PulseDrop**, a zero-cloud, local-network file sharing and real-time clipboard synchronization application targeting **Windows, macOS, Linux, iOS, and Android** using **Tauri v2, Rust, React (TypeScript), and Tailwind CSS**.

---

## 1. Project Identity & Showcase Value

* **App Name:** **PulseDrop**
* **Tagline:** *Instant, zero-cloud file drops and live clipboard sync across your desktop and phone over local Wi-Fi.*
* **Core Value Proposition:**
  * **Zero Internet / Zero Cloud:** All traffic stays strictly on the local subnet (`192.168.x.x` / `10.x.x.x` / mobile hotspot).
  * **Instant QR Pairing:** Scan a QR code from mobile (or enter a 6-digit pairing code) to establish an authenticated peer session in under 1 second.
  * **Bidirectional Live Clipboard:** Copy text or links on your PC and paste immediately on your phone (and vice versa) with loop-prevention hashing.
  * **High-Speed Chunked File Transfer:** Stream gigabytes of photos, videos, and folders directly between devices with real-time progress rings and SHA-256 integrity checks.
  * **Ultra-Light Footprint:** ~6–10 MB desktop installer and ~35 MB idle RAM.

---

## 2. System Architecture & How It Works

### 2.1 High-Level Architecture
Every PulseDrop instance runs **both a local server and a client** so any device (PC or mobile) can initiate or receive connections:

```text
+-------------------------------------------------------------------+
|                     React + Tailwind Frontend                     |
|  - Responsive Desktop Sidebar / Mobile Bottom Nav                 |
|  - QR Generator (qrcode.react) & Mobile Scanner (Tauri Plugin)    |
|  - Live Clipboard Toggle & History Feed                           |
|  - Drag-and-Drop File Queue + Real-Time Progress Bars             |
+---------------------------------+---------------------------------+
                                  | Tauri IPC (invoke + Channel<T>)
+---------------------------------v---------------------------------+
|                         Rust Core Engine                          |
|  1. Network & Discovery: local-ip-address + mdns-sd               |
|  2. Local Axum Server (HTTP/WS):                                  |
|     - GET  /ws?token=...      -> Bidirectional Clipboard & Events |
|     - POST /upload            -> Streaming Chunked File Receiver  |
|     - GET  /health            -> Device Metadata & Pairing Check  |
|  3. Clipboard Watcher Loop:                                       |
|     - Polls OS clipboard, hashes content (SHA-256) to prevent     |
|       echo loops, broadcasts changes to paired peers over WS.     |
|  4. Outbound Transfer Client (reqwest):                           |
|     - Streams files to paired peer IP with progress callbacks.    |
+-------------------------------------------------------------------+
```

### 2.2 Pairing & Security Flow (QR Handshake)
1. **Startup:** On launch, the Rust backend binds an `axum` HTTP/WebSocket server to `0.0.0.0:<random_available_port>`, detects the active LAN IPv4 address (`local-ip-address`), generates a cryptographically random 32-byte `session_token`, and broadcasts `_pulsedrop._tcp.local.` via `mdns-sd`.
2. **QR Code Payload:** The UI renders a QR code containing compact JSON:
   ```json
   {
     "v": 1,
     "id": "uuid-v4-device-id",
     "name": "MacBook-Pro",
     "os": "macos",
     "ip": "192.168.1.42",
     "port": 54321,
     "token": "9f86d081884c7d659a2feaa0c55ad015"
   }
   ```
3. **Connection:**
   * **Mobile -> Desktop:** User taps **Scan QR** on iOS/Android (`@tauri-apps/plugin-barcode-scanner`), parses the JSON, and opens an authenticated WebSocket (`ws://192.168.1.42:54321/ws?token=...`) plus registers its own return IP/port so the desktop can push files back.
   * **Desktop <-> Desktop:** Peers auto-appear in the **Nearby Radar** via `mdns-sd` and pair via a 6-digit PIN fallback.
4. **Authentication:** Every HTTP and WebSocket request requires `Authorization: Bearer <session_token>` (or `?token=` for WebSocket upgrade). Unauthenticated requests return `401 Unauthorized`.

### 2.3 Live Clipboard Sync Loop (Anti-Echo Design)
To prevent an infinite feedback loop when Device A updates Device B's clipboard:
1. Maintain `last_synced_hash: Arc<Mutex<String>>` in Rust `AppState`.
2. **Outbound Watcher (every 600ms):** Read OS clipboard text via `tauri-plugin-clipboard-manager`. Compute `sha256(text)`. If `hash != last_synced_hash` and `text` is non-empty, update `last_synced_hash` and broadcast a `ClipboardSync` JSON frame over all active WebSocket connections.
3. **Inbound Handler:** When a `ClipboardSync` frame arrives from a peer, compute `sha256(incoming_text)`, set `last_synced_hash = hash` **before** writing to the OS clipboard, and emit a `clipboard-updated` event to React.

---

## 3. Tech Stack & Dependencies

### 3.1 Frontend (React + TypeScript + Tailwind v4)
* **Build Tool:** Vite + React 19 + TypeScript
* **Styling:** Tailwind CSS v4 (`@tailwindcss/vite`)
* **Icons & QR:** `lucide-react`, `qrcode.react`
* **Tauri JS Packages:**
  * `@tauri-apps/api`
  * `@tauri-apps/plugin-clipboard-manager`
  * `@tauri-apps/plugin-fs`
  * `@tauri-apps/plugin-dialog`
  * `@tauri-apps/plugin-os`
  * `@tauri-apps/plugin-barcode-scanner` (Mobile QR scanning)
  * `@tauri-apps/plugin-haptics` (Mobile tactile feedback)

### 3.2 Backend (Rust + Tauri v2)
* **Core Framework:** `tauri = "2"`
* **Async Runtime & Web Server:** `tokio = { version = "1", features = ["full"] }`, `axum = { version = "0.8", features = ["ws", "multipart"] }`
* **HTTP Client:** `reqwest = { version = "0.12", features = ["stream", "json"] }`
* **LAN Discovery & IP:** `mdns-sd = "0.13"`, `local-ip-address = "0.6"`
* **Serialization & Crypto:** `serde`, `serde_json`, `uuid`, `sha2`, `hex`, `rand`
* **Tauri Rust Plugins:**
  * `tauri-plugin-clipboard-manager = "2"`
  * `tauri-plugin-fs = "2"`
  * `tauri-plugin-dialog = "2"`
  * `tauri-plugin-os = "2"`
  * `tauri-plugin-barcode-scanner = "2"` (cfg mobile)
  * `tauri-plugin-haptics = "2"` (cfg mobile)

---

## 4. Target Directory Structure

```text
pulsedrop/
├── package.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css                     # @import "tailwindcss";
│   ├── types/
│   │   └── pulse.ts                  # Shared TypeScript interfaces
│   ├── hooks/
│   │   └── usePulseEvents.ts         # Tauri event & Channel listeners
│   └── components/
│       ├── Navbar.tsx                # Responsive Sidebar (Desktop) / Bottom Bar (Mobile)
│       ├── PairModal.tsx             # QR Code Display + Mobile Barcode Scanner Trigger
│       ├── PeerRadar.tsx             # Active Paired Devices & Nearby mDNS Peers
│       ├── FileDropZone.tsx          # Drag-and-drop / File Picker + Transfer Progress
│       └── ClipboardFeed.tsx         # Live Sync Toggle + Recent Clipboard History
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/
    │   ├── default.json              # Desktop + shared permissions
    │   └── mobile.json               # iOS/Android camera/barcode & haptics permissions
    └── src/
        ├── main.rs
        ├── lib.rs                    # Plugin registration, AppState init, server spawn
        ├── state.rs                  # Thread-safe AppState, PeerRegistry, Token management
        ├── server.rs                 # Axum HTTP/WS server (/ws, /upload, /pair)
        ├── client.rs                 # Outbound WS connector & chunked file uploader
        ├── discovery.rs              # mDNS service advertiser & browser
        ├── clipboard.rs              # Background anti-loop clipboard watcher
        └── commands.rs               # #[tauri::command] IPC bridge to React
```

---

## 5. Step-by-Step Implementation Plan for the AI Agent

### Phase 1: Project Scaffolding & Package Installation
Execute the following commands to initialize the project:

```bash
npm create tauri-app@latest pulsedrop -- --template react-ts
cd pulsedrop
npm install
npm install -D tailwindcss @tailwindcss/vite
npm install lucide-react qrcode.react
npm install @tauri-apps/plugin-clipboard-manager @tauri-apps/plugin-fs @tauri-apps/plugin-dialog @tauri-apps/plugin-os @tauri-apps/plugin-barcode-scanner @tauri-apps/plugin-haptics
```

Configure `vite.config.ts` to enable Tailwind CSS v4:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: true, // Required so mobile devices on LAN can reach Vite dev server
  },
});
```

Set `src/index.css` to:
```css
@import "tailwindcss";
```

---

### Phase 2: Configure `src-tauri/Cargo.toml` & Capabilities

Update `src-tauri/Cargo.toml` dependencies:
```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-clipboard-manager = "2"
tauri-plugin-fs = "2"
tauri-plugin-dialog = "2"
tauri-plugin-os = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
tokio-util = { version = "0.7", features = ["io"] }
axum = { version = "0.8", features = ["ws", "multipart"] }
reqwest = { version = "0.12", features = ["stream", "json"] }
local-ip-address = "0.6"
mdns-sd = "0.13"
uuid = { version = "1", features = ["v4"] }
sha2 = "0.10"
hex = "0.4"
rand = "0.8"
futures-util = "0.3"

[target.'cfg(any(target_os = "android", target_os = "ios"))'.dependencies]
tauri-plugin-barcode-scanner = "2"
tauri-plugin-haptics = "2"
```

Configure `src-tauri/capabilities/default.json`:
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capabilities for PulseDrop",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "clipboard-manager:allow-read-text",
    "clipboard-manager:allow-write-text",
    "dialog:allow-open",
    "dialog:allow-save",
    "fs:default",
    "os:default"
  ]
}
```

Create `src-tauri/capabilities/mobile.json` for iOS/Android camera QR scanning:
```json
{
  "$schema": "../gen/schemas/mobile-schema.json",
  "identifier": "mobile-capabilities",
  "platforms": ["android", "iOS"],
  "windows": ["main"],
  "permissions": [
    "barcode-scanner:allow-scan",
    "barcode-scanner:allow-check-permissions",
    "barcode-scanner:allow-request-permissions",
    "haptics:allow-impact-feedback"
  ]
}
```

*(Note: For mobile builds, ensure `NSCameraUsageDescription` is added to `src-tauri/gen/apple/pulsedrop_iOS/Info.plist` after running `npm run tauri ios init`, and `android.permission.CAMERA` is present in `AndroidManifest.xml` after `npm run tauri android init`.)*

---

### Phase 3: Rust Core Modules Specification

#### 3.1 `src-tauri/src/state.rs` (Shared Data Models)
Define the core types shared across `server.rs`, `client.rs`, and `commands.rs`:
```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
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

#[derive(Debug, Clone, Serialize)]
pub struct TransferProgress {
    pub transfer_id: String,
    pub file_name: String,
    pub bytes_transferred: u64,
    pub total_bytes: u64,
    pub status: String, // "transferring" | "completed" | "failed"
}

pub struct AppState {
    pub local_device: Mutex<DeviceInfo>,
    pub paired_peers: Mutex<HashMap<String, DeviceInfo>>,
    pub clipboard_sync_enabled: Mutex<bool>,
    pub last_clipboard_hash: Mutex<String>,
    pub ws_tx: broadcast::Sender<String>, // Broadcasts serialized WireMessage to connected WS peers
}
```

#### 3.2 `src-tauri/src/server.rs` (Local Axum HTTP & WebSocket Server)
* Bind `tokio::net::TcpListener::bind("0.0.0.0:0").await` to acquire an OS-assigned free port, then update `local_device.port`.
* **Routes:**
  * `GET /ws`: Validates `?token=<local_token>`, upgrades to WebSocket, splits sender/receiver:
    * Subscribes to `state.ws_tx` to push local clipboard updates to the connected peer.
    * Listens for incoming `WireMessage::Handshake` (auto-adds peer to `paired_peers` and emits `"peer-connected"` to React) and `WireMessage::ClipboardSync` (updates `last_clipboard_hash`, writes text via `app_handle.clipboard().write_text(...)`, and emits `"clipboard-received"` to React).
  * `POST /upload`: Validates `Authorization: Bearer <local_token>`, reads `X-File-Name` and `X-Transfer-Id` headers, streams the incoming request body directly to `app.path().download_dir()` using `tokio::fs::File` (never loading the entire file into RAM), emits `"transfer-progress"` events to React, and returns HTTP `200 OK` with the saved path.

#### 3.3 `src-tauri/src/client.rs` (Outbound Pairing & Streaming Upload)
* `connect_to_peer(qr_payload: DeviceInfo)`:
  * Opens a WebSocket client connection to `ws://{peer.ip}:{peer.port}/ws?token={peer.token}`.
  * Immediately sends `WireMessage::Handshake(local_device)` so both devices hold each other's connection details.
  * Stores `peer` in `state.paired_peers`.
* `send_file_to_peer(peer_id: String, file_path: String, on_progress: Channel<TransferProgress>)`:
  * Opens `tokio::fs::File`, reads metadata for `total_bytes`, wraps the file in a custom `ReaderStream` that tracks bytes read and sends `TransferProgress` updates over the Tauri v2 `Channel` every ~256 KB.
  * Streams the body via `reqwest::Client::post(format!("http://{}:{}/upload", peer.ip, peer.port))` with `Authorization: Bearer {peer.token}` and `X-File-Name` headers.

#### 3.4 `src-tauri/src/clipboard.rs` (Background Clipboard Watcher)
* Spawns a background `tokio::spawn` loop running every `600ms`.
* Checks if `*state.clipboard_sync_enabled.lock().await` is `true` and `!state.paired_peers.lock().await.is_empty()`.
* Reads text via `app.clipboard().read_text()`.
* Computes SHA-256 hex digest. If non-empty and different from `last_clipboard_hash`:
  * Updates `last_clipboard_hash`.
  * Serializes `WireMessage::ClipboardSync` and broadcasts it via `state.ws_tx.send(...)` and any outbound peer sockets.
  * Emits `"clipboard-sent"` event to React for the history feed.

#### 3.5 `src-tauri/src/commands.rs` (Tauri IPC Commands)
Expose these `#[tauri::command]` functions to the React frontend:
1. `get_local_pairing_info(state) -> Result<DeviceInfo, String>`: Returns local IP, port, device name, OS, and session token for rendering the QR code.
2. `pair_with_qr_payload(payload_json: String, state, app) -> Result<DeviceInfo, String>`: Parses scanned QR JSON, validates fields, and initiates outbound pairing.
3. `get_paired_peers(state) -> Result<Vec<DeviceInfo>, String>`: Returns currently connected devices.
4. `disconnect_peer(peer_id: String, state) -> Result<(), String>`: Removes a peer from `paired_peers`.
5. `toggle_clipboard_sync(enabled: bool, state) -> Result<bool, String>`: Enables/disables live clipboard broadcasting.
6. `send_files(peer_id: String, file_paths: Vec<String>, on_progress: Channel<TransferProgress>, state) -> Result<(), String>`: Streams one or multiple files to the target peer.

---

### Phase 4: React + Tailwind v4 Frontend Specification

Design a clean, modern dark-mode UI (`bg-slate-950 text-slate-100`) that adapts seamlessly between desktop and mobile viewports:

1. **Responsive Layout Shell (`App.tsx`):**
   * **Desktop (`md:` and up):** Left sidebar (`w-64 border-r border-slate-800`) showing local device status, LAN IP badge, Live Clipboard toggle switch, and navigation tabs (**Drop & Sync**, **Paired Devices**, **History**).
   * **Mobile (`< md`):** Top compact header with connection pill + fixed bottom navigation bar (`h-16 border-t border-slate-800`).
2. **QR Pairing Component (`PairModal.tsx`):**
   * Renders `<QRCodeSVG value={JSON.stringify(localDevice)} size={200} />` inside a crisp white-padded card with the device's LAN IP (`192.168.x.x:port`) displayed underneath.
   * Detects platform via `@tauri-apps/plugin-os` (`platform()`):
     * On `android` / `ios`: Shows a prominent **"Scan Desktop QR Code"** button calling `scan({ windowed: true, formats: [Format.QRCode] })` from `@tauri-apps/plugin-barcode-scanner`.
     * On desktop: Shows a **"Paste Pairing JSON"** input fallback for desktop-to-desktop pairing without a camera.
3. **File Drop & Transfer Queue (`FileDropZone.tsx`):**
   * Supports HTML5 drag-and-drop (`onDrop`) + native Tauri file picker (`open({ multiple: true })` from `@tauri-apps/plugin-dialog`).
   * Displays active transfers with smooth Tailwind progress bars (`bg-indigo-500 transition-all`), speed/percentage readouts, and completion checkmarks.
4. **Live Clipboard Feed (`ClipboardFeed.tsx`):**
   * Real-time stream of synced clipboard snippets showing direction (`Sent to iPhone` vs `Received from MacBook`), timestamp, truncated preview, and a one-click **Copy Again** button.

---

### Phase 5: Running & Building Across All 5 Platforms

#### Local Development
```bash
# Desktop (Windows / macOS / Linux)
npm run tauri dev

# Android (with USB debugging or emulator connected)
npm run tauri android init
npm run tauri android dev

# iOS (requires macOS + Xcode)
npm run tauri ios init
npm run tauri ios dev
```

#### Production Builds
```bash
# Desktop Native Installers (.exe/.msi, .dmg, .AppImage/.deb)
npm run tauri build

# Android APK / AAB
npm run tauri android build

# iOS IPA
npm run tauri ios build
```

---

## 6. Agent Execution Checklist
- [ ] Scaffold Tauri v2 + React TypeScript + Tailwind CSS v4 project.
- [ ] Configure `Cargo.toml`, `capabilities/default.json`, and `capabilities/mobile.json`.
- [ ] Implement `state.rs`, `server.rs`, `client.rs`, `clipboard.rs`, `discovery.rs`, and `commands.rs` in `src-tauri/src/`.
- [ ] Register all plugins and spawn the Axum server + clipboard watcher inside `lib.rs` `.setup()`.
- [ ] Build responsive React + Tailwind components (`PairModal`, `PeerRadar`, `FileDropZone`, `ClipboardFeed`).
- [ ] Verify `cargo check` passes with zero errors and test `npm run tauri dev`.