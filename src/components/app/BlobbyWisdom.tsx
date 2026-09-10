import { useCallback, useEffect, useMemo, useState } from 'react';
import { stopBlobbySpeech, useBlobbySpeech } from '@/audio/BlobbySpeech';
import VoicePickerButton from './VoicePicker';
import { useThoughtNarration } from './useThoughtNarration';
import { ExternalLink, MessageCircle, Volume2, VolumeX, X } from 'lucide-react';
import { enableSound, setSoundSettings, useSoundSettings } from '@/audio/AppAudio';
import { thoughtsForDay } from '@/domain/wisdom';
import { useThoughtRotation } from './useThoughtRotation';
import { useAppStore } from '@/stores/appStore';
import './blobby-wisdom.css';

export default function BlobbyWisdom({ suspended = false }: { suspended?: boolean }) {
  const voice = useAppStore((s) => s.data.voice);
  const playback = useBlobbySpeech();
  const name = useAppStore((s) => s.data.profile.petName);
  const visible = useAppStore((s) => s.data.preferences.showWisdom);
  const [day] = useState(() => new Date());
  const [step, setStep] = useState(0);
  const [readingText, setReadingText] = useState(false);
  const sound = useSoundSettings();
  const muted =
    !sound.readThoughts || !sound.enabled || sound.voiceVolume === 0 || voice === 'quiet';
  const deck = useMemo(() => thoughtsForDay(day, 'all'), [day]);
  const thought = deck[step % deck.length];
  const narration = useThoughtNarration(thought.id, voice, visible, suspended);
  const advance = useCallback(() => setStep((value) => value + 1), []);
  useThoughtRotation(
    thought.id,
    narration.active && !readingText && !['loading', 'playing'].includes(playback.status),
    advance,
  );
  const toggleMute = async () => {
    if (!muted) {
      setSoundSettings({ readThoughts: false });
      stopBlobbySpeech();
      return;
    }
    if (voice === 'quiet') {
      const result = useAppStore.getState().setVoice('cloud');
      if (!result.ok) {
        useAppStore.getState().showToast(result.error!);
        return;
      }
    }
    try {
      await enableSound({ readThoughts: true, voiceVolume: sound.voiceVolume || 0.7 });
      // An explicit unmute also resumes the current bubble after a master mute.
      narration.readCurrent();
    } catch {
      useAppStore.getState().showToast('Sound couldn’t start. Please try unmuting again.');
    }
  };
  useEffect(() => () => stopBlobbySpeech(), [thought.id, visible, voice, suspended]);
  return (
    <div
      className={'blobby-wisdom' + (visible ? '' : ' is-collapsed')}
      role="region"
      aria-label="Little thoughts"
      hidden={suspended}
    >
      <div className="wisdom-bubble">
        <button
          type="button"
          className="wisdom-toggle"
          aria-label={visible ? 'Hide little thoughts' : 'Show little thoughts'}
          aria-expanded={visible}
          aria-controls="little-thoughts-content"
          onClick={() => {
            const result = useAppStore.getState().setPreference('showWisdom', !visible);
            if (!result.ok) useAppStore.getState().showToast(result.error!);
          }}
        >
          {visible ? (
            <X size={16} aria-hidden="true" />
          ) : (
            <>
              <MessageCircle size={17} aria-hidden="true" />
              Little thoughts
            </>
          )}
        </button>
        <div id="little-thoughts-content" hidden={!visible}>
          <div
            ref={narration.ref}
            className="wisdom-message"
            onFocusCapture={() => setReadingText(true)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setReadingText(false);
            }}
            aria-live={narration.narrates ? 'off' : 'polite'}
            aria-atomic="true"
            data-thought-id={thought.id}
          >
            <span className="visually-hidden">{name} says: </span>
            {thought.kind === 'quote' ? (
              <figure>
                <blockquote>
                  <p>“{thought.text}”</p>
                </blockquote>
                <figcaption>
                  <strong>{thought.author}</strong>
                  <cite className="visually-hidden">{thought.work}</cite>
                  <a
                    href={thought.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="wisdom-source"
                    title={thought.work}
                  >
                    Source
                    <ExternalLink size={12} aria-hidden="true" />
                    <span className="visually-hidden"> for this quote (opens in a new tab)</span>
                  </a>
                </figcaption>
              </figure>
            ) : (
              <p>{thought.text}</p>
            )}
          </div>
        </div>
      </div>
      <div className="wisdom-controls" hidden={!visible}>
        <VoicePickerButton />
        <button
          type="button"
          className="wisdom-mute"
          aria-label={muted ? 'Unmute Blobby' : 'Mute Blobby'}
          onClick={() => void toggleMute()}
        >
          {muted ? (
            <VolumeX size={16} aria-hidden="true" />
          ) : (
            <Volume2 size={16} aria-hidden="true" />
          )}
          {muted ? 'Unmute' : 'Mute'}
        </button>
      </div>
      <p className="wisdom-voice-status" role="status" hidden={!visible}>
        {playback.clip === voice + '/' + thought.id
          ? playback.error || (playback.status === 'loading' ? 'Loading voice…' : '')
          : ''}
      </p>
    </div>
  );
}
