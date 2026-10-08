// Every sound is synthesised with WebAudio — no audio files needed.

const PENTA = [0, 2, 4, 7, 9];

function noteFreq(semitonesFromA4: number): number {
  return 440 * Math.pow(2, semitonesFromA4 / 12);
}

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private musicTimer = 0;
  private nextNoteTime = 0;
  private step = 0;
  private tempo = 1;

  sfxOn = true;
  musicOn = true;

  constructor() {
    try {
      this.sfxOn = localStorage.getItem('cattris.sfx') !== 'off';
      this.musicOn = localStorage.getItem('cattris.music') !== 'off';
    } catch {
      /* storage unavailable */
    }
  }

  /** Must be called from a user gesture. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = this.sfxOn ? 0.9 : 0;
      this.sfx.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.musicOn ? 0.22 : 0;
      this.musicBus.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setSfx(on: boolean): void {
    this.sfxOn = on;
    if (this.ctx) this.sfx.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.02);
    try {
      localStorage.setItem('cattris.sfx', on ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.1);
    try {
      localStorage.setItem('cattris.music', on ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }

  private get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  private env(g: GainNode, t: number, peak: number, attack: number, dur: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  private tone(freq: number, dur: number, type: OscillatorType, peak: number, at = 0, endFreq?: number, out?: AudioNode): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    this.env(g, t, peak, Math.min(0.01, dur / 4), dur);
    o.connect(g).connect(out ?? this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noiseBurst(dur: number, freq: number, q: number, peak: number, at = 0, type: BiquadFilterType = 'bandpass'): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, t, peak, 0.005, dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  /** A synthesised "mi-yaaw". pitch 1 = normal kitten. */
  meow(pitch = 1, length = 0.42, at = 0, vol = 0.32): void {
    if (!this.ready || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const base = 560 * pitch;
    const out = ctx.createGain();
    this.env(out, t, vol, 0.04, length);
    out.connect(this.sfx);

    // Formant filter sweeps "ee" → "aa" → "oo" to imitate the mouth opening.
    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.Q.value = 3.5;
    formant.frequency.setValueAtTime(1400 * pitch, t);
    formant.frequency.linearRampToValueAtTime(2300 * pitch, t + length * 0.35);
    formant.frequency.linearRampToValueAtTime(900 * pitch, t + length);
    const body = ctx.createBiquadFilter();
    body.type = 'lowpass';
    body.frequency.value = 3200 * pitch;

    const vib = ctx.createOscillator();
    vib.frequency.value = 7;
    const vibGain = ctx.createGain();
    vibGain.gain.value = base * 0.02;
    vib.connect(vibGain);

    for (const [type, mult, level] of [['sawtooth', 1, 0.9], ['triangle', 2, 0.5]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(base * mult * 0.85, t);
      o.frequency.linearRampToValueAtTime(base * mult * 1.35, t + length * 0.3);
      o.frequency.linearRampToValueAtTime(base * mult * 0.8, t + length);
      vibGain.connect(o.frequency);
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(formant);
      o.start(t);
      o.stop(t + length + 0.05);
    }
    formant.connect(body).connect(out);
    vib.start(t);
    vib.stop(t + length + 0.05);
  }

  purr(dur = 0.6, at = 0): void {
    if (!this.ready || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 48;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const am = ctx.createGain();
    am.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 24;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain).connect(am.gain);
    const g = ctx.createGain();
    this.env(g, t, 0.35, 0.08, dur);
    o.connect(lp).connect(am).connect(g).connect(this.sfx);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }

  /** Cat hiss: a breathy burst of high-passed noise. */
  hiss(loud = true, at = 0): void {
    if (!this.ready || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const dur = loud ? 0.55 : 0.4;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const bp = ctx.createBiquadFilter();
    bp.type = 'peaking';
    bp.frequency.setValueAtTime(4200, t);
    bp.frequency.linearRampToValueAtTime(6000, t + dur);
    bp.gain.value = 9;
    const g = ctx.createGain();
    const peak = loud ? 0.42 : 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.025);
    g.gain.setValueAtTime(peak * 0.85, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(hp).connect(bp).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 0.4);
    src.stop(t + dur + 0.05);
  }

  /** Low throaty growl. */
  growl(at = 0, dur = 0.7): void {
    if (!this.ready || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t);
    o.frequency.linearRampToValueAtTime(150, t + dur * 0.5);
    o.frequency.linearRampToValueAtTime(95, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    lp.Q.value = 4;
    const trem = ctx.createGain();
    trem.gain.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 19;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.4;
    lfo.connect(lfoGain).connect(trem.gain);
    const g = ctx.createGain();
    this.env(g, t, 0.3, 0.06, dur);
    o.connect(lp).connect(trem).connect(g).connect(this.sfx);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }

  /** A cartoon cat fight: yowls, hisses, scratches and thumps. */
  fight(): void {
    if (!this.ready) return;
    this.meow(0.7, 0.7, 0, 0.3);
    this.growl(0.05, 1.1);
    this.hiss(true, 0.1);
    for (let i = 0; i < 9; i++) {
      const at = 0.15 + i * 0.11 + Math.random() * 0.05;
      if (i % 3 === 0) this.meow(0.9 + Math.random() * 0.9, 0.16 + Math.random() * 0.12, at, 0.2);
      else this.noiseBurst(0.05, 2500 + Math.random() * 2500, 2, 0.25, at);
      if (i % 2 === 0) this.tone(140, 0.09, 'sine', 0.25, at, 50);
    }
    this.hiss(false, 1.05);
  }

  /** Short happy "mrrp?" chirp. */
  chirp(): void {
    if (!this.ready) return;
    this.meow(1.55 + Math.random() * 0.2, 0.17, 0, 0.16);
  }

  move(): void {
    if (!this.ready) return;
    this.tone(880, 0.05, 'sine', 0.08, 0, 620);
  }

  rotate(): void {
    if (!this.ready) return;
    this.tone(620, 0.09, 'triangle', 0.12, 0, 1150);
  }

  softDrop(): void {
    if (!this.ready) return;
    this.tone(300, 0.03, 'sine', 0.04, 0, 260);
  }

  land(): void {
    if (!this.ready) return;
    this.noiseBurst(0.07, 900, 1.2, 0.18);
    this.tone(220, 0.08, 'sine', 0.12, 0, 120);
  }

  hardDrop(): void {
    if (!this.ready) return;
    this.tone(180, 0.18, 'sine', 0.4, 0, 45);
    this.noiseBurst(0.14, 500, 0.8, 0.3);
    this.meow(1.25 + Math.random() * 0.2, 0.22, 0.04, 0.18);
  }

  hold(): void {
    if (!this.ready) return;
    this.noiseBurst(0.18, 2200, 0.7, 0.12);
    this.tone(520, 0.12, 'triangle', 0.1, 0.02, 780);
  }

  clear(count: number, combo: number): void {
    if (!this.ready) return;
    const root = 3 + Math.min(combo, 6) * 2;
    const notes = count >= 4 ? [0, 4, 7, 12, 16, 19] : [0, 4, 7, 12].slice(0, count + 1);
    notes.forEach((n, i) => this.tone(noteFreq(root + n + 12), 0.28, 'triangle', 0.16, i * 0.06));
    notes.forEach((n, i) => this.tone(noteFreq(root + n + 24), 0.18, 'sine', 0.06, i * 0.06 + 0.03));
    if (count >= 4) {
      this.meow(1.4, 0.45, 0.1, 0.3);
      this.meow(1.05, 0.5, 0.3, 0.26);
      this.purr(0.9, 0.2);
    } else {
      this.meow(1 + count * 0.12 + Math.random() * 0.1, 0.36, 0.05, 0.26);
    }
  }

  levelUp(): void {
    if (!this.ready) return;
    [0, 4, 7, 12, 7, 12, 16].forEach((n, i) => this.tone(noteFreq(n + 15), 0.2, 'square', 0.06, i * 0.08));
    this.meow(1.5, 0.3, 0.55, 0.25);
  }

  gameOver(): void {
    if (!this.ready) return;
    this.meow(0.75, 0.9, 0, 0.32);
    [7, 4, 0, -5].forEach((n, i) => this.tone(noteFreq(n), 0.35, 'triangle', 0.12, 0.5 + i * 0.22));
  }

  start(): void {
    if (!this.ready) return;
    this.meow(1.15, 0.35, 0, 0.28);
    [0, 4, 7, 12].forEach((n, i) => this.tone(noteFreq(n + 15), 0.16, 'triangle', 0.1, 0.25 + i * 0.07));
  }

  click(): void {
    if (!this.ready) return;
    this.tone(1200, 0.04, 'sine', 0.08, 0, 900);
  }

  // ------------------------------------------------------------ music box

  setTempo(level: number): void {
    this.tempo = 1 + Math.min(level - 1, 10) * 0.035;
  }

  startMusic(): void {
    if (!this.ctx || this.musicTimer) return;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 50);
  }

  stopMusic(): void {
    window.clearInterval(this.musicTimer);
    this.musicTimer = 0;
  }

  private scheduleMusic(): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    // 32-step lullaby on a pentatonic scale, chord changes every 8 steps.
    const melody = [
      9, -1, 7, 4, 7, -1, 9, 12, 14, -1, 12, 9, 7, -1, 4, -1,
      2, -1, 4, 7, 9, -1, 7, 4, 2, 4, 0, -1, 2, -1, -1, -1,
      9, -1, 12, 14, 16, -1, 14, 12, 9, -1, 7, 9, 12, -1, 9, -1,
      7, -1, 4, 2, 4, -1, 7, 4, 2, -1, 0, -1, 0, -1, -1, -1,
    ];
    const bass = [-12, -5, -3, -8];
    const stepDur = 0.2 / this.tempo;
    while (this.nextNoteTime < this.ctx.currentTime + 0.25) {
      const t = this.nextNoteTime - this.ctx.currentTime;
      const n = melody[this.step % melody.length];
      if (n >= 0) {
        this.tone(noteFreq(n + 3), 0.5, 'sine', 0.22, t, undefined, this.musicBus);
        this.tone(noteFreq(n + 15), 0.25, 'sine', 0.05, t, undefined, this.musicBus);
      }
      if (this.step % 8 === 0) {
        const b = bass[Math.floor(this.step / 16) % bass.length];
        this.tone(noteFreq(b - 6), 1.2, 'triangle', 0.2, t, undefined, this.musicBus);
      }
      if (this.step % 4 === 2) {
        const p = PENTA[(this.step / 2) % PENTA.length | 0];
        this.tone(noteFreq(p + 3 - 12), 0.3, 'sine', 0.08, t, undefined, this.musicBus);
      }
      this.step++;
      this.nextNoteTime += stepDur;
    }
  }
}
