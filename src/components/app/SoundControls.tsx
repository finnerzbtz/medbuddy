import { speakBlobby } from '@/audio/BlobbySpeech';
import { Link } from 'react-router-dom';
import { VoicePreferences } from './VoicePicker';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Music2, Volume2, VolumeX, X } from 'lucide-react';
import { enableSound, setSoundSettings, useSoundSettings } from '@/audio/AppAudio';
import './sound-controls.css';

export function MusicButton() {
  const settings = useSoundSettings(),
    [error, setError] = useState('');
  const on = settings.enabled && settings.music;
  return (
    <>
      <button
        className="button music-toggle"
        aria-pressed={on}
        onClick={async () => {
          setError('');
          if (on) setSoundSettings({ music: false });
          else
            try {
              await enableSound({ music: true });
            } catch {
              setError('Music could not start. Try again.');
            }
        }}
      >
        <Music2 size={18} aria-hidden="true" />
        Music {on ? 'on' : 'off'}
      </button>
      {error && <span role="status">{error}</span>}
    </>
  );
}

export function SoundPreferences() {
  const settings = useSoundSettings(),
    [error, setError] = useState('');
  return (
    <div className="sound-preferences">
      <label className="toggle-row">
        <span>
          <strong>Enable audio</strong>
        </span>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={async (e) => {
            setError('');
            if (!e.target.checked) setSoundSettings({ enabled: false });
            else
              try {
                await enableSound();
              } catch {
                setError('Audio could not start. Try again.');
              }
          }}
        />
      </label>
      {(['music', 'effects'] as const).map((key) => (
        <div className="sound-channel" key={key}>
          <label className="toggle-row">
            <strong>{key === 'music' ? 'Background music' : 'Sound effects'}</strong>
            <input
              type="checkbox"
              checked={settings.enabled && settings[key]}
              onChange={async (e) => {
                setError('');
                if (!e.target.checked) setSoundSettings({ [key]: false });
                else
                  try {
                    await enableSound({ [key]: true });
                  } catch {
                    setError('Audio could not start. Try again.');
                  }
              }}
            />
          </label>
          <label className="sound-volume">
            {key === 'music' ? 'Music volume' : 'Effects volume'}
            <input
              aria-label={key === 'music' ? 'Music volume' : 'Effects volume'}
              type="range"
              min="0"
              max="100"
              value={Math.round(settings[key === 'music' ? 'musicVolume' : 'effectsVolume'] * 100)}
              onChange={(e) =>
                setSoundSettings({
                  [key === 'music' ? 'musicVolume' : 'effectsVolume']: Number(e.target.value) / 100,
                })
              }
            />
            <span>
              {Math.round(settings[key === 'music' ? 'musicVolume' : 'effectsVolume'] * 100)}%
            </span>
          </label>
        </div>
      ))}
      <Link
        to="/music"
        className="button secondary"
        onClick={() => window.dispatchEvent(new Event('open-record-player'))}
      >
        <Music2 size={18} />
        Open record player
      </Link>
      <VoicePreferences />
      <button
        className="button secondary"
        onClick={async () => {
          setError('');
          try {
            await enableSound();
            await speakBlobby('cloud', 'familiar');
          } catch {
            setError('Sound could not start. Check your connected headphones and try again.');
          }
        }}
      >
        Test sound
      </button>
      <span role="status">{error}</span>
    </div>
  );
}
function SoundDialog({ close }: { close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement,
      dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    window.addEventListener('open-record-player', close);
    return () => window.removeEventListener('open-record-player', close);
  }, [close]);
  return createPortal(
    <dialog ref={ref} className="app-dialog sound-dialog" aria-labelledby={id} onCancel={close}>
      <div className="dialog-heading">
        <h2 id={id}>Sound</h2>
        <button className="icon-button" aria-label="Close sound settings" onClick={close}>
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <SoundPreferences />
    </dialog>,
    document.body,
  );
}
export default function SoundControls() {
  const [open, setOpen] = useState(false),
    enabled = useSoundSettings((s) => s.enabled);
  return (
    <>
      <button
        className="icon-button"
        aria-label="Sound settings"
        title="Sound settings"
        onClick={() => setOpen(true)}
      >
        {enabled ? (
          <Volume2 size={19} aria-hidden="true" />
        ) : (
          <VolumeX size={19} aria-hidden="true" />
        )}
      </button>
      {open && <SoundDialog close={() => setOpen(false)} />}
    </>
  );
}
