import { FEED } from './feeding';
import { TEA, teaPose } from './tea';
import { assetContract } from '../generated/assets';
import type { AnimationName } from '../types/index';
// Shared by the visible hop and its landing sound.
export const WALK_HOPS_PER_SECOND = 2.6;
export type Point3 = [number, number, number];
export const PLACES = {
  cushion: [...assetContract.anchors.pet] as Point3,
  front: [1.07, 0.015, 1.5],
  tea: [...TEA.place] as Point3,
  right: [1.82, 0.015, 1.25],
  back: [0.05, 0.015, -0.38],
  aisle: [0.05, 0.015, 1.25],
  bed: [...assetContract.anchors.bed] as Point3,
  window: [0.42, 0.015, -0.87],
  garden: [-1.04, 0.015, -0.55],
} satisfies Record<string, Point3>;
type Place = keyof typeof PLACES;
const edges: [Place, Place][] = [
  ['cushion', 'front'],
  ['front', 'tea'],
  ['front', 'right'],
  ['front', 'aisle'],
  ['aisle', 'back'],
  ['back', 'bed'],
  ['back', 'window'],
  ['window', 'garden'],
];
const distance = (a: Point3, b: Point3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function route(start: Point3, end: Place): Point3[] {
  const nearest = (Object.keys(PLACES) as Place[]).sort(
    (a, b) => distance(start, PLACES[a]) - distance(start, PLACES[b]),
  )[0];
  const queue: Place[][] = [[nearest]],
    visited = new Set<Place>();
  while (queue.length) {
    const path = queue.shift()!,
      at = path.at(-1)!;
    if (at === end) return [start, ...path.map((key) => [...PLACES[key]] as Point3)];
    visited.add(at);
    for (const [a, b] of edges) {
      const next = a === at ? b : b === at ? a : undefined;
      if (next && !visited.has(next)) queue.push([...path, next]);
    }
  }
  return [start, [...PLACES[end]]];
}
export const ROOM_ACTIVITIES = [
  { id: 'tea', label: 'Tea break', group: 'Tea_table', code: 'tea' },
  { id: 'tend', label: 'Tend the bonsai', group: 'Bonsai', code: 'garden' },
  { id: 'window', label: 'Watch the window', group: 'Garden', code: 'window' },
  { id: 'ball', label: 'Play ball', group: 'Toy_ball', code: 'ball' },
] as const;
export const GROUP_PARENT: Record<string, string> = {
  Bonsai_leaves: 'Bonsai',
  Watering_can: 'Bonsai',
  Tea_cup: 'Tea_table',
  Bed_cover: 'Bed',
  Window_sun: 'Garden',
  Window_moon: 'Garden',
  Window_stars: 'Garden',
};
export function activityAvailable(clip: AnimationName, hidden: string[]): boolean {
  if (clip === 'rest') return !hidden.includes('Bed');
  const activity = ROOM_ACTIVITIES.find((a) => a.id === clip);
  return !activity || !hidden.includes(activity.group);
}
export function activityDuration(clip: AnimationName): number {
  if (clip === 'walk_to_cushion') return 14000;
  // Tea in still-image mode uses a timeout; interactive gardens own their completion.
  if (clip === 'tend') return 16000;
  if (clip === 'tea') return 14000;
  if (clip === 'feeding') return FEED.duration * 1000;
  if (['window', 'ball'].includes(clip)) return 10000;
  if (['happy', 'dance', 'celebrating'].includes(clip)) return 6500;
  return clip === 'rest' || clip === 'critical' ? 8000 : clip === 'idle' ? 4500 : 3600;
}
export const MOOD_LOOKS: Record<
  AnimationName,
  { body: string; light: string; sky: string; accent: string; effect: string }
> = {
  idle: {
    body: '#f0eee4',
    light: '#fff0d8',
    sky: '#8fb8b6',
    accent: '#a9bd82',
    effect: 'motes',
  },
  wave: {
    body: '#ffe6c2',
    light: '#ffe2b7',
    sky: '#a2c6ba',
    accent: '#f2bb83',
    effect: 'motes',
  },
  happy: {
    body: '#ffe4a2',
    light: '#ffe3a4',
    sky: '#accdb8',
    accent: '#e8b654',
    effect: 'petals',
  },
  celebrating: {
    body: '#ffd0ab',
    light: '#ffdfb5',
    sky: '#b6d1c2',
    accent: '#e7a56e',
    effect: 'confetti',
  },
  worried: {
    body: '#afc7e6',
    light: '#ccd9f4',
    sky: '#7c95ae',
    accent: '#809ebc',
    effect: 'rain',
  },
  sick: {
    body: '#b8cba2',
    light: '#dce3c5',
    sky: '#a1b8a8',
    accent: '#93ac7c',
    effect: 'poorly',
  },
  critical: {
    body: '#b6bddb',
    light: '#e1d8f5',
    sky: '#79839e',
    accent: '#a5a8d1',
    effect: 'blanket',
  },
  recovering: {
    body: '#e4edbd',
    light: '#ffebba',
    sky: '#b0cfb4',
    accent: '#99bd71',
    effect: 'petals',
  },
  walk_to_cushion: {
    body: '#eee2bd',
    light: '#ffedcd',
    sky: '#9ec5bd',
    accent: '#a9c8a2',
    effect: 'motes',
  },
  rest: {
    body: '#c7cde5',
    light: '#e4d9ee',
    sky: '#78819c',
    accent: '#b3b0d5',
    effect: 'sleep',
  },
  feeding: {
    body: '#f9d3ae',
    light: '#ffe0b4',
    sky: '#abc8b7',
    accent: '#e3a27c',
    effect: 'hearts',
  },
  petting: {
    body: '#efb8c8',
    light: '#ffdfdd',
    sky: '#c5b9ca',
    accent: '#da94af',
    effect: 'hearts',
  },
  dance: {
    body: '#d4b4ed',
    light: '#f0d7fa',
    sky: '#b3aecb',
    accent: '#bd92d1',
    effect: 'confetti',
  },
  curious: {
    body: '#eee7c5',
    light: '#f8eacb',
    sky: '#a0c6c3',
    accent: '#bec789',
    effect: 'motes',
  },
  stretch: {
    body: '#e9dcba',
    light: '#ffebce',
    sky: '#9abbb0',
    accent: '#bcb78b',
    effect: 'motes',
  },
  tea: {
    body: '#f4dbb6',
    light: '#ffe4bf',
    sky: '#b9c7b1',
    accent: '#d0ae7b',
    effect: 'tea',
  },
  tend: {
    body: '#d1e5b0',
    light: '#e9edbe',
    sky: '#a2c9b7',
    accent: '#a8c579',
    effect: 'garden',
  },
  ball: {
    body: '#f5d092',
    light: '#ffe2ac',
    sky: '#a9c8ba',
    accent: '#e8ad65',
    effect: 'confetti',
  },
  window: {
    body: '#c8deed',
    light: '#ddebf7',
    sky: '#a2c8d0',
    accent: '#abceca',
    effect: 'butterfly',
  },
};
interface Segment {
  from: Point3;
  to: Point3;
  seconds: number;
  animation: AnimationName;
  phase: 'travel' | 'act';
  face?: number;
}
export class RoomJourney {
  position: Point3 = [...PLACES.cushion];
  activity: AnimationName = 'idle';
  animation: AnimationName = 'idle';
  phase: 'travel' | 'act' = 'act';
  yaw = 0;
  elapsed = 0;
  actionTime = 0;
  duration = 0;
  squash = 1;
  lean = 0;
  segments: Segment[] = [];
  loop = false;
  private touring = false;
  setActivity(activity: AnimationName, still = false) {
    const waking = this.activity === 'rest' && this.phase === 'act' && activity !== 'rest';
    this.activity = activity;
    this.elapsed = 0;
    this.actionTime = 0;
    this.squash = 1;
    this.lean = 0;
    // An offered snack is eaten where Blobby is, without a detour to the tea table.
    if (activity === 'feeding') {
      this.touring = false;
      this.phase = 'act';
      this.animation = 'feeding';
      this.yaw = 0.35;
      this.actionTime = still ? FEED.stillTime : 0;
      this.segments = still
        ? []
        : [
            {
              from: [...this.position],
              to: [...this.position],
              seconds: FEED.duration,
              animation: 'feeding',
              phase: 'act',
              face: 0.35,
            },
          ];
      this.duration = FEED.duration;
      return;
    }
    const place: Place =
      activity === 'rest'
        ? 'bed'
        : activity === 'tea'
          ? 'tea'
          : activity === 'tend'
            ? 'garden'
            : activity === 'window'
              ? 'window'
              : ['ball', 'dance', 'celebrating', 'happy'].includes(activity)
                ? 'front'
                : 'cushion';
    const facing =
      activity === 'tea'
        ? Math.PI
        : place === 'tea'
          ? 0.05
          : place === 'garden'
            ? -0.6
            : place === 'window'
              ? 2.1
              : place === 'bed'
                ? 0
                : 0.12;
    this.touring = activity === 'walk_to_cushion';
    if (still) {
      this.position = [...PLACES[place]];
      this.actionTime = activity === 'tea' ? TEA.stillTime : 0;
      this.yaw = activity === 'tea' ? teaPose(this.actionTime).yaw : facing;
      this.phase = 'act';
      this.animation = activity;
      this.segments = [];
      return;
    }
    this.segments = [];
    let from: Point3 = [...this.position];
    const travel = (target: Place) => {
      const points = route(from, target);
      for (let i = 1; i < points.length; i++) {
        const length = distance(points[i - 1], points[i]);
        if (length < 1e-8) continue;
        this.segments.push({
          from: points[i - 1],
          to: points[i],
          seconds: Math.max(0.12, length / 2.4),
          animation:
            this.touring || ROOM_ACTIVITIES.some((a) => a.id === activity) || activity === 'rest'
              ? 'walk_to_cushion'
              : activity,
          phase: 'travel',
        });
      }
      from = [...PLACES[target]];
    };
    const hold = (animation: AnimationName, seconds: number, face: number) =>
      this.segments.push({
        from: [...from],
        to: [...from],
        seconds,
        animation,
        phase: 'act',
        face,
      });
    if (waking) hold('stretch', 0.9, 0);
    if (this.touring) {
      travel('window');
      hold('curious', 1.2, Math.PI);
      travel('garden');
      hold('curious', 1.2, -2.35);
      travel('front');
      hold('wave', 1.3, 0.15);
      travel('cushion');
    } else {
      travel(place);
      hold(
        activity,
        activity === 'rest'
          ? 86400
          : activity === 'tea'
            ? TEA.duration
            : activity === 'tend'
              ? 30
              : 4,
        facing,
      );
      // Gardening hands control to the cutscene at the plant. Its completion starts
      // a new journey home from this actual location, including after a long pause.
      if (place !== 'cushion' && !['tend', 'rest'].includes(activity)) {
        travel('cushion');
        hold('idle', 0.4, 0);
      }
    }
    this.duration = this.segments.reduce((n, s) => n + s.seconds, 0);
    this.sample(0);
  }
  update(dt: number) {
    if (!this.segments.length) return;
    this.elapsed += Math.max(0, Math.min(dt, 0.05));
    if (this.elapsed >= this.duration) {
      if (this.loop && this.activity !== 'rest') this.setActivity(this.activity);
      else this.elapsed = this.duration;
    }
    this.sample(this.elapsed);
  }
  private sample(time: number) {
    let previous = 0;
    for (const segment of this.segments) {
      if (time <= previous + segment.seconds) {
        const t = Math.min(1, (time - previous) / segment.seconds),
          ease = t * t * (3 - 2 * t);
        this.position = segment.from.map((v, i) => v + (segment.to[i] - v) * ease) as Point3;
        const stride = (time * WALK_HOPS_PER_SECOND) % 1;
        const hop = 4 * stride * (1 - stride);
        this.squash = segment.phase === 'travel' ? 0.88 + 0.23 * hop : 1;
        this.lean =
          segment.phase === 'travel'
            ? 0.1 * Math.sin(time * Math.PI * 2 * WALK_HOPS_PER_SECOND)
            : 0;
        if (segment.phase === 'travel') this.position[1] += 0.095 * hop * Math.sin(Math.PI * t);
        if (segment.phase === 'travel' && (segment.from[1] > 0.1 || segment.to[1] > 0.1))
          this.position[1] += 0.14 * Math.sin(Math.PI * t);
        this.phase = segment.phase;
        this.animation = segment.animation;
        this.actionTime = time - previous;
        this.yaw =
          (segment.phase === 'act' && segment.animation === 'tea'
            ? teaPose(this.actionTime).yaw
            : segment.face) ??
          Math.atan2(segment.to[0] - segment.from[0], segment.to[2] - segment.from[2]);
        return;
      }
      previous += segment.seconds;
    }
  }
}
