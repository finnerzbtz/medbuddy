import { useLeafBalance } from '@/native/leaves';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Coffee, Eye, Flower2, LampDesk, Leaf, Pause, Play, Sunrise, X } from 'lucide-react';
import { PRODUCTS, type ShopProduct } from '@/domain/catalog';
import { ROOM_SLOTS, roomItem } from '@/domain/room';
import { roomEnvironment } from '@/domain/environment';
import { useAppStore } from '@/stores/appStore';
import { useNow } from '@/components/app/AppRuntime';
import { useReducedMotion } from '@/components/app/useReducedMotion';
import SceneErrorBoundary from '@/components/scene/SceneErrorBoundary';
import RoomArt, { RoomStill } from './RoomArt';
import type { RoomItemId, RoomSlot, RoomStyle } from '@/types';
const AssetScene = lazy(() => import('@/components/scene/AssetScene'));
const areas = {
  garden: { label: 'Garden', title: 'Garden activities', icon: Flower2 },
  table: { label: 'Table', title: 'Table activities', icon: Coffee },
  lamp: { label: 'Lamps', title: 'Lamps', icon: LampDesk },
  view: { label: 'View', title: 'Window views', icon: Sunrise },
};

function RoomPreview({ product, close }: { product: ShopProduct; close: () => void }) {
  const data = useAppStore((s) => s.data),
    now = useNow(),
    reduced = useReducedMotion();
  const ref = useRef<HTMLDialogElement>(null);
  const trigger = useRef(document.activeElement as HTMLElement | null);
  const [playing, setPlaying] = useState(true);
  const [ready, setReady] = useState(false);
  const item = roomItem(product.item)!;
  const current = roomItem(data.room[item.slot])!;
  const room = { ...data.room, [item.slot]: item.id } as RoomStyle;
  const motion = !reduced && !data.preferences.reducedMotion && !data.preferences.pauseScene;
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      if (trigger.current?.isConnected) trigger.current.focus({ preventScroll: true });
    };
  }, []);
  const fallback = <RoomStill room={room} name={data.profile.petName} />;
  return (
    <dialog
      className="room-item-preview"
      ref={ref}
      aria-labelledby="room-preview-title"
      onCancel={close}
    >
      <header className="room-item-preview-heading">
        <h2 id="room-preview-title">Preview {product.name}</h2>
        <button className="icon-button" aria-label="Close preview" onClick={close}>
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <div
        className="room-preview-frame"
        data-preview-ready={ready || data.preferences.staticScene}
        role="img"
        aria-label={product.name + ' in Blobby’s room'}
      >
        {data.preferences.staticScene ? (
          fallback
        ) : (
          <SceneErrorBoundary fallback={fallback}>
            <Suspense fallback={fallback}>
              <AssetScene
                outfit={data.outfit}
                room
                cosy
                roomStyle={room}
                clip="idle"
                playing={motion && playing}
                environment={roomEnvironment(now)}
                lampOn
                onReady={setReady}
              />
            </Suspense>
          </SceneErrorBoundary>
        )}
        {!ready && !data.preferences.staticScene && (
          <div className="room-preview-loading" aria-hidden="true">
            {fallback}
          </div>
        )}
      </div>
      {!ready && !data.preferences.staticScene && (
        <span className="sr-only" role="status">
          Loading room preview
        </span>
      )}
      <p className="room-preview-placement">
        {current.id === item.id ? 'Currently in your room' : 'Replaces ' + current.name}
      </p>
      <footer className="room-preview-controls">
        {motion && !data.preferences.staticScene && (
          <button className="button ghost" onClick={() => setPlaying(!playing)}>
            {playing ? (
              <Pause size={16} aria-hidden="true" />
            ) : (
              <Play size={16} aria-hidden="true" />
            )}
            {playing ? 'Pause animation' : 'Play animation'}
          </button>
        )}
        <button className="button primary" onClick={close}>
          Back to items
        </button>
      </footer>
    </dialog>
  );
}

export default function RoomShop({ onPurchase }: { onPurchase: (product: ShopProduct) => void }) {
  const balance = useLeafBalance();
  const data = useAppStore((s) => s.data);
  const [params, setParams] = useSearchParams();
  const [preview, setPreview] = useState<ShopProduct | null>(null);
  const slot = (
    ROOM_SLOTS.some((s) => s.id === params.get('slot')) ? params.get('slot')! : 'garden'
  ) as RoomSlot;
  const products = PRODUCTS.filter((p) => p.kind === 'room' && roomItem(p.item)?.slot === slot);
  return (
    <section className="room-shop" aria-label="Decorate your room">
      <div className="room-area-tabs" role="group" aria-label="Room areas">
        {ROOM_SLOTS.map((area) => {
          const { label, icon: Icon } = areas[area.id];
          return (
            <button
              key={area.id}
              aria-pressed={slot === area.id}
              onClick={() => setParams({ tab: 'room', slot: area.id })}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      <h2 className="room-items-title">{areas[slot].title}</h2>
      <div className="room-item-grid">
        {products.map((product) => {
          const id = product.item as RoomItemId;
          const item = roomItem(id)!;
          const owned = data.market.ownedRoomItems.includes(id);
          const inRoom = data.room[item.slot] === id;
          const enough = balance >= product.price;
          return (
            <article
              className="room-item-card"
              data-item={id}
              data-equipped={inRoom}
              aria-labelledby={'room-item-title-' + id}
              key={id}
            >
              <div className="room-item-art">
                <RoomArt item={id} />
              </div>
              <div className="room-item-copy">
                <h3 id={'room-item-title-' + id}>{product.name}</h3>
                <p>{product.description}</p>
                {owned && !inRoom && <span className="room-owned">Owned</span>}
              </div>
              <div className="room-item-actions">
                <button
                  className="button secondary"
                  aria-label={'Preview ' + product.name}
                  onClick={() => setPreview(product)}
                >
                  <Eye size={17} aria-hidden="true" />
                  Preview
                </button>
                {inRoom ? (
                  <span
                    className="room-in-use"
                    id={'room-item-status-' + id}
                    aria-label={product.name + ' is in your room'}
                    tabIndex={-1}
                  >
                    <Check size={17} aria-hidden="true" />
                    In your room
                  </span>
                ) : owned ? (
                  <button
                    className="button primary"
                    aria-label={'Use ' + product.name + ' in room'}
                    onClick={() => {
                      const result = useAppStore.getState().equipRoomItem(id);
                      if (!result.ok) useAppStore.getState().showToast(result.error!);
                      if (result.ok)
                        requestAnimationFrame(() =>
                          document
                            .getElementById('room-item-status-' + id)
                            ?.focus({ preventScroll: true }),
                        );
                    }}
                  >
                    Use in room
                  </button>
                ) : (
                  <button
                    className="button primary"
                    disabled={!enough}
                    aria-label={
                      enough
                        ? 'Buy and use ' + product.name + ' for ' + product.price + ' leaves'
                        : 'Need ' + (product.price - balance) + ' more leaves for ' + product.name
                    }
                    onClick={() => onPurchase(product)}
                  >
                    {enough ? (
                      <>
                        <Leaf size={16} aria-hidden="true" />
                        Buy & use · {product.price} leaves
                      </>
                    ) : (
                      <>Need {product.price - balance} more leaves</>
                    )}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {preview && <RoomPreview key={preview.id} product={preview} close={() => setPreview(null)} />}
    </section>
  );
}
