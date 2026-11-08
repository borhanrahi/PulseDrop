# ⚡ PulseDrop

> **Zero-Cloud, High-Speed Local File Sharing & Clipboard Synchronization**  
> Effortlessly drop files and sync clipboard text across your PC, Mac, Linux, iPhone, Android, and colleagues on the same network — without sending a single byte to the cloud.

---

## 🌟 Highlights

- **🔒 100% Local & Private**: No cloud servers, no user accounts, no tracking. All files and clipboard data transfer strictly over your local area network (LAN).
- **🌐 Universal Network Support**: Seamlessly connects across wired Ethernet, Wi-Fi, mobile hotspots, and office subnets.
- **📱 1-Tap QR & Link Pairing**: Scan the QR code with any standard smartphone camera or share a universal link via Slack, Teams, or email. The pairing modal auto-syncs and closes on connect.
- **📊 Real-Time Bidirectional Progress**: Live animated progress bars showing percentage, bytes transferred, and status for **both the sender and the receiver**.
- **📋 Live Clipboard Sync**: Broadcast code snippets, URLs, and copied text instantly between paired devices.
- **📁 Native File Handling**: Transferred files automatically download to your browser's Downloads folder or save directly to disk.
- **📱 Responsive Mobile & Desktop UI**: Designed with Tailwind CSS v4 featuring mobile bottom navigation, desktop sidebar, and dark mode interface.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend Framework** | [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com/) |
| **Bundler & Server** | [Vite 8](https://vitejs.dev/) with inlined WebSocket & HTTP streaming relay |
| **Icons & QR** | [Lucide React](https://lucide.dev/), [qrcode.react](https://github.com/zpao/qrcode.react) |
| **Desktop / Mobile Core** | [Tauri v2](https://v2.tauri.app/) (Rust backend for native OS integration) |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18.0.0 or higher recommended)
- `npm`, `pnpm`, or `yarn`
- *(Optional for native builds)*: [Rust toolchain](https://rustup.rs/) (v1.78+)

### 1. Clone the Repository

```bash
git clone https://github.com/borhanrahi/PulseDrop.git
cd PulseDrop
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run the Development Server

```bash
npm run dev
```

The server starts and listens on all network interfaces:
```
  ➜  Local:   http://localhost:1420/
  ➜  Network: http://10.200.11.91:1420/ (or your local LAN IP)
```

---

## 📲 How to Connect Devices

PulseDrop provides four flexible ways to connect devices on your local network:

### Method 1: Scan QR Code (Phones & Tablets)
1. On your PC, click **Connect Device** (or Pair) to open the QR modal.
2. Point your phone’s native camera app at the QR code.
3. Tap the link that appears — PulseDrop opens in your mobile browser.
4. The PC modal will display **"Successfully Connected!"** and close automatically.

### Method 2: Universal Link Sharing (PC, Mac, Laptop, Coworkers)
1. In the **Connect Device** modal, click **Copy Universal Link**.
2. Send the link to your coworker or open it on another device (via Slack, Teams, WhatsApp, email, or chat).
3. The moment the recipient opens the link in Chrome, Edge, Safari, or Firefox:
   - Both devices sync immediately.
   - The modal automatically displays the connected peer and closes.

> 💡 **Quick Test on the Same PC**: Click the **"Test in new tab"** icon next to the link. A second tab will open, and both tabs will automatically pair and show ready for live transfer!

### Method 3: Direct IP Connect (Mixed Ethernet / Wi-Fi Subnets)
If you are on a wired office Ethernet connection and your colleague is on Wi-Fi (or separated by office switches):
1. Navigate to the **Radar** tab or the bottom of the **Pair Modal**.
2. Enter the coworker's IP address and port (e.g., `10.200.10.8:1420`).
3. Click **Connect** to pair directly.

### Method 4: Nearby Radar (Zero-Setup Auto-Discovery)
- Open the **Radar** tab to view all PulseDrop nodes broadcasting on your subnet.
- Click **Pair** next to any detected device.

---

## 📦 Building for Production

### Web Build
To compile the standalone web application:

```bash
npm run build
```

The compiled assets will be written to the `dist/` directory. You can preview the production build locally:

```bash
npm run preview
```

### Native Desktop / Mobile Build (Tauri v2)
*(Requires Rust and platform build tools)*

```bash
# Run Tauri desktop app in development
npm run tauri dev

# Compile release binaries (.exe, .dmg, .deb, etc.)
npm run tauri build
```

---

## 📂 Project Structure

```
PulseDrop/
├── src/
│   ├── components/
│   │   ├── ClipboardFeed.tsx    # Live clipboard history & broadcast interface
│   │   ├── FileDropZone.tsx     # Drag-and-drop zone with live progress bars
│   │   ├── Navbar.tsx           # Sidebar (desktop) & header/bottom nav (mobile)
│   │   ├── PairModal.tsx        # QR code, universal link share & direct IP modal
│   │   └── PeerRadar.tsx        # Discovery radar, network interface badges & direct IP
│   ├── hooks/
│   │   └── usePulseEvents.ts    # Central reactive state, WebSocket relay & file transfer engine
│   ├── types/
│   │   └── pulse.ts             # TypeScript interfaces (DeviceInfo, TransferProgress, etc.)
│   ├── App.tsx                  # Root application layout & global notifications
│   ├── main.tsx                 # React DOM mount point
│   └── index.css                # Global styles & Tailwind CSS v4 directives
├── src-tauri/                   # Tauri v2 Rust backend source code
├── vite.config.ts               # Vite configuration + inlined WebSocket LAN relay plugin
├── tsconfig.json                # TypeScript project configuration
└── package.json                 # Project scripts and dependencies
```

---

## 🔧 Network & Firewall Notes

- **Port 1420**: PulseDrop runs on port `1420` by default. If your operating system prompts you with a Windows Defender / firewall alert on first launch, allow access for **Private Networks**.
- **Virtual Network Adapters**: PulseDrop automatically filters out virtual adapters (such as VMware, VirtualBox, and WSL) to ensure devices connect over your physical Wi-Fi or Ethernet interfaces.

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
