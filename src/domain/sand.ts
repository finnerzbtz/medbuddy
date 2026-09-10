export type SandTool = 'rake' | 'smooth';
export type SandPoint = { x: number; y: number };
export type SandBounds = { left: number; top: number; right: number; bottom: number };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A bounded height field: strokes displace the surface, rather than painting lines. */
export class SandField {
  heights: Float32Array;
  history: Float32Array[] = [];
  private checkpoint: Float32Array | null = null;
  constructor(
    public width: number,
    public height: number,
  ) {
    this.heights = new Float32Array(width * height);
  }
  begin() {
    this.checkpoint ??= this.heights.slice();
  }
  end(changed: boolean) {
    if (changed && this.checkpoint) {
      this.history.push(this.checkpoint);
      const limit = Math.max(1, Math.min(6, Math.floor(18_000_000 / this.heights.byteLength)));
      while (this.history.length > limit) this.history.shift();
    }
    this.checkpoint = null;
  }
  undo() {
    const last = this.history.pop();
    if (!last) return false;
    this.heights = last;
    this.checkpoint = null;
    return true;
  }
  clear() {
    this.begin();
    const changed = this.heights.some((v) => Math.abs(v) > 0.001);
    this.heights.fill(0);
    this.end(changed);
  }
  /** Keep marks in proportion and centred when rotating or resizing a device. */
  resized(width: number, height: number) {
    const next = new SandField(width, height);
    const scale = Math.min(width / this.width, height / this.height);
    const resample = (source: Float32Array) => {
      const dest = new Float32Array(width * height);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const sx = (x - width / 2) / scale + this.width / 2;
          const sy = (y - height / 2) / scale + this.height / 2;
          if (sx < 0 || sy < 0 || sx >= this.width - 1 || sy >= this.height - 1) continue;
          const ix = Math.floor(sx),
            iy = Math.floor(sy),
            fx = sx - ix,
            fy = sy - iy;
          const at = iy * this.width + ix;
          dest[y * width + x] =
            (source[at] * (1 - fx) + source[at + 1] * fx) * (1 - fy) +
            (source[at + this.width] * (1 - fx) + source[at + this.width + 1] * fx) * fy;
        }
      return dest;
    };
    next.heights = resample(this.heights);
    next.history = this.history
      .map(resample)
      .slice(-Math.max(1, Math.floor(18_000_000 / next.heights.byteLength)));
    return next;
  }
  stamp(x: number, y: number, angle: number, width: number, tool: SandTool): SandBounds {
    const nx = -Math.sin(angle),
      ny = Math.cos(angle),
      tx = Math.cos(angle),
      ty = Math.sin(angle);
    const half = width / 2,
      reach = tool === 'smooth' ? half : width * 0.11;
    const radius = Math.ceil(half + reach + 3);
    const bounds = {
      left: clamp(Math.floor(x - radius), 1, this.width - 2),
      top: clamp(Math.floor(y - radius), 1, this.height - 2),
      right: clamp(Math.ceil(x + radius), 1, this.width - 2),
      bottom: clamp(Math.ceil(y + radius), 1, this.height - 2),
    };
    const spacing = width / 7,
      sigma = spacing * 0.22;
    for (let py = bounds.top; py <= bounds.bottom; py++)
      for (let px = bounds.left; px <= bounds.right; px++) {
        const dx = px - x,
          dy = py - y;
        const cross = dx * nx + dy * ny,
          along = dx * tx + dy * ty;
        if (tool === 'smooth') {
          const distance = Math.hypot(dx, dy) / half;
          if (distance >= 1) continue;
          const strength = Math.pow(1 - distance * distance, 2) * 0.72;
          this.heights[py * this.width + px] *= 1 - strength;
          continue;
        }
        if (Math.abs(cross) > half || Math.abs(along) > reach) continue;
        const tine = clamp(Math.round(cross / spacing), -3, 3);
        const offset = cross - tine * spacing;
        const depression = Math.exp(-0.5 * (offset / sigma) ** 2);
        const shoulder = Math.exp(
          -0.5 * ((Math.abs(offset) - spacing * 0.38) / (sigma * 0.72)) ** 2,
        );
        const target = -2.65 * depression + 0.85 * shoulder;
        const edge = clamp((half - Math.abs(cross)) / (spacing * 0.55), 0, 1);
        const strength = Math.cos(((along / reach) * Math.PI) / 2) * edge * 0.64;
        const i = py * this.width + px;
        this.heights[i] += (target - this.heights[i]) * strength;
      }
    return bounds;
  }
}
