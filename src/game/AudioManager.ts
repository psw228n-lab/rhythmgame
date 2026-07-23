export class AudioManager {
  readonly element: HTMLAudioElement;
  private context: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private gain: GainNode | null = null;

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
      this.source.connect(this.gain).connect(this.context.destination);
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
    if (this.gain && this.context) {
      this.gain.gain.setTargetAtTime(value, this.context.currentTime, 0.015);
    } else {
      this.element.volume = value;
    }
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
