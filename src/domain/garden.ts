/** A living, unscored bonsai. All state is local to this sensory session. */
export type GardenTool = 'rain' | 'breeze';
export type GardenPoint = { x: number; y: number };
export type GardenLeaf = GardenPoint & {
  size: number;
  angle: number;
  shade: number;
  seed: number;
  bend: number;
  velocity: number;
  wet: number;
  shed: number;
  brushed: number;
  crown: number;
};
export const GARDEN_CROWNS = [
  { x: 332, y: 302, rx: 90, ry: 43 },
  { x: 551, y: 276, rx: 88, ry: 42 },
  { x: 392, y: 225, rx: 99, ry: 49 },
  { x: 512, y: 189, rx: 86, ry: 43 },
  { x: 434, y: 137, rx: 69, ry: 34 },
];
export const MAX_GARDEN_DROPS = 180;
export type GardenDrop = GardenPoint & {
  vx: number;
  vy: number;
  life: number;
  size: number;
  kind: 'rain' | 'blown' | 'splash';
};
export type GardenRipple = GardenPoint & { life: number; size: number };
const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
export class SensoryGarden {
  leaves: GardenLeaf[] = [];
  crowns = GARDEN_CROWNS.map((crown) => ({ ...crown, sway: 0, velocity: 0 }));
  direction = 1;
  private targetDirection = 1;
  drops: GardenDrop[] = [];
  ripples: GardenRipple[] = [];
  tool: GardenTool = 'rain';
  target: GardenPoint = { x: 440, y: 235 };
  cursor: GardenPoint = { ...this.target };
  active = false;
  visible = false;
  private reducedMotion = false;
  get reduced() {
    return this.reducedMotion;
  }
  set reduced(value: boolean) {
    this.reducedMotion = value;
    if (!value) return;
    this.drops = [];
    this.ripples = [];
    this.emission = 0;
    for (const crown of this.crowns) {
      crown.sway = 0;
      crown.velocity = 0;
    }
    for (const leaf of this.leaves) {
      leaf.bend = 0;
      leaf.velocity = 0;
      leaf.shed = 0;
    }
  }
  time = 0;
  soil = 0;
  interactions = 0;
  private emission = 0;
  private seed = 8421;
  private random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  constructor() {
    for (const [index, crown] of GARDEN_CROWNS.entries()) {
      for (let i = 0; i < 48; i++) {
        const a = this.random() * Math.PI * 2,
          radius = Math.sqrt(this.random());
        this.leaves.push({
          x: crown.x + Math.cos(a) * radius * crown.rx,
          y: crown.y + Math.sin(a) * radius * crown.ry,
          size: 11 + this.random() * 13,
          angle: -0.8 + this.random() * 1.6,
          shade: this.random(),
          seed: this.random() * 12,
          bend: 0,
          velocity: 0,
          wet: 0,
          shed: 0,
          brushed: 0,
          crown: index,
        });
      }
    }
    this.leaves.sort((a, b) => a.y - b.y);
  }
  leafPosition(leaf: GardenLeaf): GardenPoint {
    const sway = this.crowns[leaf.crown].sway;
    return { x: leaf.x + sway * 22 + leaf.bend * 8, y: leaf.y + Math.abs(sway) * 3 };
  }
  move(point: GardenPoint) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    if (this.visible && Math.abs(point.x - this.target.x) > 0.75)
      this.targetDirection = Math.sign(point.x - this.target.x);
    this.target = { x: clamp(point.x, 20, 820), y: clamp(point.y, 40, 570) };
    if (!this.visible || this.reduced) this.cursor = { ...this.target };
    this.visible = true;
  }
  begin(point: GardenPoint) {
    this.move(point);
    this.active = true;
    this.interactions++;
  }
  end() {
    this.active = false;
    this.emission = 0;
  }
  leave() {
    this.end();
    this.visible = false;
  }
  step(delta: number) {
    const dt = clamp(delta, 0, 0.04);
    if (!dt) return;
    this.time += dt;
    const smoothing = 1 - Math.exp(-dt * 24);
    this.cursor.x += (this.target.x - this.cursor.x) * smoothing;
    this.cursor.y += (this.target.y - this.cursor.y) * smoothing;
    this.direction += (this.targetDirection - this.direction) * (1 - Math.exp(-dt * 4));
    for (const [index, crown] of this.crowns.entries()) {
      if (this.reduced) continue;
      const nearby = clamp(1 - Math.hypot(crown.x - this.cursor.x, crown.y - this.cursor.y) / 200);
      const gust =
        this.active && this.tool === 'breeze'
          ? nearby * this.direction * (0.85 + 0.45 * Math.sin(this.time * 2.6 + index * 0.45)) * 22
          : 0;
      crown.velocity += (gust - crown.sway * 20 - crown.velocity * 7) * dt;
      crown.sway = clamp(crown.sway + crown.velocity * dt, -1.2, 1.2);
    }
    for (const leaf of this.leaves) {
      const position = this.leafPosition(leaf);
      const distance = Math.hypot(position.x - this.cursor.x, position.y - this.cursor.y);
      const nearby = clamp(1 - distance / (this.tool === 'rain' ? 98 : 165));
      const touching = this.active ? nearby : 0;
      if (this.tool === 'rain') {
        leaf.wet = clamp(leaf.wet + touching * dt);
        if (touching) leaf.shed = 0;
      }
      if (this.tool === 'breeze') {
        leaf.brushed = clamp(leaf.brushed + touching * dt * 1.8);
        const removed = Math.min(leaf.wet, touching * dt * 1.35);
        leaf.wet -= removed;
        leaf.shed += removed;
        // A detached bead comes from the actual moving leaf, not from the cursor.
        if (
          !this.reduced &&
          removed > 0 &&
          (leaf.shed >= 0.3 || (leaf.wet < 0.02 && leaf.shed > 0.07))
        ) {
          if (this.drops.length < MAX_GARDEN_DROPS) {
            this.drops.push({
              x: position.x,
              y: position.y - 1,
              vx: this.direction * (105 + touching * 75) + (this.random() - 0.5) * 20,
              vy: -38 - this.random() * 48,
              life: 2,
              size: 2.4 + this.random() * 1.7,
              kind: 'blown',
            });
          }
          leaf.shed = 0;
        }
        if (this.reduced || !leaf.wet) leaf.shed = 0;
      }
      if (!this.reduced) leaf.brushed = Math.max(0, leaf.brushed - dt * 0.035);
      leaf.wet = Math.max(0, leaf.wet - dt * 0.013);
      if (this.reduced) {
        leaf.bend = 0;
        leaf.velocity = 0;
        continue;
      }
      const breeze =
        this.tool === 'breeze'
          ? touching * this.direction * (12 + 9 * Math.sin(this.time * 4 + leaf.seed))
          : touching * 1.5;
      leaf.velocity += (breeze - 32 * leaf.bend - 9 * leaf.velocity) * dt;
      leaf.bend = clamp(leaf.bend + leaf.velocity * dt, -0.48, 0.48);
    }
    if (this.active && this.tool === 'rain') {
      if (this.cursor.y > 380 && Math.abs(this.cursor.x - 460) < 140)
        this.soil = clamp(this.soil + dt * 0.13);
      if (!this.reduced) {
        this.emission += dt * 108;
        while (this.emission >= 1 && this.drops.length < MAX_GARDEN_DROPS) {
          this.emission--;
          this.drops.push({
            x: this.cursor.x + (this.random() - 0.5) * 108,
            y: this.cursor.y - 85 + this.random() * 16,
            vx: (this.random() - 0.5) * 16,
            vy: 130 + this.random() * 60,
            life: 1.8,
            size: 1.7 + this.random() * 1.5,
            kind: 'rain',
          });
        }
        this.emission = Math.min(this.emission, 1);
      }
    }
    const splashes: GardenDrop[] = [];
    for (const drop of this.drops) {
      drop.life -= dt;
      if (this.active && this.tool === 'breeze') {
        const nearby = clamp(1 - Math.hypot(drop.x - this.cursor.x, drop.y - this.cursor.y) / 190);
        drop.vx += this.direction * nearby * dt * 180;
      }
      drop.vx *= Math.exp(-dt * 0.35);
      drop.vy += (drop.kind === 'rain' ? 330 : 230) * dt;
      const previousY = drop.y;
      drop.x += drop.vx * dt;
      drop.y += drop.vy * dt;
      const onTray = drop.x > 240 && drop.x < 660;
      const potX = (drop.x - 462) / 108;
      const soilSurface = 442 - Math.sqrt(Math.max(0, 1 - potX * potX)) * 5;
      const hitsSoil = Math.abs(potX) < 1 && previousY <= soilSurface && drop.y > soilSurface;
      const surface = hitsSoil ? soilSurface : onTray ? 490 : 557;
      if (hitsSoil && drop.kind !== 'splash') this.soil = clamp(this.soil + 0.002);
      if (drop.y > surface && drop.life > 0) {
        if (drop.kind !== 'splash') {
          if (this.ripples.length < 36)
            this.ripples.push({
              x: drop.x,
              y: surface + this.random() * 7,
              life: 1,
              size: 9 + this.random() * 14,
            });
          if (this.drops.length + splashes.length + 2 <= MAX_GARDEN_DROPS) {
            for (const side of [-1, 1])
              splashes.push({
                x: drop.x,
                y: surface - 2,
                vx: side * (30 + this.random() * 40),
                vy: -45 - this.random() * 30,
                life: 0.45,
                size: 1.4 + this.random(),
                kind: 'splash',
              });
          }
        }
        drop.life = 0;
      }
    }
    this.drops = this.drops.filter((drop) => drop.life > 0).concat(splashes);
    for (const ripple of this.ripples) ripple.life -= dt * 0.85;
    this.ripples = this.ripples.filter((ripple) => ripple.life > 0);
  }
  get moisture() {
    return this.leaves.reduce((n, leaf) => n + leaf.wet, 0) / this.leaves.length;
  }
  get resting() {
    return (
      !this.active &&
      (!this.visible ||
        Math.hypot(this.cursor.x - this.target.x, this.cursor.y - this.target.y) < 0.15) &&
      !this.drops.length &&
      !this.ripples.length &&
      this.crowns.every((crown) => Math.abs(crown.sway) + Math.abs(crown.velocity) < 0.002) &&
      this.leaves.every((leaf) => Math.abs(leaf.bend) + Math.abs(leaf.velocity) < 0.002)
    );
  }
  clearDroplets() {
    this.end();
    this.drops = [];
    this.ripples = [];
    this.soil = 0;
    for (const crown of this.crowns) {
      crown.sway = 0;
      crown.velocity = 0;
    }
    for (const leaf of this.leaves) {
      leaf.wet = 0;
      leaf.shed = 0;
      leaf.brushed = 0;
      leaf.bend = 0;
      leaf.velocity = 0;
    }
  }
}
