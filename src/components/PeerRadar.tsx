import React, { useState } from 'react';
import { 
  Radio, 
  Laptop, 
  Smartphone, 
  Unlink, 
  Plus, 
  QrCode, 
  RefreshCw, 
  Server, 
  Globe, 
  Wifi, 
  Network, 
  ArrowRight, 
  CheckCircle2 
} from 'lucide-react';
import { DeviceInfo, NetworkInterfaceInfo } from '../types/pulse';

interface PeerRadarProps {
  pairedPeers: DeviceInfo[];
  nearbyPeers: DeviceInfo[];
  localDevice: DeviceInfo | null;
  networkInterfaces?: NetworkInterfaceInfo[];
  onDisconnect: (peerId: string) => void;
  onPairNearby: (peer: DeviceInfo, pin?: string) => Promise<DeviceInfo>;
  onPairWithIpAddress?: (ipOrUrl: string) => Promise<DeviceInfo>;
  onOpenPairModal: () => void;
}

export const PeerRadar: React.FC<PeerRadarProps> = ({
  pairedPeers,
  nearbyPeers,
  localDevice,
  networkInterfaces = [],
  onDisconnect,
  onPairNearby,
  onPairWithIpAddress,
  onOpenPairModal,
}) => {
  const [connectingPeerId, setConnectingPeerId] = useState<string | null>(null);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [directIpInput, setDirectIpInput] = useState('');
  const [isDirectConnecting, setIsDirectConnecting] = useState(false);
  const [directSuccess, setDirectSuccess] = useState<string | null>(null);

  const handleConnect = async (peer: DeviceInfo) => {
    setConnectingPeerId(peer.id);
    setPairingError(null);
    try {
      await onPairNearby(peer);
    } catch (e: any) {
      setPairingError(e?.toString() || 'Failed to connect to peer');
    } finally {
      setConnectingPeerId(null);
    }
  };

  const handleDirectConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directIpInput.trim() || !onPairWithIpAddress) return;
    
    setIsDirectConnecting(true);
    setPairingError(null);
    setDirectSuccess(null);
    try {
      const paired = await onPairWithIpAddress(directIpInput.trim());
      setDirectSuccess(`Connected to ${paired.name} (${paired.ip})!`);
      setDirectIpInput('');
      setTimeout(() => setDirectSuccess(null), 4000);
    } catch (err: any) {
      setPairingError(err?.message || 'Could not connect to peer at this address.');
    } finally {
      setIsDirectConnecting(false);
    }
  };

  const getOsIcon = (os: string) => {
    const lower = os.toLowerCase();
    if (lower.includes('android') || lower.includes('ios')) {
      return <Smartphone className="w-5 h-5 text-indigo-400 shrink-0" />;
    }
    return <Laptop className="w-5 h-5 text-indigo-400 shrink-0" />;
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-3.5 sm:p-5 md:p-8 select-none max-w-4xl mx-auto w-full">
      {/* Header section with gradient heading */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 sm:pb-6 border-b border-[#272727]">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-[#9B9B9B] bg-clip-text text-transparent">
            Nearby Radar
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-zinc-400">
            Real time peer discovery across Ethernet, Wi-Fi, and office subnets
          </p>
        </div>
        <button
          onClick={onOpenPairModal}
          className="flex items-center justify-center gap-2 py-2 px-3.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition-all active:scale-[0.98] self-start sm:self-auto shrink-0"
        >
          <QrCode className="w-4 h-4" />
          <span>Pair with QR</span>
        </button>
      </div>

      {pairingError && (
        <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between">
          <span>{pairingError}</span>
          <button onClick={() => setPairingError(null)} className="text-zinc-400 hover:text-white">✕</button>
        </div>
      )}

      {directSuccess && (
        <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{directSuccess}</span>
        </div>
      )}

      {/* Radar Animation Badge & Network Interfaces */}
      <div className="mt-6 p-4 rounded-2xl bg-[#181818] border border-[#272727] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-[#1f1f1f] border border-[#272727]">
            <Radio className="w-5 h-5 text-indigo-400" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400" />
          </div>
          <div>
            <div className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <span>Universal Mesh Active</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Online
              </span>
            </div>
            <div className="text-xs text-zinc-400 font-mono mt-0.5">
              Listening on {localDevice?.ip || '127.0.0.1'}:{localDevice?.port || 1420} ({localDevice?.name || 'PulseDrop'})
            </div>
          </div>
        </div>

        {networkInterfaces.length > 0 && (
          <div className="flex flex-wrap gap-1.5 self-end sm:self-center">
            {networkInterfaces.map((iface) => (
              <span
                key={iface.name}
                className="text-[10px] font-mono px-2 py-1 rounded-md bg-[#222] border border-[#333] text-zinc-300 flex items-center gap-1.5"
                title={`${iface.name}: ${iface.ip}`}
              >
                {iface.type === 'ethernet' ? (
                  <Network className="w-3 h-3 text-cyan-400" />
                ) : (
                  <Wifi className="w-3 h-3 text-indigo-400" />
                )}
                <span className="font-semibold text-zinc-200">{iface.name}:</span>
                <span className="text-zinc-400">{iface.ip}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Direct IP Connect Form (Universal Cross-Ethernet / Cross-WiFi support) */}
      <div className="mt-6 p-4 rounded-2xl bg-[#161616] border border-[#272727]">
        <div className="flex items-center gap-2 mb-2">
          <Globe className="w-4 h-4 text-indigo-400" />
          <h2 className="text-xs sm:text-sm font-semibold text-zinc-200">
            Direct IP Connect (Cross-Subnet / Wi-Fi + Ethernet)
          </h2>
        </div>
        <p className="text-xs text-zinc-400 mb-3">
          If your colleague is on office Wi-Fi and you are on wired Ethernet (or different access points), enter their IP address or URL below to pair instantly.
        </p>
        <form onSubmit={handleDirectConnect} className="flex gap-2">
          <input
            type="text"
            value={directIpInput}
            onChange={(e) => setDirectIpInput(e.target.value)}
            placeholder="e.g. 10.200.10.8:1420 or 192.168.1.50"
            className="flex-1 bg-[#202020] border border-[#2e2e2e] focus:border-indigo-500 rounded-xl px-3 py-2 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={isDirectConnecting || !directIpInput.trim()}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-medium flex items-center gap-1.5 disabled:opacity-50 transition-all active:scale-[0.98] shrink-0"
          >
            {isDirectConnecting ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ArrowRight className="w-3.5 h-3.5" />
            )}
            <span>Connect</span>
          </button>
        </form>
      </div>

      {/* Section 1: Active Paired Devices */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
            Connected Peers ({pairedPeers.length})
          </h2>
          <span className="text-xs text-zinc-500">Live bidirectional sync active</span>
        </div>

        {pairedPeers.length === 0 ? (
          <div className="p-6 rounded-2xl bg-[#181818] border border-[#272727] text-center">
            <div className="w-10 h-10 rounded-xl bg-[#1f1f1f] text-zinc-500 flex items-center justify-center mx-auto mb-3">
              <Server className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-medium text-zinc-300">No devices connected</h3>
            <p className="mt-1 text-xs text-zinc-500 max-w-sm mx-auto">
              Scan your QR code from another device or click below to start sharing files and clipboard snippets.
            </p>
            <button
              onClick={onOpenPairModal}
              className="mt-4 inline-flex items-center gap-1.5 py-2 px-3.5 rounded-lg text-xs font-semibold bg-[#272727] hover:bg-[#313131] text-zinc-200 hover:text-white transition-all active:scale-[0.98]"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Show Pairing Code</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pairedPeers.map((peer) => (
              <div
                key={peer.id}
                className="p-4 rounded-xl bg-[#181818] border border-[#272727] flex items-center justify-between hover:border-[#313131] transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-[#1f1f1f] border border-[#272727]">
                    {getOsIcon(peer.os)}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5">
                      <span>{peer.name}</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    </div>
                    <div className="text-xs font-mono text-zinc-400">
                      {peer.ip}:{peer.port}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => onDisconnect(peer.id)}
                  title="Disconnect Peer"
                  className="p-2 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-[#272727] transition-colors"
                >
                  <Unlink className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Discovered Nearby Devices (mDNS) */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
            Discovered On Network ({nearbyPeers.length})
          </h2>
          <span className="text-xs text-zinc-500">Zero setup LAN discovery</span>
        </div>

        {nearbyPeers.length === 0 ? (
          <div className="p-5 rounded-2xl bg-[#181818]/60 border border-dashed border-[#272727] text-center text-xs text-zinc-500">
            Scanning local network for devices running PulseDrop...
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {nearbyPeers.map((peer) => (
              <div
                key={peer.id}
                className="p-3.5 rounded-xl bg-[#181818] border border-[#272727] flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[#1f1f1f]">
                    {getOsIcon(peer.os)}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-zinc-200">{peer.name}</div>
                    <div className="text-xs font-mono text-zinc-500">{peer.ip}:{peer.port}</div>
                  </div>
                </div>

                <button
                  onClick={() => handleConnect(peer)}
                  disabled={connectingPeerId === peer.id}
                  className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-all active:scale-[0.98]"
                >
                  {connectingPeerId === peer.id ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>{connectingPeerId === peer.id ? 'Connecting...' : 'Pair'}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
