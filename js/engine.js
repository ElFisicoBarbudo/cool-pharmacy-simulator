import { buildModel, makeColorMapper } from './models.js';
import { getEffect } from './effects.js';
import { hexToRgb, clamp } from './util.js';

const FADE = 0.7; // segundos de fundido entre animaciones

/**
 * Calcula, fotograma a fotograma, el color de cada LED del modelo activo.
 * El resultado queda en `buf` (RGB 0..1 por LED, ya con el color físico del LED aplicado).
 */
export class Engine {
  constructor() {
    this.cur = null;
    this.prev = null;
    this.fade = 1;
    this.global = { power: true, brightness: 1, speed: 1 };
    this.o = [0, 0, 0];
    this.m = [0, 0, 0];
    this.t = [0, 0, 0];
    this.setModel('rgb-pro');
  }

  setModel(id) {
    this.model = buildModel(id);
    this.leds = this.model.leds;
    this.mapper = makeColorMapper(this.model);
    const n = this.leds.length * 3;
    this.buf = new Float32Array(n);
    this.bufB = new Float32Array(n);
    this.cur = this.prev = null; // se reconstruye con sync()
    this.fade = 1;
  }

  _runtime(scene) {
    return { scene, animId: scene.anim, customRev: scene.rev, effect: getEffect(scene.anim), time: 0, state: {}, c: { state: null } };
  }

  /** Asegura que el efecto en marcha corresponde a la escena indicada. */
  sync(scene) {
    if (!this.cur) { this.cur = this._runtime(scene); this.fade = 1; return; }
    if (this.cur.animId !== scene.anim || this.cur.customRev !== scene.rev) {
      this.prev = this.cur;
      this.cur = this._runtime(scene);
      this.fade = 0;
    } else {
      this.cur.scene = scene;
    }
  }

  _palette(scene) {
    const t = this.model.color.type;
    if (t === 'mono') return [[1, 1, 1], [1, 1, 1], [1, 1, 1]];
    const cols = scene.colors || ['#00ff66', '#ff1744', '#2979ff'];
    return cols.map(hexToRgb);
  }

  _render(rt, dt, dest) {
    const sc = rt.scene, g = this.global;
    const speed = (sc.speed ?? 1) * g.speed;
    rt.time += dt * speed;
    const [c1, c2, c3] = this._palette(sc);
    const c = rt.c;
    c.t = rt.time; c.dt = dt * speed; c.c1 = c1; c.c2 = c2; c.c3 = c3;
    c.p = sc.params || {}; c.model = this.model;
    c.state = rt.state;
    const ef = rt.effect;
    if (ef.frame) ef.frame(c);
    const o = this.o;
    const leds = this.leds;
    for (let i = 0; i < leds.length; i++) {
      ef.px(leds[i], c, o);
      const k = i * 3;
      dest[k] = o[0]; dest[k + 1] = o[1]; dest[k + 2] = o[2];
    }
  }

  update(dt) {
    if (!this.cur) return;
    const buf = this.buf;
    this._render(this.cur, dt, buf);
    if (this.prev && this.fade < 1) {
      this.fade = Math.min(1, this.fade + dt / FADE);
      this._render(this.prev, dt, this.bufB);
      const f = this.fade, B = this.bufB;
      for (let i = 0; i < buf.length; i++) buf[i] = B[i] + (buf[i] - B[i]) * f;
      if (this.fade >= 1) this.prev = null;
    }
    const br = this.global.power ? this.global.brightness : 0;
    const map = this.mapper, m = this.m;
    this.avg = 0;
    for (let i = 0; i < buf.length; i += 3) {
      let r = buf[i], g = buf[i + 1], b = buf[i + 2];
      if (map) {
        m[0] = r; m[1] = g; m[2] = b;
        const t = this.t;
        map(m, t);
        r = t[0]; g = t[1]; b = t[2];
      }
      r = clamp(r * br); g = clamp(g * br); b = clamp(b * br);
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b;
      this.avg += r + g + b;
    }
    this.avg /= buf.length || 1;
  }

  /** Color medio emitido (para iluminar el entorno). */
  averageColor() {
    const buf = this.buf, n = buf.length / 3;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < buf.length; i += 3) { r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; }
    return [r / n, g / n, b / n];
  }
}
