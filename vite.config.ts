import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { WebSocketServer, WebSocket } from "ws";
import os from "os";
import { IncomingMessage, ServerResponse } from "http";

interface StoredFile {
  id: string;
  name: string;
  size: number;
  type: string;
  buffer: Buffer;
  senderId: string;
  senderName: string;
  targetId: string;
  createdAt: number;
}

interface ConnectedPeer {
  id: string;
  name: string;
  os: string;
  ip: string;
  port: number;
  token: string;
  ws: WebSocket;
}

function localRelayPlugin(): Plugin {
  return {
    name: "pulsedrop-local-relay",
    configureServer(server) {
      if (!server.httpServer) return;

      const peers = new Map<string, ConnectedPeer>();
      const fileStore = new Map<string, StoredFile>();

      // Auto-cleanup files older than 15 minutes
      setInterval(() => {
        const now = Date.now();
        fileStore.forEach((file, id) => {
          if (now - file.createdAt > 15 * 60 * 1000) {
            fileStore.delete(id);
          }
        });
      }, 60 * 1000);

      // Helper to detect LAN IPv4
      const getLocalLanIp = (): string => {
        const interfaces = os.networkInterfaces();

        // Priority 1: Wi-Fi / WLAN adapters
        for (const ifaceName of Object.keys(interfaces)) {
          const lower = ifaceName.toLowerCase();
          if (lower.includes("wi-fi") || lower.includes("wlan") || lower.includes("wireless")) {
            const iface = interfaces[ifaceName];
            if (!iface) continue;
            for (const alias of iface) {
              if (alias.family === "IPv4" && !alias.internal && !alias.address.startsWith("169.254")) {
                return alias.address;
              }
            }
          }
        }

        // Priority 2: Non-virtual adapters
        for (const ifaceName of Object.keys(interfaces)) {
          const lower = ifaceName.toLowerCase();
          if (
            lower.includes("vmware") ||
            lower.includes("virtual") ||
            lower.includes("vethernet") ||
            lower.includes("loopback")
          ) {
            continue;
          }

          const iface = interfaces[ifaceName];
          if (!iface) continue;
          for (const alias of iface) {
            if (
              alias.family === "IPv4" &&
              !alias.internal &&
              !alias.address.startsWith("169.254") &&
              !alias.address.startsWith("192.168.56.") &&
              !alias.mac.startsWith("0a:00:27")
            ) {
              return alias.address;
            }
          }
        }

        // Fallback to first non-internal IPv4
        for (const ifaceName of Object.keys(interfaces)) {
          const iface = interfaces[ifaceName];
          if (!iface) continue;
          for (const alias of iface) {
            if (alias.family === "IPv4" && !alias.internal) {
              return alias.address;
            }
          }
        }
        return "127.0.0.1";
      };

      // Set up WebSocket server with noServer: true to avoid interfering with Vite HMR
      const wss = new WebSocketServer({ noServer: true });

      server.httpServer.on("upgrade", (req, socket, head) => {
        if (req.url === "/ws-relay") {
          wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit("connection", ws, req);
          });
        }
      });

      const broadcastPeerList = () => {
        const peerList = Array.from(peers.values()).map((p) => ({
          id: p.id,
          name: p.name,
          os: p.os,
          ip: p.ip,
          port: p.port,
          token: p.token,
        }));

        const msg = JSON.stringify({
          type: "peer-list",
          peers: peerList,
        });

        peers.forEach((peer) => {
          if (peer.ws.readyState === WebSocket.OPEN) {
            peer.ws.send(msg);
          }
        });
      };

      wss.on("connection", (ws: WebSocket) => {
        let currentPeerId: string | null = null;

        ws.on("message", (raw) => {
          try {
            const data = JSON.parse(raw.toString());

            if (data.type === "register") {
              const dev = data.device;
              currentPeerId = dev.id;
              peers.set(dev.id, {
                id: dev.id,
                name: dev.name,
                os: dev.os,
                ip: dev.ip || getLocalLanIp(),
                port: dev.port || 1420,
                token: dev.token || "web-token",
                ws,
              });
              broadcastPeerList();
            } else if (data.type === "clipboard-sync") {
              const payload = JSON.stringify({
                type: "clipboard-sync",
                text: data.text,
                sender_name: data.sender_name,
                timestamp: data.timestamp || Math.floor(Date.now() / 1000),
                hash: data.hash || "",
              });

              peers.forEach((peer) => {
                if (peer.id !== data.sender_id && peer.ws.readyState === WebSocket.OPEN) {
                  peer.ws.send(payload);
                }
              });
            } else if (data.type === "pair-request") {
              const target = peers.get(data.target_id);
              if (target && target.ws.readyState === WebSocket.OPEN) {
                target.ws.send(
                  JSON.stringify({
                    type: "peer-paired",
                    peer: data.sender,
                  })
                );
              }
            }
          } catch (err) {
            console.error("[WebRelay] Failed to parse WebSocket message:", err);
          }
        });

        ws.on("close", () => {
          if (currentPeerId) {
            peers.delete(currentPeerId);
            broadcastPeerList();
          }
        });
      });

      // HTTP Middleware for network info and file upload/download
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const url = req.url || "";

        if (url === "/api/network-info") {
          const lanIp = getLocalLanIp();
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              ip: lanIp,
              port: 1420,
              url: `http://${lanIp}:1420`,
            })
          );
          return;
        }

        if (url === "/api/upload" && req.method === "POST") {
          const fileName = decodeURIComponent((req.headers["x-file-name"] as string) || "downloaded-file");
          const fileSize = parseInt((req.headers["x-file-size"] as string) || "0", 10);
          const fileType = (req.headers["x-file-type"] as string) || "application/octet-stream";
          const transferId = (req.headers["x-transfer-id"] as string) || `tx-${Date.now()}`;
          const senderId = (req.headers["x-sender-id"] as string) || "";
          const senderName = decodeURIComponent((req.headers["x-sender-name"] as string) || "Nearby Peer");
          const targetId = (req.headers["x-target-id"] as string) || "";

          const chunks: Buffer[] = [];
          req.on("data", (chunk) => {
            chunks.push(Buffer.from(chunk));
          });

          req.on("end", () => {
            const buffer = Buffer.concat(chunks);
            fileStore.set(transferId, {
              id: transferId,
              name: fileName,
              size: fileSize || buffer.length,
              type: fileType,
              buffer,
              senderId,
              senderName,
              targetId,
              createdAt: Date.now(),
            });

            const targetPeer = peers.get(targetId);
            const downloadUrl = `/api/download/${transferId}`;

            const offerMsg = JSON.stringify({
              type: "file-offer",
              transfer_id: transferId,
              file_name: fileName,
              file_size: fileSize || buffer.length,
              sender_name: senderName,
              sender_id: senderId,
              download_url: downloadUrl,
            });

            if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
              targetPeer.ws.send(offerMsg);
            } else {
              peers.forEach((peer) => {
                if (peer.id !== senderId && peer.ws.readyState === WebSocket.OPEN) {
                  peer.ws.send(offerMsg);
                }
              });
            }

            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: true, transferId, downloadUrl }));
          });
          return;
        }

        if (url.startsWith("/api/download/")) {
          const transferId = url.replace("/api/download/", "").split("?")[0];
          const file = fileStore.get(transferId);

          if (!file) {
            res.statusCode = 404;
            res.end("File not found or expired");
            return;
          }

          res.setHeader("Content-Type", file.type || "application/octet-stream");
          res.setHeader("Content-Length", file.buffer.length);
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="${encodeURIComponent(file.name)}"; filename*=UTF-8''${encodeURIComponent(file.name)}`
          );
          res.end(file.buffer);
          return;
        }

        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), localRelayPlugin()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: true,
  },
});
