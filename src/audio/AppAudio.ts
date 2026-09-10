import { fetchAudioBytes } from './bundledAudio';
import { prepareAudioPlayback } from '@/native/audio';
import { create } from 'zustand';
import { AUDIO_ASSETS } from '@/generated/audio';
import { MUSIC_LOOP } from '@/generated/music-loop';

export type SoundCue =
  | 'tap'
  | 'step'
  | 'bounce'
  | 'bite'
  | 'sip'
  | 'cup'
  | 'cuddle'
  | 'delight'
  | 'cloth'
  | 'place'
  | 'lamp'
  | 'water'
  | 'bloom'
  | 'checkin'
  | 'purchase'
  | 'sleep'
  | 'reminder';
type Preferences = {
  enabled: boolean;
  music: boolean;
  effects: boolean;
  musicVolume: number;
  effectsVolume: number;
  voiceVolume: number;
  readThoughts: boolean;
};
const KEY = 'reminduh-sound-v1';
const defaults: Preferences = {
  enabled: false,
  music: false,
  effects: true,
  musicVolume: 0.22,
  effectsVolume: 0.45,
  voiceVolume: 0.7,
  readThoughts: true,
};
function readPreferences(): Preferences {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      ...defaults,
      enabled: raw.enabled === true,
      music: raw.music === true,
      effects: raw.effects !== false,
      readThoughts: raw.readThoughts !== false,
      voiceVolume: Number.isFinite(raw.voiceVolume)
        ? Math.max(0, Math.min(1, raw.voiceVolume))
        : defaults.voiceVolume,
      musicVolume: Number.isFinite(raw.musicVolume)
        ? Math.max(0, Math.min(1, raw.musicVolume))
        : defaults.musicVolume,
      effectsVolume: Number.isFinite(raw.effectsVolume)
        ? Math.max(0, Math.min(1, raw.effectsVolume))
        : defaults.effectsVolume,
    };
  } catch {
    return { ...defaults };
  }
}
export const useSoundSettings = create<Preferences>(() => readPreferences());
export const useAudioReady = create(() => ({ ready: false }));
export const useRadioPlayback = create(() => ({ playing: false, loading: false, error: '' }));
export function setSoundSettings(patch: Partial<Preferences>) {
  useSoundSettings.setState(patch);
  const state = useSoundSettings.getState();
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* Audio still works for this visit. */
  }
  appAudio.configure(state);
}
export async function enableSound(patch: Partial<Preferences> = {}) {
  await appAudio.unlock();
  // A deliberate Play action can retry a failed bundled recording.
  if (patch.music === true) useRadioPlayback.setState({ error: '' });
  setSoundSettings({ ...patch, enabled: true });
}

