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
  Globe
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
}

export const PairModal: React.FC<PairModalProps> = ({
  isOpen,
  onClose,
  localDevice,
  networkInterfaces = [],
  onPairWithPayload,
  onPairWithIpAddress,
}) => {
  const [copied, setCopied] = useState(false);
  const [pastePayload, setPastePayload] = useState('');
  const [directIp, setDirectIp] = useState('');
  const [isPairing, setIsPairing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pairingSuccess, setPairingSuccess] = useState<DeviceInfo | null>(null);

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

  const qrPayloadString = isTauri()
    ? localDevice
      ? JSON.stringify({
          v: 1,
          id: localDevice.id,
          name: localDevice.name,
          os: localDevice.os,
          ip: activeHostIp,
          port: activePort,
          token: localDevice.token,
        })
      : ''
    : webMobileUrl;

  const handleCopyLinkOrPayload = () => {
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

  const handleManualPair = async () => {
    if (!pastePayload.trim()) return;
    setIsPairing(true);
    setErrorMsg(null);
    try {
      const peer = await onPairWithPayload(pastePayload.trim());
      setPairingSuccess(peer);
      setTimeout(() => {
        setPairingSuccess(null);
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
          setPairingSuccess(null);
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
      const { scan, Format } = await import('@tauri-apps/plugin-barcode-scanner');
      const result = await scan({
        windowed: false,
        formats: [Format.QRCode],
      });
      if (result && result.content) {
        await onPairWithPayload(result.content);
        onClose();
      }
    } catch (err: any) {
      setErrorMsg('Camera scan failed: ' + (err?.message || err));
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
              <h2 className="text-base font-semibold text-white">Instant Pair</h2>
              <p className="text-xs text-zinc-400">
                Connect over same Wi-Fi, Ethernet LAN, or office network
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

        {/* Success banner */}
        {pairingSuccess && (
          <div className="mt-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>Connected to {pairingSuccess.name} ({pairingSuccess.ip})</span>
          </div>
        )}

        {/* Multi-Network Interface Selector (Ethernet / Wi-Fi) */}
        {networkInterfaces.length > 1 && (
          <div className="mt-3 p-2.5 rounded-xl bg-[#202020] border border-[#2d2d2d]">
            <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1.5 font-medium">
              <span>Select Network to Broadcast:</span>
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

        {/* QR Code Presentation */}
        <div className="mt-4 flex flex-col items-center">
          <div className="p-3 bg-white rounded-xl shadow-inner">
            {qrPayloadString ? (
              <QRCodeSVG
                value={qrPayloadString}
                size={168}
                level="M"
                includeMargin={false}
              />
            ) : (
              <div className="w-[168px] h-[168px] bg-zinc-200 animate-pulse rounded" />
            )}
          </div>

          <div className="mt-3 text-center">
            {!isTauri() ? (
              <div className="flex flex-col items-center">
                <span className="font-mono text-xs px-2.5 py-1 rounded-md bg-[#1f1f1f] text-indigo-400 border border-[#272727] flex items-center gap-1.5 max-w-[320px] truncate">
                  <Smartphone className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{webMobileUrl}</span>
                </span>
                <p className="mt-1.5 text-xs text-zinc-300 font-medium max-w-[300px]">
                  Scan with your phone camera to open and pair instantly!
                </p>
              </div>
            ) : (
              <div>
                <span className="font-mono text-xs px-2.5 py-1 rounded-md bg-[#1f1f1f] text-zinc-300 border border-[#272727]">
                  {activeHostIp}:{activePort}
                </span>
                <p className="mt-1.5 text-xs text-zinc-400 max-w-[280px]">
                  Scan with another device to connect over the same local network
                </p>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleCopyLinkOrPayload}
              className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold bg-[#272727] hover:bg-[#313131] text-zinc-200 hover:text-white border border-transparent transition-all active:scale-[0.98]"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied Link' : 'Copy Mobile Link'}</span>
            </button>

            {!isTauri() && (
              <a
                href={webMobileUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 transition-all active:scale-[0.98]"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Test Link</span>
              </a>
            )}

            {isTauri() && isMobile && (
              <button
                onClick={handleMobileScan}
                className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all active:scale-[0.98]"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Scan Camera</span>
              </button>
            )}
          </div>
        </div>

        {/* Direct IP Connect (Universal Office Network Pairing) */}
        <div className="mt-4 pt-3.5 border-t border-[#272727]">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            <label className="text-xs font-semibold text-zinc-200">
              Direct IP Connect (Ethernet / Cross-Subnet)
            </label>
          </div>
          <p className="text-[11px] text-zinc-400 mb-2">
            Connect to any coworker on the office network by typing their IP:
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
        <div className="mt-3.5 pt-3 border-t border-[#272727]">
          <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
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
      </div>
    </div>
  );
};
