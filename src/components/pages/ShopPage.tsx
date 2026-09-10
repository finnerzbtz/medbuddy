import LeafWalletButton from '@/components/shop/LeafWallet';
import { purchaseShopItem, useLeafBalance } from '@/native/leaves';
import RoomShop from '@/components/shop/RoomShop';
import RoomArt, { RoomStill } from '@/components/shop/RoomArt';
import { ROOM_SLOTS, roomItem } from '@/domain/room';
import { roomEnvironment } from '@/domain/environment';
import { useReducedMotion } from '@/components/app/useReducedMotion';
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Gift, Leaf, X, Pause, Play } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { DAILY_LEAVES, PRODUCTS, type ShopProduct } from '@/domain/catalog';
import { foodQuantity } from '@/domain/market';
import { dateKey } from '@/domain/schedule';
import { useNow } from '@/components/app/AppRuntime';
import FoodArt from '@/components/shop/FoodArt';
import SceneErrorBoundary from '@/components/scene/SceneErrorBoundary';
import type { BlobbyVariant, FoodId, AppData, RoomItemId, RoomSlot, RoomStyle } from '@/types';
const AssetScene = lazy(() => import('@/components/scene/AssetScene'));

function PurchaseDialog({ product, close }: { product: ShopProduct; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const trigger = useRef(document.activeElement as HTMLElement | null);
  const orderId = useRef(crypto.randomUUID());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const balance = useLeafBalance();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      requestAnimationFrame(() => {
        const target =
          trigger.current?.isConnected &&
          !(trigger.current instanceof HTMLButtonElement && trigger.current.disabled)
            ? trigger.current
            : (document.getElementById('room-item-status-' + product.item) ??
              document.getElementById('shop-preview-title') ??
              document.getElementById('shop-product-' + product.id));
        target?.focus({ preventScroll: target === trigger.current });
      });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="app-dialog shop-confirm"
      aria-labelledby="purchase-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
    >
      <div className="dialog-heading">
        <h2 id="purchase-title">
          {product.kind === 'food' ? product.quantity + ' × ' : ''}
          {product.name}
        </h2>
        <button
          className="icon-button"
          aria-label="Cancel purchase"
          disabled={busy}
          onClick={close}
        >
          <X aria-hidden="true" size={20} />
        </button>
      </div>
      <p>
        Spend <strong>{product.price} leaves</strong> to add{' '}
        {product.kind === 'food'
          ? 'these snacks to your pantry'
          : product.kind === 'room'
            ? 'this item to your room'
            : 'this outfit to your wardrobe'}
        .
      </p>
      <p className="purchase-balance">
        Balance after purchase: {Math.max(0, balance - product.price)} leaves
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button className="button secondary" disabled={busy} onClick={close}>
          Keep browsing
        </button>
        <button
          autoFocus
          className="button primary"
          disabled={busy || balance < product.price}
          onClick={async () => {
            setBusy(true);
            const result = await purchaseShopItem(product.id, orderId.current);
            if (result.ok) close();
            else {
              setError(result.error!);
              setBusy(false);
            }
          }}
        >
          {product.kind === 'room' ? 'Buy & use' : 'Buy for'} {product.price} leaves
        </button>
      </div>
    </dialog>
  );
}
function owns(data: AppData, product: ShopProduct) {
  return product.kind === 'outfit'
    ? data.market.ownedOutfits.includes(product.item as BlobbyVariant)
    : product.kind === 'room'
      ? data.market.ownedRoomItems.includes(product.item as RoomItemId)
      : false;
}
function equipped(data: AppData, product: ShopProduct) {
  return product.kind === 'outfit'
    ? data.outfit === product.item
    : product.kind === 'room'
      ? data.room[roomItem(product.item)!.slot] === product.item
      : false;
}
function ProductArt({ product }: { product: ShopProduct }) {
  return product.kind === 'food' ? (
    <FoodArt food={product.item as FoodId} />
  ) : product.kind === 'room' ? (
    <RoomArt item={product.item as RoomItemId} />
  ) : (
    <img src={'/assets-v2/' + product.item + '-preview.webp'} alt="" loading="lazy" />
  );
}
function ProductDetails({
  mobile,
  open,
  close,
  children,
}: {
  mobile: boolean;
  open: boolean;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!mobile || !open) return;
    const dialog = ref.current!;
    const trigger = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      requestAnimationFrame(() => {
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      });
    };
  }, [mobile, open]);
  if (!mobile) return children;
  if (!open) return null;
  return (
    <dialog
      className="shop-product-dialog"
      ref={ref}
      aria-labelledby="shop-preview-title"
      onCancel={close}
    >
      <button
        className="icon-button shop-product-close"
        aria-label="Close item details"
        onClick={close}
      >
        <X aria-hidden="true" size={20} />
      </button>
      {children}
    </dialog>
  );
}

