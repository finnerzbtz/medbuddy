import { STORAGE_KEY } from '@/domain/storage';
export interface CloudBinding {
  ownerId: string;
  email: string;
  revision: number;
  hash: string;
  syncedAt: string | null;
}
export function readBinding(raw = localStorage.getItem(STORAGE_KEY)): CloudBinding | null {
  let value;
  try {
    value = raw ? JSON.parse(raw)._cloud : null;
  } catch {
    return null;
  }
  if (value == null) return null;
  if (
    typeof value.ownerId !== 'string' ||
    !/^[a-f0-9-]{36}$/i.test(value.ownerId) ||
    typeof value.email !== 'string' ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    typeof value.hash !== 'string'
  )
    throw new Error('Your account data could not be opened. Export a backup before trying again.');
  return value;
}
// Rendering recovery controls must not throw on damaged metadata. Writes still
// use strict readBinding, so a damaged binding can never trigger an upload.
export function displayBinding(): CloudBinding | null {
  try {
    return readBinding();
  } catch {
    return null;
  }
}
export function serializeLocal(data: unknown, binding: CloudBinding | null): string {
  return JSON.stringify({ ...(data as object), ...(binding ? { _cloud: binding } : {}) });
}
export async function hashCloudData(data: import('@/types').AppData): Promise<string> {
  const { cloudFingerprint } = await import('./payload');
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(cloudFingerprint(data)),
  );
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