type Speech = { controller: AbortController; source?: AudioBufferSourceNode; onEnd: () => void };
type Voice = { source: AudioScheduledSourceNode; nodes: AudioNode[]; music: boolean };
/** One quiet mixer. No API requests, credentials or user data enter the browser audio path. */
class AppAudio {
  private ctx: AudioContext | null = null;
  private fx: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private speechBus: GainNode | null = null;
  private speech: Speech | null = null;
  private speechBuffers = new Map<string, AudioBuffer>();
  private voices = new Set<Voice>();
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Set<string>();
  private stepVariant = 0;
  private last = new Map<string, number>();
  private noise: AudioBuffer | null = null;
  private musicOffset = 0;
  private musicStartedAt = 0;
  private musicGain: GainNode | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private environment: 'room' | 'sand' | 'melody' | 'other' = 'other';
  private hidden = false;
  private externalMusic = false;
  private config = useSoundSettings.getState();
  async unlock() {
    // Web Audio otherwise uses the iPhone ringer channel. Opted-in playback
    // should use media volume even when the phone's Silent switch is on.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) {
      try {
        session.type = 'playback';
      } catch {
        /* Older engines use their default. */
      }
    }
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext();
      this.ctx.onstatechange = () => {
        useAudioReady.setState({ ready: this.ctx?.state === 'running' });
        if (this.ctx?.state === 'running') this.configure(this.config);
        else if (useRadioPlayback.getState().playing) useRadioPlayback.setState({ playing: false });
      };
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -14;
      limiter.knee.value = 14;
      limiter.ratio.value = 5;
      limiter.attack.value = 0.012;
      limiter.release.value = 0.22;
      limiter.connect(this.ctx.destination);
      this.fx = this.ctx.createGain();
      this.musicBus = this.ctx.createGain();
      this.speechBus = this.ctx.createGain();
      this.speechBus.gain.value = 0;
      this.speechBus.connect(limiter);
      this.fx.gain.value = this.musicBus.gain.value = 0;
      this.fx.connect(limiter);
      this.musicBus.connect(limiter);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const samples = this.noise.getChannelData(0);
      let last = 0;
      for (let i = 0; i < samples.length; i++) {
        last = (last + (Math.random() * 2 - 1) * 0.08) / 1.08;
        samples[i] = last * 3;
      }
    }
    // Call resume synchronously in the tap handler, before any network await.
    // An iOS permission sheet can steal focus without emitting a matching focus.
    if (!document.hidden) this.hidden = false;
    await Promise.all([this.ctx.resume(), prepareAudioPlayback()]);
    if (this.ctx.state !== 'running') throw new Error('Audio could not start. Try again.');
  }
  configure(state: Preferences) {
    this.config = state;
    if (state.enabled && state.effects)
      Object.keys(AUDIO_ASSETS)
        .filter((id) => id !== 'zen-music')
        .forEach((id) => this.load(id));
    if (!this.ctx) return;
    const live = state.enabled && !this.hidden;
    if (!live || this.externalMusic) this.stopSpeech();
    const duck = this.speech?.source ? 0.25 : 1;
    const t = this.ctx.currentTime;
    for (const [node, volume] of [
      [this.fx, live && !this.externalMusic && state.effects ? state.effectsVolume * duck : 0],
      [this.speechBus, live && !this.externalMusic ? state.voiceVolume : 0],
      [
        this.musicBus,
        live &&
        !this.externalMusic &&
        state.music &&
        this.environment !== 'other' &&
        this.environment !== 'melody'
          ? state.musicVolume * duck
          : 0,
      ],
    ] as const) {
      node!.gain.cancelScheduledValues(t);
      node!.gain.setTargetAtTime(volume, t, 0.09);
    }
    if (!live || !state.effects) this.stopVoices(false);
    if (
      live &&
      !this.externalMusic &&
      state.music &&
      this.environment !== 'other' &&
      this.environment !== 'melody'
    )
      this.startMusic();
    else this.stopMusic();
  }
  canAutoSpeak() {
    return (
      this.config.enabled &&
      this.config.readThoughts &&
      this.config.voiceVolume > 0 &&
      !this.hidden &&
      !this.externalMusic &&
      this.ctx?.state === 'running'
    );
  }
  /** Automatic readings use an already-enabled mixer and can never unmute it. */
  async playSpeech(url: string, onEnd: () => void, automatic = false): Promise<boolean> {
    if (automatic && !this.canAutoSpeak()) return false;
    this.stopSpeech();
    const request: Speech = { controller: new AbortController(), onEnd };
    this.speech = request;
    try {
      if (!automatic) await this.unlock();
      if (this.speech !== request) return false;
      if (this.hidden) {
        this.stopSpeech();
        return false;
      }
      if (!automatic) setSoundSettings({ enabled: true });
      let buffer = this.speechBuffers.get(url);
      if (!buffer) {
        buffer = await this.ctx!.decodeAudioData(
          await fetchAudioBytes(url, request.controller.signal),
        );
        if (this.speech !== request) return false;
        this.speechBuffers.set(url, buffer);
        // Bound decoded voice memory; the service worker keeps compressed files offline.
        while (this.speechBuffers.size > 6)
          this.speechBuffers.delete(this.speechBuffers.keys().next().value!);
      }
      if (this.speech !== request) return false;
      if (!this.config.enabled || this.hidden || (automatic && !this.canAutoSpeak())) {
        this.stopSpeech();
        return false;
      }
      const source = this.ctx!.createBufferSource();
      source.buffer = buffer;
      source.connect(this.speechBus!);
      request.source = source;
      source.onended = () => {
        if (this.speech === request) this.stopSpeech();
      };
      this.configure(this.config);
      source.start();
      return true;
    } catch (error) {
      if (this.speech !== request) return false;
      this.stopSpeech();
      throw error;
    }
  }
  stopSpeech() {
    const speech = this.speech;
    if (!speech) return;
    this.speech = null;
    speech.controller.abort();
    if (speech.source) {
      speech.source.onended = null;
      try {
        speech.source.stop();
      } catch {
        /* Already ended. */
      }
      speech.source.disconnect();
    }
    speech.onEnd();
    this.configure(this.config);
  }
  setEnvironment(value: 'room' | 'sand' | 'melody' | 'other') {
    this.environment = value;
    this.configure(this.config);
  }
  setExternalMusicPlaying(value: boolean) {
    this.externalMusic = value;
    this.configure(this.config);
  }
  setHidden(value: boolean) {
    this.hidden = value;
    this.configure(this.config);
    if (value) {
      void this.ctx?.suspend().catch(() => {});
    } else if (this.config.enabled) {
      void this.ctx
        ?.resume()
        .then(() => this.configure(this.config))
        .catch(() => {});
    }
  }
  resumeFromGesture() {
    // Recover from a call, lock screen or WebKit interruption without unmuting.
    if (this.config.enabled && !document.hidden && this.ctx?.state !== 'running')
      void this.unlock()
        .then(() => this.configure(this.config))
        .catch(() => {});
  }
  private stopVoices(music: boolean) {
    for (const voice of [...this.voices])
      if (voice.music === music) {
        try {
          voice.source.stop();
        } catch {
          /* Already finished. */
        }
        voice.nodes.forEach((n) => n.disconnect());
        this.voices.delete(voice);
      }
  }
  private track(source: AudioScheduledSourceNode, nodes: AudioNode[], music: boolean) {
    const voice = { source, nodes, music };
    this.voices.add(voice);
    source.onended = () => {
      nodes.forEach((n) => n.disconnect());
      this.voices.delete(voice);
    };
  }
  private tone(
    frequency: number,
    duration: number,
    level: number,
    delay = 0,
    music = false,
    pan = 0,
  ) {
    if (!this.ctx) return;
    const ctx = this.ctx,
      at = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator(),
      envelope = ctx.createGain(),
      stereo = ctx.createStereoPanner();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(level, at + (music ? 0.6 : 0.012));
    envelope.gain.exponentialRampToValueAtTime(0.00001, at + duration);
    stereo.pan.value = pan;
    oscillator.connect(envelope);
    envelope.connect(stereo);
    stereo.connect(music ? this.musicBus! : this.fx!);
    this.track(oscillator, [oscillator, envelope, stereo], music);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }
  private texture(duration: number, level: number, frequency: number, pan: number) {
    if (!this.ctx || !this.noise) return;
    const ctx = this.ctx,
      at = ctx.currentTime;
    const source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      envelope = ctx.createGain(),
      stereo = ctx.createStereoPanner();
    source.buffer = this.noise;
    source.playbackRate.value = 0.92 + Math.random() * 0.16;
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 0.65;
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(level, at + 0.018);
    envelope.gain.exponentialRampToValueAtTime(0.00001, at + duration);
    stereo.pan.value = pan;
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(stereo);
    stereo.connect(this.fx!);
    this.track(source, [source, filter, envelope, stereo], false);
    source.start(at, Math.random() * 0.3);
    source.stop(at + duration + 0.02);
  }
  private load(id: string) {
    const url = AUDIO_ASSETS[id];
    if (!url || !this.ctx || this.loading.has(id) || this.buffers.has(id)) return;
    this.loading.add(id);
    if (id === 'zen-music') useRadioPlayback.setState({ loading: true, error: '' });
    const ctx = this.ctx;
    void fetchAudioBytes(url)
      .then((b) => ctx.decodeAudioData(b))
      .then((buffer) => {
        if (this.ctx !== ctx || ctx.state === 'closed') return;
        this.buffers.set(id, buffer);
        // Start only if music is still requested after the asynchronous decode.
        if (id === 'zen-music') this.configure(this.config);
      })
      .catch(() => {
        if (
          id === 'zen-music' &&
          this.ctx === ctx &&
          this.config.enabled &&
          this.config.music &&
          !this.hidden &&
          !this.externalMusic &&
          this.environment !== 'other' &&
          this.environment !== 'melody'
        )
          useRadioPlayback.setState({
            playing: false,
            loading: false,
            error: 'Music couldn’t load. Tap Retry to try again.',
          });
      })
      .finally(() => this.loading.delete(id));
  }
  private sample(id: string, pan: number) {
    this.load(id);
    const variants = ['step', 'step-soft-2', 'step-soft-3'];
    const variant = id === 'step' ? variants[this.stepVariant++ % variants.length] : id;
    const buffer = this.buffers.get(variant) ?? this.buffers.get(id);
    if (!buffer || !this.ctx) return false;
    const source = this.ctx.createBufferSource(),
      gain = this.ctx.createGain(),
      stereo = this.ctx.createStereoPanner();
    source.buffer = buffer;
    const footstep = id === 'step';
    source.playbackRate.value = footstep
      ? 0.94 + Math.random() * 0.12
      : 0.97 + Math.random() * 0.06;
    gain.gain.value = footstep ? 0.52 + Math.random() * 0.08 : 0.65;
    stereo.pan.value = pan;
    source.connect(gain);
    gain.connect(stereo);
    stereo.connect(this.fx!);
    this.track(source, [source, gain, stereo], false);
    source.start();
    return true;
  }
  cue(id: SoundCue, pan = 0) {
    if (
      !this.ctx ||
      this.ctx.state !== 'running' ||
      !this.config.enabled ||
      !this.config.effects ||
      this.hidden ||
      this.externalMusic
    )
      return;
    const now = performance.now();
    if (
      now - (this.last.get(id) ?? -Infinity) < (id === 'water' ? 200 : id === 'step' ? 280 : 90) ||
      this.voices.size > 28
    )
      return;
    this.last.set(id, now);
    if (this.sample(id, pan)) return;
    // Keep walking quiet until its soft foley is ready; never substitute a beeping thud.
    if (id === 'step') return;
    if (['tap', 'lamp'].includes(id)) {
      this.texture(0.09, 0.15, 800, pan);
      this.tone(460, 0.09, 0.035, 0, false, pan);
    } else if (['bounce', 'place'].includes(id)) {
      this.tone(id === 'bounce' ? 160 : 105, 0.18, 0.13, 0, false, pan);
      this.texture(0.16, 0.18, 480, pan);
    } else if (id === 'bite') {
      this.texture(0.23, 0.55, 1500, pan);
      this.tone(270, 0.1, 0.045, 0, false, pan);
    } else if (id === 'sip') this.texture(0.65, 0.3, 1100, pan);
    else if (id === 'cloth' || id === 'sleep') this.texture(0.55, 0.25, 620, pan);
    else if (id === 'water') {
      this.texture(0.5, 0.35, 1900, pan);
      this.tone(750 + Math.random() * 400, 0.11, 0.018, 0.06, false, pan);
    } else if (id === 'cup') {
      this.tone(1050, 0.42, 0.055, 0, false, pan);
      this.tone(1590, 0.24, 0.025, 0.01, false, pan);
    } else {
      const tune =
        id === 'checkin'
          ? [261.63, 329.63, 392, 523.25]
          : id === 'bloom'
            ? [392, 523.25, 659.25]
            : id === 'cuddle'
              ? [329.63, 392]
              : id === 'purchase'
                ? [392, 523.25]
                : [261.63, 392, 523.25];
      tune.forEach((n, i) => this.tone(n, 0.8, 0.075, i * 0.17, false, pan));
    }
  }
  private startMusic() {
    if (this.musicSource) {
      useRadioPlayback.setState({
        playing: this.ctx?.state === 'running',
        loading: false,
        error: '',
      });
      return;
    }
    if (!this.ctx || this.ctx.state !== 'running') return;
    const buffer = this.buffers.get('zen-music');
    if (!buffer) {
      // Preserve a failure until an explicit Play/Retry action; avoid retry loops
      // when unrelated sound settings update the mixer.
      if (useRadioPlayback.getState().error) return;
      useRadioPlayback.setState({ playing: false, loading: true });
      this.load('zen-music');
      return;
    }
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    // The loop is edited and mastered as an asset, not crossfaded into an arbitrary outro here.
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = MUSIC_LOOP.loopStart;
    source.loopEnd = Math.min(MUSIC_LOOP.loopEnd, buffer.duration);
    source.connect(gain);
    gain.connect(this.musicBus!);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.45);
    this.musicOffset %= source.loopEnd - source.loopStart;
    this.musicStartedAt = ctx.currentTime;
    source.start(ctx.currentTime, source.loopStart + this.musicOffset);
    this.musicSource = source;
    this.musicGain = gain;
    useRadioPlayback.setState({ playing: true, loading: false, error: '' });
  }
  private stopMusic() {
    const radio = useRadioPlayback.getState();
    if (radio.playing || radio.loading || radio.error)
      useRadioPlayback.setState({ playing: false, loading: false, error: '' });
    const source = this.musicSource;
    const gain = this.musicGain;
    if (source && this.ctx) {
      const now = this.ctx.currentTime;
      this.musicOffset =
        (this.musicOffset + now - this.musicStartedAt) % (source.loopEnd - source.loopStart);
      const fade = this.hidden || this.externalMusic || this.ctx.state !== 'running' ? 0 : 0.08;
      if (gain) {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + fade);
      }
      source.onended = () => {
        source.disconnect();
        gain?.disconnect();
      };
      source.stop(now + fade);
      this.musicSource = null;
      this.musicGain = null;
    }
    this.stopVoices(true);
  }
  dispose() {
    this.stopSpeech();
    this.speechBuffers.clear();
    this.stopMusic();
    this.stopVoices(false);
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.buffers.clear();
    this.musicOffset = 0;
  }
}
export const appAudio = new AppAudio();

if (import.meta.env.DEV) {
  (window as unknown as { __appAudio?: typeof appAudio }).__appAudio = appAudio;
}
