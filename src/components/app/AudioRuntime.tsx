import { isNative } from '@/native/platform';
import { stopBlobbySpeech } from '@/audio/BlobbySpeech';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { appAudio } from '@/audio/AppAudio';
import { useAppStore } from '@/stores/appStore';

export default function AudioRuntime() {
  const location = useLocation();
  useEffect(() => {
    stopBlobbySpeech();
    appAudio.setEnvironment(['/studio', '/welcome'].includes(location.pathname) ? 'other' : 'room');
  }, [location.pathname]);
  useEffect(() => {
    appAudio.setHidden(document.hidden);
    const visibility = () => appAudio.setHidden(document.hidden);
    const blur = () => {
      if (!isNative) appAudio.setHidden(true);
    };
    const focus = () => appAudio.setHidden(false);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    const resume = () => appAudio.resumeFromGesture();
    window.addEventListener('pointerdown', resume, { capture: true, passive: true });
    window.addEventListener('keydown', resume, true);
    const unsubscribe = useAppStore.subscribe((next, before) => {
      if (next.data.voice !== before.data.voice || next.reactionId !== before.reactionId)
        stopBlobbySpeech();
      if (next.celebration && next.celebration.id !== before.celebration?.id)
        appAudio.cue('checkin');
      if (next.data.preferences.lampOn !== before.data.preferences.lampOn) appAudio.cue('lamp');
      if (next.data.outfit !== before.data.outfit) appAudio.cue('cloth');
      if (next.data.market.orders.length > before.data.market.orders.length)
        appAudio.cue('purchase');
      else if (JSON.stringify(next.data.room) !== JSON.stringify(before.data.room))
        appAudio.cue('place');
      if (next.data.preferences.staticScene && next.reactionId !== before.reactionId) {
        if (next.currentAnimation === 'feeding') appAudio.cue('bite');
        if (next.currentAnimation === 'petting') appAudio.cue('cuddle');
        if (next.currentAnimation === 'dance') appAudio.cue('delight');
      }
    });
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
      window.removeEventListener('pointerdown', resume, true);
      window.removeEventListener('keydown', resume, true);
      appAudio.setHidden(true);
    };
  }, []);
  return null;
}
