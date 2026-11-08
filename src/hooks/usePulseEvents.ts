import { useEffect, useState, useCallback, useRef } from 'react';
import { DeviceInfo, TransferProgress, ClipboardItem, ReceivedFile } from '../types/pulse';

// Helper to check if Tauri runtime is present
export const isTauri = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

// Detect browser device metadata
const getBrowserDevice = (): { id: string; name: string; os: string } => {
  let storedId = localStorage.getItem('pulsedrop_device_id');
  if (!storedId) {
    storedId = 'web-' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('pulsedrop_device_id', storedId);
  }

  const ua = navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);
  const isMac = /macintosh|mac os x/.test(ua);

  const os = isIos ? 'ios' : isAndroid ? 'android' : isMac ? 'macos' : 'windows';
  const name = isIos
    ? 'Apple iPhone'
    : isAndroid
    ? 'Android Phone'
    : isMac
    ? 'MacBook'
    : 'Windows PC';

  return { id: storedId, name, os };
};

export function usePulseEvents() {
  const [localDevice, setLocalDevice] = useState<DeviceInfo | null>(null);
  const [pairedPeers, setPairedPeers] = useState<DeviceInfo[]>([]);
  const [nearbyPeers, setNearbyPeers] = useState<DeviceInfo[]>([]);
  const [clipboardFeed, setClipboardFeed] = useState<ClipboardItem[]>([]);
  const [activeTransfers, setActiveTransfers] = useState<Record<string, TransferProgress>>({});
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([]);
  const [clipboardSyncEnabled, setClipboardSyncEnabled] = useState<boolean>(true);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [networkUrl, setNetworkUrl] = useState<string>('');

  const wsRef = useRef<WebSocket | null>(null);

  // Load initial state
  const loadState = useCallback(async () => {
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const local = await invoke<DeviceInfo>('get_local_pairing_info');
        setLocalDevice(local);

        const peers = await invoke<DeviceInfo[]>('get_paired_peers');
        setPairedPeers(peers);
      } catch (err) {
        console.error('Failed to load initial Tauri state:', err);
      }
    } else {
      // Browser web mode
      const browserDev = getBrowserDevice();
      let lanIp = window.location.hostname;
      let hostUrl = window.location.origin;

      try {
        const res = await fetch('/api/network-info');
        if (res.ok) {
          const info = await res.json();
          if (info.ip && info.ip !== '127.0.0.1') {
            lanIp = info.ip;
          }
          if (info.url) {
            hostUrl = info.url;
          }
        }
      } catch (err) {
        console.warn('Could not fetch network info:', err);
      }

      setNetworkUrl(hostUrl);

      const webLocal: DeviceInfo = {
        id: browserDev.id,
        name: browserDev.name,
        os: browserDev.os,
        ip: lanIp,
        port: parseInt(window.location.port, 10) || 1420,
        token: 'web-token-' + browserDev.id,
      };
      setLocalDevice(webLocal);
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  // Web Relay WebSocket Connection for Browser Mode
  useEffect(() => {
    if (isTauri() || !localDevice) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws-relay`;
    let socket: WebSocket;
    let reconnectTimeout: any;

    const connectWs = () => {
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        socket.send(
          JSON.stringify({
            type: 'register',
            device: localDevice,
          })
        );

        // Check if opened via a pair link (e.g., ?pair=<id>&name=<name>)
        const params = new URLSearchParams(window.location.search);
        const pairId = params.get('pair');
        const pairName = params.get('name');
        if (pairId && pairId !== localDevice.id) {
          socket.send(
            JSON.stringify({
              type: 'pair-request',
              target_id: pairId,
              sender: localDevice,
            })
          );
          // Add to paired peers immediately
          setPairedPeers((prev) => {
            if (prev.some((p) => p.id === pairId)) return prev;
            return [
              ...prev,
              {
                id: pairId,
                name: pairName ? decodeURIComponent(pairName) : 'Remote Peer',
                os: 'unknown',
                ip: '',
                port: 1420,
                token: 'paired-token',
              },
            ];
          });
        }
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'peer-list') {
            const allPeers: DeviceInfo[] = msg.peers || [];
            // Filter out self
            const others = allPeers.filter((p) => p.id !== localDevice.id);
            setNearbyPeers(others);

            // In local browser mode, all active peers on the same relay are immediately available to pair
            setPairedPeers((prev) => {
              // Keep existing paired peers updated with live info
              const updated = prev.map((p) => others.find((o) => o.id === p.id) || p);
              // If none paired yet, automatically pair with other peer for seamless 1-click test!
              if (updated.length === 0 && others.length > 0) {
                return others;
              }
              return updated;
            });
          } else if (msg.type === 'peer-paired') {
            const peer: DeviceInfo = msg.peer;
            setPairedPeers((prev) => {
              if (prev.some((p) => p.id === peer.id)) return prev;
              return [...prev, peer];
            });
          } else if (msg.type === 'clipboard-sync') {
            const item: ClipboardItem = {
              id: 'recv-' + Date.now(),
              text: msg.text,
              direction: 'received',
              peerName: msg.sender_name,
              timestamp: msg.timestamp || Math.floor(Date.now() / 1000),
              hash: msg.hash,
            };
            setClipboardFeed((prev) => [item, ...prev.slice(0, 49)]);

            // Optional: try copying to navigator clipboard if user has interacted
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(msg.text).catch(() => {});
            }
          } else if (msg.type === 'file-offer') {
            const receivedFile: ReceivedFile = {
              transfer_id: msg.transfer_id,
              file_name: msg.file_name,
              path: msg.download_url,
              bytes: msg.file_size,
              receivedAt: Date.now(),
              download_url: msg.download_url,
              sender_name: msg.sender_name,
            };

            setReceivedFiles((prev) => [receivedFile, ...prev]);

            // Auto-trigger browser download like LocalSend!
            const downloadLink = document.createElement('a');
            downloadLink.href = msg.download_url;
            downloadLink.download = msg.file_name;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
          }
        } catch (e) {
          console.error('[WebRelay] Failed to process message:', e);
        }
      };

      socket.onclose = () => {
        reconnectTimeout = setTimeout(connectWs, 2000);
      };
    };

    connectWs();

    return () => {
      if (socket) socket.close();
      clearTimeout(reconnectTimeout);
    };
  }, [localDevice]);

  // Set up event listeners for native Tauri
  useEffect(() => {
    if (!isTauri()) return;

    let unlistenList: (() => void)[] = [];

    const setupListeners = async () => {
      const { listen } = await import('@tauri-apps/api/event');

      const u1 = await listen<DeviceInfo>('peer-connected', (event) => {
        setPairedPeers((prev) => {
          const filtered = prev.filter((p) => p.id !== event.payload.id);
          return [...filtered, event.payload];
        });
        setNearbyPeers((prev) => prev.filter((p) => p.id !== event.payload.id));
      });
      unlistenList.push(u1);

      const u2 = await listen<string>('peer-disconnected', (event) => {
        setPairedPeers((prev) => prev.filter((p) => p.id !== event.payload));
      });
      unlistenList.push(u2);

      const u3 = await listen<DeviceInfo>('nearby-peer-discovered', (event) => {
        setNearbyPeers((prev) => {
          if (prev.some((p) => p.id === event.payload.id)) return prev;
          return [...prev, event.payload];
        });
      });
      unlistenList.push(u3);

      const u4 = await listen<string>('nearby-peer-lost', (event) => {
        setNearbyPeers((prev) => prev.filter((p) => !event.payload.includes(p.id)));
      });
      unlistenList.push(u4);

      const u5 = await listen<{ text: string; timestamp: number; hash: string }>(
        'clipboard-sent',
        (event) => {
          const item: ClipboardItem = {
            id: 'sent-' + Date.now(),
            text: event.payload.text,
            direction: 'sent',
            timestamp: event.payload.timestamp,
            hash: event.payload.hash,
          };
          setClipboardFeed((prev) => [item, ...prev.slice(0, 49)]);
        }
      );
      unlistenList.push(u5);

      const u6 = await listen<{
        text: string;
        sender_name: string;
        timestamp: number;
        hash: string;
      }>('clipboard-received', (event) => {
        const item: ClipboardItem = {
          id: 'recv-' + Date.now(),
          text: event.payload.text,
          direction: 'received',
          peerName: event.payload.sender_name,
          timestamp: event.payload.timestamp,
          hash: event.payload.hash,
        };
        setClipboardFeed((prev) => [item, ...prev.slice(0, 49)]);
      });
      unlistenList.push(u6);

      const u7 = await listen<TransferProgress>('transfer-progress', (event) => {
        setActiveTransfers((prev) => ({
          ...prev,
          [event.payload.transfer_id]: event.payload,
        }));
      });
      unlistenList.push(u7);

      const u8 = await listen<ReceivedFile>('file-received', (event) => {
        setReceivedFiles((prev) => [
          { ...event.payload, receivedAt: Date.now() },
          ...prev,
        ]);
      });
      unlistenList.push(u8);
    };

    setupListeners();

    return () => {
      unlistenList.forEach((fn) => fn());
    };
  }, []);

  const toggleSync = async (enabled: boolean) => {
    setClipboardSyncEnabled(enabled);
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('toggle_clipboard_sync', { enabled });
      } catch (e) {
        console.error('Failed to toggle clipboard sync:', e);
      }
    }
  };

  const disconnectPeer = async (peerId: string) => {
    setPairedPeers((prev) => prev.filter((p) => p.id !== peerId));
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('disconnect_peer', { peerId });
      } catch (e) {
        console.error('Failed to disconnect peer:', e);
      }
    }
  };

  const pairWithQr = async (qrPayloadString: string) => {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      const peer = await invoke<DeviceInfo>('pair_with_qr_payload', {
        payloadJson: qrPayloadString,
      });
      setPairedPeers((prev) => [...prev.filter((p) => p.id !== peer.id), peer]);
      return peer;
    } else {
      let peer: DeviceInfo;
      try {
        peer = JSON.parse(qrPayloadString);
      } catch {
        // If it's a URL with params, parse it
        const url = new URL(qrPayloadString);
        const pairId = url.searchParams.get('pair') || 'unknown';
        const pairName = url.searchParams.get('name') || 'Remote Device';
        peer = {
          id: pairId,
          name: decodeURIComponent(pairName),
          os: 'mobile',
          ip: url.hostname,
          port: parseInt(url.port, 10) || 1420,
          token: 'paired-token',
        };
      }
      setPairedPeers((prev) => [...prev.filter((p) => p.id !== peer.id), peer]);
      return peer;
    }
  };

  const pairWithNearby = async (peer: DeviceInfo, pin?: string) => {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      const connected = await invoke<DeviceInfo>('pair_with_nearby_peer', {
        peerInfo: peer,
        pin,
      });
      setPairedPeers((prev) => [...prev.filter((p) => p.id !== connected.id), connected]);
      setNearbyPeers((prev) => prev.filter((p) => p.id !== peer.id));
      return connected;
    } else {
      setPairedPeers((prev) => [...prev.filter((p) => p.id !== peer.id), peer]);
      setNearbyPeers((prev) => prev.filter((p) => p.id !== peer.id));
      return peer;
    }
  };

  // Broadcast custom text across devices in web mode
  const sendClipboardText = async (text: string) => {
    if (!text.trim()) return;

    if (isTauri()) {
      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
      await writeText(text.trim());
    } else {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && localDevice) {
        wsRef.current.send(
          JSON.stringify({
            type: 'clipboard-sync',
            text: text.trim(),
            sender_id: localDevice.id,
            sender_name: localDevice.name,
            timestamp: Math.floor(Date.now() / 1000),
          })
        );
      }
      // Add to own feed
      const item: ClipboardItem = {
        id: 'sent-' + Date.now(),
        text: text.trim(),
        direction: 'sent',
        timestamp: Math.floor(Date.now() / 1000),
      };
      setClipboardFeed((prev) => [item, ...prev.slice(0, 49)]);
    }
  };

  // Send real files over local Wi-Fi in web mode or Tauri
  const sendFiles = async (targetPeerId: string, files: File[]) => {
    if (!files || files.length === 0) return;

    if (isTauri()) {
      const { invoke, Channel } = await import('@tauri-apps/api/core');
      const channel = new Channel<TransferProgress>();
      const paths = files.map((f: any) => f.path || f.name);
      await invoke('send_files', {
        peerId: targetPeerId,
        filePaths: paths,
        onProgress: channel,
      });
      return;
    }

    // Web mode upload to local relay
    for (const file of files) {
      const transferId = 'tx-' + Math.random().toString(36).substring(2, 9);

      // Initialize progress
      setActiveTransfers((prev) => ({
        ...prev,
        [transferId]: {
          transfer_id: transferId,
          file_name: file.name,
          bytes_transferred: 0,
          total_bytes: file.size,
          status: 'transferring',
        },
      }));

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload');

        xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name));
        xhr.setRequestHeader('x-file-size', file.size.toString());
        xhr.setRequestHeader('x-file-type', file.type || 'application/octet-stream');
        xhr.setRequestHeader('x-transfer-id', transferId);
        xhr.setRequestHeader('x-sender-id', localDevice?.id || 'sender');
        xhr.setRequestHeader('x-sender-name', encodeURIComponent(localDevice?.name || 'Local User'));
        xhr.setRequestHeader('x-target-id', targetPeerId);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setActiveTransfers((prev) => ({
              ...prev,
              [transferId]: {
                transfer_id: transferId,
                file_name: file.name,
                bytes_transferred: event.loaded,
                total_bytes: event.total,
                status: 'transferring',
              },
            }));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setActiveTransfers((prev) => ({
              ...prev,
              [transferId]: {
                transfer_id: transferId,
                file_name: file.name,
                bytes_transferred: file.size,
                total_bytes: file.size,
                status: 'completed',
              },
            }));
            resolve();
          } else {
            setActiveTransfers((prev) => ({
              ...prev,
              [transferId]: {
                transfer_id: transferId,
                file_name: file.name,
                bytes_transferred: 0,
                total_bytes: file.size,
                status: 'failed',
              },
            }));
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        };

        xhr.onerror = () => {
          setActiveTransfers((prev) => ({
            ...prev,
            [transferId]: {
              transfer_id: transferId,
              file_name: file.name,
              bytes_transferred: 0,
              total_bytes: file.size,
              status: 'failed',
            },
          }));
          reject(new Error('Network error during upload'));
        };

        xhr.send(file);
      });
    }
  };

  return {
    localDevice,
    pairedPeers,
    nearbyPeers,
    clipboardFeed,
    activeTransfers,
    receivedFiles,
    clipboardSyncEnabled,
    isInitialized,
    networkUrl,
    toggleSync,
    disconnectPeer,
    pairWithQr,
    pairWithNearby,
    sendClipboardText,
    sendFiles,
    setClipboardFeed,
  };
}
