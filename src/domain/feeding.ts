import motion from './feeding-motion.json';
export const FEED = motion;
export function feedingPose(time: number) {
  const b = motion.keys.find((k) => k.time >= time) ?? motion.keys.at(-1)!;
  const a = motion.keys[Math.max(0, motion.keys.indexOf(b) - 1)];
  const u = a === b ? 0 : Math.max(0, Math.min(1, (time - a.time) / (b.time - a.time)));
  const t = u * u * (3 - 2 * u);
  return {
    food: a.food.map((v, i) => v + (b.food[i] - v) * t),
    reach: a.reach + (b.reach - a.reach) * t,
  };
}
export interface FeedTarget {
  x: number;
  y: number;
  width: number;
  height: number;
}
