import { MODELS, MODEL_IDS, buildModel, BICOLOR_CHOICES } from './models.js';
import { EFFECTS, GROUPS, getEffect, effectAvailable, listCustoms, listFrames, compileCustom, removeCustom, registerFrames, CUSTOM_TEMPLATE, CUSTOM_EXAMPLES } from './effects.js';
import { initFrames } from './frames.js';
import { PALETTES, PROGRAMS } from './presets.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, props = {}, ...kids) => {
  const { dataset, ...rest } = props;
  const e = Object.assign(document.createElement(tag), rest);
  if (dataset) Object.assign(e.dataset, dataset);
  kids.flat().forEach((k) => e.append(k));
  return e;
};

export function initUI(app) {
  const { state, engine, toast, save } = app;
  let group = 'all';

  // ───────────── Pestañas ─────────────
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => {
    $$('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
    $$('.tabpane').forEach((p) => p.classList.toggle('on', p.id === 'pane-' + b.dataset.tab));
    frames.onTab(b.dataset.tab);
  }));

  // ───────────── Cabecera / escenario ─────────────
  const badge = $('#badge');
  function updateBadge() {
    const ef = getEffect(app.liveScene().anim);
    badge.innerHTML = `${engine.model.name} · <em>${ef.name}</em>`;
  }

  $$('[data-view]').forEach((b) => b.addEventListener('click', async () => {
    await app.setView(b.dataset.view);
    syncStageControls();
  }));
  const mountSel = $('#mountSel');
  mountSel.append(...[['wall', 'Fachada'], ['flag', 'Bandera'], ['totem', 'Tótem']].map(([v, t]) => el('option', { value: v, textContent: t })));
  mountSel.addEventListener('change', () => app.setMount(mountSel.value));
  $('#autoRot').addEventListener('change', (e) => app.setAutoRotate(e.target.checked));
  $('#ambient').addEventListener('input', (e) => app.setAmbient(+e.target.value));
  $('#brightness').addEventListener('input', (e) => { state.brightness = +e.target.value; save(); });
  $('#speed').addEventListener('input', (e) => { state.speed = +e.target.value; save(); });
  const power = $('#btnPower');
  power.addEventListener('click', () => {
    state.power = !state.power;
    power.classList.toggle('on', state.power);
    power.setAttribute('aria-pressed', state.power);
    save();
  });

  function syncStageControls() {
    const v3 = state.view === '3d';
    $$('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === state.view));
    $('#mountBox').hidden = !v3;
    $('#rotBox').hidden = !v3;
  }

  $('#btnShot').addEventListener('click', () => {
    const url = app.capture();
    const a = el('a', { href: url, download: `senal-farmacia-${Date.now()}.png` });
    a.click();
    toast('Captura guardada');
  });
  const stage = $('#stage');
  $('#btnFs').addEventListener('click', toggleFs);
  function toggleFs() {
    if (document.fullscreenElement) document.exitFullscreen();
    else stage.requestFullscreen?.().catch(() => toast('Tu navegador no permite pantalla completa aquí', true));
  }
  let idleT;
  const wake = () => {
    stage.classList.remove('idle');
    clearTimeout(idleT);
    if (document.fullscreenElement) idleT = setTimeout(() => stage.classList.add('idle'), 2500);
  };
  stage.addEventListener('pointermove', wake);
  document.addEventListener('fullscreenchange', wake);
  document.addEventListener('keydown', (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (e.key === 'f' || e.key === 'F') toggleFs();
    if (e.key === ' ') { e.preventDefault(); power.click(); }
  });

  // ───────────── Modelos ─────────────
  const modelList = $('#modelList');
  function thumb(id) {
    const m = buildModel(id), cv = el('canvas', { width: 128, height: 128 });
    const c = cv.getContext('2d');
    const W = 112, H = W / m.aspect, ox = 8, oy = 64 - H / 2;
    for (const l of m.leds) {
      let col;
      const t = m.color.type;
      if (t === 'mono') col = m.color.tone;
      else if (t === 'bicolor') col = l.y < 0.5 ? m.color.green : m.color.red;
      else col = `hsl(${Math.round((l.x * 0.7 + l.y * 0.3) * 330)},100%,60%)`;
      c.fillStyle = col;
      c.shadowColor = col; c.shadowBlur = 6;
      c.beginPath(); c.arc(ox + l.x * W, oy + l.y * H, Math.max(1.3, m.ledR * W * (m.aspect > 2 ? 1.2 : 1.05)), 0, 6.3); c.fill();
    }
    return cv;
  }
  const colorLabel = { mono: 'Un color', bicolor: '2 chips · 3 colores', rgb: 'RGB 16M colores' };
  MODEL_IDS.forEach((id) => {
    const m = MODELS[id], n = buildModel(id).leds.length;
    const btn = el('button', { className: 'model', dataset: { id } },
      thumb(id),
      el('div', {},
        el('div', { className: 'name' }, m.name, el('span', { className: 'tag' + (m.color.type === 'rgb' ? ' pro' : ''), textContent: m.tier })),
        el('div', { className: 'd', textContent: m.desc }),
        el('div', { className: 'spec', textContent: `${colorLabel[m.color.type]} · ${n} LED · ${m.zones.length} ${m.zones.length > 1 ? 'zonas' : 'zona'}` })));
    btn.addEventListener('click', () => { app.setModel(id); refreshAll(); });
    modelList.append(btn);
  });

  // ───────────── Animaciones ─────────────
  const lockBanner = $('#lockBanner'), animBody = $('#animBody');
  $('#lockStop').addEventListener('click', stopSeq);

  function stopSeq() { state.seq.playing = false; renderSeq(); refreshAnim(); }

  function buildGroups() {
    const box = $('#effectGroups');
    box.innerHTML = '';
    const list = [{ id: 'all', name: 'Todas' }, ...GROUPS];
    list.forEach((g) => {
      const b = el('button', { textContent: g.name, className: g.id === group ? 'on' : '' });
      b.addEventListener('click', () => { group = g.id; buildGroups(); buildEffects(); });
      box.append(b);
    });
  }

  function allEffects() {
    const customs = [...listCustoms(), ...listFrames()].map((c) => getEffect(c.id));
    return [...EFFECTS, ...customs];
  }

  function buildEffects() {
    const grid = $('#effectGrid');
    grid.innerHTML = '';
    const model = engine.model;
    const list = allEffects().filter((e) => (group === 'all' || e.group === group) && effectAvailable(e, model));
    if (!list.length) grid.append(el('div', { className: 'empty', textContent: group === 'custom' ? 'Aún no tienes animaciones propias. Créalas en las pestañas Fotogramas o Código.' : 'Ninguna disponible para este modelo.' }));
    list.forEach((e) => {
      const b = el('button', { className: e.id === state.scene.anim ? 'on' : '', title: e.desc },
        el('span', { className: 'ic', textContent: e.icon }), el('span', { className: 'nm', textContent: e.name }));
      b.addEventListener('click', () => selectEffect(e.id));
      grid.append(b);
    });
    const cur = getEffect(state.scene.anim);
    $('#effectDesc').textContent = cur.desc || '';
  }

  function selectEffect(id) {
    state.seq.playing = false;
    state.scene.anim = id;
    state.scene.params = {};
    refreshAnim(); renderSeq(); save();
  }

  function buildParams() {
    const box = $('#effectParams');
    box.innerHTML = '';
    const ef = getEffect(state.scene.anim);
    (ef.params || []).forEach((p) => {
      if (p.show && !p.show(state.scene.params)) return;
      const val = state.scene.params[p.id] ?? p.def;
      const wrap = el('div', { className: 'param' }, el('small', { textContent: p.label, style: 'margin:0 0 4px' }));
      if (p.type === 'text') {
        const inp = el('input', { type: 'text', value: val, maxLength: 80, spellcheck: false, placeholder: 'Escribe tu mensaje…' });
        inp.addEventListener('input', () => { state.scene.params[p.id] = inp.value; save(); });
        wrap.append(inp);
        if (p.presets) {
          const row = el('div', { className: 'presets' });
          p.presets.forEach((t) => {
            const b = el('button', { textContent: t });
            b.addEventListener('click', () => { state.scene.params[p.id] = t; inp.value = t; save(); });
            row.append(b);
          });
          wrap.append(row);
        }
      } else if (p.type === 'select') {
        const row = el('div', { className: 'row' });
        p.options.forEach((o, i) => {
          const b = el('button', { textContent: o, className: i === val ? 'on' : '' });
          b.addEventListener('click', () => { state.scene.params[p.id] = i; buildParams(); save(); });
          row.append(b);
        });
        wrap.append(row);
      } else {
        const out = el('small', { textContent: String(val) });
        const r = el('input', { type: 'range', min: p.min, max: p.max, step: p.step, value: val });
        r.addEventListener('input', () => { state.scene.params[p.id] = +r.value; out.textContent = r.value; save(); });
        wrap.append(r, out);
      }
      box.append(wrap);
    });
  }

  function buildColors() {
    const box = $('#colorBox');
    box.innerHTML = '';
    const t = engine.model.color.type;
    const cols = state.scene.colors;
    if (t === 'mono') {
      box.append(el('div', { className: 'note', textContent: 'Este modelo tiene LED de un único color: las animaciones juegan solo con el brillo.' }));
      return;
    }
    const sw = el('div', { className: 'swatches' });
    cols.forEach((c, i) => {
      let input;
      if (t === 'bicolor') {
        input = el('select', { style: 'width:auto' }, BICOLOR_CHOICES.map((o) => el('option', { value: o.id, textContent: o.name, selected: o.id === c })));
        input.addEventListener('change', () => { cols[i] = input.value; save(); });
      } else {
        input = el('input', { type: 'color', value: c });
        input.addEventListener('input', () => { cols[i] = input.value; save(); });
      }
      sw.append(el('label', {}, input, `Color ${i + 1}`));
    });
    box.append(sw);
    if (engine.model.zones.length > 1) box.append(el('small', { textContent: `Zonas: ${engine.model.zones.join(' / ')} (en «Fijo»: color 1 y color 2).` }));
    if (t === 'rgb') {
      const pal = el('div', { className: 'palettes' });
      PALETTES.forEach((p) => {
        const b = el('button', { title: p.name }, p.colors.map((c) => el('i', { style: `background:${c}` })));
        b.addEventListener('click', () => { state.scene.colors = [...p.colors]; buildColors(); save(); });
        pal.append(b);
      });
      box.append(pal);
      if (['rainbow', 'plasma', 'fire'].includes(state.scene.anim)) box.append(el('small', { textContent: 'Esta animación genera sus propios colores.' }));
    }
  }

  const sceneSpeed = $('#sceneSpeed');
  sceneSpeed.addEventListener('input', () => { state.scene.speed = +sceneSpeed.value; save(); });

  function refreshAnim() {
    const locked = state.seq.playing;
    lockBanner.hidden = !locked;
    animBody.classList.toggle('locked', locked);
    buildEffects(); buildParams(); buildColors();
    sceneSpeed.value = state.scene.speed ?? 1;
  }

  // ───────────── Estudio: editor de código ─────────────
  const customSel = $('#customSel'), editorBox = $('#editorBox'), codeEl = $('#customCode');
  const nameEl = $('#customName'), statusEl = $('#customStatus'), exSel = $('#customExamples');
  let editingId = null;

  exSel.append(el('option', { value: '', textContent: 'Cargar un ejemplo…' }),
    ...Object.keys(CUSTOM_EXAMPLES).map((k) => el('option', { value: k, textContent: k })));

  function buildCustomSel() {
    customSel.innerHTML = '';
    customSel.append(el('option', { value: '', textContent: state.customs.length ? 'Elige una animación…' : 'Sin animaciones propias' }));
    state.customs.forEach((c) => customSel.append(el('option', { value: c.id, textContent: c.name, selected: c.id === editingId })));
  }

  function openEditor(id) {
    editingId = id;
    const c = state.customs.find((x) => x.id === id);
    editorBox.hidden = !c;
    if (c) {
      nameEl.value = c.name; codeEl.value = c.code;
      showStatus(compileCustom(c.id, c.name, c.code));
    }
    buildCustomSel();
  }

  function showStatus(entry) {
    statusEl.className = 'status ' + (entry.error ? 'err' : 'ok');
    statusEl.textContent = entry.error ? '✖ ' + entry.error : '✔ Funciona. Cambios en vivo sobre la señal.';
  }

  function applyCustom(id) {
    state.seq.playing = false;
    if (state.scene.anim === id) state.scene.rev = (state.scene.rev || 0) + 1;
    else { state.scene.anim = id; state.scene.params = {}; }
    state.seq.items.forEach((it) => { if (it.scene.anim === id) it.scene.rev = (it.scene.rev || 0) + 1; });
  }

  $('#customNew').addEventListener('click', () => {
    const id = 'custom:' + Date.now().toString(36);
    const c = { id, name: `Mi animación ${state.customs.length + 1}`, code: CUSTOM_TEMPLATE };
    state.customs.push(c);
    compileCustom(c.id, c.name, c.code);
    openEditor(id); applyCustom(id); refreshAnim(); renderSeq(); save();
  });
  customSel.addEventListener('change', () => {
    if (!customSel.value) { editorBox.hidden = true; editingId = null; return; }
    openEditor(customSel.value); applyCustom(customSel.value); refreshAnim(); renderSeq();
  });
  $('#customDel').addEventListener('click', () => {
    if (!editingId) return;
    const i = state.customs.findIndex((c) => c.id === editingId);
    if (i < 0) return;
    if (!confirm(`¿Eliminar «${state.customs[i].name}»?`)) return;
    removeCustom(editingId);
    state.customs.splice(i, 1);
    if (state.scene.anim === editingId) { state.scene.anim = 'pulse'; state.scene.params = {}; }
    state.seq.items = state.seq.items.filter((it) => it.scene.anim !== editingId);
    editingId = null; editorBox.hidden = true;
    buildCustomSel(); refreshAnim(); renderSeq(); save();
  });
  nameEl.addEventListener('input', () => {
    const c = state.customs.find((x) => x.id === editingId);
    if (!c) return;
    c.name = nameEl.value || 'Sin nombre';
    compileCustom(c.id, c.name, c.code);
    buildCustomSel(); buildEffects(); updateBadge(); save();
  });
  let codeTimer;
  codeEl.addEventListener('input', () => {
    clearTimeout(codeTimer);
    codeTimer = setTimeout(() => {
      const c = state.customs.find((x) => x.id === editingId);
      if (!c) return;
      c.code = codeEl.value;
      const entry = compileCustom(c.id, c.name, c.code);
      showStatus(entry);
      if (!entry.error) applyCustom(c.id);
      save();
    }, 350);
  });
  codeEl.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: en } = codeEl;
      codeEl.setRangeText('  ', s, en, 'end');
      codeEl.dispatchEvent(new Event('input'));
    }
  });
  exSel.addEventListener('change', () => {
    if (!exSel.value || !editingId) { exSel.value = ''; return; }
    codeEl.value = CUSTOM_EXAMPLES[exSel.value];
    exSel.value = '';
    codeEl.dispatchEvent(new Event('input'));
  });

  // Errores de ejecución mostrados en el estado
  function pollCustomError() {
    if (!editingId) return;
    const entry = listCustoms().find((c) => c.id === editingId);
    if (entry && entry.error && !statusEl.classList.contains('err')) showStatus(entry);
  }

  // ───────────── Estudio: secuenciador ─────────────
  const seqList = $('#seqList');
  const cloneScene = (s) => JSON.parse(JSON.stringify(s));
  function renderSeq() {
    seqList.innerHTML = '';
    const sq = state.seq;
    $('#seqPlay').textContent = sq.playing ? '■ Detener' : '▶ Reproducir';
    if (!sq.items.length) { seqList.append(el('div', { className: 'empty', textContent: 'Vacío. Ajusta una animación y pulsa «Añadir escena actual», o carga un programa.' })); return; }
    sq.items.forEach((it, i) => {
      const row = el('div', { className: 'item' + (sq.playing && i === sq.idx ? ' now' : '') });
      const dur = el('input', { type: 'number', min: 1, max: 600, value: it.dur, title: 'Duración (s)' });
      dur.addEventListener('change', () => { it.dur = Math.max(1, +dur.value || 5); save(); });
      const mk = (txt, fn, title) => { const b = el('button', { textContent: txt, title }); b.addEventListener('click', fn); return b; };
      const move = (d) => () => { const j = i + d; if (j < 0 || j >= sq.items.length) return; [sq.items[i], sq.items[j]] = [sq.items[j], sq.items[i]]; renderSeq(); save(); };
      row.append(el('span', { textContent: i + 1, style: 'color:var(--dim)' }),
        el('span', { className: 'nm', textContent: it.name }), dur,
        el('span', { className: 'btns' }, mk('↑', move(-1), 'Subir'), mk('↓', move(1), 'Bajar'),
          mk('✕', () => { sq.items.splice(i, 1); if (sq.idx >= sq.items.length) sq.idx = 0; renderSeq(); save(); }, 'Quitar')));
      if (sq.playing && i === sq.idx) row.append(el('div', { className: 'progress', id: 'seqProg' }));
      seqList.append(row);
    });
  }
  $('#seqAdd').addEventListener('click', () => {
    const sc = cloneScene(state.scene);
    state.seq.items.push({ name: getEffect(sc.anim).name, dur: 8, scene: sc });
    renderSeq(); save(); toast('Escena añadida');
  });
  $('#seqPlay').addEventListener('click', () => {
    const sq = state.seq;
    if (!sq.items.length) { toast('Añade escenas primero', true); return; }
    sq.playing = !sq.playing; sq.idx = 0; sq.elapsed = 0;
    renderSeq(); refreshAnim();
  });
  const presets = $('#seqPresets');
  presets.append(el('option', { value: '', textContent: 'Cargar programa de ejemplo…' }),
    ...Object.keys(PROGRAMS).map((k) => el('option', { value: k, textContent: k })));
  presets.addEventListener('change', () => {
    const p = PROGRAMS[presets.value];
    presets.value = '';
    if (!p) return;
    state.seq.items = JSON.parse(JSON.stringify(p));
    state.seq.idx = 0; state.seq.elapsed = 0;
    renderSeq(); save(); toast('Programa cargado. Pulsa Reproducir');
  });
  $('#seqExport').addEventListener('click', () => {
    const skip = (k, v) => (k === '_rgb' || k === 'hold' ? undefined : v);
    const data = { app: 'cool-pharmacy-simulator', version: 2, customs: state.customs, frameAnims: state.frameAnims, seq: state.seq.items };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, skip, 2)], { type: 'application/json' }));
    el('a', { href: url, download: 'programa-farmacia.json' }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('#seqImport').addEventListener('click', () => $('#seqFile').click());
  $('#seqFile').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!Array.isArray(d.seq)) throw new Error('formato');
      (d.customs || []).forEach((c) => {
        if (!state.customs.some((x) => x.id === c.id) && typeof c.code === 'string') {
          state.customs.push({ id: String(c.id), name: String(c.name || 'Importada'), code: c.code });
          compileCustom(c.id, c.name, c.code);
        }
      });
      (d.frameAnims || []).forEach((f) => {
        if (state.frameAnims.some((x) => x.id === f.id) || !MODELS[f.model] || !Array.isArray(f.frames) || !f.frames.length) return;
        state.frameAnims.push(registerFrames({ id: String(f.id), name: String(f.name || 'Importada'), model: f.model, fps: +f.fps || 4, frames: f.frames }));
      });
      frames.refresh();
      state.seq.items = d.seq;
      renderSeq(); buildCustomSel(); refreshAnim(); save(); toast('Programa importado');
    } catch (_) { toast('Archivo no válido', true); }
  });

  // ───────────── Fotogramas ─────────────
  const frames = initFrames(app, { refreshAll: () => refreshAll(), refreshAnim: () => refreshAnim(), renderSeq: () => renderSeq(), syncStage: () => syncStageControls() });

  // ───────────── Sincronización ─────────────
  let acc = 0;
  function refreshAll() {
    $$('.model').forEach((b) => b.classList.toggle('on', b.dataset.id === state.model));
    refreshAnim(); syncStageControls(); updateBadge();
    frames.refresh();
  }
  $('#brightness').value = state.brightness;
  $('#speed').value = state.speed;
  $('#ambient').value = state.ambient;
  mountSel.value = state.mount;
  $('#autoRot').checked = state.autoRotate;
  power.classList.toggle('on', state.power);
  buildGroups(); buildCustomSel(); renderSeq(); refreshAll();

  return {
    onSeqStep() { renderSeq(); },
    tick(dt) {
      acc += dt;
      if (acc < 0.06) return;
      acc = 0;
      updateBadge();
      frames.tick();
      pollCustomError();
      if (state.seq.playing) {
        const p = $('#seqProg'), cur = state.seq.items[state.seq.idx];
        if (p && cur) p.style.width = Math.min(100, (state.seq.elapsed / (cur.dur || 5)) * 100) + '%';
      }
    },
  };
}
