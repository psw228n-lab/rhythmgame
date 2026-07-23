export class AudioManager {
  readonly element: HTMLAudioElement;
  private context: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private gain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private cheerBuffer: AudioBuffer | null = null;
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
      this.cheerBuffer = this.createNoiseBuffer(2.2);
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

  fadeOutMusic(duration: number) {
    if (!this.gain || !this.context) return;
    const now = this.context.currentTime;
    const safeDuration = Math.max(0.1, duration);
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(Math.max(0, this.gain.gain.value), now);
    this.gain.gain.linearRampToValueAtTime(0, now + safeDuration);
  }

  resetMusicFade() {
    if (!this.gain || !this.context) return;
    const now = this.context.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.volume, now);
  }

  playHitSound() {
    if (!this.context || !this.sfxGain || this.context.state !== "running") return;
    const now = this.context.currentTime;
    this.playSnare(now);
  }

  playCrowdCheer() {
    if (!this.context || !this.sfxGain || !this.cheerBuffer || this.context.state !== "running") return;
    const now = this.context.currentTime;
    const crowd = this.context.createBufferSource();
    const highpass = this.context.createBiquadFilter();
    const lowpass = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    crowd.buffer = this.cheerBuffer;
    highpass.type = "highpass";
    highpass.frequency.value = 320;
    lowpass.type = "lowpass";
    lowpass.frequency.value = 4200;
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(0.34, now + 0.09);
    envelope.gain.setValueAtTime(0.28, now + 1.15);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
    crowd.connect(highpass).connect(lowpass).connect(envelope).connect(this.sfxGain);
    crowd.start(now);
    crowd.stop(now + 2.2);

    for (let index = 0; index < 7; index += 1) {
      const start = now + 0.04 + index * 0.065;
      const duration = 0.7 + (index % 3) * 0.18;
      const voice = this.context.createOscillator();
      const voiceEnvelope = this.context.createGain();
      voice.type = index % 2 === 0 ? "triangle" : "sawtooth";
      voice.frequency.setValueAtTime(260 + (index % 4) * 54, start);
      voice.frequency.exponentialRampToValueAtTime(390 + (index % 4) * 62, start + duration * 0.62);
      voiceEnvelope.gain.setValueAtTime(0.0001, start);
      voiceEnvelope.gain.exponentialRampToValueAtTime(0.026, start + 0.08);
      voiceEnvelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      voice.connect(voiceEnvelope).connect(this.sfxGain);
      voice.start(start);
      voice.stop(start + duration);
    }

    for (let index = 0; index < 12; index += 1) {
      this.playNoise(now + 0.12 + index * 0.13, 0.055, 2300, 0.055 + (index % 3) * 0.012);
    }
  }

  private playSnare(now: number) {
    if (!this.context || !this.sfxGain) return;
    this.playNoise(now, 0.1, 1700, 0.38);
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(180, now);
    oscillator.frequency.exponentialRampToValueAtTime(112, now + 0.08);
    envelope.gain.setValueAtTime(0.3, now);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    oscillator.connect(envelope).connect(this.sfxGain);
    oscillator.start(now);
    oscillator.stop(now + 0.11);
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
