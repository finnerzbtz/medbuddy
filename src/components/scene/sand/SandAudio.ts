/** Local granular noise: no downloaded loops, microphone or autoplay. */
export class SandAudio {
  private context: AudioContext;
  private source: AudioBufferSourceNode;
  private filter: BiquadFilterNode;
  private gain: GainNode;
  private pan: StereoPannerNode;
  private timer?: ReturnType<typeof setTimeout>;
  private volume = 0.35;
  private closed = false;
  constructor() {
    this.context = new AudioContext();
    const ctx = this.context;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    let brown = 0,
      envelope = 0.5;
    for (let i = 0; i < samples.length; i++) {
      const white = Math.random() * 2 - 1;
      brown = (brown + white * 0.025) / 1.025;
      envelope += (Math.random() - envelope) * 0.017;
      samples[i] = (white * 0.28 + brown * 3.4) * (0.4 + envelope * 0.8);
    }
    // A crossfade makes the repeating texture continuous at its seam.
    for (let i = 0; i < 512; i++) {
      const blend = i / 512;
      samples[samples.length - 512 + i] =
        samples[samples.length - 512 + i] * (1 - blend) + samples[i] * blend;
    }
    this.source = ctx.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = true;
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 160;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 2400;
    this.filter.Q.value = 0.3;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.pan = ctx.createStereoPanner();
    this.source.connect(high);
    high.connect(this.filter);
    this.filter.connect(this.gain);
    this.gain.connect(this.pan);
    this.pan.connect(ctx.destination);
    this.source.start();
  }
  async enable() {
    await this.context.resume();
    if (this.context.state !== 'running') throw new Error('Sand audio could not start.');
  }
  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (!this.volume) this.hush();
  }
  move(speed: number, position: number, smoothing: boolean) {
    if (this.closed) return;
    clearTimeout(this.timer);
    const at = this.context.currentTime,
      velocity = Math.min(1, speed / 750);
    const level = speed > 3 ? this.volume * 0.24 * Math.sqrt(velocity) : 0;
    this.gain.gain.setTargetAtTime(level, at, 0.035);
    this.filter.frequency.setTargetAtTime((smoothing ? 900 : 1700) + velocity * 1900, at, 0.08);
    this.pan.pan.setTargetAtTime(Math.max(-0.7, Math.min(0.7, (position - 0.5) * 1.4)), at, 0.09);
    this.source.playbackRate.setTargetAtTime(0.78 + velocity * 0.45, at, 0.12);
    this.timer = setTimeout(() => this.hush(), 100);
  }
  hush() {
    clearTimeout(this.timer);
    if (!this.closed) this.gain.gain.setTargetAtTime(0, this.context.currentTime, 0.035);
  }
  dispose() {
    if (this.closed) return;
    this.hush();
    this.closed = true;
    this.source.stop();
    this.source.disconnect();
    void this.context.close().catch(() => {});
  }
}
