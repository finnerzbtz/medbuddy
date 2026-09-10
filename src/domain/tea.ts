import motion from './tea-motion.json';
export const TEA = motion;
export const smooth = (v: number) => {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
};
export function teaPose(time: number) {
  const keys = TEA.keys;
  const index = keys.findIndex((k) => k.time >= time);
  const b = keys[index < 0 ? keys.length - 1 : index];
  const a = keys[Math.max(0, (index < 0 ? keys.length - 1 : index) - 1)];
  const u = a === b ? 0 : smooth((time - a.time) / (b.time - a.time));
  const mix = (from: number, to: number) => from + (to - from) * u;
  return {
    cup: a.cup.map((v, i) => mix(v, b.cup[i])) as [number, number, number],
    pitch: mix(a.pitch, b.pitch),
    yaw: mix(a.yaw, b.yaw),
    reach: mix(a.reach, b.reach),
    bend: mix(a.bend, b.bend),
    eyes: mix(a.eyes, b.eyes),
    head: mix(a.head, b.head),
  };
}
export function teaCloseup(time: number) {
  return smooth((time - 1.35) / 0.65) * (1 - smooth((time - 6.1) / 1));
}
