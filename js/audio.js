import { clamp } from './util.js';

const BANDS = 32;

/**
 * Motor de audio: captura sonido (micrófono, pestaña, archivo o demo interna) y
 * expone un estado normalizado 0..1 que usan los efectos.
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.source = null; // 'mic' | 'tab' | 'file' | 'demo' | null
    this.label = '';
    this.sens = 1;
    this.auto = true;
    this.cleanup = null;
    this.onChange = () => {};
    this.state = {
      level: 0, bass: 0, mid: 0, treble: 0, beat: 0, beatCount: 0,
      spec: new Float32Array(BANDS), active: false, simulated: true,
    };
    this._peak = 0.2;
    this._bassAvg = 0;
    this._lastBeat = -1;
    this._time = 0;
    this._demoMute = false;
  }

  _ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  _attach(node, { monitor = false } = {}) {
    const ctx = this._ensureCtx();
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    an.smoothingTimeConstant = 0.55;
    an.minDecibels = -90;
    an.maxDecibels = -12;
    node.connect(an);
    if (monitor) an.connect(ctx.destination);
    this.analyser = an;
    this.freq = new Uint8Array(an.frequencyBinCount);
    this._peak = 0.2;
  }

  stop() {
    if (this.cleanup) { try { this.cleanup(); } catch (_) { /* nada */ } }
    this.cleanup = null;
    this.analyser = null;
    this.source = null;
    this.label = '';
    this.state.active = false;
    this.onChange();
  }

  async useMic() {
    this.stop();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const ctx = this._ensureCtx();
    const src = ctx.createMediaStreamSource(stream);
    this._attach(src);
    this.source = 'mic';
    this.label = 'Micrófono';
    this.cleanup = () => { stream.getTracks().forEach((t) => t.stop()); src.disconnect(); };
    this.onChange();
  }

  /** Captura el audio de una pestaña (p. ej. YouTube o Spotify). Solo Chrome/Edge de escritorio. */
  async useTab({ currentTab = false } = {}) {
    this.stop();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      throw new Error('Tu navegador no permite capturar audio de pestañas. Usa Chrome o Edge de escritorio.');
    }
    const opts = { video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } };
    if (currentTab) { opts.preferCurrentTab = true; opts.selfBrowserSurface = 'include'; }
    else { opts.systemAudio = 'include'; }
    const stream = await navigator.mediaDevices.getDisplayMedia(opts);
    if (!stream.getAudioTracks().length) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error('No se compartió audio. Vuelve a intentarlo y marca «Compartir audio de la pestaña».');
    }
    const ctx = this._ensureCtx();
    const src = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
    this._attach(src);
    this.source = 'tab';
    this.label = currentTab ? 'Esta pestaña' : 'Pestaña / sistema';
    const end = () => this.stop();
    stream.getTracks().forEach((t) => t.addEventListener('ended', end));
    this.cleanup = () => { stream.getTracks().forEach((t) => { t.removeEventListener('ended', end); t.stop(); }); src.disconnect(); };
    this.onChange();
  }

  /** Reproduce un archivo local con un <audio> y lo analiza. */
  useFile(file, audioEl) {
    this.stop();
    const url = URL.createObjectURL(file);
    audioEl.src = url;
    audioEl.hidden = false;
    const ctx = this._ensureCtx();
    if (!audioEl._node) audioEl._node = ctx.createMediaElementSource(audioEl);
    this._attach(audioEl._node, { monitor: true });
    audioEl.play().catch(() => {});
    this.source = 'file';
    this.label = file.name;
    this.cleanup = () => {
      audioEl.pause(); audioEl.hidden = true;
      try { audioEl._node.disconnect(); } catch (_) { /* nada */ }
      URL.revokeObjectURL(url);
    };
    this.onChange();
  }

  /** Pista electrónica generada con WebAudio, útil para probar sin música. */
  useDemo({ mute = false } = {}) {
    this.stop();
    const ctx = this._ensureCtx();
    const bus = ctx.createGain();
    bus.gain.value = 0.9;
    const out = ctx.createGain();
    out.gain.value = mute ? 0 : 0.55;
    bus.connect(out);
    out.connect(ctx.destination);
    this._demoOut = out;
    this._attach(bus);
    this.source = 'demo';
    this.label = 'Pista demo';

    const bpm = 124, step = 60 / bpm / 4;
    let next = ctx.currentTime + 0.05, n = 0;
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const bass = [55, 55, 82.4, 55, 73.4, 73.4, 98, 73.4];

    const kick = (t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      g.gain.setValueAtTime(1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.4);
    };
    const noiseHit = (t, freq, dur, vol) => {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f); f.connect(g); g.connect(bus); s.start(t); s.stop(t + dur + 0.02);
    };
    const note = (t, freq, dur, type, vol) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = type; o.frequency.value = freq; f.type = 'lowpass'; f.frequency.value = 900;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(f); f.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02);
    };
    const schedule = () => {
      while (next < ctx.currentTime + 0.12) {
        const s = n % 16;
        if (s % 4 === 0) kick(next);
        if (s === 4 || s === 12) noiseHit(next, 1800, 0.18, 0.5);
        if (s % 2 === 1) noiseHit(next, 7000, 0.05, 0.25);
        if (s % 2 === 0) note(next, bass[(n / 2 | 0) % 8], step * 1.6, 'sawtooth', 0.28);
        if (s % 4 === 2) note(next, bass[(n / 2 | 0) % 8] * 8, step * 0.9, 'square', 0.07);
        next += step; n++;
      }
    };
    const id = setInterval(schedule, 25);
    this.cleanup = () => { clearInterval(id); bus.disconnect(); out.disconnect(); this._demoOut = null; };
    this.onChange();
  }

  setDemoMute(m) { if (this._demoOut) this._demoOut.gain.value = m ? 0 : 0.55; }

  /** Señal sintética cuando no hay entrada, para poder previsualizar los efectos de sonido. */
  _simulate(dt) {
    this._time += dt;
    const beatT = (this._time * 124) / 60;
    const ph = beatT % 1;
    const kick = Math.exp(-ph * 5);
    const hat = Math.exp(-(((beatT * 2) % 1)) * 9) * 0.5;
    const s = this.state;
    s.bass = clamp(kick * 0.9 + 0.1);
    s.mid = clamp(0.3 + 0.2 * Math.sin(this._time * 1.3) + kick * 0.2);
    s.treble = clamp(hat + 0.15);
    s.level = clamp(s.bass * 0.55 + s.mid * 0.3 + s.treble * 0.2);
    for (let i = 0; i < BANDS; i++) {
      const f = i / BANDS;
      s.spec[i] = clamp(kick * (1 - f) * 1.1 + hat * f + 0.15 * Math.sin(this._time * 2 + i * 0.7) * 0.5 + 0.12);
    }
    if (Math.floor(beatT) !== this._lastBeat) { this._lastBeat = Math.floor(beatT); s.beat = 1; s.beatCount++; }
  }

  update(dt) {
    const s = this.state;
    s.beat = Math.max(0, s.beat - dt * 4.5);
    if (!this.analyser) {
      s.active = false;
      s.simulated = true;
      this._simulate(dt);
      return;
    }
    s.active = true;
    s.simulated = false;
    const an = this.analyser, f = this.freq;
    an.getByteFrequencyData(f);
    const hz = this.ctx.sampleRate / an.fftSize;
    const avg = (lo, hi) => {
      const a = Math.max(1, Math.floor(lo / hz)), b = Math.min(f.length - 1, Math.ceil(hi / hz));
      let sum = 0;
      for (let i = a; i <= b; i++) sum += f[i];
      return sum / (b - a + 1) / 255;
    };
    const raw = { bass: avg(30, 150), mid: avg(150, 2000), treble: avg(2000, 10000) };
    let level = raw.bass * 0.45 + raw.mid * 0.4 + raw.treble * 0.3;

    // Control automático de ganancia: normaliza al pico reciente
    this._peak = Math.max(level, this._peak - dt * 0.03, 0.12);
    const gain = (this.auto ? 0.75 / this._peak : 1.4) * this.sens;
    const sm = (cur, tgt) => (tgt > cur ? tgt : cur + (tgt - cur) * Math.min(1, dt * 9));
    s.level = sm(s.level, clamp(level * gain));
    s.bass = sm(s.bass, clamp(raw.bass * gain * 1.05));
    s.mid = sm(s.mid, clamp(raw.mid * gain * 1.3));
    s.treble = sm(s.treble, clamp(raw.treble * gain * 3.2));

    for (let i = 0; i < BANDS; i++) {
      const lo = 40 * Math.pow(12000 / 40, i / BANDS), hi = 40 * Math.pow(12000 / 40, (i + 1) / BANDS);
      s.spec[i] = sm(s.spec[i], clamp(avg(lo, hi) * gain * (1 + i / BANDS * 0.8)));
    }

    // Detección de golpes por energía de graves frente a su media móvil
    this._bassAvg += (s.bass - this._bassAvg) * Math.min(1, dt / 0.7);
    const now = performance.now() / 1000;
    if (s.bass > this._bassAvg * 1.22 + 0.06 && s.bass > 0.3 && now - this._beatAt > 0.2) {
      this._beatAt = now;
      s.beat = 1; s.beatCount++;
    }
  }
}
AudioEngine.prototype._beatAt = 0;
