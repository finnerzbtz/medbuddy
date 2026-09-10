import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Play, Square, Volume2, X } from 'lucide-react';
import { BLOBBY_VOICES, VOICE_SAMPLE, voiceName } from '@/domain/voices';
import { useAppStore } from '@/stores/appStore';
import { setSoundSettings, useSoundSettings } from '@/audio/AppAudio';
import { speakBlobby, stopBlobbySpeech, useBlobbySpeech } from '@/audio/BlobbySpeech';
import './voice-picker.css';

export function VoicePreferences() {
  const voice = useAppStore((s) => s.data.voice);
  const name = useAppStore((s) => s.data.profile.petName);
  const volume = useSoundSettings((s) => s.voiceVolume);
  const readThoughts = useSoundSettings((s) => s.readThoughts);
  const playback = useBlobbySpeech();
  const id = useId();
  useEffect(() => () => stopBlobbySpeech(), []);
  const choices = [
    ...BLOBBY_VOICES,
    { id: 'quiet' as const, name: 'Quiet', description: 'Just the words on screen' },
  ];
  return (
    <div className="voice-preferences">
      <fieldset className="voice-choices">
        <legend>{name}’s voice</legend>
        {choices.map((choice) => {
          const playing =
            playback.clip === choice.id + '/preview' &&
            ['loading', 'playing'].includes(playback.status);
          return (
            <div className="voice-choice" key={choice.id} data-selected={voice === choice.id}>
              <label>
                <input
                  type="radio"
                  name={id}
                  value={choice.id}
                  checked={voice === choice.id}
                  onChange={() => {
                    const result = useAppStore.getState().setVoice(choice.id);
                    if (!result.ok) useAppStore.getState().showToast(result.error!);
                    else stopBlobbySpeech();
                  }}
                />
                <span>
                  <strong>{choice.name}</strong>
                  <small>{choice.description}</small>
                </span>
              </label>
              {choice.id !== 'quiet' && (
                <button
                  type="button"
                  className="voice-sample"
                  aria-label={(playing ? 'Stop ' : 'Preview ') + choice.name + ' voice'}
                  onClick={() =>
                    playing ? stopBlobbySpeech() : void speakBlobby(choice.id, 'preview')
                  }
                >
                  {playing ? (
                    <Square size={16} aria-hidden="true" />
                  ) : (
                    <Play size={16} aria-hidden="true" />
                  )}
                  {playing ? 'Stop' : 'Preview'}
                </button>
              )}
            </div>
          );
        })}
      </fieldset>
      <label className="sound-volume voice-volume">
        Voice volume
        <input
          aria-label="Voice volume"
          type="range"
          min="0"
          max="100"
          value={Math.round(volume * 100)}
          onChange={(e) => setSoundSettings({ voiceVolume: Number(e.target.value) / 100 })}
        />
        <span>{Math.round(volume * 100)}%</span>
      </label>
      <label className="toggle-row voice-auto-read">
        <strong>Read thoughts aloud</strong>
        <input
          type="checkbox"
          checked={readThoughts}
          onChange={(event) => {
            setSoundSettings({ readThoughts: event.target.checked });
            if (!event.target.checked && useBlobbySpeech.getState().automatic) stopBlobbySpeech();
          }}
        />
      </label>
      <p className="voice-hint">
        {readThoughts
          ? `Once sound is on, ${name} reads each new bubble. Quiet keeps just the words.`
          : 'Thoughts are muted. Use Unmute beneath the bubble to hear them again.'}
      </p>
      <details className="voice-transcript">
        <summary>Preview words</summary>
        <p>{VOICE_SAMPLE}</p>
      </details>
      <p className="voice-feedback" role="status">
        {playback.clip?.endsWith('/preview')
          ? playback.error || (playback.status === 'loading' ? 'Loading voice…' : '')
          : ''}
      </p>
    </div>
  );
}

function VoiceDialog({ close }: { close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const dialog = ref.current!;
    stopBlobbySpeech();
    dialog.showModal();
    return () => {
      stopBlobbySpeech();
      dialog.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <dialog ref={ref} className="app-dialog voice-dialog" aria-labelledby={id} onCancel={close}>
      <div className="dialog-heading">
        <h2 id={id}>Choose a voice</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close voice choices"
          onClick={close}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <VoicePreferences />
    </dialog>,
    document.body,
  );
}
export default function VoicePickerButton() {
  const voice = useAppStore((s) => s.data.voice);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="voice-picker-button"
        aria-label={'Choose voice: ' + voiceName(voice)}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Volume2 size={16} aria-hidden="true" />
        {voiceName(voice)}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && <VoiceDialog close={() => setOpen(false)} />}
    </>
  );
}
