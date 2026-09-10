import { useAppStore } from '@/stores/appStore';
import { emptyData, parseData } from '@/domain/storage';
import { flushNativeStorage } from '@/native/storage';
import { isNative } from '@/native/platform';
import { syncNativeReminders } from '@/native/reminders';
import { cloudConfig } from './config';
import { applyCloudData, cloudPayload } from './payload';
import { hashCloudData, readBinding, type CloudBinding } from './local';
import {
  cloudRpc,
  getCloudSession,
  endCloudSession,
  clearNativeSession,
  SignInRequired,
  CloudUnavailable,
  type CloudUser,
} from './auth';
import { useCloudStore, type CloudSnapshot } from './store';

let epoch = 0;
let running: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let suppress = false;
const state = useCloudStore.setState;
const local = () => useAppStore.getState().data;
function saveDevice(data: ReturnType<typeof local>, binding: CloudBinding | null) {
  suppress = true;
  try {
    const result = useAppStore.getState().applyCloud(data, binding);
    if (!result.ok) throw new Error(result.error);
  } finally {
    suppress = false;
  }
}
function validSnapshot(value: CloudSnapshot): CloudSnapshot {
  if (
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    (value.revision > 0 && !value.data)
  )
    throw new Error('The cloud copy could not be read. Your device data is safe.');
  return { ...value, data: value.data ? parseData(value.data) : null };
}
function fail(error: unknown) {
  state({
    status:
      error instanceof SignInRequired
        ? 'signin'
        : error instanceof CloudUnavailable || !navigator.onLine
          ? 'offline'
          : 'error',
    message: error instanceof Error ? error.message : 'Couldn’t sync. Your device data is safe.',
  });
}
async function remember(snapshot: CloudSnapshot, hash: string, expectedOwner: string) {
  const binding = readBinding();
  if (!binding || binding.ownerId !== expectedOwner) return;
  saveDevice(local(), {
    ...binding,
    revision: snapshot.revision,
    hash,
    syncedAt: snapshot.updatedAt,
  });
  await flushNativeStorage();
  state({ status: 'synced', message: '', remote: null, lastSyncedAt: snapshot.updatedAt });
}
function runtimeBinding() {
  if (useAppStore.getState().storageError) return null;
  try {
    return readBinding();
  } catch (error) {
    fail(error);
    return null;
  }
}
export function scheduleCloudSync() {
  clearTimeout(timer);
  if (suppress || !runtimeBinding() || useCloudStore.getState().status === 'conflict') return;
  timer = setTimeout(() => {
    void syncCloud();
  }, 900);
}
export async function syncCloud(): Promise<void> {
  if (!cloudConfig.enabled || !runtimeBinding()) return;
  if (running) {
    await running;
    return;
  }
  const requestEpoch = epoch;
  running = (async () => {
    try {
      const binding = readBinding()!;
      if (!navigator.onLine)
        throw new CloudUnavailable('Offline. Changes will sync when you reconnect.');
      if (useCloudStore.getState().status === 'conflict') return;
      if (useAppStore.getState().storageError)
        throw new Error('Resolve the device storage issue before syncing.');
      state({ status: 'syncing', message: '' });
      const remote = validSnapshot(
        await cloudRpc<CloudSnapshot>('reminduh_read', {}, binding.ownerId),
      );
      if (epoch !== requestEpoch || readBinding()?.ownerId !== binding.ownerId) return;
      if (useAppStore.getState().cloudOwner !== binding.ownerId)
        throw new Error('The account changed in another window. Refresh before syncing.');
      const current = local();
      const hash = await hashCloudData(current);
      const remoteHash = remote.data ? await hashCloudData(remote.data) : '';
      if (epoch !== requestEpoch) return;
      if (current !== local()) {
        scheduleCloudSync();
        return;
      }
      if (remote.data && remoteHash === hash) {
        await remember(remote, hash, binding.ownerId);
        return;
      }
      if (remote.revision !== binding.revision) {
        if (hash === binding.hash && remote.data) {
          saveDevice(applyCloudData(remote.data, local(), true), {
            ...binding,
            revision: remote.revision,
            hash: remoteHash,
            syncedAt: remote.updatedAt,
          });
          await flushNativeStorage();
          state({ status: 'synced', remote: null, lastSyncedAt: remote.updatedAt });
        } else
          state({
            status: 'conflict',
            remote,
            message: 'This device and another device both changed. Choose which copy to keep.',
          });
        return;
      }
      if (hash === binding.hash) {
        state({ status: 'synced', lastSyncedAt: binding.syncedAt });
        return;
      }
      const result = validSnapshot(
        await cloudRpc<CloudSnapshot>(
          'reminduh_save',
          { expected_revision: binding.revision, payload: cloudPayload(current) },
          binding.ownerId,
        ),
      );
      if (epoch !== requestEpoch || readBinding()?.ownerId !== binding.ownerId) return;
      if (result.status === 'conflict') {
        state({
          status: 'conflict',
          remote: result,
          message: 'Another device changed while we synced. Your changes are safe here.',
        });
        return;
      }
      await remember(result, hash, binding.ownerId);
      if ((await hashCloudData(local())) !== hash) scheduleCloudSync();
    } catch (error) {
      if (epoch === requestEpoch) fail(error);
    }
  })();
  try {
    await running;
  } finally {
    running = null;
  }
}
export async function receiveSignIn(user: CloudUser): Promise<void> {
  epoch++;
  const binding = readBinding();
  if (binding && binding.ownerId !== user.id)
    throw new Error('Sign out of the current account before switching accounts.');
  state({ user, status: 'checking', message: '' });
  if (binding) {
    await syncCloud();
    return;
  }
  try {
    state({
      status: 'choose',
      remote: validSnapshot(await cloudRpc<CloudSnapshot>('reminduh_read', {}, user.id)),
    });
  } catch (error) {
    fail(error);
  }
}
export async function connectCloud(source: 'device' | 'cloud'): Promise<void> {
  const user = useCloudStore.getState().user;
  if (!user || readBinding()) throw new Error('Please sign in again.');
  const remote = validSnapshot(await cloudRpc<CloudSnapshot>('reminduh_read', {}, user.id));
  if (source === 'device' && remote.revision !== 0)
    throw new Error('This account already has a cloud copy. Open that copy to continue.');
  if (source === 'cloud' && !remote.data) throw new Error('There is no cloud copy yet.');
  const data = source === 'cloud' ? applyCloudData(remote.data!, local(), false) : local();
  const binding: CloudBinding = {
    ownerId: user.id,
    email: user.email,
    revision: remote.revision,
    hash: source === 'cloud' ? await hashCloudData(data) : '',
    syncedAt: remote.updatedAt,
  };
  saveDevice(data, binding);
  await flushNativeStorage();
  state({ remote: null, status: 'syncing' });
  await syncCloud();
}
export async function resolveCloudConflict(source: 'device' | 'cloud'): Promise<void> {
  const binding = readBinding();
  const shown = useCloudStore.getState().remote;
  if (!binding || !shown) return;
  const remote = validSnapshot(await cloudRpc<CloudSnapshot>('reminduh_read', {}, binding.ownerId));
  if (shown.revision !== remote.revision) {
    state({ remote, message: 'The cloud copy changed again. Please review the latest copy.' });
    return;
  }
  if (source === 'cloud') {
    if (!remote.data) throw new Error('No cloud copy is available.');
    const hash = await hashCloudData(remote.data);
    saveDevice(applyCloudData(remote.data, local(), true), {
      ...binding,
      revision: remote.revision,
      hash,
      syncedAt: remote.updatedAt,
    });
    await flushNativeStorage();
    state({ status: 'synced', remote: null, message: '', lastSyncedAt: remote.updatedAt });
  } else {
    // A user-approved overwrite still uses CAS; another concurrent write prompts again.
    saveDevice(local(), {
      ...binding,
      revision: remote.revision,
      hash: remote.data ? await hashCloudData(remote.data) : '',
    });
    state({ status: 'syncing', remote: null, message: '' });
    await syncCloud();
  }
}
export async function hasPendingCloudChanges() {
  const binding = readBinding();
  return !!binding && (await hashCloudData(local())) !== binding.hash;
}
async function clearDeviceAccount() {
  epoch++;
  clearTimeout(timer);
  const blank = emptyData();
  saveDevice(blank, null);
  await flushNativeStorage();
  if (isNative) await syncNativeReminders(blank);
  state({ status: 'local', user: null, remote: null, message: '', lastSyncedAt: null });
}
export async function signOutCloud(discardUnsynced = false) {
  clearTimeout(timer);
  if (running) await running;
  if ((await hasPendingCloudChanges()) && !discardUnsynced)
    throw new Error(
      'Some changes are only on this device. Sync or export a backup before signing out.',
    );
  await endCloudSession();
  if (readBinding()) await clearDeviceAccount();
  else state({ status: 'local', user: null, remote: null, message: '' });
}
export async function deleteCloudAccount(confirmationToken: string) {
  const user = useCloudStore.getState().user;
  const binding = readBinding();
  if (!user || (binding && user.id !== binding.ownerId))
    throw new Error('Sign in to the account you want to delete.');
  epoch++;
  clearTimeout(timer);
  if (running) await running;
  const result = await cloudRpc<{ deleted: boolean }>(
    'reminduh_delete_account',
    { confirmation_token: confirmationToken },
    user.id,
  );
  if (!result.deleted) throw new Error('Account deletion did not finish. Please try again.');
  await clearNativeSession();
  if (binding) await clearDeviceAccount();
  else state({ status: 'local', user: null, remote: null, message: '', lastSyncedAt: null });
}
export function startCloudRuntime() {
  if (!cloudConfig.enabled) return () => {};
  const binding = runtimeBinding();
  if (binding) {
    state({ status: 'checking', lastSyncedAt: binding.syncedAt });
    void getCloudSession()
      .then((session) => {
        if (session) return receiveSignIn(session.user);
        throw new SignInRequired('Sign in again to resume sync. Your device data is safe.');
      })
      .catch(fail);
  }
  const unsubscribe = useAppStore.subscribe((next, previous) => {
    if (next.data !== previous.data) scheduleCloudSync();
  });
  const refresh = () => {
    if (!document.hidden) void syncCloud();
  };
  const offline = () => {
    if (runtimeBinding())
      state({
        status: 'offline',
        message: 'Offline. Your changes stay on this device until you reconnect.',
      });
  };
  window.addEventListener('online', refresh);
  window.addEventListener('focus', refresh);
  window.addEventListener('offline', offline);
  document.addEventListener('visibilitychange', refresh);
  const scopeChanged = () => {
    const next = runtimeBinding();
    if (!next) {
      epoch++;
      clearTimeout(timer);
      state({ status: 'local', user: null, remote: null, message: '', lastSyncedAt: null });
    } else if (next.ownerId !== useCloudStore.getState().user?.id) {
      epoch++;
      void getCloudSession()
        .then((session) => {
          if (session) return receiveSignIn(session.user);
          throw new SignInRequired('Sign in again to resume cloud sync.');
        })
        .catch(fail);
    }
  };
  window.addEventListener('storage', scopeChanged);
  const interval = setInterval(refresh, 30000);
  return () => {
    epoch++;
    clearTimeout(timer);
    clearInterval(interval);
    window.removeEventListener('storage', scopeChanged);
    unsubscribe();
    window.removeEventListener('online', refresh);
    window.removeEventListener('focus', refresh);
    window.removeEventListener('offline', offline);
    document.removeEventListener('visibilitychange', refresh);
  };
}
