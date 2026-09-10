import { create } from 'zustand';
import { appAudio } from './AppAudio';
import { VOICE_ASSETS } from '@/generated/voices';
import type { BlobbyVoice } from '@/domain/voices';

type Playback = {
  clip: string | null;
  status: 'idle' | 'loading' | 'playing' | 'error';
  error: string;
  automatic: boolean;
};
const idle: Playback = { clip: null, status: 'idle', error: '', automatic: false };
export const useBlobbySpeech = create<Playback>(() => idle);
let revision = 0;
export function stopBlobbySpeech() {
  revision++;
  appAudio.stopSpeech();
  useBlobbySpeech.setState(idle);
}
export async function speakBlobby(
  voice: BlobbyVoice,
  line: string,
  { automatic = false }: { automatic?: boolean } = {},
) {
  if (automatic && !appAudio.canAutoSpeak()) return;
  stopBlobbySpeech();
  if (voice === 'quiet') return;
  const current = ++revision;
  const clip = voice + '/' + line;
  const url = VOICE_ASSETS[clip];
  if (!url) {
    useBlobbySpeech.setState({
      clip,
      status: 'error',
      error: 'This voice recording isn’t available yet.',
      automatic,
    });
    return;
  }
  useBlobbySpeech.setState({ clip, status: 'loading', error: '', automatic });
  try {
    const started = await appAudio.playSpeech(
      url,
      () => {
        if (revision === current) useBlobbySpeech.setState(idle);
      },
      automatic,
    );
    if (revision === current)
      useBlobbySpeech.setState(started ? { clip, status: 'playing', error: '', automatic } : idle);
  } catch {
    if (revision === current)
      useBlobbySpeech.setState({
        clip,
        status: 'error',
        error: 'The voice couldn’t play. Please try again.',
        automatic,
      });
  }
}
