import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight, Gift, Leaf, X } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { CHECK_IN_LEAVES, DAILY_LEAVES } from '@/domain/catalog';
import { dateKey } from '@/domain/schedule';
import { isNative } from '@/native/platform';
import {
  LEAF_PACKS,
  loadLeafPacks,
  purchaseLeafPack,
  refreshLeafWallet,
  useLeafBalance,
  useLeafWallet,
  type LeafPack,
} from '@/native/leaves';
import './leaf-wallet.css';

export default function LeafWalletButton({ compact = false }: { compact?: boolean }) {
  const balance = useLeafBalance();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={'leaf-wallet-button' + (compact ? ' compact' : '')}
        aria-label={`${balance} leaves available. Open leaf wallet`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Leaf size={compact ? 17 : 22} aria-hidden="true" />
        <strong>{balance}</strong>
        {!compact && <span>leaves</span>}
        <ChevronRight size={14} aria-hidden="true" />
      </button>
      {open && <LeafWalletDialog close={() => setOpen(false)} />}
    </>
  );
}
export function LeafWalletDialog({ close }: { close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const balance = useLeafBalance();
  const wallet = useLeafWallet();
  const market = useAppStore((s) => s.data.market);
  const [packs, setPacks] = useState<LeafPack[]>([]);
  const [loading, setLoading] = useState(isNative);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const claimed = !!market.lastGiftDay && market.lastGiftDay >= dateKey();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current!.showModal();
    let active = true;
    void refreshLeafWallet();
    void loadLeafPacks()
      .then((items) => {
        if (active) setPacks(items);
      })
      .catch(() => {
        if (active) setMessage('Leaf packs couldn’t load. You can still earn leaves.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      ref.current?.close();
      previous?.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className="app-dialog leaves-dialog"
      aria-labelledby="leaves-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
    >
      <div className="dialog-heading">
        <h2 id="leaves-title">Your leaves</h2>
        <button
          className="icon-button"
          aria-label="Close leaf wallet"
          disabled={!!busy}
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      <div className="leaves-total">
        <Leaf size={30} aria-hidden="true" />
        <strong>{balance}</strong>
        <span>leaves to enjoy</span>
      </div>
      <p className="leaves-earned">+{CHECK_IN_LEAVES} for each scheduled check-in</p>
      <div className="leaves-gift">
        <Gift size={23} aria-hidden="true" />
        <span>
          Daily gift<strong>{DAILY_LEAVES} leaves</strong>
        </span>
        <button
          className="button secondary"
          disabled={claimed}
          onClick={() => {
            const result = useAppStore.getState().claimShopGift();
            setMessage(result.ok ? `${DAILY_LEAVES} leaves added.` : result.error!);
          }}
        >
          {claimed ? (
            <>
              <Check size={15} />
              Collected
            </>
          ) : (
            'Collect'
          )}
        </button>
      </div>
      <section className="leaf-packs" aria-labelledby="leaf-packs-title">
        <h3 id="leaf-packs-title">A few extra leaves</h3>
        <div className="leaf-pack-grid">
          {LEAF_PACKS.map((pack, index) => {
            const item = packs.find((p) => p.id === pack.id);
            return (
              <div className="leaf-pack" key={pack.id}>
                <div className="leaf-pack-art" aria-hidden="true">
                  {Array.from({ length: index + 1 }, (_, i) => (
                    <Leaf key={i} size={29} />
                  ))}
                </div>
                <strong>{pack.leaves}</strong>
                <span>{pack.name}</span>
                <button
                  className="button secondary"
                  disabled={!item || !!busy || wallet.pending}
                  aria-label={
                    item
                      ? `Buy ${pack.leaves} leaves for ${item.price}`
                      : `${pack.leaves} leaves, not available yet`
                  }
                  onClick={async () => {
                    setBusy(pack.id);
                    setMessage('');
                    try {
                      const status = await purchaseLeafPack(pack.id);
                      setMessage(
                        status === 'purchased'
                          ? `${pack.leaves} leaves added.`
                          : status === 'pending'
                            ? 'Waiting for Apple approval. Your leaves will arrive once approved.'
                            : 'Purchase cancelled. No leaves added.',
                      );
                    } catch (error) {
                      setMessage(
                        error instanceof Error
                          ? error.message
                          : 'The purchase couldn’t finish. Please try again.',
                      );
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === pack.id
                    ? 'Opening…'
                    : loading
                      ? 'Loading…'
                      : (item?.price ?? 'Coming soon')}
                </button>
              </div>
            );
          })}
        </div>
        <p className="leaf-pack-note">
          {packs.length
            ? 'Optional, one-time purchases through Apple. Purchased leaves don’t expire.'
            : 'Leaf packs are coming to the iPhone app. Earning leaves is available now.'}
        </p>
      </section>
      <p className="leaves-message" role="status">
        {message || wallet.error}
      </p>
      {(wallet.error || wallet.pending) && (
        <button className="button secondary" onClick={() => void refreshLeafWallet()}>
          Retry leaf wallet
        </button>
      )}
      <details className="leaves-help">
        <summary>How leaves work</summary>
        <p>
          Earn {CHECK_IN_LEAVES} leaves once for each scheduled dose you check in with, whether
          taken or skipped. Editing or undoing a check-in won’t earn them again.
        </p>
        <p>
          Your first cuddle and play each day also earn 5 leaves each. Medication reminders and
          self-care activities are always free.
        </p>
        {isNative && (
          <p>
            Purchased leaves stay in this iPhone’s wallet, separate from health backups. Wallet
            syncing between devices is not available yet.
          </p>
        )}
      </details>
    </dialog>,
    document.body,
  );
}
