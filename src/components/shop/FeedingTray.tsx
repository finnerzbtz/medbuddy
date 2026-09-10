import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type MutableRefObject,
  type PointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { FOODS } from '@/domain/catalog';
import { foodQuantity } from '@/domain/market';
import type { FeedTarget } from '@/domain/feeding';
import type { FoodId } from '@/types';
import { useAppStore } from '@/stores/appStore';
import FoodArt from './FoodArt';
export default function FeedingTray({
  scene,
  target,
  busy,
  initialFood,
  close,
}: {
  scene: RefObject<HTMLDivElement>;
  target: MutableRefObject<FeedTarget | null>;
  busy: boolean;
  initialFood?: FoodId;
  close: () => void;
}) {
  const data = useAppStore((s) => s.data);
  const [selected, setSelected] = useState<FoodId | null>(initialFood ?? null);
  const [drag, setDrag] = useState<{ food: FoodId; x: number; y: number; over: boolean } | null>(
    null,
  );
  const [message, setMessage] = useState(
    data.preferences.staticScene
      ? 'Select a snack, then tap Feed.'
      : 'Drag a snack to Blobby, or select one and tap Feed.',
  );
  const pointer = useRef<{ id: number; food: FoodId; x: number; y: number; moved: boolean } | null>(
    null,
  );
  const suppressClick = useRef(false);
  const cancel = () => {
    pointer.current = null;
    setDrag(null);
  };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        cancel();
        setMessage('Snack returned to the tray.');
      }
    };
    const abort = () => cancel();
    window.addEventListener('keydown', escape);
    window.addEventListener('blur', abort);
    return () => {
      window.removeEventListener('keydown', escape);
      window.removeEventListener('blur', abort);
    };
  }, []);
  useEffect(() => {
    scene.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [scene]);
  const hit = (x: number, y: number) => {
    const rect = scene.current?.getBoundingClientRect(),
      point = target.current;
    if (!rect || !point) return false;
    return (
      Math.abs(x - rect.left - point.x) <= point.width / 2 &&
      Math.abs(y - rect.top - point.y) <= point.height / 2 &&
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    );
  };
  const feed = (food: FoodId) => {
    const result = useAppStore.getState().feedBlobby(food);
    if (result.ok) {
      setSelected(null);
      setMessage(
        data.profile.petName +
          ' enjoyed the ' +
          FOODS.find((f) => f.id === food)!.name.toLowerCase() +
          '.',
      );
    } else setMessage(result.error!);
    cancel();
  };
  const start = (event: PointerEvent<HTMLButtonElement>, food: FoodId) => {
    if (!event.isPrimary || event.button !== 0 || busy || data.preferences.staticScene) return;
    suppressClick.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = {
      id: event.pointerId,
      food,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    setSelected(food);
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const p = pointer.current;
    if (!p || p.id !== event.pointerId) return;
    p.moved ||= Math.hypot(event.clientX - p.x, event.clientY - p.y) > 7;
    if (p.moved) {
      suppressClick.current = true;
      setDrag({
        food: p.food,
        x: event.clientX,
        y: event.clientY,
        over: hit(event.clientX, event.clientY),
      });
    }
  };
  const end = (event: PointerEvent<HTMLButtonElement>) => {
    const p = pointer.current;
    if (!p || p.id !== event.pointerId) return;
    const valid = p.moved && hit(event.clientX, event.clientY);
    cancel();
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (valid) feed(p.food);
    else if (p.moved) setMessage('Snack returned to the tray. Drop it on Blobby, or tap Feed.');
  };
  const quantity = selected ? foodQuantity(data, selected) : 0;
  const point = target.current;
  return (
    <section id="blobby-pantry" className="feeding-tray" aria-label="Food tray">
      <div className="feeding-tray-heading">
        <h3>Snack time</h3>
        <Link className="text-link" to="/shop">
          Food shop →
        </Link>
        <button className="icon-button" aria-label="Close food tray" onClick={close}>
          <X aria-hidden="true" size={17} />
        </button>
      </div>
      <div className="feeding-foods">
        {FOODS.map((food) => {
          const count = foodQuantity(data, food.id);
          return (
            <button
              key={food.id}
              type="button"
              className="feeding-food"
              aria-pressed={selected === food.id}
              disabled={count === 0 || busy}
              aria-label={'Select ' + food.name + ', ' + count + ' available'}
              onPointerDown={(event) => start(event, food.id)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={() => {
                cancel();
                setMessage('Snack returned to the tray.');
              }}
              onLostPointerCapture={cancel}
              onClick={(event) => {
                if (event.detail === 0 || !suppressClick.current) {
                  setSelected(food.id);
                  setMessage('Drag to Blobby or tap Feed ' + food.name + '.');
                }
                suppressClick.current = false;
              }}
            >
              <FoodArt food={food.id} />
              <span>{food.name}</span>
              <span className="food-count" aria-hidden="true">
                {count}
              </span>
            </button>
          );
        })}
      </div>
      <p role="status" aria-live="polite">
        {busy ? data.profile.petName + ' is enjoying this snack…' : message}
      </p>
      {selected && (
        <div className="feed-selected">
          <span>{quantity} available</span>
          <button
            className="button primary"
            disabled={busy || quantity === 0}
            onClick={() => feed(selected)}
          >
            Feed {FOODS.find((food) => food.id === selected)!.name}
          </button>
        </div>
      )}
      {scene.current &&
        createPortal(
          <div
            className="feed-target"
            aria-hidden="true"
            data-active={!!drag}
            data-over={drag?.over ?? false}
            style={
              point
                ? { left: point.x, top: point.y, width: point.width, height: point.height }
                : undefined
            }
          >
            <span>{drag?.over ? 'Let go to feed' : 'Drop snack here'}</span>
          </div>,
          scene.current,
        )}
      {drag &&
        createPortal(
          <div className="drag-snack" aria-hidden="true" style={{ left: drag.x, top: drag.y }}>
            <FoodArt food={drag.food} />
          </div>,
          document.body,
        )}
    </section>
  );
}
