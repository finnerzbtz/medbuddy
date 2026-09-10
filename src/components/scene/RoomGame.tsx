import RecordPlayer from './RecordPlayer';
import { stopOwnedPlayback, reportPlayerError } from '@/audio/RecordPlayerAudio';
import { appAudio, enableSound, setSoundSettings, useSoundSettings } from '@/audio/AppAudio';
import SoundControls from '@/components/app/SoundControls';
import SandGarden from './SandGarden';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Leaf, Music2, Volume2, VolumeX, X } from 'lucide-react';
import type { RoomGameKind } from '@/domain/room';
import './room-games.css';

const notes = [
  { name: 'Do', frequency: 261.63, colour: '#b8d1b5' },
  { name: 'Mi', frequency: 329.63, colour: '#efcc97' },
  { name: 'Sol', frequency: 392, colour: '#c9bce0' },
  { name: 'La', frequency: 440, colour: '#e7b8b9' },
];
const melodies = [
  [0, 1, 2],
  [2, 1, 0, 3],
  [0, 2, 3, 1, 0],
];

export default function RoomGame({
  kind,
  name,
  reduced,
  onFinish,
}: {
  kind: RoomGameKind;
  name: string;
  reduced: boolean;
  onFinish: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const returnTo = useRef(document.activeElement as HTMLElement | null);
  const [take, setTake] = useState(0);
  const [mode, setMode] = useState<'listen' | 'melody'>('listen');
  useEffect(() => {
    if (kind === 'melody') appAudio.setEnvironment(mode === 'melody' ? 'melody' : 'room');
  }, [kind, mode]);
  useEffect(() => {
    const el = dialog.current!;
    el.showModal();
    appAudio.setEnvironment(kind === 'melody' ? 'room' : kind);
    return () => {
      el.close();
      appAudio.setEnvironment('room');
      if (returnTo.current?.isConnected) returnTo.current.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <dialog
      className="room-game"
      data-game={kind}
      data-reduced={reduced}
      ref={dialog}
      aria-labelledby="room-game-title"
      onCancel={(event) => {
        event.preventDefault();
        onFinish();
      }}
    >
      <div className="room-game-shell">
        <header className="room-game-header">
          <span className="room-game-symbol" aria-hidden="true">
            {kind === 'sand' ? <Leaf /> : <Music2 />}
          </span>
          <h2 id="room-game-title">
            {kind === 'sand'
              ? 'A little Zen'
              : mode === 'melody'
                ? `${name}’s mixtape`
                : 'Record player'}
          </h2>
          <SoundControls />
          <button className="icon-button" aria-label="Back to room" onClick={onFinish}>
            <X aria-hidden="true" size={21} />
          </button>
        </header>
        {kind === 'melody' && (
          <div className="record-mode" role="group" aria-label="Record player activity">
            <button aria-pressed={mode === 'listen'} onClick={() => setMode('listen')}>
              Listen
            </button>
            <button
              aria-pressed={mode === 'melody'}
              onClick={() => {
                void stopOwnedPlayback()
                  .then(() => setMode('melody'))
                  .catch(reportPlayerError);
              }}
            >
              Make a melody
            </button>
          </div>
        )}
        {kind === 'sand' ? (
          <SandGarden reduced={reduced} />
        ) : mode === 'listen' ? (
          <RecordPlayer reduced={reduced} />
        ) : (
          <MelodyGame
            key={take}
            name={name}
            onFinish={onFinish}
            onReplay={() => setTake((t) => t + 1)}
          />
        )}
      </div>
    </dialog>,
    document.body,
  );
}
function MelodyGame({
  name,
  onFinish,
  onReplay,
}: {
  name: string;
  onFinish: () => void;
  onReplay: () => void;
}) {
  const [round, setRound] = useState(0),
    [step, setStep] = useState(0),
    [message, setMessage] = useState(''),
    [listening, setListening] = useState(false);
  const settings = useSoundSettings();
  const sound = settings.enabled && settings.effects;
  const listeningTimer = useRef<ReturnType<typeof setTimeout>>();
  const playingNotes = useRef(new Set<OscillatorNode>());
  const output = useRef<GainNode | null>(null);
  const audio = useRef<AudioContext | null>(null),
    next = useRef<HTMLButtonElement>(null);
  const sequence = melodies[round],
    done = step === sequence.length,
    complete = done && round === 2;
  useEffect(() => {
    if (done) next.current?.focus();
  }, [done]);
  useEffect(() => {
    if (!sound) return;
    const context = new AudioContext();
    audio.current = context;
    const master = context.createGain();
    master.gain.value = useSoundSettings.getState().effectsVolume;
    master.connect(context.destination);
    output.current = master;
    void context
      .resume()
      .catch(() => setMessage('Sound is unavailable. You can still match the notes.'));
    return () => {
      clearTimeout(listeningTimer.current);
      setListening(false);
      void context.close().catch(() => {});
      if (audio.current === context) audio.current = null;
    };
  }, [sound]);
  useEffect(() => {
    const stop = () => {
      for (const note of playingNotes.current) {
        try {
          note.stop();
        } catch {
          /* Already ended. */
        }
      }
      playingNotes.current.clear();
      clearTimeout(listeningTimer.current);
      setListening(false);
      void audio.current?.suspend().catch(() => {});
    };
    const resume = () => {
      if (!document.hidden) void audio.current?.resume().catch(() => {});
    };
    const visibility = () => (document.hidden ? stop() : resume());
    window.addEventListener('blur', stop);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('blur', stop);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => {
    if (audio.current && output.current)
      output.current.gain.setTargetAtTime(settings.effectsVolume, audio.current.currentTime, 0.03);
  }, [settings.effectsVolume]);
  const tone = (note: number, delay = 0) => {
    if (!sound || !audio.current) return;
    const ctx = audio.current,
      at = ctx.currentTime + delay;
    void ctx
      .resume()
      .catch(() => setMessage('Sound is unavailable. You can still match the notes.'));
    const oscillator = ctx.createOscillator(),
      gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = notes[note].frequency;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.18, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);
    oscillator.connect(gain);
    gain.connect(output.current!);
    playingNotes.current.add(oscillator);
    oscillator.start(at);
    oscillator.stop(at + 0.45);
    oscillator.onended = () => {
      playingNotes.current.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
  };
  return (
    <div className="melody-game" data-round={round} data-step={step}>
      <div className="room-game-intro">
        <p>
          {complete
            ? `A tiny mixtape, made by you and ${name}.`
            : 'Tap the notes in order to make a little melody. Sound is optional.'}
        </p>
        <span className="game-count">Melody {round + 1}/3</span>
      </div>
      <div className="mixtape-art" aria-hidden="true">
        <div className="mixtape-sleeve">
          <span>
            little
            <br />
            moments
          </span>
          <Music2 size={34} />
        </div>
        <div className="mixtape-record" key={round + '-' + step}>
          <div>
            <Leaf size={26} />
          </div>
        </div>
      </div>
      <div className="melody-sound">
        <button
          className="button ghost"
          aria-pressed={sound}
          onClick={async () => {
            if (sound) setSoundSettings({ effects: false });
            else
              try {
                await enableSound({ effects: true });
              } catch {
                setMessage('Sound is unavailable. You can still match the notes.');
              }
          }}
        >
          {sound ? (
            <Volume2 aria-hidden="true" size={17} />
          ) : (
            <VolumeX aria-hidden="true" size={17} />
          )}
          Sound {sound ? 'on' : 'off'}
        </button>
        {sound && (
          <button
            className="button ghost"
            disabled={listening}
            onClick={() => {
              setListening(true);
              sequence.forEach((n, i) => tone(n, i * 0.5));
              listeningTimer.current = setTimeout(() => setListening(false), sequence.length * 500);
            }}
          >
            Hear pattern
          </button>
        )}
      </div>
      <ol className="melody-pattern" aria-label="Notes to play">
        {sequence.map((note, i) => (
          <li
            key={i}
            className={i < step ? 'played' : i === step ? 'current' : ''}
            aria-current={i === step ? 'step' : undefined}
          >
            <span>{i + 1}</span>
            {notes[note].name}
            {i < step && <Check aria-hidden="true" size={13} />}
          </li>
        ))}
      </ol>
      <div className="melody-pads" role="group" aria-label="Play notes">
        {notes.map((note, i) => (
          <button
            key={note.name}
            data-note={i}
            style={{ background: note.colour }}
            aria-label={'Play ' + note.name}
            disabled={done}
            onClick={() => {
              tone(i);
              if (sequence[step] === i) {
                setStep((n) => n + 1);
                setMessage(
                  step + 1 === sequence.length
                    ? 'Lovely. This melody is complete.'
                    : `${note.name}. Next, ${notes[sequence[step + 1]].name}.`,
                );
              } else setMessage(`Try ${notes[sequence[step]].name} next. No need to start over.`);
            }}
          >
            <Music2 aria-hidden="true" size={25} />
            <strong>{note.name}</strong>
          </button>
        ))}
      </div>
      <p className="room-game-status" role="status" aria-atomic="true">
        {message || 'The pattern stays here while you play.'}
      </p>
      {complete ? (
        <>
          <h3 className="game-complete-title">Your little mixtape.</h3>
          <button className="button primary" ref={next} onClick={onFinish}>
            Back to room
          </button>
          <button className="button ghost" onClick={onReplay}>
            Make another
          </button>
        </>
      ) : done ? (
        <button
          className="button primary"
          ref={next}
          onClick={() => {
            setRound((n) => n + 1);
            setStep(0);
            setMessage('A new melody. Start with ' + notes[melodies[round + 1][0]].name + '.');
            requestAnimationFrame(() =>
              document
                .querySelector<HTMLButtonElement>('[data-note="' + melodies[round + 1][0] + '"]')
                ?.focus(),
            );
          }}
        >
          Next melody
        </button>
      ) : null}
    </div>
  );
}
