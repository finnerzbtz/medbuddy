import { registerPlugin } from '@capacitor/core';
import { isNative } from './platform';

const playback = registerPlugin<{
  prepareAudioPlayback(): Promise<void>;
}>('ReminduhDevice');

/** Playback uses no microphone permission. Invoke only after an audio gesture. */
export async function prepareAudioPlayback() {
  if (isNative) await playback.prepareAudioPlayback();
}
