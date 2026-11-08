import React from 'react';
import { 
  Files, 
  ClipboardCopy, 
  Radio, 
  QrCode, 
  Laptop, 
  Smartphone, 
  CircleDot
} from 'lucide-react';
import { DeviceInfo } from '../types/pulse';

interface NavbarProps {
  currentTab: 'drop' | 'radar' | 'clipboard' | 'settings';
  setCurrentTab: (tab: 'drop' | 'radar' | 'clipboard' | 'settings') => void;
  localDevice: DeviceInfo | null;
  pairedCount: number;
  clipboardSyncEnabled: boolean;
  onToggleClipboardSync: (enabled: boolean) => void;
  onOpenPairModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  localDevice,
  pairedCount,
  clipboardSyncEnabled,
  onToggleClipboardSync,
  onOpenPairModal,
}) => {
  const isMobileOS = localDevice?.os === 'android' || localDevice?.os === 'ios';

  return (
    <>
      {/* Desktop Sidebar (md and up) */}
      <aside className="hidden md:flex flex-col w-64 h-full bg-[#181818] border-r border-[#272727] p-4 select-none shrink-0">
        {/* Brand Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#272727]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Radio className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-white block">PulseDrop</span>
              <span className="text-[11px] font-medium text-zinc-400">LAN Peer Mesh</span>
            </div>
          </div>
          <button
            onClick={onOpenPairModal}
            title="Show Pairing QR"
            className="p-2 rounded-lg bg-[#272727] hover:bg-[#313131] text-zinc-200 hover:text-white transition-colors active:scale-[0.98]"
          >
            <QrCode className="w-4 h-4" />
          </button>
        </div>

        {/* Local Device Identity Card */}
        <div className="mt-4 p-3 rounded-xl bg-[#1f1f1f] border border-[#272727]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Local Node</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              Online
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            {isMobileOS ? (
              <Smartphone className="w-4 h-4 text-indigo-400" />
            ) : (
              <Laptop className="w-4 h-4 text-indigo-400" />
            )}
            <span className="text-sm font-semibold text-zinc-100 truncate">
              {localDevice?.name || 'Local Machine'}
            </span>
          </div>
          <div className="mt-1 font-mono text-[11px] text-zinc-400 truncate">
            {localDevice ? `${localDevice.ip}:${localDevice.port}` : 'Detecting network...'}
          </div>
        </div>

        {/* Live Clipboard Toggle Quick Switch */}
        <div className="mt-4 p-3 rounded-xl bg-[#1f1f1f] border border-[#272727] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ClipboardCopy className="w-4 h-4 text-indigo-400" />
            <div>
              <div className="text-xs font-semibold text-zinc-200">Live Clipboard</div>
              <div className="text-[10px] text-zinc-400">Auto broadcast</div>
            </div>
          </div>
          <button
            onClick={() => onToggleClipboardSync(!clipboardSyncEnabled)}
            className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-300 ${
              clipboardSyncEnabled ? 'bg-indigo-600' : 'bg-[#272727]'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${
                clipboardSyncEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Navigation Tabs */}
        <nav className="mt-6 flex flex-col gap-1.5 flex-1">
          <button
            onClick={() => setCurrentTab('drop')}
            className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              currentTab === 'drop'
                ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#1f1f1f]'
            }`}
          >
            <div className="flex items-center gap-3">
              <Files className="w-4 h-4" />
              <span>Drop & Transfer</span>
            </div>
          </button>

          <button
            onClick={() => setCurrentTab('radar')}
            className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              currentTab === 'radar'
                ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#1f1f1f]'
            }`}
          >
            <div className="flex items-center gap-3">
              <Radio className="w-4 h-4" />
              <span>Nearby Radar</span>
            </div>
            {pairedCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-400">
                {pairedCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setCurrentTab('clipboard')}
            className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              currentTab === 'clipboard'
                ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#1f1f1f]'
            }`}
          >
            <div className="flex items-center gap-3">
              <ClipboardCopy className="w-4 h-4" />
              <span>Clipboard Feed</span>
            </div>
            {clipboardSyncEnabled && (
              <CircleDot className="w-3.5 h-3.5 text-emerald-400" />
            )}
          </button>
        </nav>

        {/* Footer info */}
        <div className="pt-3 border-t border-[#272727] flex items-center justify-between text-[11px] text-zinc-500">
          <span>Zero cloud transfer</span>
          <span className="font-mono">v0.1.0</span>
        </div>
      </aside>

      {/* Mobile Top Header (< md) */}
      <header className="flex md:hidden items-center justify-between px-4 py-3 bg-[#181818] border-b border-[#272727] select-none shrink-0 w-full z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-sm shadow-indigo-500/20">
            <Radio className="w-4 h-4 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white tracking-tight">PulseDrop</span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Online
              </span>
            </div>
            <div className="text-[10px] font-mono text-zinc-400 truncate max-w-[170px]">
              {localDevice?.name || 'Local'} • {localDevice?.ip || '127.0.0.1'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {pairedCount > 0 ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>{pairedCount} Paired</span>
            </div>
          ) : (
            <button
              onClick={onOpenPairModal}
              className="flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition-all active:scale-95"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Pair</span>
            </button>
          )}

          <button
            onClick={onOpenPairModal}
            title="Show Pairing QR"
            className="p-1.5 rounded-lg bg-[#272727] text-zinc-300 hover:text-white"
          >
            <QrCode className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar (< md) */}
      <nav className="flex md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#181818]/95 backdrop-blur-md border-t border-[#272727] items-center justify-around px-3 z-40 select-none">
        <button
          onClick={() => setCurrentTab('drop')}
          className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all ${
            currentTab === 'drop'
              ? 'text-indigo-400 font-semibold'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <div className={`p-1 rounded-lg ${currentTab === 'drop' ? 'bg-indigo-500/15' : ''}`}>
            <Files className="w-5 h-5" />
          </div>
          <span className="text-[10px] mt-0.5">Drop</span>
        </button>

        <button
          onClick={() => setCurrentTab('radar')}
          className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all relative ${
            currentTab === 'radar'
              ? 'text-indigo-400 font-semibold'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <div className={`p-1 rounded-lg relative ${currentTab === 'radar' ? 'bg-indigo-500/15' : ''}`}>
            <Radio className="w-5 h-5" />
            {pairedCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400" />
            )}
          </div>
          <span className="text-[10px] mt-0.5">Radar</span>
        </button>

        <button
          onClick={() => setCurrentTab('clipboard')}
          className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all ${
            currentTab === 'clipboard'
              ? 'text-indigo-400 font-semibold'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <div className={`p-1 rounded-lg ${currentTab === 'clipboard' ? 'bg-indigo-500/15' : ''}`}>
            <ClipboardCopy className="w-5 h-5" />
          </div>
          <span className="text-[10px] mt-0.5">Clipboard</span>
        </button>
      </nav>
    </>
  );
};
