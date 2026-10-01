import { AudioEngine } from './audio.js';
import { Engine } from './engine.js';
import { View2D } from './view2d.js';
import { MODELS, BICOLOR_CHOICES } from './models.js';
import { compileCustom, getEffect, effectAvailable } from './effects.js';
import { DEFAULT_COLORS, BICOLOR_DEFAULT } from './presets.js';
import { initUI } from './ui.js';
import { debounce } from './util.js';

const KEY = 'cps.v1';
const $ = (s) => document.querySelector(s);

const defaults = () => ({
  model: 'rgb-pro', view: '2d', mount: 'wall', ambient: 0, autoRotate: false,
  power: true, brightness: 1, speed: 1, text: 'FARMACIA 24 H',
  scene: { anim: 'rainbow', colors: [...DEFAULT_COLORS], params: {}, speed: 1, audioMix: 0, rev: 0 },
  customs: [],
  seq: { items: [], playing: false, idx: 0, elapsed: 0 },
  audio: { sens: 1, auto: true },
});

function load() {
  const base = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && typeof saved === 'object') {
      Object.assign(base, saved, { seq: { ...base.seq, items: saved.seq?.items || [] }, scene: { ...base.scene, ...saved.scene } });
    }
  } catch (_) { /* almacenamiento no disponible */ }
  if (!MODELS[base.model]) base.model = 'rgb-pro';
  base.seq.playing = false;
  return base;
}

const state = load();
const audio = new AudioEngine();
const engine = new Engine(audio);
const v2 = new View2D($('#c2d'));
let v3 = null;
let v3Module = null;

const save = debounce(() => {
  try {
    const { seq, ...rest } = state;
    localStorage.setItem(KEY, JSON.stringify({ ...rest, seq: { items: seq.items } }));
  } catch (_) { /* nada */ }
}, 400);

function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.className = 'toast' + (err ? ' err' : ''); }, err ? 5200 : 2400);
}

// Registrar animaciones personalizadas guardadas
state.customs.forEach((c) => compileCustom(c.id, c.name, c.code));

/** Escena que se está mostrando: la del secuenciador si está en marcha, o la manual. */
function liveScene() {
  const s = state.seq;
  if (s.playing && s.items.length) return s.items[s.idx % s.items.length].scene;
  return state.scene;
}

function normalizeScene() {
  const model = MODELS[state.model], sc = state.scene;
  if (model.color.type === 'bicolor') {
    const ok = BICOLOR_CHOICES.map((c) => c.id);
    if (!sc.colors.every((c) => ok.includes(c))) sc.colors = [...BICOLOR_DEFAULT];
  } else if (sc.colors.length < 3 || !/^#/.test(sc.colors[0])) {
    sc.colors = [...DEFAULT_COLORS];
  }
  if (!effectAvailable(getEffect(sc.anim), { ...model, zoneCount: model.zones.length })) { sc.anim = 'pulse'; sc.params = {}; }
}

async function ensure3D() {
  if (v3) return v3;
  if (!v3Module) v3Module = await import('./view3d.js');
  v3 = new v3Module.View3D($('#c3d'));
  v3.setModel(engine.model);
  v3.setMount(state.mount);
  v3.setAmbient(state.ambient);
  v3.setAutoRotate(state.autoRotate);
  return v3;
}

const app = {
  state, engine, audio, toast, save,
  get v3() { return v3; },
  liveScene,
  setModel(id) {
    state.model = id;
    engine.setModel(id);
    normalizeScene();
    v2.setModel(engine.model);
    if (v3) v3.setModel(engine.model);
    save();
  },
  async setView(view) {
    if (view === '3d') {
      try { await ensure3D(); } catch (e) {
        console.error(e);
        toast('No se pudo iniciar WebGL en este navegador. Se queda la vista 2D.', true);
        view = '2d';
      }
    }
    state.view = view;
    $('#c2d').hidden = view !== '2d';
    $('#c3d').hidden = view !== '3d';
    resize();
    save();
  },
  setMount(m) { state.mount = m; if (v3) v3.setMount(m); save(); },
  setAmbient(a) { state.ambient = a; v2.setAmbient(a); if (v3) v3.setAmbient(a); save(); },
  setAutoRotate(v) { state.autoRotate = v; if (v3) v3.setAutoRotate(v); save(); },
  capture() {
    if (state.view === '3d' && v3) { v3.render(engine); return v3.capture(); }
    v2.render(engine);
    return $('#c2d').toDataURL('image/png');
  },
};

function resize() {
  v2.resize();
  if (v3) v3.resize();
}
new ResizeObserver(resize).observe($('#stage'));

audio.sens = state.audio.sens;
audio.auto = state.audio.auto;
normalizeScene();
engine.setModel(state.model);
engine.global = state;
v2.setModel(engine.model);
v2.setAmbient(state.ambient);

const ui = initUI(app);

// Bucle principal
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  audio.update(dt);

  const sq = state.seq;
  if (sq.playing && sq.items.length) {
    sq.elapsed += dt;
    const cur = sq.items[sq.idx % sq.items.length];
    if (sq.elapsed >= (cur.dur || 5)) {
      sq.elapsed = 0;
      sq.idx = (sq.idx + 1) % sq.items.length;
      ui.onSeqStep();
    }
  }
  engine.global.power = state.power;
  engine.sync(liveScene());
  engine.update(dt);
  if (state.view === '3d' && v3) v3.render(engine); else v2.render(engine);
  ui.tick(dt);
  requestAnimationFrame(frame);
}
resize();
if (state.view === '3d') app.setView('3d');
requestAnimationFrame(frame);

// Útil para depurar desde la consola del navegador
window.cps = app;
