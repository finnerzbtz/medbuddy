import { SandField, type SandPoint, type SandTool, type SandBounds } from '@/domain/sand';
type Particle = { x: number; y: number; vx: number; vy: number; age: number; life: number };
let remembered: SandField | null = null;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export class SandRenderer {
  field: SandField;
  private ctx: CanvasRenderingContext2D;
  private overlay: CanvasRenderingContext2D;
  private pixels: ImageData;
  private grains: Uint8Array;
  private raf = 0;
  private lastTime = 0;
  private target: SandPoint | null = null;
  private samples: SandPoint[] = [];
  private point: SandPoint | null = null;
  private angle = 0;
  private headingEstablished = false;
  private drawing = false;
  private changed = false;
  private dirty: SandBounds | null = null;
  private particles: Particle[] = [];
  private ratio = 1;
  private disposed = false;
  private lastInput = 0;
  tool: SandTool = 'rake';
  size = 64;
  reduced = false;
  onMotion?: (speed: number, x: number, smooth: boolean) => void;
  onChange?: (canUndo: boolean) => void;
  constructor(
    private canvas: HTMLCanvasElement,
    private cursor: HTMLCanvasElement,
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.overlay = cursor.getContext('2d')!;
    this.field = remembered ?? new SandField(1, 1);
    remembered = null;
    this.pixels = this.ctx.createImageData(1, 1);
    this.grains = new Uint8Array(1);
  }
  resize(width: number, height: number) {
    this.end();
    const scale = Math.min(
      1.5,
      window.devicePixelRatio || 1,
      1100 / width,
      Math.sqrt(720000 / (width * height)),
    );
    const w = Math.max(2, Math.round(width * scale)),
      h = Math.max(2, Math.round(height * scale));
    if (
      w === this.field.width &&
      h === this.field.height &&
      this.pixels.width === w &&
      this.canvas.width === w
    )
      return;
    this.ratio = w / width;
    if (w !== this.field.width || h !== this.field.height) this.field = this.field.resized(w, h);
    this.canvas.width = this.cursor.width = w;
    this.canvas.height = this.cursor.height = h;
    this.pixels = this.ctx.createImageData(w, h);
    this.grains = new Uint8Array(w * h);
    let seed = 6173;
    for (let i = 0; i < this.grains.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      this.grains[i] = seed >>> 24;
    }
    this.target = this.point = null;
    this.shade({ left: 0, top: 0, right: w - 1, bottom: h - 1 });
    this.onChange?.(this.field.history.length > 0);
  }
  private mark(bounds: SandBounds) {
    if (!this.dirty) this.dirty = { ...bounds };
    else {
      this.dirty.left = Math.min(this.dirty.left, bounds.left);
      this.dirty.top = Math.min(this.dirty.top, bounds.top);
      this.dirty.right = Math.max(this.dirty.right, bounds.right);
      this.dirty.bottom = Math.max(this.dirty.bottom, bounds.bottom);
    }
  }
  private shade(bounds: SandBounds) {
    const { width: w, height: h, heights: heights } = this.field,
      bytes = this.pixels.data;
    const l = Math.max(0, Math.floor(bounds.left) - 3),
      t = Math.max(0, Math.floor(bounds.top) - 3),
      r = Math.min(w - 1, Math.ceil(bounds.right) + 3),
      b = Math.min(h - 1, Math.ceil(bounds.bottom) + 3);
    for (let y = t; y <= b; y++)
      for (let x = l; x <= r; x++) {
        const i = y * w + x;
        const dx = heights[y * w + Math.max(0, x - 1)] - heights[y * w + Math.min(w - 1, x + 1)];
        const dy = heights[Math.max(0, y - 1) * w + x] - heights[Math.min(h - 1, y + 1) * w + x];
        const normal = Math.sqrt(dx * dx + dy * dy + 3.8);
        const relief = (-dx * 0.53 - dy * 0.64 + 1.5) / normal;
        const noise = (this.grains[i] - 127.5) / 127.5;
        const vignette = Math.pow((x / w - 0.45) ** 2 + (y / h - 0.35) ** 2, 0.65);
        const light = (relief - 0.77) * 47 + noise * 7.8 - vignette * 10 + heights[i] * 1.6;
        const glint = this.grains[i] > 250 ? 5 : 0;
        const at = i * 4;
        bytes[at] = clamp(222 + light + glint, 0, 255);
        bytes[at + 1] = clamp(205 + light * 0.94 + glint, 0, 255);
        bytes[at + 2] = clamp(169 + light * 0.82 + glint, 0, 255);
        bytes[at + 3] = 255;
      }
    this.ctx.putImageData(this.pixels, 0, 0, l, t, r - l + 1, b - t + 1);
  }
  private wake() {
    if (!this.raf && !this.disposed) this.raf = requestAnimationFrame(this.frame);
  }
  hover(point: SandPoint) {
    this.target = { x: point.x * this.ratio, y: point.y * this.ratio };
    if (this.drawing) {
      this.samples.push({ ...this.target });
      if (this.samples.length > 128)
        this.samples = this.samples.filter((_, i) => i % 2 === 0 || i === this.samples.length - 1);
    }
    this.point ??= { ...this.target };
    this.lastInput = performance.now();
    this.wake();
  }
  begin(point: SandPoint) {
    this.end();
    this.field.begin();
    this.changed = false;
    this.drawing = true;
    this.samples = [];
    this.headingEstablished = false;
    this.target = this.point = { x: point.x * this.ratio, y: point.y * this.ratio };
    this.lastTime = performance.now();
    this.lastInput = this.lastTime;
    this.wake();
  }
  end() {
    this.flushSamples(true);
    // Finish the last input sample before releasing so fast strokes never stop short.
    if (this.drawing && this.target && this.point) {
      this.trace(this.point, this.target);
      this.point = { ...this.target };
    }
    this.samples = [];
    if (this.dirty) {
      this.shade(this.dirty);
      this.dirty = null;
    }
    this.field.end(this.changed);
    this.drawing = false;
    this.changed = false;
    this.onChange?.(this.field.history.length > 0);
    this.onMotion?.(0, 0.5, false);
  }
  leave() {
    this.end();
    this.target = this.point = null;
    this.wake();
  }
  private flushSamples(all = false, dt = 1 / 60) {
    if (!this.point || !this.samples.length) return 0;
    // Consume a continuous path, never jump to the penultimate raw event.
    // A short distance-based backlog smooths uneven mouse/touch event delivery.
    let backlog = 0,
      previous = this.point;
    for (const sample of this.samples) {
      backlog += Math.hypot(sample.x - previous.x, sample.y - previous.y);
      previous = sample;
    }
    let budget = all || this.reduced ? backlog : backlog * (1 - Math.exp(-dt * 42));
    if (backlog < 0.4 * this.ratio) budget = backlog;
    let travelled = 0;
    let current: SandPoint = this.point;
    while (this.samples.length && budget > 0.001) {
      const next = this.samples[0];
      const distance = Math.hypot(next.x - current.x, next.y - current.y);
      if (distance < 0.001) {
        this.samples.shift();
        continue;
      }
      const step = Math.min(distance, budget);
      const to: SandPoint = {
        x: current.x + ((next.x - current.x) * step) / distance,
        y: current.y + ((next.y - current.y) * step) / distance,
      };
      if (this.drawing) this.trace(current, to);
      this.point = current = to;
      travelled += step;
      budget -= step;
      if (step >= distance) this.samples.shift();
    }
    return travelled;
  }
  private trace(from: SandPoint, to: SandPoint) {
    const dx = to.x - from.x,
      dy = to.y - from.y,
      distance = Math.hypot(dx, dy);
    if (distance < 0.15) return;
    const direction = Math.atan2(dy, dx);
    if (!this.headingEstablished) {
      this.angle = direction;
      this.headingEstablished = true;
    }
    const steps = Math.max(1, Math.ceil(distance / (1.7 * this.ratio)));
    const stepDistance = distance / steps;
    for (let i = 1; i <= steps; i++) {
      const progress = i / steps;
      let turn = Math.atan2(Math.sin(direction - this.angle), Math.cos(direction - this.angle));
      // The comb is symmetrical. Reverse strokes keep their heading instead of flipping.
      if (turn > Math.PI / 2) turn -= Math.PI;
      if (turn < -Math.PI / 2) turn += Math.PI;
      // Steer over travelled distance, not raw event count; tiny hand tremors
      // cannot whip the handle around. The cursor and grooves share this heading.
      this.angle += turn * (1 - Math.exp(-stepDistance / (this.size * this.ratio * 0.22)));
      this.mark(
        this.field.stamp(
          from.x + dx * progress,
          from.y + dy * progress,
          this.angle,
          this.size * this.ratio,
          this.tool,
        ),
      );
    }
    this.changed = true;
    if (!this.reduced && this.tool === 'rake' && this.particles.length < 80) {
      const side = Math.random() > 0.5 ? 1 : -1,
        n = this.size * this.ratio * 0.48 * side;
      this.particles.push({
        x: to.x - Math.sin(this.angle) * n,
        y: to.y + Math.cos(this.angle) * n,
        vx: -Math.sin(this.angle) * side * 10,
        vy: Math.cos(this.angle) * side * 10 - 6,
        age: 0,
        life: 0.25 + Math.random() * 0.25,
      });
    }
  }
  private frame = (time: number) => {
    this.raf = 0;
    const dt = Math.min(0.04, Math.max(0.001, (time - (this.lastTime || time - 16)) / 1000));
    this.lastTime = time;
    let distance = this.drawing ? this.flushSamples(false, dt) : 0;
    if (!this.drawing && this.target && this.point) {
      const old = { ...this.point },
        fraction = this.reduced ? 1 : 1 - Math.exp(-dt * 42);
      this.point.x += (this.target.x - this.point.x) * fraction;
      this.point.y += (this.target.y - this.point.y) * fraction;
      distance = Math.hypot(this.point.x - old.x, this.point.y - old.y);
    }
    const moving = distance > 0.02;
    if (this.drawing && moving && this.point)
      this.onMotion?.(
        distance / dt / this.ratio,
        this.point.x / this.field.width,
        this.tool === 'smooth',
      );
    if (this.dirty) {
      this.shade(this.dirty);
      this.dirty = null;
    }
    this.paintCursor(dt);
    if (
      moving ||
      this.samples.length ||
      this.particles.length ||
      (this.drawing && time - this.lastInput < 120)
    )
      this.wake();
    else this.onMotion?.(0, 0.5, false);
  };
  private paintCursor(dt: number) {
    const ctx = this.overlay;
    ctx.clearRect(0, 0, this.cursor.width, this.cursor.height);
    this.particles = this.reduced ? [] : this.particles.filter((p) => p.age < p.life);
    for (const p of this.particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 28 * dt;
      ctx.fillStyle = `rgba(250,237,208,${0.55 * (1 - p.age / p.life)})`;
      ctx.fillRect(p.x, p.y, 1.4 * this.ratio, 1.4 * this.ratio);
    }
    if (!this.point) return;
    ctx.save();
    ctx.translate(this.point.x, this.point.y);
    ctx.rotate(this.angle - Math.PI / 2);
    ctx.scale(this.ratio, this.ratio);
    ctx.globalAlpha = this.drawing ? 1 : 0.82;
    ctx.shadowColor = '#47341c50';
    ctx.shadowBlur = this.drawing ? 5 : 9;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 5;
    const wood = ctx.createLinearGradient(-this.size / 2, 0, this.size / 2, 0);
    wood.addColorStop(0, '#b3864c');
    wood.addColorStop(0.45, '#e2c58c');
    wood.addColorStop(1, '#a87a43');
    ctx.strokeStyle = wood;
    ctx.lineCap = 'round';
    ctx.lineWidth = this.tool === 'rake' ? 8 : 11;
    ctx.beginPath();
    ctx.moveTo(0, -69);
    ctx.lineTo(0, -10);
    ctx.stroke();
    ctx.fillStyle = wood;
    if (this.tool === 'smooth') {
      ctx.beginPath();
      ctx.ellipse(0, -4, this.size * 0.48, this.size * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.lineWidth = 3.4;
      for (let i = -3; i <= 3; i++) {
        const x = (i * this.size) / 7;
        ctx.beginPath();
        ctx.moveTo(x, -10);
        ctx.lineTo(x, 1);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.roundRect(-this.size / 2, -17, this.size, 10, 4);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = '#f7e2b466';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-this.size / 2 + 5, -14);
      ctx.lineTo(this.size / 2 - 5, -14);
      ctx.stroke();
    }
    ctx.restore();
  }
  undo() {
    this.leave();
    if (this.field.undo())
      this.shade({ left: 0, top: 0, right: this.field.width - 1, bottom: this.field.height - 1 });
    this.onChange?.(this.field.history.length > 0);
  }
  clear() {
    this.leave();
    this.field.clear();
    this.shade({ left: 0, top: 0, right: this.field.width - 1, bottom: this.field.height - 1 });
    this.onChange?.(this.field.history.length > 0);
  }
  spiral() {
    this.leave();
    this.headingEstablished = false;
    this.field.begin();
    this.changed = false;
    const radius = Math.min(this.field.width, this.field.height) * 0.36,
      centre = { x: this.field.width * 0.5, y: this.field.height * 0.5 };
    let previous = { x: centre.x + 12, y: centre.y };
    for (let i = 1; i <= 460; i++) {
      const t = i / 460,
        a = t * Math.PI * 4.4,
        r = 12 + radius * t;
      const point = { x: centre.x + Math.cos(a) * r, y: centre.y + Math.sin(a) * r };
      this.trace(previous, point);
      previous = point;
    }
    this.end();
    this.particles = [];
    this.overlay.clearRect(0, 0, this.cursor.width, this.cursor.height);
  }
  dispose() {
    this.end();
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    remembered = this.field;
    this.target = this.point = null;
    this.particles = [];
  }
}
