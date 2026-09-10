import { useEffect, useRef, useState } from 'react';
import { appAudio, useSoundSettings } from '@/audio/AppAudio';
import { speakBlobby, stopBlobbySpeech, useBlobbySpeech } from '@/audio/BlobbySpeech';
import type { BlobbyVoice } from '@/domain/voices';

/** Read a visible bubble once. Never queue speech behind a game, dialog or muted mixer. */
export function useThoughtNarration(
  id: string,
  voice: BlobbyVoice,
  visible: boolean,
  suspended: boolean,
) {
  const ref = useRef<HTMLDivElement>(null);
  const handled = useRef<string | null>(null);
  const readThoughts = useSoundSettings((s) => s.readThoughts);
  const audible = useSoundSettings((s) => s.enabled && s.voiceVolume > 0);
  const [inView, setInView] = useState(false);
  const [foreground, setForeground] = useState(() => !document.hidden && document.hasFocus());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [request, setRequest] = useState(0);
  const key = voice + '/' + id;

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio >= 0.25),
      { threshold: [0, 0.25] },
    );
    if (ref.current) observer.observe(ref.current);
    const updateDialogs = () => setDialogOpen(!!document.querySelector('dialog[open]'));
    const dialogs = new MutationObserver(updateDialogs);
    dialogs.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open'],
    });
    updateDialogs();
    const blur = () => setForeground(false);
    const focus = () => setForeground(!document.hidden);
    const visibility = () => setForeground(!document.hidden && document.hasFocus());
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      observer.disconnect();
      dialogs.disconnect();
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  useEffect(() => {
    handled.current = null;
    // Any playback of this bubble counts as reading it; never restart it on focus return.
    const remember = () => {
      const speech = useBlobbySpeech.getState();
      if (speech.clip === key && ['loading', 'playing'].includes(speech.status))
        handled.current = key;
    };
    remember();
    return useBlobbySpeech.subscribe(remember);
  }, [key, visible, readThoughts]);

  useEffect(() => {
    const stopThisReading = () => {
      const speech = useBlobbySpeech.getState();
      if (speech.automatic && speech.clip === key) stopBlobbySpeech();
    };
    if (
      !readThoughts ||
      !audible ||
      voice === 'quiet' ||
      !visible ||
      suspended ||
      !inView ||
      !foreground ||
      dialogOpen
    ) {
      stopThisReading();
      return;
    }
    const timer = window.setTimeout(() => {
      if (
        handled.current === key ||
        !appAudio.canAutoSpeak() ||
        document.querySelector('dialog[open]')
      )
        return;
      const speech = useBlobbySpeech.getState();
      if (['loading', 'playing'].includes(speech.status)) return;
      handled.current = key;
      void speakBlobby(voice, id, { automatic: true });
    }, 220);
    return () => {
      window.clearTimeout(timer);
      stopThisReading();
    };
  }, [
    key,
    id,
    voice,
    readThoughts,
    audible,
    visible,
    suspended,
    inView,
    foreground,
    dialogOpen,
    request,
  ]);

  return {
    ref,
    readCurrent: () => {
      handled.current = null;
      setRequest((value) => value + 1);
    },
    active: visible && !suspended && inView && foreground && !dialogOpen,
    narrates: readThoughts && audible && voice !== 'quiet',
  };
}
