import type { SoundCue } from './AppAudio';
import { WALK_HOPS_PER_SECOND } from '@/domain/choreography';
import type { AnimationName } from '@/types';
const cues: Partial<Record<AnimationName, [number, SoundCue][]>> = {
  tea: [
    [1.15, 'cup'],
    [3.1, 'sip'],
    [4.4, 'sip'],
    [6.85, 'cup'],
  ],
  feeding: [
    [1.55, 'bite'],
    [2.8, 'bite'],
    [4.2, 'delight'],
  ],
  petting: [[0.25, 'cuddle']],
  dance: [
    [0.35, 'bounce'],
    [1.1, 'bounce'],
    [1.85, 'bounce'],
  ],
  ball: [
    [0.35, 'bounce'],
    [1.3, 'bounce'],
    [2.3, 'bounce'],
  ],
  rest: [[0.7, 'sleep']],
  happy: [[0.4, 'delight']],
  wave: [[0.35, 'cloth']],
};
/** Read the actual animation clock, so a paused/hidden scene never runs sound ahead. */
export class SceneSound {
  private key = '';
  private previous = -0.01;
  private position: [number, number] | null = null;
  private landing = -1;
  private travelTime = 0;
  constructor(private play: (cue: SoundCue, pan: number) => void) {}
  update(
    animation: AnimationName,
    phase: string,
    time: number,
    x: number,
    z: number,
    travelTime = time,
  ) {
    const key = animation + phase;
    if (key !== this.key || time < this.previous) {
      this.previous = -0.01;
      this.landing = -1;
      this.position = null;
    }
    const pan = Math.max(-0.65, Math.min(0.65, x / 3));
    const landing = Math.floor(travelTime * WALK_HOPS_PER_SECOND);
    if (
      phase === 'travel' &&
      this.position &&
      this.landing >= 0 &&
      landing > this.landing &&
      travelTime - this.travelTime < 0.15 &&
      Math.hypot(x - this.position[0], z - this.position[1]) > 0.0005
    ) {
      // A single pat when the visible hop touches down, regardless of route speed.
      // Pauses, still poses and skipped frames never queue catch-up footsteps.
      this.play('step', pan);
    }
    this.landing = landing;
    this.travelTime = travelTime;
    if (phase === 'act')
      for (const [at, cue] of cues[animation] ?? []) {
        // Don't replay every earlier cue when reduced motion jumps to a still pose.
        if (at > this.previous && at <= time && time - at < 0.15) this.play(cue, pan);
      }
    this.position = [x, z];
    this.key = key;
    this.previous = time;
  }
}
