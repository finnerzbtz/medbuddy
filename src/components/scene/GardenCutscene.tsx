import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Droplets, Wind, Pause, Play, X, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { enableSound, setSoundSettings, useSoundSettings } from '@/audio/AppAudio';
import { MusicButton } from '@/components/app/SoundControls';
import type { BlobbyVariant } from '@/types';
import type { GardenTool, GardenPoint } from '@/domain/garden';
import { GardenBlobby } from './GardenArtwork';
import { BonsaiRenderer } from './bonsai/BonsaiRenderer';
import { BonsaiAudio } from './bonsai/BonsaiAudio';
import './garden-cutscene.css';

export default function GardenCutscene({
  outfit,
  name,
  reduced,
  paused,
  onPauseChange,
  onFinish,
}: {
  outfit: BlobbyVariant;
  name: string;
  reduced: boolean;
  paused: boolean;
  onPauseChange: () => void;
  onFinish: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    area = useRef<HTMLDivElement>(null);
  const engine = useRef<BonsaiRenderer | null>(null),
    audio = useRef<BonsaiAudio | null>(null);
  const pointer = useRef<number | null>(null),
    keyActive = useRef(false),
    auto = useRef<ReturnType<typeof setInterval> | null>(null);
  const [tool, setTool] = useState<GardenTool>('rain'),
    [message, setMessage] = useState(''),
    [ready, setReady] = useState(false),
    [unavailable, setUnavailable] = useState(false);
  const [showering, setShowering] = useState(false);
  const settings = useSoundSettings(),
    sound = settings.enabled && settings.effects;
  const stop = () => {
    if (auto.current) clearInterval(auto.current);
    auto.current = null;
    setShowering(false);
    pointer.current = null;
    keyActive.current = false;
    engine.current?.end();
    audio.current?.hush();
  };
  useLayoutEffect(() => {
    const el = dialog.current!,
      previous = document.activeElement as HTMLElement | null,
      overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    el.showModal();
    return () => {
      el.close();
      document.documentElement.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    let renderer: BonsaiRenderer;
    try {
      renderer = new BonsaiRenderer(canvas.current!);
    } catch {
      setUnavailable(true);
      return;
    }
    engine.current = renderer;
    renderer.onMotion = (active, breeze, x) => audio.current?.move(active, breeze, x);
    const resize = () => {
      const rect = area.current!.getBoundingClientRect();
      if (rect.width && rect.height) {
        stop();
        renderer.resize(rect.width, rect.height);
        setReady(true);
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(area.current!);
    const away = () => {
      stop();
      renderer.suspend(true);
    };
    const back = () => {
      if (!document.hidden) renderer.suspend(dialog.current?.dataset.paused === 'true');
    };
    const visibility = () => (document.hidden ? away() : back());
    window.addEventListener('blur', away);
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      if (auto.current) clearInterval(auto.current);
      observer.disconnect();
      window.removeEventListener('blur', away);
      window.removeEventListener('focus', back);
      document.removeEventListener('visibilitychange', visibility);
      renderer.dispose();
      engine.current = null;
      audio.current?.dispose();
      audio.current = null;
    };
  }, []);
  useEffect(() => {
    if (engine.current) {
      engine.current.garden.tool = tool;
      engine.current.garden.reduced = reduced;
      engine.current.paint();
    }
  }, [tool, reduced, ready]);
  useEffect(() => {
    if (paused) stop();
    engine.current?.suspend(paused || document.hidden);
  }, [paused, ready]);
  useEffect(() => {
    if (!sound) return;
    let next: BonsaiAudio;
    try {
      next = new BonsaiAudio();
    } catch {
      setMessage('Sound is unavailable. You can keep tending.');
      return;
    }
    audio.current = next;
    next.setVolume(useSoundSettings.getState().effectsVolume);
    void next.enable().catch(() => {
      if (audio.current === next) {
        setMessage('Sound is unavailable. You can keep tending.');
        setSoundSettings({ effects: false });
      }
    });
    return () => {
      next.dispose();
      if (audio.current === next) audio.current = null;
    };
  }, [sound]);
  useEffect(() => {
    audio.current?.setVolume(settings.effectsVolume);
  }, [settings.effectsVolume]);
  const point = (event: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return engine.current!.point(event.clientX - r.left, event.clientY - r.top);
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (
      !event.isPrimary ||
      !engine.current ||
      paused ||
      (pointer.current !== null && pointer.current !== event.pointerId)
    )
      return;
    // A mouse can brush the foliage without a held button. Touch keeps its drag gesture.
    if (
      tool === 'breeze' &&
      event.pointerType === 'mouse' &&
      event.buttons === 0 &&
      !keyActive.current &&
      auto.current === null &&
      !engine.current.garden.active
    ) {
      engine.current.begin(point(event));
    } else {
      engine.current.move(point(event));
    }
  };
  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!event.isPrimary || event.button !== 0 || !engine.current || paused) return;
    stop();
    pointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    engine.current.begin(point(event));
  };
  const key = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const renderer = engine.current;
    if (!renderer || paused) return;
    if (event.code === 'Space') {
      event.preventDefault();
      if (event.repeat) return;
      if (keyActive.current) {
        stop();
        setMessage('Resting.');
      } else {
        stop();
        keyActive.current = true;
        renderer.begin(renderer.garden.target);
        setMessage(
          tool === 'rain'
            ? 'Shower on. Use the arrow keys to move.'
            : 'Breeze on. Use the arrow keys to move.',
        );
      }
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const p = { ...renderer.garden.target },
      amount = event.shiftKey ? 6 : 22;
    p.x += event.key === 'ArrowRight' ? amount : event.key === 'ArrowLeft' ? -amount : 0;
    p.y += event.key === 'ArrowDown' ? amount : event.key === 'ArrowUp' ? -amount : 0;
    renderer.move(p);
  };
  const gentlePass = () => {
    if (showering) {
      stop();
      return;
    }
    const renderer = engine.current;
    if (!renderer || paused) return;
    stop();
    setShowering(true);
    let step = 0;
    const positions: GardenPoint[] = [
      { x: 434, y: 140 },
      { x: 505, y: 194 },
      { x: 550, y: 273 },
      { x: 420, y: 230 },
      { x: 330, y: 297 },
      { x: 460, y: 433 },
    ];
    renderer.begin(positions[0]);
    auto.current = setInterval(() => {
      step++;
      if (step >= positions.length) {
        stop();
        setMessage(
          tool === 'rain'
            ? 'A little shower. Stay as long as you like.'
            : 'The leaves settle softly.',
        );
        return;
      }
      renderer.move(positions[step]);
    }, 700);
  };
  return createPortal(
    <dialog
      ref={dialog}
      className="garden-cutscene bonsai-garden"
      aria-labelledby="bonsai-title"
      aria-describedby="bonsai-intro"
      data-paused={paused}
      data-reduced={reduced}
      data-ready={ready}
      onCancel={(event) => {
        event.preventDefault();
        stop();
        onFinish();
      }}
    >
      <div className="bonsai-shell">
        <header className="bonsai-header">
          <div>
            <span className="bonsai-mark" aria-hidden="true">
              ✿
            </span>
            <h2 id="bonsai-title">A little green</h2>
          </div>
          <div className="bonsai-header-actions">
            <button
              className="icon-button"
              aria-label={paused ? 'Resume garden' : 'Pause garden'}
              onClick={() => {
                stop();
                onPauseChange();
              }}
            >
              {paused ? (
                <Play size={18} aria-hidden="true" />
              ) : (
                <Pause size={18} aria-hidden="true" />
              )}
            </button>
            <button
              className="icon-button"
              aria-label="Back to room"
              onClick={() => {
                stop();
                onFinish();
              }}
              autoFocus
            >
              <X size={21} aria-hidden="true" />
            </button>
          </div>
        </header>
        <p id="bonsai-intro">A quiet moment with {name}. Nothing to finish.</p>
        <div className="bonsai-playfield" ref={area}>
          <canvas
            ref={canvas}
            className="bonsai-canvas"
            tabIndex={0}
            role="img"
            aria-label="Interactive bonsai tree"
            aria-describedby="bonsai-help bonsai-keyboard"
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={(event) => {
              if (pointer.current === event.pointerId) stop();
            }}
            onPointerCancel={(event) => {
              if (pointer.current === event.pointerId) stop();
            }}
            onLostPointerCapture={(event) => {
              if (pointer.current === event.pointerId) stop();
            }}
            onPointerLeave={() => {
              if (pointer.current === null && !keyActive.current && auto.current === null) {
                stop();
                engine.current?.garden.leave();
                engine.current?.paint();
              }
            }}
            onKeyDown={key}
            onBlur={() => stop()}
          />
          <svg
            className="bonsai-companion"
            viewBox="-135 -315 280 365"
            aria-hidden="true"
            data-outfit={outfit}
          >
            <ellipse cx="0" cy="22" rx="103" ry="19" fill="#74836920" />
            <ellipse cx="0" cy="14" rx="94" ry="18" fill="#e6dcc3" />
            <GardenBlobby outfit={outfit} />
            <path
              d="M79-119Q108-105 96-73Q84-58 73-82L64-104Z"
              fill={
                outfit === 'raincoat' ? '#f4c64d' : outfit === 'sweater' ? '#d3b392' : '#fff8e5'
              }
              stroke="#56664d"
              strokeWidth="3"
            />
          </svg>
          {paused && <span className="bonsai-paused">Paused</span>}
          {unavailable && (
            <p className="bonsai-unavailable" role="status">
              The garden couldn’t open on this device. You can return to Blobby’s room.
            </p>
          )}
        </div>
        <div className="bonsai-tool-row" role="group" aria-label="Garden tools">
          <div className="bonsai-tool-switch">
            <button
              aria-pressed={tool === 'rain'}
              onClick={() => {
                stop();
                setTool('rain');
              }}
            >
              <Droplets size={19} aria-hidden="true" />
              Rain
            </button>
            <button
              aria-pressed={tool === 'breeze'}
              onClick={() => {
                stop();
                setTool('breeze');
              }}
            >
              <Wind size={19} aria-hidden="true" />
              Breeze
            </button>
          </div>
          <button
            className="bonsai-auto"
            disabled={paused || !ready}
            aria-pressed={showering}
            onClick={gentlePass}
          >
            <Sparkles size={17} aria-hidden="true" />
            {showering ? 'Stop' : tool === 'rain' ? 'Shower the tree' : 'Brush the tree'}
          </button>
          <button
            className="bonsai-clear"
            disabled={!ready}
            onClick={() => {
              stop();
              engine.current?.garden.clearDroplets();
              engine.current?.paint();
              setMessage('Fresh leaves.');
            }}
          >
            Clear droplets
          </button>
        </div>
        <p id="bonsai-help" className="bonsai-help">
          {tool === 'rain'
            ? 'Drag over the leaves to shower them with rain.'
            : reduced
              ? 'Brush the leaves to clear water beads. Movement is reduced.'
              : 'Brush through the leaves to blow the water away.'}
        </p>
        <footer className="bonsai-footer">
          <div className="bonsai-audio">
            <button
              aria-pressed={sound}
              onClick={async () => {
                if (sound) setSoundSettings({ effects: false });
                else
                  try {
                    await enableSound({ effects: true });
                  } catch {
                    setMessage('Sound is unavailable. You can keep tending.');
                  }
              }}
            >
              {sound ? (
                <Volume2 size={17} aria-hidden="true" />
              ) : (
                <VolumeX size={17} aria-hidden="true" />
              )}
              Sound {sound ? 'on' : 'off'}
            </button>
            <MusicButton />
          </div>
          <details>
            <summary>Keyboard controls</summary>
            <p id="bonsai-keyboard">
              Focus the tree, then use arrow keys to move. Space turns your tool on or off. Or use
              “Shower the tree” / “Brush the tree” for a gentle pass with one press. Escape returns
              to the room.
            </p>
          </details>
        </footer>
        <span className="visually-hidden" role="status" aria-live="polite">
          {message}
        </span>
      </div>
    </dialog>,
    document.body,
  );
}
