import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { WebSocketServer, WebSocket } from "ws";
import os from "os";
import fs from "fs";
import path from "path";
import { IncomingMessage, ServerResponse } from "http";

interface StoredFile {
  id: string;
  name: string;
  size: number;
  type: string;
  filePath: string;
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

interface NetworkIface {
  name: string;
  ip: string;
  type: "wifi" | "ethernet" | "other";
  url: string;
}

function localRelayPlugin(): Plugin {
  return {
    name: "pulsedrop-local-relay",
    configureServer(server) {
      if (!server.httpServer) return;

      const peers = new Map<string, ConnectedPeer>();
      const fileStore = new Map<string, StoredFile>();

      // Spool directory for unlimited file sizes (no memory bottlenecks)
      const spoolDir = path.join(os.tmpdir(), "pulsedrop_spool");
      try {
        if (!fs.existsSync(spoolDir)) {
          fs.mkdirSync(spoolDir, { recursive: true });
        }
      } catch (err) {
        console.warn("[PulseDrop] Could not create spool dir:", err);
      }

      // Auto-cleanup files older than 15 minutes
      setInterval(() => {
        const now = Date.now();
        fileStore.forEach((file, id) => {
          if (now - file.createdAt > 15 * 60 * 1000) {
            try {
              if (fs.existsSync(file.filePath)) {
                fs.unlinkSync(file.filePath);
              }
            } catch {}
            fileStore.delete(id);
          }
        });
      }, 60 * 1000);

      // Detect ALL active LAN / Wi-Fi / Ethernet IPv4 interfaces
      const getAllLanInterfaces = (port: number = 1420): NetworkIface[] => {
        const interfaces = os.networkInterfaces();
        const list: NetworkIface[] = [];

        for (const ifaceName of Object.keys(interfaces)) {
          const lower = ifaceName.toLowerCase();
          // Exclude virtual/loopback adapters
          if (
            lower.includes("vmware") ||
            lower.includes("virtual") ||
            lower.includes("vethernet") ||
            lower.includes("loopback") ||
            lower.includes("wsl")
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
              const isWifi = lower.includes("wi-fi") || lower.includes("wlan") || lower.includes("wireless");
              const isEth = lower.includes("ethernet") || lower.includes("eth") || lower.includes("lan");
              const type: "wifi" | "ethernet" | "other" = isWifi ? "wifi" : isEth ? "ethernet" : "other";

              list.push({
                name: ifaceName,
                ip: alias.address,
                type,
                url: `http://${alias.address}:${port}`,
              });
            }
          }
        }

        // Prioritize Wi-Fi and Ethernet first
        list.sort((a, b) => {
          if (a.type === "wifi" && b.type !== "wifi") return -1;
          if (b.type === "wifi" && a.type !== "wifi") return 1;
          if (a.type === "ethernet" && b.type !== "ethernet") return -1;
          if (b.type === "ethernet" && a.type !== "ethernet") return 1;
          return 0;
        });

        return list;
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
                ip: dev.ip || "127.0.0.1",
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
                // Also notify the sender (e.g. mobile scanner) that it successfully paired with the target
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(
                    JSON.stringify({
                      type: "peer-paired",
                      peer: {
                        id: target.id,
                        name: target.name,
                        os: target.os,
                        ip: target.ip,
                        port: target.port,
                        token: target.token,
                      },
                    })
                  );
                }
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

      // HTTP Middleware for universal network info and file upload/download
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const url = req.url || "";

        if (url === "/api/network-info") {
          const allInterfaces = getAllLanInterfaces(1420);
          const primaryIp = allInterfaces[0]?.ip || "127.0.0.1";
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              ip: primaryIp,
              port: 1420,
              url: `http://${primaryIp}:1420`,
              interfaces: allInterfaces,
            })
          );
          return;
        }

        // Direct IP Pair endpoint (allows pairing across different subnets / Wi-Fi / Ethernet)
        if (url === "/api/pair-device" && req.method === "POST") {
          const chunks: Buffer[] = [];
          req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          req.on("end", () => {
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString());
              const remotePeer = body.peer;

              if (remotePeer && remotePeer.id) {
                // Broadcast to local WebSocket clients that a peer paired directly via IP
                const pairMsg = JSON.stringify({
                  type: "peer-paired",
                  peer: remotePeer,
                });
                peers.forEach((peer) => {
                  if (peer.ws.readyState === WebSocket.OPEN) {
                    peer.ws.send(pairMsg);
                  }
                });

                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ success: true, message: "Paired successfully" }));
                return;
              }
            } catch (err) {
              console.error("[WebRelay] Failed to parse pair-device body:", err);
            }
            res.statusCode = 400;
            res.end(JSON.stringify({ success: false, message: "Invalid peer payload" }));
          });
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

          const notifyTarget = (msg: string) => {
            if (targetId && peers.has(targetId)) {
              const target = peers.get(targetId);
              if (target && target.ws.readyState === WebSocket.OPEN) {
                target.ws.send(msg);
                return;
              }
            }
            peers.forEach((peer) => {
              if (peer.id !== senderId && peer.ws.readyState === WebSocket.OPEN) {
                peer.ws.send(msg);
              }
            });
          };

          // Immediately broadcast incoming transfer starting to receiver
          const initProgressMsg = JSON.stringify({
            type: "transfer-progress",
            transfer_id: transferId,
            file_name: fileName,
            direction: "incoming",
            total_bytes: fileSize,
            bytes_transferred: 0,
            speed_bps: 0,
            status: "in_progress",
            sender_name: senderName,
          });
          notifyTarget(initProgressMsg);

          // Stream directly to spool file on disk (zero memory limit, supports multi-GB files at line speed)
          const tempFilePath = path.join(spoolDir, `${transferId}-${Date.now()}.dat`);
          const fileWriteStream = fs.createWriteStream(tempFilePath, { highWaterMark: 512 * 1024 });

          let bytesReceived = 0;
          let lastBroadcastTime = 0;
          let lastSpeedSampleTime = Date.now();
          let lastBytesSample = 0;
          let currentSpeedBps = 0;

          req.on("data", (chunk: Buffer) => {
            fileWriteStream.write(chunk);
            bytesReceived += chunk.length;

            const now = Date.now();
            const timeDiff = (now - lastSpeedSampleTime) / 1000;
            if (timeDiff >= 0.2) {
              const bytesDiff = bytesReceived - lastBytesSample;
              currentSpeedBps = Math.round(bytesDiff / timeDiff);
              lastSpeedSampleTime = now;
              lastBytesSample = bytesReceived;
            }

            // Throttle WebSocket progress broadcasts to 60ms for smooth 60fps UI
            if (now - lastBroadcastTime > 60 || bytesReceived === fileSize) {
              lastBroadcastTime = now;
              const progressMsg = JSON.stringify({
                type: "transfer-progress",
                transfer_id: transferId,
                file_name: fileName,
                direction: "incoming",
                total_bytes: fileSize || bytesReceived,
                bytes_transferred: bytesReceived,
                speed_bps: currentSpeedBps,
                status: bytesReceived >= fileSize && fileSize > 0 ? "completed" : "in_progress",
                sender_name: senderName,
              });
              notifyTarget(progressMsg);
            }
          });

          req.on("end", () => {
            fileWriteStream.end(() => {
              fileStore.set(transferId, {
                id: transferId,
                name: fileName,
                size: fileSize || bytesReceived,
                type: fileType,
                filePath: tempFilePath,
                senderId,
                senderName,
                targetId,
                createdAt: Date.now(),
              });

              const downloadUrl = `/api/download/${transferId}`;

              // Send final completion progress update to receiver
              const completedMsg = JSON.stringify({
                type: "transfer-progress",
                transfer_id: transferId,
                file_name: fileName,
                direction: "incoming",
                total_bytes: fileSize || bytesReceived,
                bytes_transferred: fileSize || bytesReceived,
                speed_bps: 0,
                status: "completed",
                sender_name: senderName,
              });
              notifyTarget(completedMsg);

              const offerMsg = JSON.stringify({
                type: "file-offer",
                transfer_id: transferId,
                file_name: fileName,
                file_size: fileSize || bytesReceived,
                sender_name: senderName,
                sender_id: senderId,
                download_url: downloadUrl,
              });
              notifyTarget(offerMsg);

              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: true, transferId, downloadUrl }));
            });
          });

          req.on("error", () => {
            fileWriteStream.destroy();
            try {
              if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            } catch {}
          });
          return;
        }

        if (url.startsWith("/api/download/")) {
          const transferId = url.replace("/api/download/", "").split("?")[0];
          const file = fileStore.get(transferId);

          if (!file || !fs.existsSync(file.filePath)) {
            res.statusCode = 404;
            res.end("File not found or expired");
            return;
          }

          res.setHeader("Content-Type", file.type || "application/octet-stream");
          res.setHeader("Content-Length", file.size);
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="${encodeURIComponent(file.name)}"; filename*=UTF-8''${encodeURIComponent(file.name)}`
          );
          res.setHeader("Accept-Ranges", "bytes");

          // High-throughput 512KB read stream for maximum local gigabit performance
          const readStream = fs.createReadStream(file.filePath, { highWaterMark: 512 * 1024 });
          readStream.pipe(res);
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
