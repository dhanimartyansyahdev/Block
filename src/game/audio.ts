import { SETTINGS_KEY } from './models';

export interface AudioSettings {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
}

class SoundAndHapticController {
  private ctx: AudioContext | null = null;
  private soundEnabled = true;
  private hapticsEnabled = true;

  constructor() {
    this.loadSettings();
  }

  private loadSettings(): void {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AudioSettings>;
        if (typeof parsed.soundEnabled === 'boolean') this.soundEnabled = parsed.soundEnabled;
        if (typeof parsed.hapticsEnabled === 'boolean') this.hapticsEnabled = parsed.hapticsEnabled;
      }
    } catch {
      // Ignore storage failures
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({
          soundEnabled: this.soundEnabled,
          hapticsEnabled: this.hapticsEnabled,
        }),
      );
    } catch {
      // Ignore storage failures
    }
  }

  public getSettings(): AudioSettings {
    return {
      soundEnabled: this.soundEnabled,
      hapticsEnabled: this.hapticsEnabled,
    };
  }

  public setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    this.saveSettings();
  }

  public setHapticsEnabled(enabled: boolean): void {
    this.hapticsEnabled = enabled;
    this.saveSettings();
  }

  private ensureContext(): AudioContext | null {
    if (!this.soundEnabled) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public vibrate(pattern: number | number[]): void {
    if (!this.hapticsEnabled) return;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch {
      // Ignore unsupported vibration APIs
    }
  }

  public playPickup(): void {
    this.vibrate(12);
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const jitter = 0.96 + Math.random() * 0.08;
    osc.frequency.setValueAtTime(340 * jitter, now);
    osc.frequency.exponentialRampToValueAtTime(520 * jitter, now + 0.065);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playDrop(): void {
    this.vibrate(18);
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const jitter = 0.95 + Math.random() * 0.1;
    osc.frequency.setValueAtTime(210 * jitter, now);
    osc.frequency.exponentialRampToValueAtTime(95 * jitter, now + 0.09);

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playInvalidDrop(): void {
    this.vibrate([10, 30, 10]);
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.linearRampToValueAtTime(120, now + 0.1);

    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playLineClear(linesCleared: number, comboStreak: number): void {
    this.vibrate(linesCleared >= 2 ? [25, 30, 45] : 28);
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Ascending pentatonic scale based on comboStreak
    const baseMidi = 60 + Math.min(comboStreak - 1, 6) * 2;
    const intervals = linesCleared >= 2 ? [0, 4, 7, 12] : [0, 4, 7];

    intervals.forEach((semitone, idx) => {
      const freq = 440 * Math.pow(2, (baseMidi + semitone - 69) / 12);
      const start = now + idx * 0.045;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx === intervals.length - 1 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, start);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.015, start + 0.24);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.11, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.26);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.28);
    });
  }

  public playPowerUp(): void {
    this.vibrate([20, 25, 25]);
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const start = now + i * 0.05;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.09, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  }

  public playGameOver(): void {
    this.vibrate([40, 40, 70]);
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [392.0, 349.23, 311.13, 261.63];
    notes.forEach((freq, i) => {
      const start = now + i * 0.11;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.1, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    });
  }
}

export const soundAndHaptics = new SoundAndHapticController();
