import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Cloud, Mail, ArrowLeft, Download, LogOut } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useCloudStore } from '@/cloud/store';
import { cloudConfig } from '@/cloud/config';
import { displayBinding } from '@/cloud/local';
import { sendSignInCode, verifySignInCode } from '@/cloud/auth';
import {
  connectCloud,
  deleteCloudAccount,
  hasPendingCloudChanges,
  receiveSignIn,
  resolveCloudConflict,
  signOutCloud,
  syncCloud,
} from '@/cloud/engine';
import { backupText } from '@/domain/storage';
import { download } from '@/domain/exports';
import './account.css';

export function AccountCard() {
  const cloud = useCloudStore();
  const storageError = useAppStore((s) => s.storageError);
  const binding = displayBinding();
  if (!cloudConfig.enabled || storageError) return null;
  return (
    <Link className="panel account-card" to="/account">
      <span className="account-icon">
        <Cloud aria-hidden="true" size={24} />
      </span>
      <span>
        <strong>{binding ? 'Your account' : 'Keep your routine backed up'}</strong>
        <span className="small muted">
          {binding ? cloudLabel(cloud.status) : 'Optional sign-in and cloud sync'}
        </span>
      </span>
      <span aria-hidden="true">→</span>
    </Link>
  );
}
export function cloudLabel(status: string) {
  return (
    (
      {
        synced: 'Up to date',
        syncing: 'Syncing…',
        offline: 'Saved on this device · waiting to sync',
        conflict: 'Your copies need a quick review',
        signin: 'Sign in to resume sync',
        checking: 'Checking your account…',
        error: 'Saved on this device · sync needs attention',
      } as Record<string, string>
    )[status] ?? 'Saved on this device'
  );
}
export default function AccountPage() {
  const data = useAppStore((s) => s.data);
  const storageError = useAppStore((s) => s.storageError);
  const cloud = useCloudStore();
  const binding = displayBinding();
  const navigate = useNavigate();
  const [email, setEmail] = useState(binding?.email ?? '');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [action, setAction] = useState<'none' | 'signout' | 'delete'>('none');
  const [pending, setPending] = useState(false);
  const [deleteWord, setDeleteWord] = useState('');
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const send = () =>
    run(async () => {
      await sendSignInCode(email.trim().toLowerCase());
      setSent(true);
      setCode('');
      setCooldown(60);
    });
  const verify = () =>
    run(async () => {
      const result = await verifySignInCode(email.trim().toLowerCase(), code.trim());
      if (action === 'delete') {
        if (result.user.id !== cloud.user?.id || deleteWord !== 'DELETE')
          throw new Error('Confirm the account you want to delete.');
        await deleteCloudAccount(result.confirmationToken);
        navigate('/welcome', { replace: true });
      } else {
        await receiveSignIn(result.user);
        setSent(false);
      }
    });
  const exportDevice = () =>
    download(backupText(data), 'reminduh-device-backup.json', 'application/json');
  const hasDeviceData = data.onboarded || data.medications.length > 0;
  const showLogin = !cloud.user || cloud.status === 'signin' || action === 'delete';
  if (storageError)
    return (
      <section className="panel account-panel">
        <h1>Let’s recover your saved data first</h1>
        <p>
          Your original data is still on this device. Export it or restore a backup before
          connecting an account.
        </p>
        <Link className="button primary" to="/profile">
          Open data recovery
        </Link>
      </section>
    );
  return (
    <section className="account-page">
      <Link to="/profile" className="text-link">
        <ArrowLeft size={17} aria-hidden="true" /> My Blobby
      </Link>
      <div className="panel account-panel">
        <span className="account-hero-icon">
          {cloud.status === 'synced' ? (
            <Cloud aria-hidden="true" size={30} />
          ) : (
            <Cloud aria-hidden="true" size={30} />
          )}
        </span>
        <h1>
          {action === 'delete'
            ? 'Delete your account'
            : binding
              ? 'Your account'
              : 'Your routine, wherever you are'}
        </h1>
        {!cloudConfig.enabled ? (
          <p>Cloud accounts are not configured in this build. Your device data is safe.</p>
        ) : (
          <>
            {showLogin && (
              <>
                <p>
                  {action === 'delete'
                    ? 'This permanently deletes your account, medications, check-ins and cloud progress. We’ll email a code to confirm it’s you.'
                    : 'Sign in with an email code. No password to remember.'}
                </p>
                <form
                  className="stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void (sent ? verify() : send());
                  }}
                >
                  <label className="field">
                    Email address
                    <input
                      type="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                      maxLength={254}
                      value={email}
                      readOnly={sent || !!binding || action === 'delete'}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </label>
                  {action === 'delete' && (
                    <>
                      <button type="button" className="text-link" onClick={exportDevice}>
                        <Download size={16} aria-hidden="true" /> Export a backup first
                      </button>
                      <label className="field">
                        Type DELETE to confirm
                        <input
                          autoComplete="off"
                          value={deleteWord}
                          onChange={(e) => setDeleteWord(e.target.value)}
                        />
                      </label>
                    </>
                  )}
                  {sent && (
                    <>
                      <p className="account-hint" role="status">
                        Check your email for a 6-digit code.
                      </p>
                      <label className="field">
                        Email code
                        <input
                          autoFocus
                          autoComplete="one-time-code"
                          inputMode="numeric"
                          pattern="[0-9]{6}"
                          maxLength={6}
                          required
                          value={code}
                          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                        />
                      </label>
                    </>
                  )}
                  <button
                    className={'button full ' + (action === 'delete' ? 'danger' : 'primary')}
                    disabled={busy || (action === 'delete' && deleteWord !== 'DELETE')}
                  >
                    {busy
                      ? 'One moment…'
                      : sent
                        ? action === 'delete'
                          ? 'Confirm and delete account'
                          : 'Sign in'
                        : 'Email me a code'}
                  </button>
                  {sent && (
                    <div className="button-row">
                      <button
                        type="button"
                        className="text-link"
                        disabled={busy || cooldown > 0}
                        onClick={send}
                      >
                        {cooldown > 0 ? `Send again in ${cooldown}s` : 'Send a new code'}
                      </button>
                      {!binding && action !== 'delete' && (
                        <button
                          type="button"
                          className="text-link"
                          onClick={() => {
                            setSent(false);
                            setError('');
                          }}
                        >
                          Use another email
                        </button>
                      )}
                    </div>
                  )}
                </form>
                {action === 'delete' ? (
                  <button
                    className="text-link"
                    disabled={busy}
                    onClick={() => {
                      setAction('none');
                      setSent(false);
                      setCode('');
                      setError('');
                    }}
                  >
                    Keep my account
                  </button>
                ) : (
                  <p className="small muted">
                    Signing in creates an account if you’re new. Your medication data is only
                    uploaded when you choose cloud sync.
                  </p>
                )}
              </>
            )}
            {!showLogin && (
              <>
                <p className="account-email">
                  <Mail aria-hidden="true" size={16} /> {cloud.user?.email}
                </p>
                {cloud.status === 'choose' && (
                  <div className="stack">
                    {cloud.remote?.data ? (
                      <>
                        <h2>Open your cloud copy</h2>
                        <p>
                          {cloud.remote.data.medications.length} medications ·{' '}
                          {Object.keys(cloud.remote.data.records).length} medication check-ins
                          <br />
                          {cloud.remote.data.selfCare.routines.length} optional routines ·{' '}
                          {Object.keys(cloud.remote.data.selfCare.records).length} routine records
                          <br />
                          {cloud.remote.data.market.coins} leaves
                        </p>
                        {hasDeviceData && (
                          <>
                            <p>
                              This replaces the copy currently on this device. Save a backup first
                              if you want to keep it.
                            </p>
                            <button className="button secondary" onClick={exportDevice}>
                              Export device backup
                            </button>
                            <label className="account-consent">
                              <input
                                type="checkbox"
                                checked={confirmed}
                                onChange={(e) => setConfirmed(e.target.checked)}
                              />{' '}
                              I’m ready to replace this device’s copy.
                            </label>
                          </>
                        )}
                        <button
                          className="button primary"
                          disabled={busy || (hasDeviceData && !confirmed)}
                          onClick={() =>
                            run(async () => {
                              await connectCloud('cloud');
                              navigate('/');
                            })
                          }
                        >
                          Open my cloud copy
                        </button>
                      </>
                    ) : (
                      <>
                        <h2>Turn on cloud sync?</h2>
                        <p>
                          Your medications, check-ins, optional routines, Blobby and earned progress
                          will be saved to your account in London. Reminders still run on each
                          device.
                        </p>
                        <button
                          className="button primary"
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await connectCloud('device');
                              navigate('/');
                            })
                          }
                        >
                          Turn on cloud sync
                        </button>
                        <button
                          className="text-link"
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await signOutCloud();
                              navigate('/profile');
                            })
                          }
                        >
                          Keep using this device only
                        </button>
                      </>
                    )}
                  </div>
                )}
                {binding && (
                  <>
                    <div className="account-sync-status" role="status">
                      <strong>{cloudLabel(cloud.status)}</strong>
                      {cloud.lastSyncedAt && (
                        <span className="small muted">
                          Last synced{' '}
                          {new Date(cloud.lastSyncedAt).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                      )}
                    </div>
                    {cloud.message && <p>{cloud.message}</p>}
                    {cloud.status === 'conflict' && cloud.remote?.data ? (
                      <div className="stack">
                        <div className="account-copies">
                          <div>
                            <strong>This device</strong>
                            <p>
                              {data.medications.length} medications
                              <br />
                              {Object.keys(data.records).length} medication check-ins
                              <br />
                              {data.selfCare.routines.length} optional routines ·{' '}
                              {Object.keys(data.selfCare.records).length} routine records
                              <br />
                              {data.market.coins} leaves
                            </p>
                            <button className="text-link" onClick={exportDevice}>
                              Export this copy
                            </button>
                          </div>
                          <div>
                            <strong>Cloud copy</strong>
                            <p>
                              {cloud.remote.data.medications.length} medications
                              <br />
                              {Object.keys(cloud.remote.data.records).length} medication check-ins
                              <br />
                              {cloud.remote.data.selfCare.routines.length} optional routines ·{' '}
                              {Object.keys(cloud.remote.data.selfCare.records).length} routine
                              records
                              <br />
                              {cloud.remote.data.market.coins} leaves
                            </p>
                            <button
                              className="text-link"
                              onClick={() =>
                                download(
                                  backupText(cloud.remote!.data!),
                                  'reminduh-cloud-backup.json',
                                  'application/json',
                                )
                              }
                            >
                              Export this copy
                            </button>
                          </div>
                        </div>
                        <p>
                          The chosen copy will be used on your devices. Export either copy before
                          replacing it. Optional routines, day choices, reward history and the leaf
                          balance are replaced together; balances are never added.
                        </p>
                        <label className="account-consent">
                          <input
                            type="checkbox"
                            checked={confirmed}
                            onChange={(e) => setConfirmed(e.target.checked)}
                          />{' '}
                          I’ve reviewed the copies.
                        </label>
                        <div className="button-row">
                          <button
                            className="button secondary"
                            disabled={busy || !confirmed}
                            onClick={() => run(() => resolveCloudConflict('cloud'))}
                          >
                            Keep cloud copy
                          </button>
                          <button
                            className="button secondary"
                            disabled={busy || !confirmed}
                            onClick={() => run(() => resolveCloudConflict('device'))}
                          >
                            Keep this device’s copy
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="button secondary"
                        disabled={busy || cloud.status === 'syncing' || cloud.status === 'checking'}
                        onClick={() => run(syncCloud)}
                      >
                        Sync now
                      </button>
                    )}
                  </>
                )}
                {action === 'signout' ? (
                  <div className="account-danger stack">
                    <h2>Sign out on this device?</h2>
                    <p>
                      Signing out removes this account’s local copy and reminders from this device.
                      Your synced cloud copy stays saved.
                    </p>
                    {pending && (
                      <>
                        <p role="alert">
                          Some changes haven’t synced. Export a backup before removing this device’s
                          copy.
                        </p>
                        <button className="button secondary" onClick={exportDevice}>
                          Export device backup
                        </button>
                        <label className="account-consent">
                          <input
                            type="checkbox"
                            checked={confirmed}
                            onChange={(e) => setConfirmed(e.target.checked)}
                          />{' '}
                          Remove the unsynced device copy.
                        </label>
                      </>
                    )}
                    <div className="button-row">
                      <button
                        className="button danger"
                        disabled={busy || (pending && !confirmed)}
                        onClick={() =>
                          run(async () => {
                            await signOutCloud(pending && confirmed);
                            navigate('/welcome', { replace: true });
                          })
                        }
                      >
                        Sign out
                      </button>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => setAction('none')}
                      >
                        Stay signed in
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="account-actions">
                    <button
                      className="text-link"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          setPending(await hasPendingCloudChanges());
                          setConfirmed(false);
                          setAction('signout');
                        })
                      }
                    >
                      <LogOut size={16} aria-hidden="true" /> Sign out
                    </button>
                    <button
                      className="danger-link"
                      disabled={busy}
                      onClick={() => {
                        setAction('delete');
                        setEmail(cloud.user!.email);
                        setSent(false);
                        setCode('');
                        setDeleteWord('');
                      }}
                    >
                      Delete account
                    </button>
                  </div>
                )}
              </>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </div>
      {!binding && action === 'none' && (
        <Link className="text-link account-skip" to={data.onboarded ? '/' : '/welcome'}>
          Continue without an account
        </Link>
      )}
      <p className="small muted account-privacy">
        You control whether to sync. You can export your records or delete your account here.{' '}
        <Link to="/help">About your data</Link>
      </p>
    </section>
  );
}
