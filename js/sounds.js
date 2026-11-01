/* Generative soundscapes with the Web Audio API. No audio files, no network. */

export const SOUNDS = [
  {
    id: 'rain',
    name: 'Night rain',
    description: 'Soft rain on leaves, with a low, steady hush.',
    icon: 'rain',
    color: '#91b4ff',
    accent: 'rgba(126, 168, 255, 0.22)',
  },
  {
    id: 'ocean',
    name: 'Slow tide',
    description: 'Long waves rolling in and out at a sleepy pace.',
    icon: 'waves',
    color: '#7ee0c3',
    accent: 'rgba(103, 226, 190, 0.18)',
  },
  {
    id: 'brown',
    name: 'Brown noise',
    description: 'Deep, even static that softens a busy room.',
    icon: 'noise',
    color: '#c8b6ff',
    accent: 'rgba(174, 147, 255, 0.2)',
  },
  {
    id: 'fan',
    name: 'Old fan',
    description: 'A warm, low whirr for people who need a little hum.',
    icon: 'fan',
    color: '#ffc98b',
    accent: 'rgba(255, 193, 126, 0.18)',
  },
];

const VOLUME_KEY = 'somnia.volume.v1';

function smooth(context, param, value, seconds = 0.6) {
  const now = context.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, now + seconds);
}

function makeFilter(context, type, frequency, q = 0.7) {
  const filter = context.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  return filter;
}

class SoundEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.current = null;
    this.activeId = null;
    this.listeners = new Set();
    this.timerEndsAt = null;
    this.timerMinutes = 0;
    this.timerInterval = null;
    const stored = Number(localStorage.getItem(VOLUME_KEY));
    this.volume = Number.isFinite(stored) && stored > 0 ? Math.min(1, stored) : 0.55;
    this.volume = Math.max(0.05, this.volume);
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    const state = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (error) {
        console.error(error);
      }
    });
  }

  getState() {
    return {
      activeId: this.activeId,
      volume: this.volume,
      timerEndsAt: this.timerEndsAt,
      timerMinutes: this.timerMinutes,
      remainingMs: this.timerEndsAt ? Math.max(0, this.timerEndsAt - Date.now()) : 0,
    };
  }

  async ensureContext() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('This browser does not support Web Audio.');
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') await this.context.resume();
    return this.context;
  }

  noiseBuffer(kind = 'white') {
    const context = this.context;
    const length = Math.floor(context.sampleRate * 4);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;

    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      if (kind === 'brown') {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.2;
      } else if (kind === 'pink') {
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.11;
      } else {
        data[i] = white * 0.7;
      }
    }
    return buffer;
  }

  build(id, output) {
    const context = this.context;
    const gain = context.createGain();
    gain.gain.value = 1;
    gain.connect(output);
    const sources = [];
    const nodes = [gain];

    const loopSource = (kind) => {
      const source = context.createBufferSource();
      source.buffer = this.noiseBuffer(kind);
      source.loop = true;
      sources.push(source);
      return source;
    };

    if (id === 'rain') {
      const hiss = loopSource('white');
      const highpass = makeFilter(context, 'highpass', 950);
      const lowpass = makeFilter(context, 'lowpass', 7800);
      const level = context.createGain();
      level.gain.value = 0.3;
      hiss.connect(highpass).connect(lowpass).connect(level).connect(gain);
      nodes.push(highpass, lowpass, level);

      const body = loopSource('brown');
      const bodyFilter = makeFilter(context, 'lowpass', 380);
      const bodyLevel = context.createGain();
      bodyLevel.gain.value = 0.5;
      body.connect(bodyFilter).connect(bodyLevel).connect(gain);
      nodes.push(bodyFilter, bodyLevel);
    } else if (id === 'ocean') {
      const surf = loopSource('brown');
      const lowpass = makeFilter(context, 'lowpass', 720);
      const swell = context.createGain();
      swell.gain.value = 0.55;
      surf.connect(lowpass).connect(swell).connect(gain);
      nodes.push(lowpass, swell);

      const lfo = context.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.065;
      const lfoDepth = context.createGain();
      lfoDepth.gain.value = 0.32;
      lfo.connect(lfoDepth).connect(swell.gain);
      lfo.start();
      sources.push(lfo);
      nodes.push(lfoDepth);

      const foam = loopSource('white');
      const foamFilter = makeFilter(context, 'bandpass', 1600, 0.5);
      const foamLevel = context.createGain();
      foamLevel.gain.value = 0.025;
      foam.connect(foamFilter).connect(foamLevel).connect(gain);
      nodes.push(foamFilter, foamLevel);
    } else if (id === 'fan') {
      const whirr = loopSource('brown');
      const lowpass = makeFilter(context, 'lowpass', 900);
      const rumble = makeFilter(context, 'highpass', 90);
      const level = context.createGain();
      level.gain.value = 0.62;
      whirr.connect(lowpass).connect(rumble).connect(level).connect(gain);
      nodes.push(lowpass, rumble, level);

      const motor = loopSource('white');
      const motorFilter = makeFilter(context, 'bandpass', 240, 1.4);
      const motorLevel = context.createGain();
      motorLevel.gain.value = 0.045;
      motor.connect(motorFilter).connect(motorLevel).connect(gain);
      nodes.push(motorFilter, motorLevel);
    } else {
      const noise = loopSource('brown');
      const lowpass = makeFilter(context, 'lowpass', 2400);
      const level = context.createGain();
      level.gain.value = 0.7;
      noise.connect(lowpass).connect(level).connect(gain);
      nodes.push(lowpass, level);
    }

    sources.forEach((source) => {
      if (typeof source.start === 'function') {
        try {
          source.start();
        } catch {
          /* already started */
        }
      }
    });
    return { sources, nodes, gain };
  }

  cleanup(session, fade = 0.25) {
    if (!session) return;
    const now = this.context?.currentTime ?? 0;
    try {
      session.gain.gain.cancelScheduledValues(now);
      session.gain.gain.setValueAtTime(session.gain.gain.value, now);
      session.gain.gain.linearRampToValueAtTime(0, now + fade);
    } catch {
      /* noop */
    }
    window.setTimeout(() => {
      session.sources.forEach((source) => {
        try {
          source.stop();
        } catch {
          /* already stopped */
        }
      });
      session.nodes.forEach((node) => {
        try {
          node.disconnect();
        } catch {
          /* noop */
        }
      });
    }, fade * 1000 + 60);
  }

  async play(id) {
    if (!SOUNDS.some((sound) => sound.id === id)) return;
    await this.ensureContext();
    this.stopInternal(0.18, false);

    const output = this.context.createGain();
    output.gain.setValueAtTime(0.0001, this.context.currentTime);
    output.gain.linearRampToValueAtTime(1, this.context.currentTime + 1.2);
    output.connect(this.master);

    const built = this.build(id, output);
    this.current = { id, ...built, output };
    this.activeId = id;
    if (this.timerEndsAt && this.timerEndsAt <= Date.now()) {
      this.timerEndsAt = null;
      this.clearTimerInterval();
    }
    this.notify();
  }

  async toggle(id) {
    if (this.activeId === id) {
      this.stop();
      return false;
    }
    await this.play(id);
    if (this.timerEndsAt) this.notify();
    return true;
  }

  stop() {
    this.stopInternal(0.5, true);
  }

  stopInternal(fade = 0.4, clearTimer = true) {
    const session = this.current;
    this.current = null;
    this.activeId = null;
    if (session) this.cleanup(session, fade);
    if (clearTimer) this.clearTimer();
    this.notify();
  }

  setVolume(value) {
    this.volume = Math.min(1, Math.max(0.02, Number(value) || 0.02));
    if (this.master && this.context) smooth(this.context, this.master.gain, this.volume, 0.12);
    try {
      localStorage.setItem(VOLUME_KEY, String(this.volume));
    } catch {
      /* noop */
    }
    this.notify();
  }

  clearTimerInterval() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  clearTimer() {
    this.clearTimerInterval();
    this.timerEndsAt = null;
    this.timerMinutes = 0;
    this.notify();
  }

  setTimer(minutes) {
    this.clearTimerInterval();
    const amount = Number(minutes);
    if (!amount || amount <= 0) {
      this.timerEndsAt = null;
      this.timerMinutes = 0;
      this.notify();
      return false;
    }
    this.timerMinutes = amount;
    this.timerEndsAt = Date.now() + amount * 60000;
    this.timerInterval = setInterval(() => {
      if (!this.timerEndsAt) return;
      if (Date.now() >= this.timerEndsAt) {
        this.timerEndsAt = null;
        this.timerMinutes = 0;
        this.clearTimerInterval();
        this.stopInternal(1.5, true);
      } else {
        this.notify();
      }
    }, 1000);
    this.notify();
    return true;
  }
}

export const soundEngine = new SoundEngine();
