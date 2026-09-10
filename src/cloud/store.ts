import { create } from 'zustand';
import type { AppData } from '@/types';
import type { CloudUser } from './auth';
export interface CloudSnapshot {
  revision: number;
  data: AppData | null;
  updatedAt: string | null;
  status?: 'saved' | 'conflict';
}
export type CloudStatus =
  | 'local'
  | 'checking'
  | 'choose'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'signin'
  | 'conflict'
  | 'error';
interface CloudState {
  status: CloudStatus;
  user: CloudUser | null;
  message: string;
  remote: CloudSnapshot | null;
  lastSyncedAt: string | null;
}
export const useCloudStore = create<CloudState>(() => ({
  status: 'local',
  user: null,
  message: '',
  remote: null,
  lastSyncedAt: null,
}));
