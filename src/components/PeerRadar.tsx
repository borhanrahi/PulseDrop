import React, { useState } from 'react';
import { 
  Radio, 
  Laptop, 
  Smartphone, 
  Unlink, 
  Plus, 
  QrCode, 
  RefreshCw,
  Server
} from 'lucide-react';
import { DeviceInfo } from '../types/pulse';

interface PeerRadarProps {
  pairedPeers: DeviceInfo[];
  nearbyPeers: DeviceInfo[];
  localDevice: DeviceInfo | null;
  onDisconnect: (peerId: string) => void;
  onPairNearby: (peer: DeviceInfo, pin?: string) => Promise<DeviceInfo>;
  onOpenPairModal: () => void;
}

export const PeerRadar: React.FC<PeerRadarProps> = ({
  pairedPeers,
  nearbyPeers,
  localDevice,
  onDisconnect,
  onPairNearby,
  onOpenPairModal,
}) => {
  const [connectingPeerId, setConnectingPeerId] = useState<string | null>(null);
  const [pairingError, setPairingError] = useState<string | null>(null);

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
            Real time peer discovery across local Wi-Fi and mobile hotspots
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

      {/* Radar Animation Badge */}
      <div className="mt-6 p-4 rounded-2xl bg-[#181818] border border-[#272727] flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-[#1f1f1f] border border-[#272727]">
            <Radio className="w-5 h-5 text-indigo-400" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400" />
          </div>
          <div>
            <div className="text-sm font-semibold text-zinc-100">mDNS LAN Beacon</div>
            <div className="text-xs text-zinc-400 font-mono">
              Broadcasting on {localDevice?.ip || '127.0.0.1'} ({localDevice?.name || 'PulseDrop'})
            </div>
          </div>
        </div>
        <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-[#1f1f1f] text-emerald-400 border border-emerald-500/20">
          Listening
        </span>
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
