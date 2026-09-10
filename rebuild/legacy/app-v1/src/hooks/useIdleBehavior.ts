import { useRef, useCallback } from 'react';
import type { PetMood } from '@/types';

/**
 * Idle behavior state machine.
 *
 * Gives Blobby unpredictable micro-behaviors when the user isn't interacting.
 * These random actions make the character feel autonomous and alive — the key
 * ingredient that makes people form emotional attachment (Finch, Tamagotchi, etc).
 *
 * Behaviors:
 * - Look around randomly, then look at camera (4th wall break)
 * - Yawn/stretch after long idle
 * - Random happy hops (when happy)
 * - Fidget/shift weight (bored)
 * - Droopy slow movements (sad)
 * - Occasional surprise reactions
 */

export type IdleBehavior =
  | 'none'           // No override, normal procedural animation
  | 'look_around'    // Head turns to random direction
  | 'look_at_camera' // Breaks 4th wall — looks right at user
  | 'yawn'           // Stretch/yawn movement
  | 'happy_hop'      // Quick little bounce
  | 'fidget'         // Shift weight side to side
  | 'perk_up'        // Sudden alert — ears up, looks around
  | 'settle_in'      // Nestle deeper into cushion
  | 'doze'           // Head slowly drops (sleepy);

interface IdleBehaviorState {
  current: IdleBehavior;
  timer: number;           // Time remaining in current behavior
  cooldown: number;        // Time until next behavior can trigger
  headTargetX: number;     // Override head rotation X
  headTargetY: number;     // Override head rotation Y
  bodyBounce: number;      // Y-position offset for hops
  bodyTilt: number;        // Z-rotation for fidgets
  active: boolean;         // Whether an idle behavior is overriding defaults
}

// Weighted random behavior pools per mood
const BEHAVIOR_POOLS: Record<PetMood, { behavior: IdleBehavior; weight: number; duration: number }[]> = {
  happy: [
    { behavior: 'look_around',    weight: 3, duration: 2.5 },
    { behavior: 'look_at_camera', weight: 4, duration: 1.5 },
    { behavior: 'happy_hop',      weight: 3, duration: 0.6 },
    { behavior: 'perk_up',        weight: 2, duration: 1.0 },
    { behavior: 'settle_in',      weight: 1, duration: 2.0 },
  ],
  content: [
    { behavior: 'look_around',    weight: 3, duration: 3.0 },
    { behavior: 'look_at_camera', weight: 3, duration: 2.0 },
    { behavior: 'settle_in',      weight: 3, duration: 2.5 },
    { behavior: 'yawn',           weight: 2, duration: 2.0 },
    { behavior: 'perk_up',        weight: 1, duration: 1.0 },
  ],
  bored: [
    { behavior: 'look_around',    weight: 2, duration: 3.0 },
    { behavior: 'look_at_camera', weight: 4, duration: 2.5 }, // More camera looks when bored (guilt)
    { behavior: 'fidget',         weight: 3, duration: 2.0 },
    { behavior: 'yawn',           weight: 3, duration: 2.5 },
    { behavior: 'doze',           weight: 1, duration: 3.0 },
  ],
  sad: [
    { behavior: 'look_at_camera', weight: 5, duration: 3.0 }, // Big sad eyes at camera
    { behavior: 'look_around',    weight: 1, duration: 2.0 },
    { behavior: 'doze',           weight: 3, duration: 4.0 },
    { behavior: 'settle_in',      weight: 2, duration: 2.5 },
  ],
  sick: [
    { behavior: 'doze',           weight: 5, duration: 4.0 },
    { behavior: 'look_at_camera', weight: 3, duration: 2.0 },
    { behavior: 'fidget',         weight: 1, duration: 1.5 },
  ],
  critical: [
    { behavior: 'doze',           weight: 4, duration: 5.0 },
    { behavior: 'look_at_camera', weight: 5, duration: 3.0 },
    { behavior: 'fidget',         weight: 1, duration: 1.0 },
  ],
};

// Cooldown range between behaviors (seconds)
const COOLDOWN_RANGE: Record<PetMood, [number, number]> = {
  happy:   [3, 7],    // Frequent behaviors when happy
  content: [5, 10],
  bored:   [4, 8],
  sad:     [6, 12],
  sick:    [8, 15],   // Rare behaviors when sick
  critical:[10, 20],
};

