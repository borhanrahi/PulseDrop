import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  FileCheck2, 
  File, 
  FolderOpen, 
  Download
} from 'lucide-react';
import { DeviceInfo, TransferProgress, ReceivedFile } from '../types/pulse';
import { isTauri } from '../hooks/usePulseEvents';

interface FileDropZoneProps {
  pairedPeers: DeviceInfo[];
  activeTransfers: Record<string, TransferProgress>;
  receivedFiles: ReceivedFile[];
  onOpenPairModal: () => void;
  onSendFiles?: (targetPeerId: string, files: File[]) => Promise<void>;
}

export const FileDropZone: React.FC<FileDropZoneProps> = ({
  pairedPeers,
  activeTransfers,
  receivedFiles,
  onOpenPairModal,
  onSendFiles,
}) => {
  const [selectedPeerId, setSelectedPeerId] = useState<string>(
    pairedPeers[0]?.id || ''
  );
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Keep selectedPeerId updated if peers list changes
  React.useEffect(() => {
    if (!selectedPeerId && pairedPeers.length > 0) {
      setSelectedPeerId(pairedPeers[0].id);
    } else if (selectedPeerId && !pairedPeers.some((p) => p.id === selectedPeerId)) {
      setSelectedPeerId(pairedPeers[0]?.id || '');
    }
  }, [pairedPeers, selectedPeerId]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleSelectFiles = async () => {
    if (pairedPeers.length === 0) {
      onOpenPairModal();
      return;
    }

    const targetPeerId = selectedPeerId || pairedPeers[0]?.id;
    if (!targetPeerId) return;

    if (isTauri()) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const selected = await open({
          multiple: true,
          directory: false,
        });

        if (selected) {
          const filePaths = Array.isArray(selected) ? selected : [selected];
          await triggerTauriSend(targetPeerId, filePaths);
        }
      } catch (e: any) {
        setErrorMsg('Failed to open file picker: ' + e?.message);
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const triggerTauriSend = async (peerId: string, paths: string[]) => {
    setErrorMsg(null);
    try {
      const { invoke, Channel } = await import('@tauri-apps/api/core');
      const channel = new Channel<TransferProgress>();

      channel.onmessage = () => {
        // Handled automatically via global listener or channel
      };

      await invoke('send_files', {
        peerId,
        filePaths: paths,
        onProgress: channel,
      });
    } catch (err: any) {
      setErrorMsg(err?.toString() || 'Failed to send file');
    }
  };

  const handleWebFilesSelected = async (files: File[]) => {
    if (!files || files.length === 0) return;
    const targetPeerId = selectedPeerId || pairedPeers[0]?.id;
    if (!targetPeerId) {
      onOpenPairModal();
      return;
    }

    try {
      if (onSendFiles) {
        await onSendFiles(targetPeerId, files);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to transfer files');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (pairedPeers.length === 0) {
      onOpenPairModal();
      return;
    }

    const targetPeerId = selectedPeerId || pairedPeers[0]?.id;
    if (!targetPeerId) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    if (isTauri()) {
      const paths = files.map((f: any) => f.path || f.name).filter(Boolean);
      if (paths.length > 0) {
        await triggerTauriSend(targetPeerId, paths);
      }
    } else {
      await handleWebFilesSelected(files);
    }
  };

  const handleOpenFolder = async (path: string) => {
    if (isTauri()) {
      try {
        const { openPath } = await import('@tauri-apps/plugin-opener');
        await openPath(path);
      } catch (err) {
        console.error('Failed to open file path:', err);
      }
    }
  };

  const hasTransfers = Object.keys(activeTransfers).length > 0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-4 md:p-8 select-none max-w-5xl mx-auto w-full">
      {/* Hidden browser file input for web mode */}
      <input
        type="file"
        ref={fileInputRef}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleWebFilesSelected(Array.from(e.target.files));
            e.target.value = '';
          }
        }}
      />

      {/* Target Peer Selector Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#272727]">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight bg-gradient-to-r from-white to-[#9B9B9B] bg-clip-text text-transparent">
            File Drop
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Transfer photos, videos, and documents directly over local Wi-Fi
          </p>
        </div>

        {/* Peer Selection Menu */}
        <div className="flex items-center gap-3">
          {pairedPeers.length > 0 ? (
            <div className="flex items-center gap-2 bg-[#181818] border border-[#272727] px-3 py-2 rounded-xl">
              <span className="text-xs text-zinc-400">Send to:</span>
              <select
                value={selectedPeerId}
                onChange={(e) => setSelectedPeerId(e.target.value)}
                className="bg-transparent text-sm font-semibold text-zinc-100 focus:outline-none cursor-pointer"
              >
                {pairedPeers.map((p) => (
                  <option key={p.id} value={p.id} className="bg-[#181818] text-zinc-100">
                    {p.name} ({p.os})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <button
              onClick={onOpenPairModal}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all active:scale-[0.98] shadow-md shadow-indigo-600/20"
            >
              Pair Device First
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
          {errorMsg}
        </div>
      )}

      {/* Drop Zone Area */}
      <div className="mt-6 flex-1 flex flex-col justify-center min-h-[260px]">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleSelectFiles}
          className={`relative flex-1 flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer ${
            isDragging
              ? 'border-indigo-500 bg-indigo-500/5 scale-[1.008]'
              : 'border-[#272727] bg-[#181818]/50 hover:bg-[#181818] hover:border-[#333333]'
          }`}
        >
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center shadow-inner mb-4 transition-transform group-hover:scale-110">
            <UploadCloud className="w-8 h-8" />
          </div>

          <h3 className="text-base md:text-lg font-semibold text-zinc-100 text-center">
            {isDragging ? 'Drop files right here' : 'Drop files here or click to browse'}
          </h3>
          <p className="mt-1 text-xs text-zinc-400 text-center max-w-sm">
            {pairedPeers.length > 0
              ? `Files will stream directly to ${pairedPeers.find((p) => p.id === selectedPeerId)?.name || 'target'}`
              : 'Pair with your mobile phone or PC to begin transfers'}
          </p>

          <div className="mt-5 flex items-center gap-2">
            <span className="text-[11px] font-mono px-2.5 py-1 rounded-md bg-[#222222] text-zinc-400 border border-[#2d2d2d]">
              High-Speed Local Transfer
            </span>
            <span className="text-[11px] font-mono px-2.5 py-1 rounded-md bg-[#222222] text-zinc-400 border border-[#2d2d2d]">
              No File Size Limits
            </span>
          </div>
        </div>
      </div>

      {/* Active Transfer Progress Bars */}
      {hasTransfers && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-3">
            Active Transfers
          </h2>
          <div className="flex flex-col gap-3">
            {Object.values(activeTransfers).map((transfer) => {
              const percent =
                transfer.total_bytes > 0
                  ? Math.min(100, Math.round((transfer.bytes_transferred / transfer.total_bytes) * 100))
                  : 0;

              return (
                <div
                  key={transfer.transfer_id}
                  className="p-4 rounded-xl bg-[#181818] border border-[#272727] shadow-sm"
                >
                  <div className="flex items-center justify-between text-xs mb-2">
                    <div className="flex items-center gap-2 truncate pr-4">
                      <File className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span className="font-medium text-zinc-200 truncate">
                        {transfer.file_name}
                      </span>
                    </div>
                    <span className="font-mono text-zinc-400 shrink-0 font-medium">
                      {percent}%
                    </span>
                  </div>

                  <div className="w-full h-1.5 rounded-full bg-[#272727] overflow-hidden">
                    <div
                      className={`h-full transition-all duration-200 ${
                        transfer.status === 'completed'
                          ? 'bg-emerald-500'
                          : transfer.status === 'failed'
                          ? 'bg-rose-500'
                          : 'bg-indigo-500'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-zinc-500">
                    <span>{formatBytes(transfer.bytes_transferred)} of {formatBytes(transfer.total_bytes)}</span>
                    <span className="capitalize">{transfer.status}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Received Files History */}
      {receivedFiles.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-3">
            Recently Received
          </h2>
          <div className="flex flex-col gap-2.5">
            {receivedFiles.map((item) => (
              <div
                key={item.transfer_id}
                className="p-3.5 rounded-xl bg-[#181818] border border-[#272727] flex items-center justify-between hover:border-[#313131] transition-all"
              >
                <div className="flex items-center gap-3 truncate pr-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
                    <FileCheck2 className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <div className="text-sm font-semibold text-zinc-200 truncate">
                      {item.file_name}
                    </div>
                    <div className="text-[11px] font-mono text-zinc-500">
                      {formatBytes(item.bytes)} • {item.sender_name ? `From ${item.sender_name}` : 'Ready to save'}
                    </div>
                  </div>
                </div>

                {item.download_url ? (
                  <a
                    href={item.download_url}
                    download={item.file_name}
                    className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all active:scale-[0.98] shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </a>
                ) : (
                  <button
                    onClick={() => handleOpenFolder(item.path)}
                    className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-medium bg-[#272727] hover:bg-[#313131] text-zinc-300 hover:text-white transition-colors active:scale-[0.98] shrink-0"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Open</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
