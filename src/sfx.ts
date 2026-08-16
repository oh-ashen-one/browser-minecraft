/**
 * CUBELAND — tiny procedural sound engine.
 * Every effect is synthesized from oscillators + a noise buffer through the
 * WebAudio API. No assets, no deps. Mute state persists to localStorage.
 */

export type SfxName =
  | 'ui'            // menu / inventory clicks
  | 'pick'          // mining tick while held
  | 'break_wood'
  | 'break_stone'
  | 'break_sand'
  | 'place'
  | 'hurt'          // player took damage
  | 'mob_hurt'
  | 'mob_die'
  | 'pickup'        // item pickup (pitch randomised)
  | 'ignite'        // furnace lit
  | 'smelt_done'    // item pops out of the furnace
  | 'nightfall'     // low bell when night begins
  | 'sunrise';      // rising bell at dawn

const MUTE_KEY = 'cubeland_muted_v1';
export const VOLUME = 0.5;

class SFX {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  muted: boolean;

  constructor() {
    let m = false;
    try { m = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* ignore */ }
    this.muted = m;
  }

  /** Create/resume the context. Must be called from a user gesture at least once. */
  ensure(): boolean {
    if (typeof window === 'undefined') return false;
    if (!this.ctx) {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : VOLUME;
      this.master.connect(this.ctx.destination);
      // 1s of white noise for percussive bits
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const ch = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return true;
  }

  setMuted(b: boolean): void {
    this.muted = b;
    try { localStorage.setItem(MUTE_KEY, b ? '1' : '0'); } catch { /* ignore */ }
    if (this.ctx && this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(b ? 0 : VOLUME, t, 0.02);
    }
  }

  /** Single oscillator voice with exponential-ish decay envelope. */
  private tone(
    freq0: number, freq1: number, dur: number,
    type: OscillatorType, peak: number, delay = 0,
  ): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq0), t0);
    if (freq1 !== freq0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq1), t0 + dur);
    g.gain.setValueAtTime(peak, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Filtered noise burst. */
  private noise(
    dur: number, freq: number, type: BiquadFilterType, peak: number,
    delay = 0, freqEnd?: number,
  ): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), t0 + dur);
    f.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0, Math.random() * 0.5, dur + 0.05);
    src.stop(t0 + dur + 0.06);
  }

  play(name: SfxName): void {
    if (!this.ensure()) return;
    switch (name) {
      case 'ui':
        this.tone(520, 760, 0.07, 'square', 0.12);
        this.noise(0.03, 5200, 'highpass', 0.05);
        break;
      case 'pick':
        this.noise(0.035, 2400, 'highpass', 0.06);
        break;
      case 'break_wood':
        this.noise(0.12, 950, 'lowpass', 0.3);
        this.tone(140, 85, 0.12, 'sine', 0.3);
        break;
      case 'break_stone':
        this.noise(0.1, 2600, 'lowpass', 0.32);
        this.tone(420, 180, 0.07, 'square', 0.12);
        break;
      case 'break_sand':
        this.noise(0.14, 3600, 'lowpass', 0.2);
        this.tone(95, 60, 0.1, 'sine', 0.12);
        break;
      case 'place':
        this.tone(200, 120, 0.07, 'sine', 0.3);
        this.noise(0.03, 1800, 'highpass', 0.07);
        break;
      case 'hurt':
        this.tone(320, 95, 0.28, 'sawtooth', 0.3);
        break;
      case 'mob_hurt':
        this.tone(190, 95, 0.12, 'square', 0.2);
        this.noise(0.06, 700, 'lowpass', 0.15);
        break;
      case 'mob_die': {
        const r = 0.9 + Math.random() * 0.3;
        this.tone(430 * r, 150 * r, 0.16, 'sine', 0.28);
        this.tone(340 * r, 110 * r, 0.2, 'sine', 0.24, 0.1);
        this.noise(0.18, 600, 'lowpass', 0.2);
        break;
      }
      case 'pickup': {
        const r = 0.9 + Math.random() * 0.25;
        this.tone(680 * r, 1350 * r, 0.09, 'square', 0.12);
        break;
      }
      case 'ignite':
        this.noise(0.5, 380, 'lowpass', 0.24, 0, 1600);
        this.tone(70, 45, 0.4, 'sine', 0.2);
        break;
      case 'smelt_done':
        this.tone(660, 660, 0.12, 'sine', 0.18);
        this.tone(880, 880, 0.16, 'sine', 0.18, 0.09);
        break;
      case 'nightfall':
        this.tone(233, 174, 0.9, 'triangle', 0.2);
        this.tone(116, 87, 1.2, 'triangle', 0.12, 0.15);
        break;
      case 'sunrise':
        this.tone(392, 523, 0.7, 'triangle', 0.16);
        this.tone(523, 784, 0.8, 'triangle', 0.12, 0.25);
        break;
    }
  }
}

export const sfx = new SFX();