function weightedRandom<T extends { weight: number }>(items: T[]): T {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;
  for (const item of items) {
    random -= item.weight;
    if (random <= 0) return item;
  }
  return items[items.length - 1];
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function useIdleBehavior(mood: PetMood) {
  const stateRef = useRef<IdleBehaviorState>({
    current: 'none',
    timer: 0,
    cooldown: randomRange(3, 6),
    headTargetX: 0,
    headTargetY: 0,
    bodyBounce: 0,
    bodyTilt: 0,
    active: false,
  });

  const update = useCallback((delta: number): IdleBehaviorState => {
    const state = stateRef.current;
    const clampedDelta = Math.min(delta, 0.05);

    if (state.current !== 'none') {
      // Currently in a behavior — update it
      state.timer -= clampedDelta;

      const progress = 1 - Math.max(0, state.timer) / getMaxDuration(state.current, mood);

      // Animate behavior parameters based on progress
      switch (state.current) {
        case 'look_around': {
          // Smooth ease-in/out head turn
          const t = Math.sin(progress * Math.PI);
          state.headTargetY = state.headTargetY * (1 - clampedDelta) + (t * 0.4 * Math.sign(state.headTargetY || 1)) * clampedDelta * 3;
          state.headTargetX = Math.sin(progress * Math.PI * 2) * 0.1;
          break;
        }
        case 'look_at_camera': {
          // Turn to face camera (NDC 0,0 = center)
          const easeIn = Math.min(progress * 3, 1);
          state.headTargetY = 0 * easeIn; // Center = camera
          state.headTargetX = 0;
          break;
        }
        case 'happy_hop': {
          // Quick arc bounce
          state.bodyBounce = Math.sin(progress * Math.PI) * 0.15;
          break;
        }
        case 'yawn': {
          // Head tilts back slightly, then forward
          const t = Math.sin(progress * Math.PI);
          state.headTargetX = -t * 0.2;
          state.bodyTilt = Math.sin(progress * Math.PI * 0.5) * 0.03;
          break;
        }
        case 'fidget': {
          // Weight shift side to side
          state.bodyTilt = Math.sin(progress * Math.PI * 2) * 0.04;
          state.headTargetY = Math.sin(progress * Math.PI * 2) * 0.15;
          break;
        }
        case 'perk_up': {
          // Quick look up and around
          const t = Math.sin(progress * Math.PI);
          state.headTargetX = -t * 0.15;
          state.headTargetY = Math.sin(progress * Math.PI * 3) * 0.25;
          state.bodyBounce = t * 0.05;
          break;
        }
        case 'settle_in': {
          // Sink slightly, head dips
          const t = Math.sin(progress * Math.PI);
          state.bodyBounce = -t * 0.03;
          state.headTargetX = t * 0.05;
          break;
        }
        case 'doze': {
          // Head slowly drops forward
          const t = Math.sin(progress * Math.PI * 0.5);
          state.headTargetX = t * 0.2;
          state.bodyTilt = t * 0.02;
          break;
        }
      }

      if (state.timer <= 0) {
        // Behavior finished — reset and enter cooldown
        state.current = 'none';
        state.active = false;
        state.bodyBounce = 0;
        state.bodyTilt = 0;
        state.headTargetX = 0;
        state.headTargetY = 0;
        const [min, max] = COOLDOWN_RANGE[mood] ?? [5, 10];
        state.cooldown = randomRange(min, max);
      }
    } else {
      // In cooldown — count down
      state.cooldown -= clampedDelta;

      if (state.cooldown <= 0) {
        // Pick a new random behavior
        const pool = BEHAVIOR_POOLS[mood] ?? BEHAVIOR_POOLS.content;
        const pick = weightedRandom(pool);
        state.current = pick.behavior;
        state.timer = pick.duration;
        state.active = true;

        // Initialize direction for look_around
        if (pick.behavior === 'look_around') {
          state.headTargetY = Math.random() > 0.5 ? 0.3 : -0.3;
        }
      }
    }

    return state;
  }, [mood]);

  return { stateRef, update };
}

function getMaxDuration(behavior: IdleBehavior, mood: PetMood): number {
  const pool = BEHAVIOR_POOLS[mood] ?? BEHAVIOR_POOLS.content;
  const entry = pool.find((b) => b.behavior === behavior);
  return entry?.duration ?? 2;
}
