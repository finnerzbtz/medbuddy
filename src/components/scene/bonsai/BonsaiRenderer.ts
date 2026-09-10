import { SensoryGarden, type GardenPoint } from '@/domain/garden';

const greens = ['#466647', '#54794d', '#638a58', '#789866', '#8aa577'];
export class BonsaiRenderer {
  readonly garden = new SensoryGarden();
  private ctx: CanvasRenderingContext2D;
  private backdrop: HTMLCanvasElement;
  private width = 1;
  private height = 1;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private raf = 0;
  private previous = 0;
  private suspended = false;
  private disposed = false;
  onMotion?: (active: boolean, breeze: boolean, x: number) => void;
  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable.');
    this.ctx = ctx;
    this.backdrop = document.createElement('canvas');
  }
  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    const density = Math.min(devicePixelRatio || 1, 2, Math.sqrt(1600000 / (width * height)));
    this.canvas.width = Math.round(width * density);
    this.canvas.height = Math.round(height * density);
    this.backdrop.width = this.canvas.width;
    this.backdrop.height = this.canvas.height;
    this.scale = Math.min(width / (width < 600 ? 660 : 840), height / 620);
    this.ox = (width - 840 * this.scale) / 2 - (width < 600 ? 25 * this.scale : 0);
    this.oy = (height - 620 * this.scale) / 2;
    const bg = this.backdrop.getContext('2d')!;
    bg.setTransform(density, 0, 0, density, 0, 0);
    this.drawBackdrop(bg);
    this.paint();
  }
  point(x: number, y: number): GardenPoint {
    return { x: (x - this.ox) / this.scale, y: (y - this.oy) / this.scale };
  }
  private world(ctx: CanvasRenderingContext2D) {
    ctx.translate(this.ox, this.oy);
    ctx.scale(this.scale, this.scale);
  }
  private ellipse(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    rx: number,
    ry: number,
    fill: string,
  ) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }
  private drawBackdrop(ctx: CanvasRenderingContext2D) {
    const bg = ctx.createLinearGradient(0, 0, this.width, this.height);
    bg.addColorStop(0, '#edf1e5');
    bg.addColorStop(0.6, '#f8f5e9');
    bg.addColorStop(1, '#dce5d6');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.save();
    this.world(ctx);
    // The quiet garden beyond a round window.
    ctx.save();
    ctx.beginPath();
    ctx.arc(514, 219, 215, 0, Math.PI * 2);
    ctx.clip();
    const sky = ctx.createLinearGradient(0, 4, 0, 420);
    sky.addColorStop(0, '#d0dfd9');
    sky.addColorStop(1, '#e5e9d8');
    ctx.fillStyle = sky;
    ctx.fillRect(285, 0, 450, 450);
    this.ellipse(ctx, 615, 116, 33, 33, '#faf2d3');
    ctx.fillStyle = '#c2d1bb';
    ctx.beginPath();
    ctx.moveTo(280, 380);
    ctx.bezierCurveTo(450, 210, 498, 390, 760, 290);
    ctx.lineTo(760, 470);
    ctx.lineTo(280, 470);
    ctx.fill();
    ctx.fillStyle = '#adbea3';
    ctx.beginPath();
    ctx.moveTo(280, 421);
    ctx.bezierCurveTo(470, 301, 620, 428, 760, 354);
    ctx.lineTo(760, 470);
    ctx.lineTo(280, 470);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#faf7ee';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(514, 219, 217, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#cbd2be';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(514, 219, 225, 0, Math.PI * 2);
    ctx.stroke();
    // Oak tray and a small river stone. Layered soft shadows avoid a flat cut-out.
    this.ellipse(ctx, 452, 539, 238, 31, '#adb4a329');
    this.ellipse(ctx, 452, 532, 210, 24, '#959e8b21');
    const wood = ctx.createLinearGradient(0, 480, 0, 545);
    wood.addColorStop(0, '#ded2b8');
    wood.addColorStop(1, '#bba98b');
    ctx.beginPath();
    ctx.roundRect(235, 477, 430, 58, 24);
    ctx.fillStyle = wood;
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(239, 474, 422, 43, 22);
    ctx.fillStyle = '#e9dec7';
    ctx.fill();
    ctx.strokeStyle = '#aa93772d';
    ctx.lineWidth = 1;
    for (let y = 493; y < 519; y += 6) {
      ctx.beginPath();
      ctx.moveTo(254, y);
      ctx.bezierCurveTo(352, y - 3, 540, y + 4, 644, y - 2);
      ctx.stroke();
    }
    this.ellipse(ctx, 302, 488, 31, 9, '#998c7438');
    this.ellipse(ctx, 300, 482, 27, 13, '#a0aa99');
    this.ellipse(ctx, 294, 478, 18, 8, '#bfc8b6');
    this.ellipse(ctx, 620, 488, 18, 6, '#bbc4ae');
    // Glazed ceramic bowl with rolled rim, soil and moss.
    this.ellipse(ctx, 463, 509, 108, 12, '#7a7d6428');
    ctx.fillStyle = '#687c75';
    ctx.beginPath();
    ctx.roundRect(397, 501, 24, 12, 5);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(507, 501, 24, 12, 5);
    ctx.fill();
    const ceramic = ctx.createLinearGradient(346, 441, 570, 500);
    ceramic.addColorStop(0, '#92a99b');
    ceramic.addColorStop(0.4, '#bdcdb9');
    ceramic.addColorStop(1, '#6b8780');
    ctx.fillStyle = ceramic;
    ctx.beginPath();
    ctx.moveTo(344, 444);
    ctx.bezierCurveTo(358, 493, 374, 507, 405, 508);
    ctx.lineTo(517, 508);
    ctx.bezierCurveTo(550, 504, 570, 475, 580, 444);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#dbe3ca99';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(363, 458);
    ctx.bezierCurveTo(381, 491, 391, 496, 423, 497);
    ctx.stroke();
    this.ellipse(ctx, 462, 443, 119, 31, '#c6d3bf');
    this.ellipse(ctx, 462, 442, 109, 23, '#5d6550');
    this.ellipse(ctx, 421, 441, 60, 20, '#7d8d59');
    this.ellipse(ctx, 486, 445, 56, 17, '#8c9d65');
    for (let i = 0; i < 75; i++) {
      const x = 373 + ((i * 71) % 178),
        y = 435 + ((i * 37) % 20);
      this.ellipse(ctx, x, y, 1.5, 0.9, i % 2 ? '#b2bb8d' : '#566942');
    }
    // Tapered, curved branches. The silhouette remains visible beneath the foliage.
    const branches: [string, number][] = [
      ['M454 441 C407 414 409 376 450 351 C498 325 482 294 448 269 C417 243 425 201 436 157', 24],
      ['M450 350 C422 333 379 346 349 306', 13],
      ['M476 315 C503 302 537 316 554 281', 12],
      ['M446 269 C421 262 389 271 386 228', 11],
      ['M432 221 C460 218 506 232 512 190', 10],
      ['M440 173 C421 166 423 150 435 133', 7],
    ];
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [d, width] of branches) {
      const path = new Path2D(d);
      ctx.strokeStyle = '#806e57';
      ctx.lineWidth = width;
      ctx.stroke(path);
      ctx.strokeStyle = '#b6a184';
      ctx.lineWidth = width * 0.54;
      ctx.stroke(path);
    }
    ctx.strokeStyle = '#c6b498';
    ctx.lineWidth = 3;
    ctx.stroke(new Path2D('M449 435 C428 415 424 396 431 384 M447 346 Q474 331 472 316'));
    ctx.restore();
  }
  paint() {
    const ctx = this.ctx,
      g = this.garden;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.backdrop, 0, 0);
    const density = this.canvas.width / this.width;
    ctx.setTransform(density, 0, 0, density, 0, 0);
    ctx.save();
    this.world(ctx);
    if (g.soil) this.ellipse(ctx, 462, 444, 98, 17, `rgba(49,70,43,${g.soil * 0.2})`);
    // Move each canopy as a connected mass, with softer individual leaf flutter.
    for (const crown of g.crowns) {
      const x = crown.x + crown.sway * 22;
      const y = crown.y + Math.abs(crown.sway) * 3;
      this.ellipse(ctx, x, y + 10, crown.rx * 0.91, crown.ry * 0.9, '#4d6a49');
      this.ellipse(ctx, x - 12, y, crown.rx * 0.85, crown.ry * 0.93, '#648455');
    }
    for (const leaf of g.leaves) {
      ctx.save();
      const position = g.leafPosition(leaf);
      ctx.translate(position.x, position.y);

      ctx.rotate(leaf.angle + leaf.bend);
      const size = leaf.size;
      ctx.fillStyle = greens[Math.min(4, Math.floor(leaf.shade * 5))];
      ctx.beginPath();
      ctx.moveTo(-size * 0.55, 0);
      ctx.bezierCurveTo(-size * 0.4, -size * 0.48, size * 0.25, -size * 0.56, size * 0.65, 0);
      ctx.bezierCurveTo(size * 0.2, size * 0.43, -size * 0.22, size * 0.4, -size * 0.55, 0);
      ctx.fill();
      if (leaf.brushed > 0) {
        ctx.fillStyle = `rgba(221,238,177,${leaf.brushed * 0.34})`;
        ctx.fill();
      }
      ctx.strokeStyle = '#d1dda14d';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(-size * 0.35, 0);
      ctx.quadraticCurveTo(0, -1, size * 0.47, 0);
      ctx.stroke();
      if (leaf.wet > 0.08) {
        const radius = 1.5 + leaf.wet * 2.8;
        this.ellipse(ctx, size * 0.06 + 0.5, 0.2, radius + 0.6, radius * 0.72, '#244e594d');
        this.ellipse(
          ctx,
          size * 0.06,
          -1,
          radius,
          radius * 0.72,
          `rgba(158,215,227,${0.45 + leaf.wet * 0.5})`,
        );
        ctx.strokeStyle = '#437e8e';
        ctx.lineWidth = 0.7;
        ctx.stroke();
        this.ellipse(
          ctx,
          size * 0.06 - radius * 0.28,
          -1 - radius * 0.24,
          radius * 0.28,
          radius * 0.17,
          '#f1fffc',
        );
        if (leaf.wet > 0.68) {
          this.ellipse(ctx, -size * 0.3, 0.5, 1.8, 1.25, '#b7e6ed');
          this.ellipse(ctx, -size * 0.3 - 0.5, 0, 0.65, 0.4, '#f1fffc');
        }
      }
      ctx.restore();
    }
    for (const drop of g.drops) {
      const alpha = Math.min(0.88, drop.life * 2.5);
      if (drop.kind === 'rain') {
        const length = 0.036;
        ctx.lineCap = 'round';
        ctx.strokeStyle = `rgba(62,127,157,${alpha})`;
        ctx.lineWidth = drop.size;
        ctx.beginPath();
        ctx.moveTo(drop.x - drop.vx * length, drop.y - drop.vy * length);
        ctx.lineTo(drop.x, drop.y);
        ctx.stroke();
        ctx.strokeStyle = `rgba(213,246,250,${alpha * 0.9})`;
        ctx.lineWidth = Math.max(0.7, drop.size * 0.35);
        ctx.stroke();
      } else {
        // Round beads arc sideways in the wind and bounce into tiny splashes.
        ctx.strokeStyle = `rgba(84,151,174,${alpha * 0.35})`;
        ctx.lineWidth = drop.size * 0.75;
        ctx.beginPath();
        ctx.moveTo(drop.x - drop.vx * 0.045, drop.y - drop.vy * 0.045);
        ctx.lineTo(drop.x, drop.y);
        ctx.stroke();
        this.ellipse(
          ctx,
          drop.x,
          drop.y,
          drop.size,
          drop.size * 0.82,
          `rgba(102,182,209,${alpha})`,
        );
        this.ellipse(
          ctx,
          drop.x - drop.size * 0.25,
          drop.y - drop.size * 0.25,
          drop.size * 0.3,
          drop.size * 0.18,
          `rgba(242,255,252,${alpha})`,
        );
      }
    }
    for (const ripple of g.ripples) {
      ctx.strokeStyle = `rgba(70,135,153,${ripple.life * 0.62})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(
        ripple.x,
        ripple.y,
        ripple.size * (1.4 - ripple.life),
        ripple.size * (1.4 - ripple.life) * 0.24,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    if (g.active && g.tool === 'breeze' && !g.reduced) {
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 4; i++) {
        const phase = (g.time * 0.55 + i / 4) % 1;
        const x = g.cursor.x + (phase - 0.5) * 190 * g.direction;
        const y = g.cursor.y - 66 + i * 35;
        ctx.strokeStyle = `rgba(238,247,216,${Math.sin(phase * Math.PI) * 0.7})`;
        ctx.beginPath();
        ctx.moveTo(x - 30 * g.direction, y);
        ctx.bezierCurveTo(
          x - 8 * g.direction,
          y - 8,
          x + 10 * g.direction,
          y + 8,
          x + 30 * g.direction,
          y,
        );
        ctx.stroke();
      }
    }
    if (g.visible) {
      ctx.save();
      ctx.translate(g.cursor.x, g.cursor.y);
      ctx.strokeStyle = g.tool === 'rain' ? '#416d7480' : '#54714580';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 6]);
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        g.tool === 'rain' ? 47 : 72,
        g.tool === 'rain' ? 25 : 48,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.setLineDash([]);
      if (g.tool === 'rain') {
        ctx.translate(0, -82);
        ctx.rotate(0.2);
        ctx.fillStyle = '#acc6c0';
        ctx.strokeStyle = '#618c86';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(-14, -20, 28, 38, 9);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#e4ece0';
        ctx.beginPath();
        ctx.roundRect(-11, -24, 22, 8, 3);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -24);
        ctx.lineTo(0, -34);
        ctx.lineTo(14, -34);
        ctx.stroke();
        ctx.fillStyle = '#edf3e7';
        ctx.beginPath();
        ctx.ellipse(0, 0, 6, 8, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = '#56785aaa';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-20, -62);
        ctx.bezierCurveTo(0, -75, 22, -49, 37, -64);
        ctx.moveTo(-34, -51);
        ctx.bezierCurveTo(-8, -67, 14, -42, 29, -52);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
    this.canvas.dataset.breezeResponse = Math.max(...g.leaves.map((leaf) => leaf.brushed)).toFixed(
      4,
    );
    this.canvas.dataset.canopySway = Math.max(
      ...g.crowns.map((crown) => Math.abs(crown.sway)),
    ).toFixed(4);
    this.canvas.dataset.active = String(g.active);
    this.canvas.dataset.moisture = g.moisture.toFixed(4);
    this.canvas.dataset.particles = String(g.drops.length);
    this.canvas.dataset.blownParticles = String(
      g.drops.filter((drop) => drop.kind === 'blown').length,
    );
    this.canvas.dataset.wetLeaves = String(g.leaves.filter((leaf) => leaf.wet > 0.08).length);
    this.canvas.dataset.frames = String(Number(this.canvas.dataset.frames || 0) + 1);
  }
  wake() {
    if (this.disposed || this.suspended || this.raf || this.garden.resting) return;
    this.previous = performance.now();
    const frame = (now: number) => {
      this.raf = 0;
      if (this.disposed || this.suspended) return;
      this.garden.step((now - this.previous) / 1000);
      this.previous = now;
      this.paint();
      this.onMotion?.(
        this.garden.active,
        this.garden.tool === 'breeze',
        this.garden.cursor.x / 840,
      );
      if (!this.garden.resting) this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }
  move(point: GardenPoint) {
    this.garden.move(point);
    this.paint();
    this.wake();
  }
  begin(point: GardenPoint) {
    if (this.suspended) return;
    this.garden.begin(point);
    this.wake();
  }
  end() {
    this.garden.end();
    if (this.garden.reduced) this.garden.cursor = { ...this.garden.target };
    if (this.garden.resting) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    this.onMotion?.(false, false, 0.5);
    this.paint();
    this.wake();
  }
  suspend(value: boolean) {
    this.suspended = value;
    if (value) {
      this.garden.leave();
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.onMotion?.(false, false, 0.5);
    }
    this.paint();
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.garden.leave();
    this.onMotion?.(false, false, 0.5);
  }
}
