import { useCallback, useEffect, useMemo, useState } from 'react';
import { stopBlobbySpeech, useBlobbySpeech } from '@/audio/BlobbySpeech';
import { useThoughtNarration } from './useThoughtNarration';
import { thoughtsForDay } from '@/domain/wisdom';
import { useThoughtRotation } from './useThoughtRotation';
import { useAppStore } from '@/stores/appStore';
import './blobby-wisdom.css';

export default function BlobbyWisdom({
  suspended = false,
  message,
  fallback,
}: {
  suspended?: boolean;
  message?: string;
  fallback: string;
}) {
  const voice = useAppStore((s) => s.data.voice);
  const playback = useBlobbySpeech();
  const name = useAppStore((s) => s.data.profile.petName);
  const visible = useAppStore((s) => s.data.preferences.showWisdom);
  const [day] = useState(() => new Date());
  const [step, setStep] = useState(0);
  const [readingText, setReadingText] = useState(false);
  const deck = useMemo(() => thoughtsForDay(day, 'all'), [day]);
  const thought = deck[step % deck.length];
  const narration = useThoughtNarration(thought.id, voice, visible, suspended || !!message);
  const advance = useCallback(() => setStep((value) => value + 1), []);
  useThoughtRotation(
    thought.id,
    narration.active && !readingText && !['loading', 'playing'].includes(playback.status),
    advance,
  );
  useEffect(() => () => stopBlobbySpeech(), [thought.id, visible, voice, suspended]);
  return (
    <div
      className="blobby-speech blobby-wisdom"
      hidden={suspended}
      onFocusCapture={() => setReadingText(true)}
      onBlurCapture={() => setReadingText(false)}
    >
      <div
        ref={narration.ref}
        className="wisdom-message"
        aria-live={message || !narration.narrates ? 'polite' : 'off'}
        aria-atomic="true"
        data-thought-id={!message && visible ? thought.id : undefined}
      >
        <span className="visually-hidden">{name} says: </span>
        {message || !visible ? (
          <p>{message || fallback}</p>
        ) : thought.kind === 'quote' ? (
          <figure>
            <blockquote>
              <p>“{thought.text}”</p>
            </blockquote>
            <figcaption>
              — {thought.author}
              <cite className="visually-hidden">, {thought.work}</cite>
            </figcaption>
          </figure>
        ) : (
          <p>{thought.text}</p>
        )}
      </div>
      {playback.clip === voice + '/' + thought.id && playback.error && (
        <span className="visually-hidden" role="status">
          {playback.error}
        </span>
      )}
    </div>
  );
}
