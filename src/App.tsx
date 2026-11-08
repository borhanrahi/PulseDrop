import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { PairModal } from './components/PairModal';
import { PeerRadar } from './components/PeerRadar';
import { FileDropZone } from './components/FileDropZone';
import { ClipboardFeed } from './components/ClipboardFeed';
import { usePulseEvents } from './hooks/usePulseEvents';

export function App() {
  const [currentTab, setCurrentTab] = useState<'drop' | 'radar' | 'clipboard' | 'settings'>('drop');
  const [isPairModalOpen, setIsPairModalOpen] = useState(false);

  const {
    localDevice,
    pairedPeers,
    nearbyPeers,
    clipboardFeed,
    activeTransfers,
    receivedFiles,
    clipboardSyncEnabled,
    toggleSync,
    disconnectPeer,
    pairWithQr,
    pairWithNearby,
    sendClipboardText,
    sendFiles,
  } = usePulseEvents();

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
      {/* Navigation (Sidebar on Desktop, Header + Bottom bar on Mobile) */}
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        localDevice={localDevice}
        pairedCount={pairedPeers.length}
        clipboardSyncEnabled={clipboardSyncEnabled}
        onToggleClipboardSync={toggleSync}
        onOpenPairModal={() => setIsPairModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden pb-16 md:pb-0 relative min-w-0 w-full">
        {currentTab === 'drop' && (
          <FileDropZone
            pairedPeers={pairedPeers}
            activeTransfers={activeTransfers}
            receivedFiles={receivedFiles}
            onOpenPairModal={() => setIsPairModalOpen(true)}
            onSendFiles={sendFiles}
          />
        )}

        {currentTab === 'radar' && (
          <PeerRadar
            pairedPeers={pairedPeers}
            nearbyPeers={nearbyPeers}
            localDevice={localDevice}
            onDisconnect={disconnectPeer}
            onPairNearby={pairWithNearby}
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

      {/* Pairing Modal */}
      <PairModal
        isOpen={isPairModalOpen}
        onClose={() => setIsPairModalOpen(false)}
        localDevice={localDevice}
        onPairWithPayload={pairWithQr}
      />
    </div>
  );
}

export default App;
