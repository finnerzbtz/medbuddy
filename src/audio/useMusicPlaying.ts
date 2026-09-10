import { useRadioPlayback, useSoundSettings } from './AppAudio';
import { useRecordPlayer } from './RecordPlayerAudio';

/** Visuals follow actual playback, including loading, master mute and silent volume. */
export function useMusicPlaying() {
  const radio = useRadioPlayback((s) => s.playing);
  const personal = useRecordPlayer((s) => s.source !== 'radio' && s.playing);
  const audible = useSoundSettings((s) => s.enabled && s.musicVolume > 0);
  return audible && (radio || personal);
}
