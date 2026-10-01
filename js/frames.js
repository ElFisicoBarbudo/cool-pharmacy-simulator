import { MODELS, BICOLOR_CHOICES, ledCount, builtModel } from './models.js';
import { registerFrames, removeFrames, setFramePixel, invalidateFrames } from './effects.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const el = (tag, props = {}, ...kids) => {
  const { dataset, ...rest } = props;
  const e = Object.assign(document.createElement(tag), rest);
  if (dataset) Object.assign(e.dataset, dataset);
  kids.flat().forEach((k) => e.append(k));
  return e;
};

const QUICK = ['#ffffff', '#ff2a2a', '#ff9a1f', '#ffe14a', '#2dff6a', '#22e5ff', '#3b6bff', '#d23bff'];
const DEFAULT_COLOR = { mono: '#ffffff', bicolor: '#00ff00', rgb: '#2dff6a' };

/** Editor de animaciones fotograma a fotograma: se pinta LED a LED sobre la vista 2D. */
export function initFrames(app, hooks) {
  const { state, v2 } = app;
  const canvas = $('#c2d'), stage = $('#stage');
  let cur = null, f = 0, tool = 'paint', color = DEFAULT_COLOR.rgb;
  let playing = false, active = false, painting = false, erasing = false, dirty = false;
  let undo = [];

  const model = () => MODELS[state.model];
  const mine = () => state.frameAnims.filter((e) => e.model === state.model);
  const blank = () => new Array(ledCount(state.model)).fill(null);
  const canPaint = () => active && cur && state.view === '2d' && !playing;

  // ───────────── Selector de animaciones ─────────────
  const sel = $('#frameSel'), box = $('#frameBox');
  function buildSel() {
    sel.innerHTML = '';
    const list = mine();
    sel.append(el('option', { value: '', textContent: list.length ? 'Elige una animación…' : 'Ninguna para este modelo' }));
    list.forEach((e) => sel.append(el('option', { value: e.id, textContent: `${e.name} (${e.frames.length})`, selected: cur && e.id === cur.id })));
  }

  function activate(entry) {
    cur = entry;
    f = 0; undo = []; playing = false;
    if (entry) {
      state.seq.playing = false;
      state.scene.anim = entry.id;
      state.scene.params = {};
      color = DEFAULT_COLOR[model().color.type];
    }
    hooks.refreshAnim(); hooks.renderSeq();
    refresh();
    app.save();
  }

  sel.addEventListener('change', () => activate(state.frameAnims.find((e) => e.id === sel.value) || null));
  $('#frameNew').addEventListener('click', () => {
    const entry = registerFrames({
      id: 'frames:' + Date.now().toString(36), name: `Mi dibujo ${state.frameAnims.length + 1}`,
      model: state.model, fps: 4, frames: [blank()],
    });
    state.frameAnims.push(entry);
    activate(entry);
  });
  $('#frameDel').addEventListener('click', () => {
    if (!cur || !confirm(`¿Eliminar «${cur.name}»?`)) return;
    const id = cur.id;
    removeFrames(id);
    state.frameAnims = state.frameAnims.filter((e) => e.id !== id);
    if (state.scene.anim === id) { state.scene.anim = 'pulse'; state.scene.params = {}; }
    state.seq.items = state.seq.items.filter((it) => it.scene.anim !== id);
    activate(null);
  });
  $('#frameName').addEventListener('input', (e) => {
    if (!cur) return;
    cur.name = e.target.value || 'Sin nombre';
    buildSel(); hooks.refreshAnim(); app.save();
  });

  // ───────────── Pincel ─────────────
  $$('[data-tool]').forEach((b) => b.addEventListener('click', () => { tool = b.dataset.tool; buildTools(); }));

  function buildTools() {
    $$('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
    const box = $('#frameColors');
    box.innerHTML = '';
    const t = model().color.type;
    if (t === 'mono') { box.append(el('small', { textContent: 'LED de un solo color: encendido / apagado', style: 'margin:0' })); return; }
    const chip = (c, title) => {
      const b = el('button', { className: 'chip' + (c === color && tool === 'paint' ? ' on' : ''), title, style: `background:${c}` });
      b.addEventListener('click', () => { color = c; tool = 'paint'; buildTools(); });
      return b;
    };
    if (t === 'bicolor') {
      BICOLOR_CHOICES.forEach((o) => box.append(chip(o.id, o.name)));
    } else {
      const inp = el('input', { type: 'color', value: color, title: 'Color del pincel' });
      inp.addEventListener('input', () => { color = inp.value; tool = 'paint'; $$('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool)); });
      box.append(inp, ...QUICK.map((c) => chip(c, c)));
    }
  }

  // ───────────── Pintado sobre la señal ─────────────
  function snapshotFrame() {
    undo.push({ k: 'frame', f, data: cur.frames[f].slice() });
    if (undo.length > 30) undo.shift();
  }
  function snapshotAll() {
    undo.push({ k: 'all', f, data: cur.frames.map((a) => a.slice()) });
    if (undo.length > 12) undo.shift();
  }
  function paintAt(i) {
    if (i < 0) return;
    const hex = erasing ? null : (model().color.type === 'mono' ? '#ffffff' : color);
    if (cur.frames[f][i] === hex) return;
    setFramePixel(cur, f, i, hex);
    dirty = true; app.save();
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!canPaint() || (e.button !== 0 && e.button !== 2)) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    snapshotFrame();
    painting = true;
    erasing = tool === 'erase' || e.button === 2;
    paintAt(v2.hit(e.clientX, e.clientY));
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!canPaint()) { v2.hover = -1; return; }
    const i = v2.hit(e.clientX, e.clientY);
    v2.hover = i;
    if (painting) paintAt(i);
  });
  const end = () => { painting = false; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => { v2.hover = -1; });
  canvas.addEventListener('contextmenu', (e) => { if (canPaint()) e.preventDefault(); });

  $('#frameFill').addEventListener('click', () => {
    if (!cur) return;
    snapshotFrame();
    const hex = model().color.type === 'mono' ? '#ffffff' : color;
    for (let i = 0; i < cur.frames[f].length; i++) setFramePixel(cur, f, i, hex);
    dirty = true; app.save();
  });
  $('#frameClear').addEventListener('click', () => {
    if (!cur) return;
    snapshotFrame();
    for (let i = 0; i < cur.frames[f].length; i++) setFramePixel(cur, f, i, null);
    dirty = true; app.save();
  });
  $('#frameUndo').addEventListener('click', () => {
    const u = undo.pop();
    if (!u || !cur) return;
    if (u.k === 'frame') { cur.frames[u.f] = u.data; } else { cur.frames = u.data; }
    invalidateFrames(cur);
    f = Math.min(u.f, cur.frames.length - 1);
    buildStrip(); setHold(); app.save();
  });

  // ───────────── Tira de fotogramas ─────────────
  const strip = $('#filmstrip');
  function drawThumb(cv, frame) {
    const m = builtModel(state.model), c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    const W = cv.width - 8, H = W / m.aspect, ox = 4, oy = (cv.height - H) / 2;
    const tone = m.color.type === 'mono' ? m.color.tone : null;
    const rad = Math.max(1.1, m.ledR * W * 1.1);
    m.leds.forEach((l, i) => {
      const hex = frame[i];
      c.fillStyle = hex ? (tone || hex) : 'rgba(255,255,255,.1)';
      c.beginPath(); c.arc(ox + l.x * W, oy + l.y * H, rad, 0, 6.3); c.fill();
    });
  }
  function buildStrip() {
    strip.innerHTML = '';
    if (!cur) return;
    cur.frames.forEach((fr, i) => {
      const cv = el('canvas', { width: 120, height: 120 });
      drawThumb(cv, fr);
      const b = el('button', { className: i === f ? 'on' : '' }, cv, String(i + 1));
      b.addEventListener('click', () => { f = i; buildStrip(); setHold(); });
      strip.append(b);
    });
    strip.children[f]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function select(i) { f = i; buildStrip(); setHold(); }

  const withAll = (fn) => () => { if (!cur) return; snapshotAll(); fn(); invalidateFrames(cur); buildStrip(); setHold(); buildSel(); app.save(); };
  $('#frameAdd').addEventListener('click', withAll(() => { cur.frames.splice(f + 1, 0, blank()); f++; }));
  $('#frameDup').addEventListener('click', withAll(() => { cur.frames.splice(f + 1, 0, cur.frames[f].slice()); f++; }));
  $('#frameRemove').addEventListener('click', () => {
    if (!cur || cur.frames.length < 2) { app.toast('Una animación necesita al menos un fotograma', true); return; }
    withAll(() => { cur.frames.splice(f, 1); f = Math.min(f, cur.frames.length - 1); })();
  });
  const move = (d) => withAll(() => {
    const j = f + d;
    if (j < 0 || j >= cur.frames.length) return;
    [cur.frames[f], cur.frames[j]] = [cur.frames[j], cur.frames[f]];
    f = j;
  });
  $('#frameLeft').addEventListener('click', move(-1));
  $('#frameRight').addEventListener('click', move(1));

  // ───────────── Reproducción ─────────────
  const playBtn = $('#framePlay'), fps = $('#frameFps'), fpsVal = $('#frameFpsVal');
  playBtn.addEventListener('click', () => { playing = !playing; setHold(); });
  fps.addEventListener('input', () => { if (!cur) return; cur.fps = +fps.value; fpsVal.textContent = fps.value; app.save(); });

  /** Fija el fotograma mostrado mientras se edita; si se previsualiza, deja correr la animación. */
  function setHold() {
    if (cur) cur.hold = active && !playing ? f : -1;
    playBtn.textContent = playing ? '■ Parar' : '▶ Previsualizar';
    playBtn.classList.toggle('primary', !playing);
    updateStage();
  }
  function updateStage() {
    const paint = !!canPaint();
    v2.editMode = paint;
    stage.classList.toggle('painting', paint);
    if (!paint) v2.hover = -1;
  }

  // ───────────── Sincronización ─────────────
  function refresh() {
    if (cur && cur.model !== state.model) {
      cur.hold = -1;
      cur = null;
    }
    box.hidden = !cur;
    $('#frameDel').disabled = !cur;
    buildSel();
    if (cur) {
      $('#frameName').value = cur.name;
      fps.value = cur.fps; fpsVal.textContent = cur.fps;
      buildTools(); buildStrip();
    }
    setHold();
  }

  return {
    refresh,
    onTab(tab) {
      const was = active;
      active = tab === 'frames';
      if (active && state.view === '3d') {
        app.setView('2d').then(() => { hooks.syncStage(); setHold(); });
        app.toast('Para dibujar se usa la vista 2D');
      }
      if (was !== active) setHold();
    },
    tick() {
      if (dirty && cur) {
        dirty = false;
        const cv = strip.children[f]?.querySelector('canvas');
        if (cv) drawThumb(cv, cur.frames[f]);
      }
      updateStage();
    },
  };
}
