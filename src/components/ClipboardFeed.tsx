import React, { useState } from 'react';
import { 
  ClipboardCopy, 
  Copy, 
  Check, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Send 
} from 'lucide-react';
import { ClipboardItem } from '../types/pulse';
import { isTauri } from '../hooks/usePulseEvents';

interface ClipboardFeedProps {
  feed: ClipboardItem[];
  clipboardSyncEnabled: boolean;
  onToggleSync: (enabled: boolean) => void;
  pairedCount: number;
  onSendClipboardText?: (text: string) => Promise<void>;
}

export const ClipboardFeed: React.FC<ClipboardFeedProps> = ({
  feed,
  clipboardSyncEnabled,
  onToggleSync,
  pairedCount,
  onSendClipboardText,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [customText, setCustomText] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  const handleCopySnippet = async (item: ClipboardItem) => {
    if (isTauri()) {
      try {
        const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
        await writeText(item.text);
      } catch {
        navigator.clipboard.writeText(item.text);
      }
    } else {
      navigator.clipboard.writeText(item.text);
    }

    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleSendCustomText = async () => {
    if (!customText.trim()) return;
    setIsBroadcasting(true);
    try {
      if (onSendClipboardText) {
        await onSendClipboardText(customText.trim());
      } else if (isTauri()) {
        const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
        await writeText(customText.trim());
      }
      setCustomText('');
    } catch (e) {
      console.error('Failed to broadcast custom text:', e);
    } finally {
      setIsBroadcasting(false);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const diff = Math.floor(Date.now() / 1000) - timestamp;
    if (diff < 10) return 'Just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return new Date(timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-3.5 sm:p-5 md:p-8 select-none max-w-4xl mx-auto w-full">
      {/* Header section with gradient per ai-design-skills */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#272727]">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight bg-gradient-to-r from-white to-[#9B9B9B] bg-clip-text text-transparent">
            Clipboard Feed
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Bidirectional live clipboard sync with SHA-256 loop prevention
          </p>
        </div>

        {/* Global Live Toggle Switch */}
        <div className="flex items-center gap-3 bg-[#181818] border border-[#272727] p-2 rounded-xl self-start sm:self-auto">
          <div className="flex items-center gap-2 pl-2">
            <span className={`w-2 h-2 rounded-full ${clipboardSyncEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
            <span className="text-xs font-semibold text-zinc-200">
              {clipboardSyncEnabled ? 'Live Sync Active' : 'Sync Paused'}
            </span>
          </div>

          <button
            onClick={() => onToggleSync(!clipboardSyncEnabled)}
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
      </div>

      {/* Quick Test / Manual Broadcast Bar */}
      <div className="mt-6 p-3.5 rounded-2xl bg-[#181818] border border-[#272727]">
        <label className="block text-xs font-semibold text-zinc-300 mb-2">
          Quick Broadcast to Paired Devices
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Type or paste any link, text, or token to broadcast..."
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendCustomText()}
            className="flex-1 bg-[#1f1f1f] border border-[#272727] rounded-xl px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <button
            onClick={handleSendCustomText}
            disabled={isBroadcasting || !customText.trim() || pairedCount === 0}
            className="flex items-center gap-1.5 py-2 px-4 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98] shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Broadcast</span>
          </button>
        </div>
        {pairedCount === 0 && (
          <p className="mt-2 text-[11px] text-zinc-500">
            Pair at least one device in Nearby Radar or QR code to broadcast snippets.
          </p>
        )}
      </div>

      {/* Snippets Feed */}
      <div className="mt-8 flex-1">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
            Recent Snippets ({feed.length})
          </h2>
          <span className="text-xs text-zinc-500">Automatic loop prevention active</span>
        </div>

        {feed.length === 0 ? (
          <div className="p-10 rounded-2xl bg-[#181818] border border-[#272727] text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#1f1f1f] border border-[#272727] text-zinc-500 flex items-center justify-center mx-auto mb-3">
              <ClipboardCopy className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-medium text-zinc-300">No clipboard events recorded yet</h3>
            <p className="mt-1 text-xs text-zinc-500 max-w-sm mx-auto">
              Whenever you press Ctrl+C or copy text on this machine or a paired phone, it will seamlessly appear here and sync to your other devices.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {feed.map((item) => {
              const isSent = item.direction === 'sent';

              return (
                <div
                  key={item.id}
                  className="p-4 rounded-xl bg-[#181818] border border-[#272727] hover:border-[#313131] transition-all flex flex-col gap-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                          isSent
                            ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}
                      >
                        {isSent ? (
                          <ArrowUpRight className="w-3 h-3" />
                        ) : (
                          <ArrowDownLeft className="w-3 h-3" />
                        )}
                        <span>{isSent ? 'Sent to peers' : `Received from ${item.peerName || 'Peer'}`}</span>
                      </span>

                      <span className="text-[11px] font-mono text-zinc-500">
                        {formatTimestamp(item.timestamp)}
                      </span>
                    </div>

                    <button
                      onClick={() => handleCopySnippet(item)}
                      title="Copy to clipboard"
                      className="flex items-center gap-1.5 py-1 px-2.5 rounded-lg text-xs font-medium bg-[#1f1f1f] hover:bg-[#272727] text-zinc-300 hover:text-white transition-colors active:scale-[0.98]"
                    >
                      {copiedId === item.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Content Preview */}
                  <div className="bg-[#121212] p-3 rounded-lg border border-[#272727]/60 text-xs text-zinc-200 font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                    {item.text}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
