export interface NetworkInterfaceInfo {
  name: string;
  ip: string;
  type: 'wifi' | 'ethernet' | 'other';
  url: string;
}

export interface DeviceInfo {
  id: string;
  name: string;
  os: string;
  ip: string;
  port: number;
  token: string;
}

export interface TransferProgress {
  transfer_id: string;
  file_name: string;
  bytes_transferred: number;
  total_bytes: number;
  status: 'transferring' | 'completed' | 'failed';
}

export interface ClipboardItem {
  id: string;
  text: string;
  direction: 'sent' | 'received';
  peerName?: string;
  timestamp: number;
  hash?: string;
}

export interface ReceivedFile {
  transfer_id: string;
  file_name: string;
  path: string;
  bytes: number;
  receivedAt: number;
  download_url?: string;
  sender_name?: string;
}