export default function ShopPage() {
  const balance = useLeafBalance();
  const data = useAppStore((s) => s.data),
    now = useNow();
  const [params, setParams] = useSearchParams();
  const tab = ['outfits', 'room', 'bag'].includes(params.get('tab') ?? '')
    ? params.get('tab')!
    : 'food';
  const reduced = useReducedMotion();
  const [previewPlaying, setPreviewPlaying] = useState(true);
  const [mobile, setMobile] = useState(() => matchMedia('(max-width: 700px)').matches);
  const [detailsOpen, setDetailsOpen] = useState(false);
  useEffect(() => {
    const media = matchMedia('(max-width: 700px)');
    const update = () => {
      setMobile(media.matches);
      setDetailsOpen(false);
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const slot = (
    ROOM_SLOTS.some((s) => s.id === params.get('slot')) ? params.get('slot')! : 'garden'
  ) as RoomSlot;
  const [selection, setSelection] = useState<string | null>(null);
  const [purchase, setPurchase] = useState<ShopProduct | null>(null);
  const [giftMessage, setGiftMessage] = useState('');
  const items = PRODUCTS.filter((p) =>
    tab === 'bag'
      ? p.kind === 'food'
        ? foodQuantity(data, p.item as FoodId) > 0
        : owns(data, p)
      : tab === 'room'
        ? p.kind === 'room' && roomItem(p.item)?.slot === slot
        : p.kind === (tab === 'outfits' ? 'outfit' : 'food'),
  );
  const selected =
    items.find((p) => p.id === selection) ??
    (tab === 'room' ? items.find((p) => p.item === data.room[slot]) : null) ??
    items[0];
  const owned = !!selected && owns(data, selected);
  const worn = !!selected && equipped(data, selected);
  const giftClaimed = !!data.market.lastGiftDay && data.market.lastGiftDay >= dateKey(now);
  const selectedRoomItem = selected?.kind === 'room' ? roomItem(selected.item) : null;
  const previewRoom = selectedRoomItem
    ? ({ ...data.room, [selectedRoomItem.slot]: selectedRoomItem.id } as RoomStyle)
    : data.room;
  const image = selected && <ProductArt product={selected} />;
  return (
    <div className="shop-page">
      <div className="shop-heading">
        <div>
          <Link to="/" className="text-link">
            <ArrowLeft aria-hidden="true" size={16} /> Back to Blobby
          </Link>
          <h1>Blobby shop</h1>
        </div>
        <LeafWalletButton />
      </div>
      <div className="shop-tabs" role="group" aria-label="Shop categories">
        {[
          ['food', 'Food'],
          ['outfits', 'Outfits'],
          ['room', 'Room'],
          ['bag', 'My bag'],
        ].map(([value, label]) => (
          <button
            key={value}
            aria-pressed={tab === value}
            onClick={() => {
              setParams(value === 'food' ? {} : { tab: value });
              setSelection(null);
              setDetailsOpen(false);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'room' ? (
        <RoomShop onPurchase={setPurchase} />
      ) : (
        <div className="shop-layout">
          <section
            className="shop-products"
            aria-label={
              tab === 'outfits'
                ? 'Outfits'
                : tab === 'room'
                  ? 'Room items'
                  : tab === 'bag'
                    ? 'Your items'
                    : 'Food'
            }
          >
            <div className="product-grid">
              {items.map((product) => {
                const have = owns(data, product);
                const count =
                  product.kind === 'food' ? foodQuantity(data, product.item as FoodId) : 0;
                return (
                  <button
                    key={product.id}
                    id={'shop-product-' + product.id}
                    className="product-card"
                    aria-pressed={mobile ? undefined : selected?.id === product.id}
                    aria-haspopup={mobile ? 'dialog' : undefined}
                    onClick={(event) => {
                      event.currentTarget.focus({ preventScroll: true });
                      setSelection(product.id);
                      if (mobile) setDetailsOpen(true);
                    }}
                    aria-label={
                      'Preview ' +
                      product.name +
                      (product.kind === 'food'
                        ? ', ' + count + ' in pantry'
                        : have
                          ? ', owned'
                          : ', ' + product.price + ' leaves')
                    }
                  >
                    <span className="product-art">
                      <ProductArt product={product} />
                    </span>
                    <strong>{product.name}</strong>
                    <span className="product-price">
                      {have ? (
                        <>
                          <Check aria-hidden="true" size={14} />{' '}
                          {equipped(data, product)
                            ? product.kind === 'room'
                              ? 'In room'
                              : 'Wearing'
                            : 'Owned'}
                        </>
                      ) : (
                        <>
                          <Leaf aria-hidden="true" size={13} />
                          {product.price}
                          {product.kind === 'food' ? ' · pack of 3' : ''}
                        </>
                      )}
                    </span>
                    {product.kind === 'food' && (
                      <span className="product-stock">{count} in pantry</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
          {selected && (
            <ProductDetails mobile={mobile} open={detailsOpen} close={() => setDetailsOpen(false)}>
              <section
                className={'shop-detail' + (selectedRoomItem ? ' room-detail' : '')}
                aria-label="Selected item"
              >
                <div
                  className={'shop-preview' + (selectedRoomItem ? ' room-shop-preview' : '')}
                  role="img"
                  aria-label={selected.name + ' preview'}
                >
                  {selectedRoomItem ? (
                    data.preferences.staticScene ? (
                      <RoomStill room={previewRoom} name={data.profile.petName} />
                    ) : (
                      <SceneErrorBoundary
                        fallback={<RoomStill room={previewRoom} name={data.profile.petName} />}
                      >
                        <Suspense
                          fallback={<RoomStill room={previewRoom} name={data.profile.petName} />}
                        >
                          <AssetScene
                            outfit={data.outfit}
                            room
                            cosy
                            roomStyle={previewRoom}
                            clip="idle"
                            playing={
                              previewPlaying &&
                              !reduced &&
                              !data.preferences.reducedMotion &&
                              !data.preferences.pauseScene
                            }
                            environment={roomEnvironment(now)}
                            lampOn
                          />
                        </Suspense>
                      </SceneErrorBoundary>
                    )
                  ) : selected.kind === 'outfit' && !data.preferences.staticScene ? (
                    <SceneErrorBoundary fallback={image}>
                      <Suspense fallback={image}>
                        <AssetScene
                          outfit={selected.item as BlobbyVariant}
                          clip="idle"
                          playing={false}
                        />
                      </Suspense>
                    </SceneErrorBoundary>
                  ) : (
                    image
                  )}
                </div>
                {selectedRoomItem &&
                  !data.preferences.staticScene &&
                  !reduced &&
                  !data.preferences.reducedMotion &&
                  !data.preferences.pauseScene && (
                    <button
                      className="room-preview-motion text-link"
                      onClick={() => setPreviewPlaying(!previewPlaying)}
                    >
                      {previewPlaying ? (
                        <Pause aria-hidden="true" size={15} />
                      ) : (
                        <Play aria-hidden="true" size={15} />
                      )}{' '}
                      {previewPlaying ? 'Pause room preview' : 'Play room preview'}
                    </button>
                  )}
                <div className="shop-detail-copy">
                  <h2 id="shop-preview-title" tabIndex={-1}>
                    {selected.name}
                  </h2>
                  <p>{selected.description}</p>
                  {selected.kind === 'food' && (
                    <p className="shop-quantity">
                      Pack of 3 · {foodQuantity(data, selected.item as FoodId)} in your pantry
                    </p>
                  )}
                  {owned ? (
                    <button
                      className="button primary"
                      disabled={worn}
                      onClick={() => {
                        const result =
                          selected.kind === 'room'
                            ? useAppStore.getState().equipRoomItem(selected.item as RoomItemId)
                            : useAppStore.getState().setOutfit(selected.item as BlobbyVariant);
                        useAppStore
                          .getState()
                          .showToast(
                            result.ok
                              ? selected.name +
                                  (selected.kind === 'room' ? ' is in your room.' : ' is on!')
                              : result.error!,
                          );
                        if (result.ok)
                          requestAnimationFrame(() =>
                            document
                              .getElementById('shop-preview-title')
                              ?.focus({ preventScroll: true }),
                          );
                      }}
                    >
                      {worn ? (
                        <>
                          <Check aria-hidden="true" size={17} />{' '}
                          {selected.kind === 'room' ? 'In your room' : 'Wearing now'}
                        </>
                      ) : selected.kind === 'room' ? (
                        'Use in room'
                      ) : (
                        'Wear this outfit'
                      )}
                    </button>
                  ) : (
                    <button
                      className="button primary"
                      disabled={balance < selected.price}
                      onClick={(event) => {
                        event.currentTarget.focus({ preventScroll: true });
                        setPurchase(selected);
                      }}
                    >
                      <Leaf aria-hidden="true" size={17} />
                      {balance < selected.price
                        ? 'Need ' + (selected.price - balance) + ' more leaves'
                        : 'Buy for ' + selected.price + ' leaves'}
                    </button>
                  )}
                  {selected.kind === 'food' && foodQuantity(data, selected.item as FoodId) > 0 && (
                    <Link className="button secondary" to={'/?feed=' + selected.item}>
                      Feed Blobby
                    </Link>
                  )}
                  {owned && (
                    <Link className="text-link" to="/">
                      See Blobby in the room →
                    </Link>
                  )}
                </div>
              </section>
            </ProductDetails>
          )}
        </div>
      )}
      <section className="shop-gift" aria-label="Daily gift">
        <div>
          <Gift aria-hidden="true" size={22} />
          <span>{giftClaimed ? 'Your daily gift is collected' : 'A little gift for today'}</span>
        </div>
        <button
          className="button secondary"
          disabled={giftClaimed}
          onClick={() => {
            const result = useAppStore.getState().claimShopGift();
            setGiftMessage(result.ok ? DAILY_LEAVES + ' leaves added.' : result.error!);
          }}
        >
          {giftClaimed ? (
            <>
              <Check aria-hidden="true" size={16} /> Collected
            </>
          ) : (
            <>Collect {DAILY_LEAVES} leaves</>
          )}
        </button>
      </section>
      <p role="status" className="sr-only">
        {giftMessage}
      </p>
      <details className="shop-help">
        <summary>Food & leaves</summary>
        <p>
          Blobby gets 3 free apples every day. Collect 25 leaves here each day, and earn 5 each for
          your first cuddle and play, plus 10 leaves for each scheduled check-in. Your original
          outfits and room pieces are yours to keep.
        </p>
        <p>Tap your leaf balance to see rewards and optional leaf packs.</p>
        {data.market.orders.length > 0 && (
          <>
            <h3>Recent purchases</h3>
            <ul>
              {data.market.orders
                .slice(-5)
                .reverse()
                .map((order) => (
                  <li key={order.id}>
                    {PRODUCTS.find((p) => p.id === order.productId)?.name} · {order.quantity} ·{' '}
                    {order.price} leaves
                  </li>
                ))}
            </ul>
          </>
        )}
      </details>
      {purchase && <PurchaseDialog product={purchase} close={() => setPurchase(null)} />}
    </div>
  );
}
