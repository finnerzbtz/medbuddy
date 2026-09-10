/** Small fixed-step springs keep interaction motion stable across frame rates. */
export class Spring {
  velocity = 0;
  constructor(public value: number) {}
  step(target: number, delta: number, stiffness = 95, damping = 20) {
    let remaining = Math.min(0.1, Math.max(0, delta));
    while (remaining > 0) {
      const dt = Math.min(remaining, 1 / 120);
      this.velocity += ((target - this.value) * stiffness - this.velocity * damping) * dt;
      this.value += this.velocity * dt;
      remaining -= dt;
    }
    return this.value;
  }
  snap(value: number) {
    this.value = value;
    this.velocity = 0;
  }
}
export class BouncyBall {
  x = 1.25;
  y = 0.145;
  z = 1.4;
  vx = 0;
  vy = 0;
  vz = 0;
  spin = 0;
  squash = 1;
  kick(direction: number) {
    this.vx = direction * 2.2;
    this.vy = 2.25;
    this.vz = this.z > 1.55 ? -0.5 : 0.5;
  }
  step(delta: number) {
    let remaining = Math.min(0.1, Math.max(0, delta));
    while (remaining > 0) {
      const dt = Math.min(remaining, 1 / 120);
      this.vy -= 8.5 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.z += this.vz * dt;
      this.vx *= Math.exp(-dt * 0.8);
      this.vz *= Math.exp(-dt * 1.2);
      this.spin -= (this.vx * dt) / 0.145;
      if (this.y < 0.145) {
        this.y = 0.145;
        const impact = Math.abs(this.vy);
        this.vy = impact > 0.25 ? impact * 0.61 : 0;
        this.squash = Math.max(0.72, 1 - impact * 0.11);
      }
      if (this.x < 0.18 || this.x > 1.58) {
        this.x = Math.max(0.18, Math.min(1.58, this.x));
        this.vx *= -0.82;
      }
      if (this.z < 1.4 || this.z > 1.72) {
        this.z = Math.max(1.4, Math.min(1.72, this.z));
        this.vz *= -0.75;
      }
      this.squash += (1 - this.squash) * Math.min(1, dt * 15);
      remaining -= dt;
    }
  }
}
export const animationSpeed = (name: string) =>
  name === 'walk_to_cushion'
    ? 2.6
    : ['happy', 'dance', 'celebrating', 'ball', 'wave'].includes(name)
      ? 1.5
      : name === 'rest'
        ? 1
        : 1.18;
