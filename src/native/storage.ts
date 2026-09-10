import { Preferences } from '@capacitor/preferences';
import { parseData, saveLocalData, MIGRATION_BACKUP_KEY, STORAGE_KEY } from '@/domain/storage';
import { isNative } from './platform';

// Keep a durable native copy outside WKWebView's potentially purgeable storage.
// Hydrate before importing the store, so the welcome screen never replaces saved data.
export async function hydrateNativeStorage() {
  if (!isNative) return;
  const { value } = await Preferences.get({ key: STORAGE_KEY });
  const local = localStorage.getItem(STORAGE_KEY);
  if (value) {
    const saved = parseData(JSON.parse(value));
    const browser = local ? parseData(JSON.parse(local)) : null;
    if (local && browser) {
      const nativeVersion = JSON.parse(value).schemaVersion;
      const browserVersion = JSON.parse(local).schemaVersion;
      if (
        (nativeVersion < browserVersion && saved.updatedAt > browser.updatedAt) ||
        (browserVersion < nativeVersion && browser.updatedAt > saved.updatedAt)
      )
        throw new Error('Two different saved versions need recovery. Both copies have been kept.');
      if (nativeVersion < browserVersion) {
        await saveNative(local);
        return;
      }
    }
    if (!browser || saved.updatedAt >= browser.updatedAt) saveLocalData(value);
  }
  const current = localStorage.getItem(STORAGE_KEY);
  if (current) {
    const upgraded = JSON.stringify({ ...JSON.parse(current), ...parseData(JSON.parse(current)) });
    // Native backup must precede both upgraded copies, even after a webview purge.
    await saveNative(upgraded);
    saveLocalData(upgraded);
  }
}
async function saveNative(value: string) {
  const next = parseData(JSON.parse(value));
  const { value: previous } = await Preferences.get({ key: STORAGE_KEY });
  if (previous) {
    const old = JSON.parse(previous);
    parseData(old); // Unknown future/corrupt versions must never be overwritten.
    if (old.schemaVersion === 1 && next.schemaVersion === 2)
      await Preferences.set({ key: MIGRATION_BACKUP_KEY, value: previous });
  }
  // Browser migration can occur before this first native save.
  const browserBackup = localStorage.getItem(MIGRATION_BACKUP_KEY);
  if (browserBackup && !(await Preferences.get({ key: MIGRATION_BACKUP_KEY })).value)
    await Preferences.set({ key: MIGRATION_BACKUP_KEY, value: browserBackup });
  await Preferences.set({ key: STORAGE_KEY, value });
}
let pending = Promise.resolve();
export function persistNativeStorage(value: string) {
  if (!isNative) return;
  pending = pending.catch(() => {}).then(() => saveNative(value));
  void pending.catch(() => {
    window.dispatchEvent(new CustomEvent('native-storage-error'));
  });
}

export function flushNativeStorage() {
  return pending;
}
