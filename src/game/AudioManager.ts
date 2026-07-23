export class AudioManager {
  readonly element: HTMLAudioElement;
  private context: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private gain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private volume = 1;

  constructor() {
    this.element = new Audio();
    this.element.preload = "auto";
  }

  async load(url: string) {
    this.element.pause();
    this.element.src = url;
    this.element.load();
    await new Promise<void>((resolve, reject) => {
      const ready = () => resolve();
      const failed = () => reject(new Error("음악 파일을 불러오지 못했습니다. public/audio/song.mp3를 확인해 주세요."));
      this.element.addEventListener("canplaythrough", ready, { once: true });
      this.element.addEventListener("error", failed, { once: true });
    });
  }

  async unlock() {
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) throw new Error("이 브라우저는 Web Audio API를 지원하지 않습니다.");
    if (!this.context) {
      this.context = new AudioContextClass();
      this.source = this.context.createMediaElementSource(this.element);
      this.gain = this.context.createGain();
      this.sfxGain = this.context.createGain();
      this.element.volume = 1;
      this.gain.gain.value = this.volume;
      this.sfxGain.gain.value = this.volume;
      this.noiseBuffer = this.createNoiseBuffer(0.18);
      this.source.connect(this.gain).connect(this.context.destination);
      this.sfxGain.connect(this.context.destination);
    }
    if (this.context.state === "suspended") await this.context.resume();
  }

  async play() {
    await this.unlock();
    await this.element.play();
  }

  pause() {
    this.element.pause();
  }

  seek(time: number) {
    this.element.currentTime = Math.max(0, Math.min(time, this.duration || time));
  }

  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.gain && this.context) {
      this.gain.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.015);
      this.sfxGain?.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.015);
    } else {
      this.element.volume = this.volume;
    }
  }

  playHitSound(lane: number) {
    if (!this.context || !this.sfxGain || this.context.state !== "running") return;
    const now = this.context.currentTime;
    if (lane === 0) {
      this.playKick(now);
    } else if (lane === 1) {
      this.playSnare(now);
    } else if (lane === 2) {
      this.playHiHat(now);
    } else {
      this.playTom(now);
    }
  }

  private playKick(now: number) {
    if (!this.context || !this.sfxGain) return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(155, now);
    oscillator.frequency.exponentialRampToValueAtTime(48, now + 0.14);
    envelope.gain.setValueAtTime(0.72, now);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    oscillator.connect(envelope).connect(this.sfxGain);
    oscillator.start(now);
    oscillator.stop(now + 0.17);
  }

  private playSnare(now: number) {
    if (!this.context || !this.sfxGain) return;
    this.playNoise(now, 0.14, 1200, 0.42);
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(190, now);
    oscillator.frequency.exponentialRampToValueAtTime(118, now + 0.1);
    envelope.gain.setValueAtTime(0.28, now);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    oscillator.connect(envelope).connect(this.sfxGain);
    oscillator.start(now);
    oscillator.stop(now + 0.13);
  }

  private playHiHat(now: number) {
    this.playNoise(now, 0.065, 6200, 0.34);
  }

  private playTom(now: number) {
    if (!this.context || !this.sfxGain) return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(235, now);
    oscillator.frequency.exponentialRampToValueAtTime(92, now + 0.16);
    envelope.gain.setValueAtTime(0.52, now);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    oscillator.connect(envelope).connect(this.sfxGain);
    oscillator.start(now);
    oscillator.stop(now + 0.19);
  }

  private playNoise(now: number, duration: number, highpassFrequency: number, level: number) {
    if (!this.context || !this.sfxGain || !this.noiseBuffer) return;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = "highpass";
    filter.frequency.value = highpassFrequency;
    envelope.gain.setValueAtTime(level, now);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(envelope).connect(this.sfxGain);
    source.start(now);
    source.stop(now + duration);
  }

  private createNoiseBuffer(duration: number) {
    if (!this.context) return null;
    const length = Math.ceil(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  get currentTime() {
    return this.element.currentTime || 0;
  }

  get duration() {
    return Number.isFinite(this.element.duration) ? this.element.duration : 0;
  }

  get paused() {
    return this.element.paused;
  }
}
