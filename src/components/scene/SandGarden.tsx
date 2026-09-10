import { MusicButton } from '@/components/app/SoundControls';
import { enableSound, setSoundSettings, useSoundSettings } from '@/audio/AppAudio';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Eraser, RotateCcw, Undo2, Volume2, VolumeX, Waves } from 'lucide-react';
import type { SandPoint, SandTool } from '@/domain/sand';
import { SandRenderer } from './sand/SandRenderer';
import { SandAudio } from './sand/SandAudio';
import './sand-garden.css';

export default function SandGarden({ reduced }: { reduced: boolean }) {
  const board = useRef<HTMLCanvasElement>(null),
    cursor = useRef<HTMLCanvasElement>(null),
    frame = useRef<HTMLDivElement>(null);
  const renderer = useRef<SandRenderer | null>(null),
    audio = useRef<SandAudio | null>(null);
  const pointer = useRef<number | null>(null),
    keyboardDown = useRef(false),
    keyboardPoint = useRef<SandPoint>({ x: 0, y: 0 });
  const [tool, setTool] = useState<SandTool>('rake'),
    [size, setSize] = useState(64),
    [canUndo, setCanUndo] = useState(false);
  const settings = useSoundSettings();
  const sound = settings.enabled && settings.effects;
  const volume = Math.round(settings.effectsVolume * 100);
  const [message, setMessage] = useState(''),
    [ready, setReady] = useState(false);
  useEffect(() => {
    const engine = new SandRenderer(board.current!, cursor.current!);
    renderer.current = engine;
    engine.onMotion = (speed, x, smooth) =>
      speed ? audio.current?.move(speed, x, smooth) : audio.current?.hush();
    engine.onChange = setCanUndo;
    const resize = () => {
      const rect = frame.current!.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      engine.resize(rect.width, rect.height);
      keyboardPoint.current = { x: rect.width / 2, y: rect.height / 2 };
      keyboardDown.current = false;
      pointer.current = null;
      setReady(true);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(frame.current!);
    const stop = () => {
      engine.leave();
      audio.current?.hush();
      keyboardDown.current = false;
      pointer.current = null;
    };
    const visibility = () => {
      if (document.hidden) stop();
    };
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      observer.disconnect();
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', visibility);
      engine.onChange = undefined;
      engine.dispose();
      renderer.current = null;
      audio.current?.dispose();
      audio.current = null;
    };
  }, []);
  useEffect(() => {
    if (renderer.current) {
      renderer.current.tool = tool;
      renderer.current.size = size;
      renderer.current.reduced = reduced;
    }
  }, [tool, size, reduced, ready]);
  useEffect(() => {
    if (!sound) {
      audio.current?.dispose();
      audio.current = null;
      return;
    }
    audio.current ??= new SandAudio();
    audio.current.setVolume(useSoundSettings.getState().effectsVolume);
  }, [sound]);
  useEffect(() => {
    audio.current?.setVolume(volume / 100);
  }, [volume]);
  const startSandSound = () => {
    const next = (audio.current ??= new SandAudio());
    next.setVolume(useSoundSettings.getState().effectsVolume);
    return next.enable();
  };
  const resumeSandSound = () => {
    if (sound)
      void startSandSound().catch(() => setMessage('Sound is unavailable. You can keep raking.'));
  };
  const end = () => {
    renderer.current?.end();
    audio.current?.hush();
    pointer.current = null;
    keyboardDown.current = false;
  };
  const pointFor = (event: { clientX: number; clientY: number }) => {
    const rect = board.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!event.isPrimary || (pointer.current !== null && event.pointerId !== pointer.current))
      return;
    const p = pointFor(event);
    const rect = board.current!.getBoundingClientRect();
    if (p.x < 0 || p.y < 0 || p.x > rect.width || p.y > rect.height) {
      end();
      renderer.current?.leave();
      return;
    }
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const sample of samples) renderer.current?.hover(pointFor(sample));
    renderer.current?.hover(p);
    keyboardPoint.current = p;
  };
  const key = (event: KeyboardEvent<HTMLCanvasElement>) => {
    resumeSandSound();
    const engine = renderer.current;
    if (!engine) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      end();
      engine.undo();
      setMessage('Last change undone.');
      return;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      if (event.repeat) return;
      if (keyboardDown.current) {
        end();
        setMessage('Rake lifted.');
      } else {
        keyboardDown.current = true;
        engine.begin(keyboardPoint.current);
        setMessage('Rake lowered. Move with the arrow keys.');
      }
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const rect = board.current!.getBoundingClientRect(),
      step = event.shiftKey ? 5 : 15;
    const p = keyboardPoint.current;
    p.x = Math.max(
      8,
      Math.min(
        rect.width - 8,
        p.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
      ),
    );
    p.y = Math.max(
      8,
      Math.min(
        rect.height - 8,
        p.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0),
      ),
    );
    engine.hover(p);
  };
  return (
    <div className="sensory-sand" data-sand-ready={ready}>
      <div className="sand-topline">
        <p id="sand-pointer-help">Drag through the sand. Make any pattern you like.</p>
        <div className="sand-audio-controls">
          <button
            className="button sand-sound"
            aria-pressed={sound}
            onClick={async () => {
              if (sound) setSoundSettings({ effects: false });
              else
                try {
                  // Unlock both contexts during the actual tap, not a React effect.
                  await Promise.all([enableSound({ effects: true }), startSandSound()]);
                } catch {
                  setMessage('Sound is unavailable. You can keep raking.');
                }
            }}
          >
            {sound ? (
              <Volume2 size={18} aria-hidden="true" />
            ) : (
              <VolumeX size={18} aria-hidden="true" />
            )}
            Sound {sound ? 'on' : 'off'}
          </button>
          <MusicButton />
        </div>
      </div>
      {sound && (
        <label className="sand-volume">
          Sand volume{' '}
          <input
            aria-label="Sand volume"
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(event) => {
              const v = Number(event.target.value);
              setSoundSettings({ effectsVolume: v / 100 });
              audio.current?.setVolume(v / 100);
            }}
          />
          <span>{volume}%</span>
        </label>
      )}
      <div className="sand-tray">
        <div className="sand-surface" ref={frame}>
          <canvas
            className="sand-board sensory-sand-board"
            ref={board}
            tabIndex={0}
            role="application"
            aria-roledescription="sand drawing area"
            aria-label="Freeform sand garden"
            aria-describedby="sand-pointer-help sand-keyboard-help"
            onPointerDown={(event) => {
              if (event.button !== 0 || !event.isPrimary || pointer.current !== null) return;
              resumeSandSound();
              board.current!.focus({ preventScroll: true });
              pointer.current = event.pointerId;
              keyboardDown.current = false;
              event.currentTarget.setPointerCapture(event.pointerId);
              const p = pointFor(event);
              keyboardPoint.current = p;
              renderer.current?.begin(p);
            }}
            onPointerMove={move}
            onPointerUp={(event) => {
              if (pointer.current !== event.pointerId) return;
              end();
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => {
              end();
              renderer.current?.leave();
            }}
            onLostPointerCapture={(event) => {
              if (pointer.current === event.pointerId) end();
            }}
            onPointerLeave={() => {
              if (pointer.current === null && !keyboardDown.current) renderer.current?.leave();
            }}
            onKeyDown={key}
            onFocus={() => renderer.current?.hover(keyboardPoint.current)}
            onBlur={() => {
              end();
              renderer.current?.leave();
            }}
          >
            Use the controls below to draw a spiral, smooth the sand or undo a change.
          </canvas>
          <canvas className="sand-cursor" ref={cursor} aria-hidden="true" />
          <div className="sand-edge-shadow" aria-hidden="true" />
        </div>
      </div>
      <div className="sand-toolbar">
        <div className="sand-tools" role="group" aria-label="Sand tools">
          <button
            className="button"
            aria-pressed={tool === 'rake'}
            onClick={() => {
              end();
              setTool('rake');
            }}
          >
            <Waves size={18} aria-hidden="true" />
            Rake
          </button>
          <button
            className="button"
            aria-pressed={tool === 'smooth'}
            onClick={() => {
              end();
              setTool('smooth');
            }}
          >
            <Eraser size={18} aria-hidden="true" />
            Smooth
          </button>
        </div>
        <div className="sand-edits">
          <button
            className="button"
            disabled={!canUndo}
            onClick={() => {
              end();
              renderer.current?.undo();
              setMessage('Last change undone.');
            }}
          >
            <Undo2 size={17} aria-hidden="true" />
            Undo
          </button>
          <button
            className="button"
            onClick={() => {
              end();
              renderer.current?.clear();
              setMessage('Fresh sand. You can undo this.');
            }}
          >
            <RotateCcw size={17} aria-hidden="true" />
            Fresh sand
          </button>
        </div>
      </div>
      <details className="sand-options">
        <summary>Tools & keyboard</summary>
        <div className="sand-options-content">
          <label>
            Tool width
            <input
              aria-label="Tool width"
              type="range"
              min="36"
              max="96"
              step="2"
              value={size}
              onChange={(event) => setSize(Number(event.target.value))}
            />
          </label>
          <button
            className="button secondary"
            onClick={() => {
              end();
              renderer.current?.spiral();
              setMessage('A spiral drawn in the sand. You can undo this.');
            }}
          >
            Draw a spiral
          </button>
          <p id="sand-keyboard-help">
            Focus the sand, then use the arrow keys to move. Space lowers or lifts the rake. Tab
            leaves the sand. Escape returns to the room.
          </p>
        </div>
      </details>
      <p className="sr-only" role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
