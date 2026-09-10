/** Quiet, continuous rain/leaf textures, shaped by live input. No autoplay or remote calls. */
export class BonsaiAudio {
  private context = new AudioContext();
  private source: AudioBufferSourceNode;
  private gain: GainNode;
  private filter: BiquadFilterNode;
  private pan: StereoPannerNode;
  private volume = 0.45;
  private closed = false;
  constructor() {
    const c = this.context,
      buffer = c.createBuffer(1, c.sampleRate * 4, c.sampleRate),
      data = buffer.getChannelData(0);
    let low = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      low = (low + white * 0.02) / 1.02;
      data[i] = low * 2 + white * 0.2;
    }
    for (let i = 0; i < 512; i++) {
      const blend = i / 512;
      data[data.length - 512 + i] = data[data.length - 512 + i] * (1 - blend) + data[i] * blend;
    }
    this.source = c.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = true;
    const high = c.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 220;
    this.filter = c.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 3200;
    this.filter.Q.value = 0.3;
    this.gain = c.createGain();
    this.gain.gain.value = 0;
    this.pan = c.createStereoPanner();
    this.source.connect(high);
    high.connect(this.filter);
    this.filter.connect(this.gain);
    this.gain.connect(this.pan);
    this.pan.connect(c.destination);
    this.source.start();
  }
  async enable() {
    await this.context.resume();
  }
  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(1, value));
    if (!value) this.hush();
  }
  move(active: boolean, breeze: boolean, x: number) {
    if (this.closed) return;
    const t = this.context.currentTime;
    this.gain.gain.setTargetAtTime(active ? this.volume * (breeze ? 0.15 : 0.32) : 0, t, 0.06);
    this.filter.frequency.setTargetAtTime(breeze ? 1300 : 3400, t, 0.12);
    this.source.playbackRate.setTargetAtTime(breeze ? 0.72 : 1, t, 0.12);
    this.pan.pan.setTargetAtTime(Math.max(-0.6, Math.min(0.6, (x - 0.5) * 1.2)), t, 0.1);
  }
  hush() {
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
