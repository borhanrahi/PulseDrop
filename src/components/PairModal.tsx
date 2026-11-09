import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  X, 
  Copy, 
  Check, 
  Camera, 
  AlertCircle,
  ShieldCheck,
  Smartphone,
  ExternalLink,
  Wifi,
  Network,
  Globe,
  Share2,
  Link as LinkIcon
} from 'lucide-react';
import { DeviceInfo, NetworkInterfaceInfo } from '../types/pulse';
import { isTauri } from '../hooks/usePulseEvents';

interface PairModalProps {
  isOpen: boolean;
  onClose: () => void;
  localDevice: DeviceInfo | null;
  networkInterfaces?: NetworkInterfaceInfo[];
  onPairWithPayload: (payload: string) => Promise<DeviceInfo>;
  onPairWithIpAddress?: (ip: string) => Promise<DeviceInfo>;
  lastPairedPeer?: DeviceInfo | null;
  lastPairedPeerTimestamp?: number;
}

export const PairModal: React.FC<PairModalProps> = ({
  isOpen,
  onClose,
  localDevice,
  networkInterfaces = [],
  onPairWithPayload,
  onPairWithIpAddress,
  lastPairedPeer,
  lastPairedPeerTimestamp,
}) => {
  const [copied, setCopied] = useState(false);
  const [pastePayload, setPastePayload] = useState('');
  const [directIp, setDirectIp] = useState('');
  const [isPairing, setIsPairing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pairingSuccess, setPairingSuccess] = useState<DeviceInfo | null>(null);
  const [modalOpenedAt, setModalOpenedAt] = useState<number>(() => Date.now());

  // Reset states when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setModalOpenedAt(Date.now());
      setPairingSuccess(null);
      setErrorMsg(null);
    }
  }, [isOpen]);

  // Auto-close modal when another device connects via shared link or QR code
  React.useEffect(() => {
    if (
      isOpen &&
      lastPairedPeer &&
      lastPairedPeerTimestamp &&
      lastPairedPeerTimestamp >= modalOpenedAt - 1000
    ) {
      setPairingSuccess(lastPairedPeer);
      const timer = setTimeout(() => {
        onClose();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isOpen, lastPairedPeer, lastPairedPeerTimestamp, modalOpenedAt, onClose]);

  // If user selects an interface (e.g. Ethernet vs Wi-Fi)
  const [selectedIfaceIp, setSelectedIfaceIp] = useState<string>('');

  if (!isOpen) return null;

  // Determine active IP to display and encode
  const defaultIp =
    localDevice?.ip && localDevice.ip !== '127.0.0.1' && localDevice.ip !== 'localhost'
      ? localDevice.ip
      : window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
      ? window.location.hostname
      : networkInterfaces[0]?.ip || '127.0.0.1';

  const activeHostIp = selectedIfaceIp || defaultIp;
  const activePort = localDevice?.port || 1420;

  const webMobileUrl = `http://${activeHostIp}:${activePort}/?pair=${localDevice?.id || ''}&name=${encodeURIComponent(localDevice?.name || 'Local Peer')}`;

  const handleCopy = () => {
    const textToCopy = isTauri()
      ? (localDevice ? JSON.stringify({
          v: 1,
          id: localDevice.id,
          name: localDevice.name,
          os: localDevice.os,
          ip: activeHostIp,
          port: activePort,
          token: localDevice.token,
        }) : '')
      : webMobileUrl;

    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'PulseDrop Local Pair',
          text: `Connect to ${localDevice?.name || 'PulseDrop'} on our local network:`,
          url: webMobileUrl,
        });
      } catch {
        // User cancelled share
      }
    } else {
      handleCopy();
    }
  };

  const handleManualPair = async () => {
    if (!pastePayload.trim()) return;
    setIsPairing(true);
    setErrorMsg(null);
    try {
      const peer = await onPairWithPayload(pastePayload.trim());
      setPairingSuccess(peer);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (e: any) {
      setErrorMsg(e?.toString() || 'Failed to pair. Check LAN connectivity.');
    } finally {
      setIsPairing(false);
    }
  };

  const handleDirectIpConnect = async () => {
    if (!directIp.trim()) return;
    setIsPairing(true);
    setErrorMsg(null);
    try {
      if (onPairWithIpAddress) {
        const peer = await onPairWithIpAddress(directIp.trim());
        setPairingSuccess(peer);
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        await onPairWithPayload(directIp.trim());
      }
    } catch (e: any) {
      setErrorMsg(e?.toString() || 'Failed to connect via IP address');
    } finally {
      setIsPairing(false);
    }
  };

  const handleMobileScan = async () => {
    if (!isTauri()) {
      setErrorMsg('Camera scanner is only available on native mobile builds');
      return;
    }
    try {
      const { checkPermissions, requestPermissions, scan, Format } = await import('@tauri-apps/plugin-barcode-scanner');
      let perm = await checkPermissions();
      if (perm !== 'granted') {
        perm = await requestPermissions();
      }
      if (perm !== 'granted') {
        setErrorMsg('Camera permission is required to scan QR code');
        return;
      }

      const result = await scan({
        windowed: false,
        formats: [Format.QRCode],
      });
      if (result && result.content) {
        try {
          const { notificationFeedback } = await import('@tauri-apps/plugin-haptics');
          await notificationFeedback('success');
        } catch {
          // ignore haptics error
        }
        await onPairWithPayload(result.content);
        onClose();
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (!msg.toLowerCase().includes('cancel')) {
        setErrorMsg('Camera scan failed: ' + msg);
      }
    }
  };

  const isMobile = localDevice?.os === 'android' || localDevice?.os === 'ios';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md bg-[#181818] border border-[#272727] rounded-2xl shadow-2xl p-4 sm:p-6 text-zinc-100 relative overflow-hidden max-h-[92dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#272727]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Connect Device</h2>
              <p className="text-xs text-zinc-400">
                Share link or scan QR on any PC, Mac, or phone on your network
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[#272727] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Success Overlay when device connects via QR or shared link */}
        {pairingSuccess ? (
          <div className="py-8 px-4 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-200">
            <div className="relative flex items-center justify-center w-20 h-20 rounded-3xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 mb-4 shadow-xl shadow-emerald-500/20">
              <Check className="w-10 h-10 animate-in zoom-in duration-300" />
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400" />
            </div>

            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2">
              Device Connected
            </span>

            <h3 className="text-xl font-bold text-white">Successfully Connected!</h3>
            <p className="mt-2 text-sm text-zinc-300 max-w-xs">
              Connected with <span className="font-semibold text-emerald-400">{pairingSuccess.name}</span>
            </p>
            <div className="mt-1 font-mono text-xs text-zinc-500">
              {pairingSuccess.ip ? `${pairingSuccess.ip}:${pairingSuccess.port || 1420}` : 'LAN Peer Mesh'}
            </div>

            <div className="mt-6 flex items-center gap-2 text-xs text-zinc-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Closing window automatically...</span>
            </div>

            <button
              onClick={onClose}
              className="mt-5 py-2 px-6 rounded-xl bg-[#272727] hover:bg-[#313131] text-zinc-200 text-xs font-semibold transition-all active:scale-95"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Multi-Network Interface Selector (Ethernet / Wi-Fi) */}
            {networkInterfaces.length > 1 && (
              <div className="mt-3 p-2.5 rounded-xl bg-[#202020] border border-[#2d2d2d]">
                <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1.5 font-medium">
                  <span>Broadcast Network Interface:</span>
                  <span className="text-indigo-400 font-mono text-[10px]">Universal LAN</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {networkInterfaces.map((iface) => {
                    const isSelected = activeHostIp === iface.ip;
                    return (
                      <button
                        key={iface.ip}
                        type="button"
                        onClick={() => setSelectedIfaceIp(iface.ip)}
                        className={`flex items-center gap-2 p-2 rounded-lg text-left text-xs transition-all ${
                          isSelected
                            ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 font-semibold'
                            : 'bg-[#181818] text-zinc-400 hover:text-zinc-200 border border-transparent'
                        }`}
                      >
                        {iface.type === 'wifi' ? (
                          <Wifi className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                        ) : (
                          <Network className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
                        )}
                        <div className="truncate">
                          <div className="truncate text-[11px]">{iface.name}</div>
                          <div className="font-mono text-[10px] text-zinc-400">{iface.ip}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Universal Link Sharing Section (For PC, Mac, Laptop, Coworkers, or Mobile) */}
            <div className="mt-3.5 p-3 rounded-xl bg-[#1c1c1c] border border-[#2a2a2a]">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <LinkIcon className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-xs font-semibold text-zinc-200">
                    Universal Link Sharing
                  </span>
                </div>
                <span className="text-[10px] text-zinc-400 font-medium">PC • Mac • Mobile</span>
              </div>
              <p className="text-[11px] text-zinc-400 mb-2.5">
                Send this link to anyone on your Wi-Fi/Ethernet. When they open it, both devices connect and this modal closes!
              </p>

              <div className="bg-[#141414] border border-[#262626] rounded-lg p-2 flex items-center justify-between gap-2 mb-2">
                <span className="text-xs text-indigo-300 font-mono truncate select-all">{webMobileUrl}</span>
                <a
                  href={webMobileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-md bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 transition-colors shrink-0"
                  title="Test in new tab"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all active:scale-[0.98]"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Link Copied to Clipboard!' : 'Copy Universal Link'}</span>
                </button>

                {typeof navigator !== 'undefined' && 'share' in navigator && (
                  <button
                    onClick={handleShare}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold bg-[#272727] hover:bg-[#313131] text-zinc-200 hover:text-white transition-all active:scale-[0.98]"
                    title="Share via system dialog"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Share</span>
                  </button>
                )}
              </div>
            </div>

            {/* QR Code Container for Phone Cameras */}
            <div className="mt-3.5 p-3 rounded-xl bg-[#1c1c1c] border border-[#2a2a2a] flex flex-col items-center">
              <div className="w-full flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs font-semibold text-zinc-200">Scan with Phone Camera</span>
                </div>
                <span className="text-[10px] text-zinc-400">iOS & Android</span>
              </div>

              <div className="p-3 bg-white rounded-xl shadow-lg border border-zinc-200/20">
                <QRCodeSVG
                  value={webMobileUrl}
                  size={160}
                  level="M"
                  includeMargin={false}
                />
              </div>

              <div className="mt-2 text-[11px] text-zinc-400 text-center">
                Point any mobile camera at this QR code to connect instantly.
              </div>

              {isTauri() && isMobile && (
                <button
                  onClick={handleMobileScan}
                  className="mt-2.5 w-full flex items-center justify-center gap-2 py-1.5 px-4 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all active:scale-[0.98]"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Scan QR Code</span>
                </button>
              )}
            </div>

            {/* Direct IP Connect (Universal LAN / Ethernet / Mixed Wifi) */}
            <div className="mt-3.5 pt-3 border-t border-[#272727]">
              <div className="flex items-center gap-1.5 mb-1">
                <Globe className="w-3.5 h-3.5 text-emerald-400" />
                <label className="text-xs font-semibold text-zinc-200">
                  Direct IP Connect (Cross-Subnet / Wi-Fi + Ethernet)
                </label>
              </div>
              <p className="text-[11px] text-zinc-400 mb-2">
                Connect directly to a colleague's IP address:
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. 10.200.11.91 or 192.168.1.50"
                  value={directIp}
                  onChange={(e) => setDirectIp(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleDirectIpConnect()}
                  className="flex-1 bg-[#1f1f1f] border border-[#272727] rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 font-mono transition-colors"
                />
                <button
                  onClick={handleDirectIpConnect}
                  disabled={isPairing || !directIp.trim()}
                  className="py-1.5 px-3.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] shrink-0"
                >
                  {isPairing ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            </div>

            {/* Manual Pairing Fallback */}
            <div className="mt-3 pt-3 border-t border-[#272727]">
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Manual Token / Link Input
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Paste full URL or token string..."
                  value={pastePayload}
                  onChange={(e) => setPastePayload(e.target.value)}
                  className="flex-1 bg-[#1f1f1f] border border-[#272727] rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                />
                <button
                  onClick={handleManualPair}
                  disabled={isPairing || !pastePayload.trim()}
                  className="py-1.5 px-3.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] shrink-0"
                >
                  {isPairing ? 'Pairing...' : 'Pair'}
                </button>
              </div>
              {errorMsg && (
                <div className="mt-2 text-xs text-rose-400 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
