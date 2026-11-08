import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  FileCheck2, 
  FolderOpen, 
  Download,
  Laptop,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Image,
  FileText,
  Plus,
  ArrowDownToLine,
  ArrowUpToLine,
  Zap
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
  const mediaInputRef = useRef<HTMLInputElement | null>(null);

  // Keep selectedPeerId updated if peers list changes
  React.useEffect(() => {
    if (!selectedPeerId && pairedPeers.length > 0) {
      setSelectedPeerId(pairedPeers[0].id);
    } else if (selectedPeerId && !pairedPeers.some((p) => p.id === selectedPeerId)) {
      setSelectedPeerId(pairedPeers[0]?.id || '');
    }
  }, [pairedPeers, selectedPeerId]);

  const activePeer = pairedPeers.find((p) => p.id === selectedPeerId) || pairedPeers[0];

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatSpeed = (bps?: number) => {
    if (!bps || bps <= 0) return '';
    if (bps >= 1024 * 1024 * 1024) {
      return `${(bps / (1024 * 1024 * 1024)).toFixed(1)} GB/s`;
    }
    if (bps >= 1024 * 1024) {
      return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
    }
    if (bps >= 1024) {
      return `${(bps / 1024).toFixed(0)} KB/s`;
    }
    return `${bps} B/s`;
  };

  const formatETA = (transferred: number, total: number, bps?: number) => {
    if (!bps || bps <= 0 || transferred >= total) return '';
    const remainingBytes = total - transferred;
    const seconds = Math.ceil(remainingBytes / bps);
    if (seconds < 60) return `${seconds}s left`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s left`;
  };

  const handleSelectFiles = async (mode: 'all' | 'media' = 'all') => {
    if (pairedPeers.length === 0) {
      onOpenPairModal();
      return;
    }

    const targetPeerId = selectedPeerId || pairedPeers[0]?.id;
    if (!targetPeerId) {
      onOpenPairModal();
      return;
    }

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
      if (mode === 'media') {
        mediaInputRef.current?.click();
      } else {
        fileInputRef.current?.click();
      }
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

  const transferList = Object.values(activeTransfers);
  const hasTransfers = transferList.length > 0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-3 sm:p-5 md:p-8 select-none max-w-4xl mx-auto w-full">
      {/* Hidden browser file inputs for web mode */}
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
      <input
        type="file"
        ref={mediaInputRef}
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleWebFilesSelected(Array.from(e.target.files));
            e.target.value = '';
          }
        }}
      />

      {/* Connection & Target Peer Header Card */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-[#181818] border border-[#272727] shadow-sm mb-4">
        {pairedPeers.length > 0 && activePeer ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                {activePeer.os.toLowerCase().includes('android') || activePeer.os.toLowerCase().includes('ios') ? (
                  <Smartphone className="w-5 h-5" />
                ) : (
                  <Laptop className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-100 truncate">
                    {activePeer.name}
                  </span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Connected
                  </span>
                </div>
                <div className="text-xs text-zinc-400 font-mono truncate">
                  {activePeer.ip ? `${activePeer.ip} • Ready to receive` : 'Local Wi-Fi Peer'}
                </div>
              </div>
            </div>

            {pairedPeers.length > 1 ? (
              <div className="flex items-center gap-2 bg-[#222222] border border-[#2d2d2d] px-3 py-1.5 rounded-xl self-start sm:self-auto">
                <span className="text-xs text-zinc-400">Target:</span>
                <select
                  value={selectedPeerId}
                  onChange={(e) => setSelectedPeerId(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-zinc-200 focus:outline-none cursor-pointer"
                >
                  {pairedPeers.map((p) => (
                    <option key={p.id} value={p.id} className="bg-[#181818] text-zinc-100">
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <button
                onClick={onOpenPairModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#222222] hover:bg-[#2a2a2a] text-zinc-300 text-xs font-medium border border-[#2d2d2d] self-start sm:self-auto active:scale-95 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Pair Another</span>
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="text-sm font-semibold text-zinc-200">No Device Paired</div>
                <div className="text-xs text-zinc-400">Scan QR to connect your phone or PC</div>
              </div>
            </div>

            <button
              onClick={onOpenPairModal}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 active:scale-95 transition-all shrink-0"
            >
              Connect Device
            </button>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-zinc-400 hover:text-white">✕</button>
        </div>
      )}

      {/* LIVE FILE TRANSFER PROGRESS BAR (User requested) */}
      {hasTransfers && (
        <div className="mb-4 p-4 rounded-2xl bg-gradient-to-b from-[#1c1c1c] to-[#161616] border border-[#2a2a2a] shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                Live File Transfer
              </span>
            </div>
            <span className="text-xs font-mono text-indigo-400 font-semibold">
              {transferList.length} Active
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {transferList.map((transfer) => {
              const percent =
                transfer.total_bytes > 0
                  ? Math.min(100, Math.round((transfer.bytes_transferred / transfer.total_bytes) * 100))
                  : 0;

              const isCompleted = transfer.status === 'completed';
              const isFailed = transfer.status === 'failed';
              const isIncoming = transfer.direction === 'incoming';

              return (
                <div
                  key={transfer.transfer_id}
                  className="p-3.5 rounded-xl bg-[#202020] border border-[#2a2a2a] flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 truncate min-w-0">
                      <div className={`p-1.5 rounded-lg shrink-0 ${
                        isCompleted 
                          ? 'bg-emerald-500/10 text-emerald-400' 
                          : isIncoming
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-indigo-500/10 text-indigo-400'
                      }`}>
                        {isCompleted ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : isIncoming ? (
                          <ArrowDownToLine className="w-4 h-4 animate-bounce" />
                        ) : (
                          <ArrowUpToLine className="w-4 h-4" />
                        )}
                      </div>
                      <div className="truncate min-w-0">
                        <span className="text-xs font-semibold text-zinc-100 truncate block">
                          {transfer.file_name}
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          {isIncoming 
                            ? `Incoming from ${transfer.sender_name || 'Connected Peer'}` 
                            : `Sending to ${activePeer?.name || 'Connected Peer'}`}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {transfer.speed_bps && transfer.speed_bps > 0 && !isCompleted && (
                        <span className="flex items-center gap-1 text-[11px] font-mono font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                          <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
                          {formatSpeed(transfer.speed_bps)}
                        </span>
                      )}
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        isIncoming 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                      }`}>
                        {isIncoming ? '📥 Receiving' : '📤 Sending'}
                      </span>
                      <span className="text-xs font-mono font-bold text-white bg-[#141414] px-2 py-0.5 rounded-md border border-[#2d2d2d]">
                        {percent}%
                      </span>
                    </div>
                  </div>

                  {/* Animated glowing progress bar */}
                  <div className="w-full h-2.5 rounded-full bg-[#121212] overflow-hidden p-0.5 border border-[#272727]">
                    <div
                      className={`h-full rounded-full transition-all duration-200 ${
                        isCompleted
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-sm shadow-emerald-500/50'
                          : isFailed
                          ? 'bg-rose-500'
                          : isIncoming
                          ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 animate-pulse'
                          : 'bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-400 animate-pulse'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                    <div className="flex items-center gap-2">
                      <span>
                        {formatBytes(transfer.bytes_transferred)} / {formatBytes(transfer.total_bytes)}
                      </span>
                      {transfer.speed_bps && transfer.speed_bps > 0 && !isCompleted && (
                        <span className="text-amber-400 font-medium">
                          • {formatETA(transfer.bytes_transferred, transfer.total_bytes, transfer.speed_bps)}
                        </span>
                      )}
                    </div>
                    <span className="flex items-center gap-1 font-sans font-medium">
                      {isCompleted ? (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {isIncoming ? 'Downloaded & Saved' : 'Transfer Complete'}
                        </span>
                      ) : isFailed ? (
                        <span className="text-rose-400 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" /> Transfer Failed
                        </span>
                      ) : (
                        <span className={isIncoming ? "text-emerald-400 flex items-center gap-1" : "text-indigo-400 flex items-center gap-1"}>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          {isIncoming ? 'Receiving via LAN...' : 'Sending via LAN...'}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Drop & Action Area */}
      <div className="flex-1 flex flex-col justify-center mb-6">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => handleSelectFiles('all')}
          className={`relative flex flex-col items-center justify-center p-6 sm:p-8 rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer ${
            isDragging
              ? 'border-indigo-500 bg-indigo-500/10 scale-[1.01]'
              : 'border-[#272727] bg-[#181818]/60 hover:bg-[#181818] hover:border-[#353535]'
          }`}
        >
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center shadow-inner mb-3 transition-transform hover:scale-105">
            <UploadCloud className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>

          <h3 className="text-base sm:text-lg font-bold text-zinc-100 text-center">
            {isDragging ? 'Release to Send Files' : 'Drop Files Here or Tap to Browse'}
          </h3>
          <p className="mt-1 text-xs text-zinc-400 text-center max-w-xs">
            {pairedPeers.length > 0
              ? `Streams directly to ${activePeer?.name || 'paired peer'} at full LAN speed • No file size limits`
              : 'Connect your phone or PC to start transferring files'}
          </p>

          {/* Quick Selection Buttons on Mobile */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSelectFiles('all');
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md active:scale-95 transition-all"
            >
              <FileText className="w-4 h-4" />
              <span>Browse Files</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSelectFiles('media');
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#272727] hover:bg-[#323232] text-zinc-200 active:scale-95 transition-all"
            >
              <Image className="w-4 h-4 text-emerald-400" />
              <span>Photos & Videos</span>
            </button>
          </div>
        </div>
      </div>

      {/* Received Files History */}
      {receivedFiles.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Received Files ({receivedFiles.length})
            </h2>
          </div>

          <div className="flex flex-col gap-2">
            {receivedFiles.map((item) => (
              <div
                key={item.transfer_id}
                className="p-3 rounded-xl bg-[#181818] border border-[#272727] flex items-center justify-between hover:border-[#353535] transition-all"
              >
                <div className="flex items-center gap-3 truncate pr-2 min-w-0">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
                    <FileCheck2 className="w-4 h-4" />
                  </div>
                  <div className="truncate min-w-0">
                    <div className="text-xs sm:text-sm font-semibold text-zinc-100 truncate">
                      {item.file_name}
                    </div>
                    <div className="text-[11px] font-mono text-zinc-400">
                      {formatBytes(item.bytes)} {item.sender_name ? `• From ${item.sender_name}` : ''}
                    </div>
                  </div>
                </div>

                {item.download_url ? (
                  <a
                    href={item.download_url}
                    download={item.file_name}
                    className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all active:scale-95 shrink-0 shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </a>
                ) : (
                  <button
                    onClick={() => handleOpenFolder(item.path)}
                    className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-medium bg-[#272727] hover:bg-[#323232] text-zinc-300 hover:text-white transition-colors active:scale-95 shrink-0"
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
