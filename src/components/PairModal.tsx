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
  ExternalLink
} from 'lucide-react';
import { DeviceInfo } from '../types/pulse';
import { isTauri } from '../hooks/usePulseEvents';

interface PairModalProps {
  isOpen: boolean;
  onClose: () => void;
  localDevice: DeviceInfo | null;
  onPairWithPayload: (payload: string) => Promise<DeviceInfo>;
}

export const PairModal: React.FC<PairModalProps> = ({
  isOpen,
  onClose,
  localDevice,
  onPairWithPayload,
}) => {
  const [copied, setCopied] = useState(false);
  const [pastePayload, setPastePayload] = useState('');
  const [isPairing, setIsPairing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pairingSuccess, setPairingSuccess] = useState<DeviceInfo | null>(null);

  if (!isOpen) return null;

  // In web mode, generate a clickable URL with pairing query params
  const hostIp =
    localDevice?.ip && localDevice.ip !== '127.0.0.1' && localDevice.ip !== 'localhost'
      ? localDevice.ip
      : window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
      ? window.location.hostname
      : '127.0.0.1';

  const webMobileUrl = `http://${hostIp}:${localDevice?.port || 1420}/?pair=${localDevice?.id || ''}&name=${encodeURIComponent(localDevice?.name || 'Desktop PC')}`;

  const qrPayloadString = isTauri()
    ? localDevice
      ? JSON.stringify({
          v: 1,
          id: localDevice.id,
          name: localDevice.name,
          os: localDevice.os,
          ip: localDevice.ip,
          port: localDevice.port,
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
          ip: localDevice.ip,
          port: localDevice.port,
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
      setErrorMsg(e?.toString() || 'Failed to pair with payload. Check LAN connectivity.');
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
                {isTauri() ? 'Encrypted peer session' : 'Connect phone camera over local Wi-Fi'}
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
          <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>Connected to {pairingSuccess.name} ({pairingSuccess.ip})</span>
          </div>
        )}

        {/* QR Code Presentation */}
        <div className="mt-4 flex flex-col items-center">
          <div className="p-3.5 bg-white rounded-xl shadow-inner">
            {qrPayloadString ? (
              <QRCodeSVG
                value={qrPayloadString}
                size={180}
                level="M"
                includeMargin={false}
              />
            ) : (
              <div className="w-[180px] h-[180px] bg-zinc-200 animate-pulse rounded" />
            )}
          </div>

          <div className="mt-3 text-center">
            {!isTauri() ? (
              <div className="flex flex-col items-center">
                <span className="font-mono text-xs px-2.5 py-1 rounded-md bg-[#1f1f1f] text-indigo-400 border border-[#272727] flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5" />
                  {webMobileUrl}
                </span>
                <p className="mt-2 text-xs text-zinc-300 font-medium max-w-[300px]">
                  Point your phone's camera at this QR code to open PulseDrop instantly in your mobile browser!
                </p>
              </div>
            ) : (
              <div>
                <span className="font-mono text-xs px-2.5 py-1 rounded-md bg-[#1f1f1f] text-zinc-300 border border-[#272727]">
                  {localDevice ? `${localDevice.ip}:${localDevice.port}` : '127.0.0.1'}
                </span>
                <p className="mt-2 text-xs text-zinc-400 max-w-[280px]">
                  Point your phone camera or desktop scanner at this code to drop files instantly
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
              <span>{copied ? 'Copied!' : isTauri() ? 'Copy Payload' : 'Copy Mobile Link'}</span>
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

        {/* Manual Pairing Fallback */}
        <div className="mt-5 pt-4 border-t border-[#272727]">
          <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
            Manual Pairing Payload or URL
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Paste URL or peer token..."
              value={pastePayload}
              onChange={(e) => setPastePayload(e.target.value)}
              className="flex-1 bg-[#1f1f1f] border border-[#272727] rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
            />
            <button
              onClick={handleManualPair}
              disabled={isPairing || !pastePayload.trim()}
              className="py-1.5 px-3.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] shrink-0"
            >
              {isPairing ? 'Pairing...' : 'Connect'}
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
