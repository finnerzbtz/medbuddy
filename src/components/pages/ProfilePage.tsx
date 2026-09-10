import { AccountCard } from './AccountPage';
import { displayBinding } from '@/cloud/local';
import { isNative } from '@/native/platform';
import { SoundPreferences } from '@/components/app/SoundControls';
import DisplaySettings from '@/components/app/DisplaySettings';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Download, Leaf, RotateCcw, ShieldCheck, Upload, X } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { dateKey, OUTFITS, ROOM_ITEMS } from '@/domain/schedule';
import { DEFAULT_ROOM, ROOM_SLOTS, roomItem } from '@/domain/room';
import {
  backupText,
  MAX_BACKUP_BYTES,
  parseBackup,
  MIGRATION_BACKUP_KEY,
  STORAGE_KEY,
} from '@/domain/storage';
import { download } from '@/domain/exports';
import type { AppData, Result } from '@/types';
import ReminderSettings from '@/components/app/ReminderSettings';
import { useNow } from '@/components/app/AppRuntime';
function ConfirmDialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const trigger = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      requestAnimationFrame(() => {
        if (trigger.current?.isConnected) trigger.current.focus();
      });
    };
  }, []);
  return (
    <dialog className="app-dialog" ref={ref} aria-labelledby="confirm-title" onCancel={close}>
      <div className="dialog-heading">
        <h2 id="confirm-title">{title}</h2>
        <button className="icon-button" aria-label="Close dialog" onClick={close}>
          <X aria-hidden="true" focusable="false" size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function ProfilePage() {
  const data = useAppStore((s) => s.data),
    now = useNow(),
    navigate = useNavigate();
  const storageError = useAppStore((s) => s.storageError);
  const [name, setName] = useState(data.profile.name),
    [petName, setPetName] = useState(data.profile.petName);
  const [restoring, setRestoring] = useState<AppData | null>(null),
    [resetting, setResetting] = useState(false),
    [resetText, setResetText] = useState(''),
    [error, setError] = useState('');
  const [offlineReady, setOfflineReady] = useState(isNative);
  const file = useRef<HTMLInputElement>(null);
  const report = (result: Result, success?: string) => {
    if (!result.ok || success)
      useAppStore.getState().showToast(result.ok ? success! : result.error!);
  };
  useEffect(() => {
    if (!isNative && 'serviceWorker' in navigator)
      void navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg?.active) setOfflineReady(true);
      });
  }, [now]);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>You & {data.profile.petName}</h1>
        </div>
        <span className="device-badge">
          <ShieldCheck aria-hidden="true" focusable="false" size={16} /> Saved on this device
        </span>
      </div>
      <div className="profile-grid">
        <AccountCard />
        <ReminderSettings />
        <section className="panel">
          <h2>For you</h2>
          <p>Optional routines, at your own pace.</p>
          <Link className="button secondary" to="/routines">
            Manage routines
          </Link>
        </section>
        <section className="panel profile-details">
          <div className="profile-pet">
            <img src={'/assets-v2/' + data.outfit + '-preview.webp'} alt={data.profile.petName} />
            <div>
              <h2>{data.profile.petName}</h2>
            </div>
          </div>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              report(useAppStore.getState().setProfile(name, petName), 'Names updated.');
            }}
          >
            <div className="form-grid">
              <label className="field">
                Your name
                <input
                  value={name}
                  maxLength={40}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="given-name"
                  placeholder="Optional"
                />
              </label>
              <label className="field">
                Companion name
                <input
                  required
                  value={petName}
                  maxLength={40}
                  onChange={(e) => setPetName(e.target.value)}
                />
              </label>
            </div>
            <button className="button secondary" type="submit">
              Save names
            </button>
          </form>
        </section>
        <section className="panel" id="wardrobe">
          <div className="section-heading">
            <h2>Wardrobe</h2>
            <Link className="text-link" to="/shop?tab=outfits">
              Visit the shop →
            </Link>
          </div>
          <div className="outfit-grid">
            {OUTFITS.filter((outfit) => data.market.ownedOutfits.includes(outfit.id)).map(
              (outfit) => (
                <button
                  className={'outfit-card ' + (data.outfit === outfit.id ? 'selected' : '')}
                  aria-pressed={data.outfit === outfit.id}
                  key={outfit.id}
                  onClick={() =>
                    report(
                      useAppStore.getState().setOutfit(outfit.id),
                      outfit.name + ' is ready for the day.',
                    )
                  }
                >
                  <img src={'/assets-v2/' + outfit.id + '-preview.webp'} alt="" />
                  <span>
                    <strong>{outfit.name}</strong>
                    {data.outfit === outfit.id && (
                      <Check aria-hidden="true" focusable="false" size={14} />
                    )}
                  </span>
                </button>
              ),
            )}
          </div>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>Your room</h2>
            <Link className="text-link" to="/shop?tab=room">
              Decorate →
            </Link>
          </div>
          <div className="room-toggles">
            {ROOM_ITEMS.map((item) => (
              <label className="checkbox-card" key={item.id}>
                <input
                  type="checkbox"
                  checked={!data.hiddenGroups.includes(item.id)}
                  onChange={() => report(useAppStore.getState().toggleRoomItem(item.id))}
                />
                <span>
                  {(() => {
                    const slot = ROOM_SLOTS.find((slot) => slot.group === item.id)?.id;
                    return slot && data.room[slot] !== DEFAULT_ROOM[slot]
                      ? roomItem(data.room[slot])?.name
                      : item.name;
                  })()}
                </span>
              </label>
            ))}
          </div>
          <Link className="text-link" to="/">
            See your room →
          </Link>
        </section>
        <section className="panel" id="sound">
          <h2>Sound</h2>
          <SoundPreferences />
        </section>
        <section className="panel" id="accessibility" tabIndex={-1}>
          <h2>Accessibility & comfort</h2>
          <DisplaySettings />
          <Link className="text-link" to="/help">
            Help, privacy & accessibility
          </Link>
        </section>
        <section className="panel wide-panel" id="your-data">
          <div className="section-heading">
            <div>
              <h2>Your data</h2>
            </div>
            <ShieldCheck aria-hidden="true" focusable="false" size={23} strokeWidth={1.5} />
          </div>
          <p>
            {isNative
              ? 'Your medications and check-ins stay on this device. There is no account or cloud sync. Deleting the app removes its data, so save a backup somewhere private.'
              : 'Your medications and check-ins stay in this browser. There is no account or cloud sync. Clearing browser data removes them, so keep a backup somewhere private.'}
          </p>
          <div className="data-status">
            <span>
              <i className={offlineReady ? 'taken-dot' : 'unrecorded-dot'} />
              {offlineReady
                ? 'Ready to open offline'
                : 'Offline access needs the installed production build'}
            </span>
            <span>
              {data.medications.length} medications · {Object.keys(data.records).length} check-ins
            </span>
          </div>
          <div className="button-row">
            <button
              className="button secondary"
              onClick={() =>
                download(
                  backupText(data),
                  'reminduh-backup-' + dateKey() + '.json',
                  'application/json',
                )
              }
            >
              <Download aria-hidden="true" focusable="false" size={16} /> Export backup
            </button>
            {localStorage.getItem(MIGRATION_BACKUP_KEY) && (
              <button
                className="button ghost"
                onClick={() =>
                  download(
                    localStorage.getItem(MIGRATION_BACKUP_KEY)!,
                    'reminduh-before-release-a.json',
                    'application/json',
                  )
                }
              >
                Export pre-update backup
              </button>
            )}
            <button
              className="button secondary"
              onClick={() => {
                setError('');
                file.current?.click();
              }}
            >
              <Upload aria-hidden="true" focusable="false" size={16} /> Restore backup
            </button>
            <input
              className="visually-hidden"
              ref={file}
              type="file"
              accept=".json,application/json"
              aria-label="Choose a Reminduh backup"
              onChange={async (e) => {
                const selected = e.target.files?.[0];
                e.target.value = '';
                if (!selected) return;
                try {
                  if (selected.size > MAX_BACKUP_BYTES)
                    throw new Error('Choose a backup smaller than 10 MB.');
                  setRestoring(parseBackup(await selected.text()));
                  setError('');
                } catch (err) {
                  setError(
                    err instanceof Error && !(err instanceof SyntaxError)
                      ? err.message
                      : 'This file could not be read as a Reminduh backup. Your current data has not changed.',
                  );
                }
              }}
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {storageError && (
            <button
              className="text-link"
              onClick={() => {
                try {
                  download(
                    localStorage.getItem(STORAGE_KEY) ?? '',
                    'reminduh-recovery.json',
                    'application/json',
                  );
                } catch {
                  useAppStore.getState().showToast('Browser storage could not be read.');
                }
              }}
            >
              Download original saved data for recovery
            </button>
          )}
          <button
            className="danger-link"
            disabled={!!displayBinding()}
            title={
              displayBinding()
                ? 'Sign out to clear this device, or delete your account in Account.'
                : undefined
            }
            onClick={() => {
              setResetText('');
              setResetting(true);
            }}
          >
            <RotateCcw aria-hidden="true" focusable="false" size={15} /> Reset this device’s app
            data
          </button>
        </section>
      </div>
      {displayBinding() && (
        <p className="small muted">
          Restoring a backup also replaces your synced cloud copy. To clear only this device,{' '}
          <Link to="/account">sign out of your account</Link>.
        </p>
      )}
      <div className="profile-footer">
        <Leaf aria-hidden="true" focusable="false" size={21} />
        <p>
          Reminduh keeps your own records; it does not verify ingestion or provide medical advice.
          Follow your medication instructions and ask a pharmacist if you’re unsure about a dose.
        </p>
        {!isNative && <Link to="/studio">Open asset studio →</Link>}
      </div>
      {restoring && (
        <ConfirmDialog title="Restore this backup?" close={() => setRestoring(null)}>
          <p>
            This will replace the current data on this device with{' '}
            <strong>{restoring.medications.length} medications</strong> and{' '}
            <strong>{Object.keys(restoring.records).length} check-ins</strong>. Export your current
            data first if you want to keep it. {restoring.selfCare.routines.length} optional
            routines and {Object.keys(restoring.selfCare.records).length} routine records will
            replace this device’s optional plan too. The leaf balance and reward history move
            together.
          </p>
          <p className="small muted">
            Browser reminders will be switched off until you enable them again.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="button-row">
            <button
              className="button secondary"
              onClick={() =>
                download(backupText(data), 'reminduh-before-restore.json', 'application/json')
              }
            >
              Save current backup
            </button>
            <button
              className="button primary"
              onClick={() => {
                const result = useAppStore.getState().restore(restoring);
                if (result.ok) {
                  setRestoring(null);
                  useAppStore.getState().showToast('Backup restored on this device.');
                  navigate('/');
                } else setError(result.error!);
              }}
            >
              Replace with backup
            </button>
          </div>
        </ConfirmDialog>
      )}
      {resetting && (
        <ConfirmDialog title="Start fresh on this device?" close={() => setResetting(false)}>
          <p>
            This removes your medications, check-ins and preferences from this device. Export a
            backup first if you want to keep them.
            {isNative && ' Purchased leaves stay in this iPhone’s separate wallet.'}
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <label className="field">
            Type RESET to confirm
            <input
              value={resetText}
              onChange={(e) => setResetText(e.target.value)}
              autoComplete="off"
            />
          </label>
          <div className="button-row">
            <button className="button secondary" onClick={() => setResetting(false)}>
              Keep my data
            </button>
            <button
              className="button danger"
              disabled={resetText !== 'RESET'}
              onClick={() => {
                const result = useAppStore.getState().reset();
                if (result.ok) {
                  setResetting(false);
                  navigate('/welcome');
                } else setError(result.error!);
              }}
            >
              Reset app data
            </button>
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}
