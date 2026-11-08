import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { PairModal } from './components/PairModal';
import { PeerRadar } from './components/PeerRadar';
import { FileDropZone } from './components/FileDropZone';
import { ClipboardFeed } from './components/ClipboardFeed';
import { usePulseEvents, isTauri } from './hooks/usePulseEvents';

export function App() {
  const [currentTab, setCurrentTab] = useState<'drop' | 'radar' | 'clipboard' | 'settings'>('drop');
  const [isPairModalOpen, setIsPairModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const {
    localDevice,
    pairedPeers,
    nearbyPeers,
    clipboardFeed,
    activeTransfers,
    receivedFiles,
    clipboardSyncEnabled,
    networkInterfaces,
    lastPairedPeer,
    lastPairedPeerTimestamp,
    toggleSync,
    disconnectPeer,
    pairWithQr,
    pairWithNearby,
    pairWithIpAddress,
    sendClipboardText,
    sendFiles,
  } = usePulseEvents();

  // Direct 1-tap QR Scanner
  const handleDirectScan = async () => {
    if (isTauri()) {
      try {
        const { checkPermissions, requestPermissions, scan, Format } = await import('@tauri-apps/plugin-barcode-scanner');
        let perm = await checkPermissions();
        if (perm !== 'granted') {
          perm = await requestPermissions();
        }
        if (perm !== 'granted') {
          setToastMessage('Camera permission required to scan QR code');
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
            // ignore haptic error if not supported
          }

          setToastMessage('Connecting to device...');
          const peer = await pairWithQr(result.content);
          setToastMessage(`Successfully connected with ${peer.name}!`);
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (!msg.toLowerCase().includes('cancel')) {
          setToastMessage(`Scan: ${msg}`);
        }
      }
    } else {
      setIsPairModalOpen(true);
    }
  };

  // Show a notification banner when a device is paired
  useEffect(() => {
    if (lastPairedPeer && lastPairedPeerTimestamp) {
      setToastMessage(`Successfully connected with ${lastPairedPeer.name}!`);
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [lastPairedPeer, lastPairedPeerTimestamp]);

  // Keyboard shortcut: Ctrl+K or Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsPairModalOpen((prev) => !prev);
      } else if (e.key === 'Escape' && isPairModalOpen) {
        setIsPairModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPairModalOpen]);

  return (
    <div className="flex flex-col md:flex-row h-screen h-[100dvh] w-screen bg-[#121212] text-zinc-100 overflow-hidden font-sans">
      {/* Navigation (Sidebar on Desktop, Header + Bottom bar on Mobile with notch safe-area) */}
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        localDevice={localDevice}
        pairedCount={pairedPeers.length}
        clipboardSyncEnabled={clipboardSyncEnabled}
        onToggleClipboardSync={toggleSync}
        onOpenPairModal={() => setIsPairModalOpen(true)}
        onDirectScan={handleDirectScan}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden pb-[calc(4.5rem+max(env(safe-area-inset-bottom,0px),12px))] md:pb-0 relative min-w-0 w-full">
        {currentTab === 'drop' && (
          <FileDropZone
            pairedPeers={pairedPeers}
            activeTransfers={activeTransfers}
            receivedFiles={receivedFiles}
            onOpenPairModal={() => setIsPairModalOpen(true)}
            onDirectScan={handleDirectScan}
            onSendFiles={sendFiles}
          />
        )}

        {currentTab === 'radar' && (
          <PeerRadar
            pairedPeers={pairedPeers}
            nearbyPeers={nearbyPeers}
            localDevice={localDevice}
            networkInterfaces={networkInterfaces}
            onDisconnect={disconnectPeer}
            onPairNearby={pairWithNearby}
            onPairWithIpAddress={pairWithIpAddress}
            onOpenPairModal={() => setIsPairModalOpen(true)}
          />
        )}

        {currentTab === 'clipboard' && (
          <ClipboardFeed
            feed={clipboardFeed}
            clipboardSyncEnabled={clipboardSyncEnabled}
            onToggleSync={toggleSync}
            pairedCount={pairedPeers.length}
            onSendClipboardText={sendClipboardText}
          />
        )}
      </main>

      {/* Floating Global Connection Toast Banner with notch safe-area offset */}
      {toastMessage && (
        <div className="fixed top-[max(calc(env(safe-area-inset-top,0px)+12px),16px)] left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-emerald-950/95 border border-emerald-500/40 text-emerald-200 text-xs sm:text-sm font-semibold shadow-2xl backdrop-blur-md animate-in slide-in-from-top-3 duration-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Pairing Modal */}
      <PairModal
        isOpen={isPairModalOpen}
        onClose={() => setIsPairModalOpen(false)}
        localDevice={localDevice}
        networkInterfaces={networkInterfaces}
        onPairWithPayload={pairWithQr}
        onPairWithIpAddress={pairWithIpAddress}
        lastPairedPeer={lastPairedPeer}
        lastPairedPeerTimestamp={lastPairedPeerTimestamp}
      />
    </div>
  );
}

export default App;
