import { TAU, clamp, fract, lerp, tri, smoothstep, hsv, mix, hash, noise, hexToRgb } from './util.js';
import { textBitmap } from './text.js';

/*
 * Cada efecto implementa px(L, c, o): recibe un LED (L), el contexto del fotograma (c)
 * y escribe el color RGB (0..1) en o. Opcionalmente frame(c) se llama una vez por fotograma.
 *   c.t      tiempo de animación (ya multiplicado por la velocidad)
 *   c.c1..3  colores de paleta  ·  c.p  parámetros del efecto  ·  c.audio  análisis de sonido
 */

export const GROUPS = [
  { id: 'basic', name: 'Básicas' },
  { id: 'motion', name: 'Movimiento' },
  { id: 'color', name: 'Color' },
  { id: 'fx', name: 'Efectos' },
  { id: 'audio', name: '♪ Sonido' },
  { id: 'custom', name: 'Mis animaciones' },
];

const set = (o, c, k = 1) => { o[0] = c[0] * k; o[1] = c[1] * k; o[2] = c[2] * k; };
const mixSet = (o, a, b, t, k = 1) => {
  o[0] = (a[0] + (b[0] - a[0]) * t) * k;
  o[1] = (a[1] + (b[1] - a[1]) * t) * k;
  o[2] = (a[2] + (b[2] - a[2]) * t) * k;
};
const bump = (p, center, w) => Math.exp(-(((p - center) / w) ** 2));

export const EFFECTS = [
  // ─────────── Básicas ───────────
  {
    id: 'solid', name: 'Fijo', group: 'basic', icon: '●',
    desc: 'Color constante. En señales de dos zonas: borde = color 1, interior = color 2.',
    px(L, c, o) { set(o, L.zone > 0 ? c.c2 : c.c1); },
  },
  {
    id: 'blink', name: 'Parpadeo', group: 'basic', icon: '◐',
    desc: 'Encendido y apagado clásico.',
    px(L, c, o) { set(o, c.c1, fract(c.t * 0.8) < 0.5 ? 1 : 0); },
  },
  {
    id: 'pulse', name: 'Respiración', group: 'basic', icon: '◌',
    desc: 'El brillo sube y baja suavemente.',
    px(L, c, o) { set(o, c.c1, 0.03 + 0.97 * (Math.sin(c.t * 2.2) * 0.5 + 0.5) ** 1.6); },
  },
  {
    id: 'heartbeat', name: 'Latido', group: 'basic', icon: '♥',
    desc: 'Doble pulso como un latido.',
    px(L, c, o) {
      const p = fract(c.t * 0.55);
      set(o, c.c1, 0.04 + bump(p, 0.08, 0.05) + 0.7 * bump(p, 0.27, 0.06));
    },
  },
  {
    id: 'strobe', name: 'Estroboscópica', group: 'basic', icon: '⚡',
    desc: 'Destellos rápidos. ¡Cuidado con la fotosensibilidad!',
    px(L, c, o) { set(o, c.c1, fract(c.t * 3) < 0.12 ? 1 : 0.02); },
  },
  {
    id: 'zones', name: 'Alternar zonas', group: 'basic', icon: '◧',
    desc: 'Se alternan dos zonas (borde/interior, o mitades superior e inferior).',
    px(L, c, o) {
      const z = c.model.zoneCount > 1 ? L.zone : L.y < 0.5 ? 0 : 1;
      const a = smoothstep(0.15, 0.85, Math.sin(c.t * 2.4) * 0.5 + 0.5);
      set(o, z ? c.c2 : c.c1, z ? 1 - a : a);
    },
  },

  // ─────────── Movimiento ───────────
  {
    id: 'chase', name: 'Persecución', group: 'motion', icon: '↻',
    desc: 'Una luz con cola recorre la señal.',
    params: [{ id: 'heads', label: 'Luces', type: 'range', min: 1, max: 6, step: 1, def: 2 }],
    px(L, c, o) {
      const n = c.p.heads ?? 2;
      const d = fract((c.t * 0.3) - L.p * n);
      const v = Math.pow(1 - d, 3);
      mixSet(o, c.c1, c.c2, d, 0.04 + v);
    },
  },
  {
    id: 'sweep', name: 'Barrido', group: 'motion', icon: '↔',
    desc: 'Una barra de luz cruza la señal.',
    params: [{ id: 'dir', label: 'Dirección', type: 'select', options: ['→', '←', '↓', '↑', '↔'], def: 0 }],
    px(L, c, o) {
      const d = c.p.dir ?? 0;
      let u = d < 2 ? L.x : L.y;
      if (d === 1 || d === 3) u = 1 - u;
      let pos = fract(c.t * 0.3) * 1.5 - 0.25;
      if (d === 4) pos = tri(c.t * 0.25) * 1.5 - 0.25;
      const v = bump(u, pos, 0.1);
      mixSet(o, c.c1, c.c2, u, 0.04 + v);
    },
  },
  {
    id: 'wave', name: 'Onda', group: 'motion', icon: '≈',
    desc: 'Ondas de brillo entre dos colores.',
    px(L, c, o) {
      const v = Math.sin(L.x * TAU * 1.2 + L.y * 2 - c.t * 3) * 0.5 + 0.5;
      mixSet(o, c.c1, c.c2, v, 0.2 + 0.8 * v);
    },
  },
  {
    id: 'ripple', name: 'Ondas desde el centro', group: 'motion', icon: '◎',
    desc: 'Anillos que se expanden desde el centro.',
    px(L, c, o) {
      const v = Math.pow(Math.sin(L.r * 7 - c.t * 4) * 0.5 + 0.5, 3);
      mixSet(o, c.c1, c.c2, L.r, 0.04 + v);
    },
  },
  {
    id: 'radar', name: 'Radar', group: 'motion', icon: '◔',
    desc: 'Un haz gira alrededor del centro.',
    px(L, c, o) {
      const d = fract(c.t * 0.35 - L.ang);
      set(o, c.c1, 0.03 + Math.pow(1 - d, 3));
    },
  },
  {
    id: 'fill', name: 'Relleno', group: 'motion', icon: '▤',
    desc: 'La señal se llena y se vacía como una barra de carga.',
    params: [{ id: 'axis', label: 'Eje', type: 'select', options: ['Vertical', 'Horizontal', 'Radial'], def: 0 }],
    px(L, c, o) {
      const ax = c.p.axis ?? 0;
      const u = ax === 0 ? 1 - L.y : ax === 1 ? L.x : L.r;
      const level = tri(c.t * 0.18) * 1.25 - 0.1;
      mixSet(o, c.c1, c.c2, u, smoothstep(level, level - 0.08, u) * 1 + 0.03);
    },
  },
  {
    id: 'build', name: 'La cruz se construye', group: 'motion', icon: '✚',
    desc: 'Centro y brazos se encienden uno a uno.',
    px(L, c, o) {
      const s = Math.floor(fract(c.t * 0.2) * 7);
      const order = [0, 1, 2, 3, 4];
      const on = s >= 6 ? 1 : s > order.indexOf(L.arm) ? 1 : 0;
      mixSet(o, c.c1, c.c2, L.arm / 4, on ? 1 : 0.03);
    },
  },

  // ─────────── Color ───────────
  {
    id: 'rainbow', name: 'Arcoíris', group: 'color', icon: '🌈', needs: 'rgb',
    desc: 'Todos los colores del espectro.',
    params: [{ id: 'mode', label: 'Modo', type: 'select', options: ['Lineal', 'Radial', 'Giratorio'], def: 0 }],
    px(L, c, o) {
      const m = c.p.mode ?? 0;
      const h = m === 0 ? L.x * 0.8 + L.y * 0.2 - c.t * 0.1 : m === 1 ? L.r * 1.1 - c.t * 0.12 : L.ang - c.t * 0.1;
      const k = hsv(h, 1, 1);
      o[0] = k[0]; o[1] = k[1]; o[2] = k[2];
    },
  },
  {
    id: 'plasma', name: 'Plasma', group: 'color', icon: '🌀', needs: 'rgb',
    desc: 'Nubes de color fluidas.',
    px(L, c, o) {
      const t = c.t;
      const v = Math.sin(L.x * 6 + t) + Math.sin(L.y * 7 - t * 1.3) + Math.sin((L.x + L.y) * 5 + t * 0.7) + Math.sin(L.r * 9 - t * 1.7);
      const k = hsv(v / 8 + t * 0.04, 1, 0.55 + 0.45 * Math.sin(v * 1.3 + t) ** 2);
      o[0] = k[0]; o[1] = k[1]; o[2] = k[2];
    },
  },
  {
    id: 'sparkle', name: 'Centelleo', group: 'color', icon: '✦',
    desc: 'Estrellas que se encienden al azar.',
    px(L, c, o) {
      const f = 0.5 + hash(L.i * 1.7) * 1.5;
      const s = Math.sin(c.t * f * 2 + hash(L.i) * TAU);
      mixSet(o, c.c1, c.c2, hash(L.i + 9), 0.07 + Math.pow(Math.max(0, s), 12));
    },
  },
  {
    id: 'police', name: 'Emergencia', group: 'color', icon: '🚨',
    desc: 'Destellos alternos izquierda / derecha, estilo luces de emergencia.',
    px(L, c, o) {
      const p = fract(c.t * 0.7);
      const left = p < 0.5;
      const flash = fract(fract(p * 2) * 3) < 0.55;
      const mine = (L.x < 0.5) === left;
      mixSet(o, c.c1, c.c2, left ? 0 : 1, mine && flash ? 1 : 0.03);
      if (mine && flash) set(o, left ? c.c1 : c.c2);
    },
  },

  // ─────────── Efectos ───────────
  {
    id: 'fire', name: 'Fuego', group: 'fx', icon: '🔥',
    desc: 'Llamas que suben desde la base.',
    px(L, c, o) {
      const n = noise(L.x * 5, L.y * 5 - c.t * 3) * 0.7 + noise(L.x * 11, L.y * 11 - c.t * 5) * 0.3;
      const h = clamp(1.3 * (1 - L.y) - 0.38 + (n - 0.5) * 1.2);
      if (h < 0.33) { o[0] = h * 3; o[1] = 0; o[2] = 0; }
      else if (h < 0.66) { o[0] = 1; o[1] = (h - 0.33) * 3; o[2] = 0; }
      else { o[0] = 1; o[1] = 1; o[2] = (h - 0.66) * 2.6; }
    },
  },
  {
    id: 'rain', name: 'Lluvia digital', group: 'fx', icon: '▥',
    desc: 'Cascadas de píxeles al estilo Matrix.',
    px(L, c, o) {
      const cols = c.model.grid ? c.model.grid.w : 20;
      const col = Math.floor(L.x * cols);
      const head = fract(c.t * (0.15 + hash(col) * 0.25) + hash(col * 3.3));
      const d = fract(head - L.y);
      const v = d < 0.45 ? Math.pow(1 - d / 0.45, 1.6) : 0;
      mixSet(o, c.c1, [1, 1, 1], d < 0.05 ? 0.7 : 0, 0.02 + v);
    },
  },
  {
    id: 'text', name: 'Texto / Reloj', group: 'fx', icon: 'Aa', needs: 'text',
    desc: 'Mensaje desplazable o reloj. Solo en pantallas matriz.',
    params: [
      { id: 'src', label: 'Mostrar', type: 'select', options: ['Texto', 'Hora'], def: 0 },
      { id: 'rb', label: 'Color', type: 'select', options: ['Sólido', 'Arcoíris'], def: 0 },
    ],
    frame(c) {
      const g = c.model.grid;
      if (!g) return;
      if ((c.p.src ?? 0) === 1) {
        const d = new Date();
        const colon = d.getSeconds() % 2 ? ' ' : ':';
        const txt = String(d.getHours()).padStart(2, '0') + colon + String(d.getMinutes()).padStart(2, '0');
        c.bmp = textBitmap(txt, g.h); c.scroll = false;
      } else {
        c.bmp = textBitmap(c.text || ' ', g.h); c.scroll = true;
      }
    },
    px(L, c, o) {
      const b = c.bmp, g = c.model.grid;
      if (!b || !g) { set(o, c.c1, 0); return; }
      let col;
      if (c.scroll) col = Math.floor(L.gx + c.t * 9) % (b.w + g.w * 0.5);
      else col = L.gx - Math.floor((g.w - b.w) / 2);
      const on = col >= 0 && col < b.w && b.data[L.gy * b.w + col];
      if (!on) { set(o, c.c2, 0.03); return; }
      if ((c.p.rb ?? 0) === 1) { const k = hsv(L.x - c.t * 0.1, 1, 1); o[0] = k[0]; o[1] = k[1]; o[2] = k[2]; }
      else set(o, c.c1);
    },
  },

  // ─────────── Sonido ───────────
  {
    id: 'vu', name: 'Vúmetro', group: 'audio', audio: true, icon: '▮',
    desc: 'La señal se llena según el volumen, con marca de pico.',
    frame(c) {
      const s = c.state;
      s.peak = Math.max(c.audio.level, (s.peak ?? 0) - c.dt * 0.4);
    },
    px(L, c, o) {
      const u = c.model.aspect > 2 ? L.x : 1 - L.y;
      const lv = c.audio.level;
      const lit = smoothstep(lv + 0.03, lv - 0.03, u);
      const col = u < 0.55 ? c.c1 : u < 0.8 ? c.c3 : c.c2;
      set(o, col, 0.03 + lit);
      if (Math.abs(u - c.state.peak) < 0.04) { o[0] = o[1] = o[2] = 1; }
    },
  },
  {
    id: 'beatflash', name: 'Flash al ritmo', group: 'audio', audio: true, icon: '◉',
    desc: 'Cada golpe de bombo dispara un destello que va alternando de color.',
    px(L, c, o) {
      const col = c.audio.beatCount % 2 ? c.c2 : c.c1;
      set(o, col, 0.05 + Math.pow(c.audio.beat, 1.5) * 1.1);
    },
  },
  {
    id: 'spectrum', name: 'Espectro', group: 'audio', audio: true, icon: '▂▅▇',
    desc: 'Ecualizador: graves a la izquierda, agudos a la derecha.',
    px(L, c, o) {
      const n = c.audio.spec.length;
      const bin = Math.min(n - 1, Math.floor(L.x * n));
      const v = c.audio.spec[bin];
      const u = 1 - L.y;
      const lit = smoothstep(v + 0.04, v - 0.04, u);
      mixSet(o, c.c1, c.c2, u, 0.03 + lit);
    },
  },
  {
    id: 'bassglow', name: 'Pulso de graves', group: 'audio', audio: true, icon: '◍',
    desc: 'Un resplandor central que late con los graves.',
    px(L, c, o) {
      const b = Math.pow(c.audio.bass, 1.4);
      mixSet(o, c.c1, c.c2, c.audio.treble, clamp(b * 1.5 - L.r * 0.7 + 0.12));
    },
  },
  {
    id: 'beatripple', name: 'Ondas al ritmo', group: 'audio', audio: true, icon: '◎',
    desc: 'Cada golpe lanza un anillo desde el centro.',
    frame(c) {
      const s = c.state;
      s.rips = s.rips || [];
      if (s.last !== c.audio.beatCount) { s.last = c.audio.beatCount; s.rips.push(c.t); if (s.rips.length > 6) s.rips.shift(); }
    },
    px(L, c, o) {
      let v = 0;
      for (const t0 of c.state.rips) {
        const age = c.t - t0;
        v += bump(L.r, age * 0.9, 0.13) * Math.max(0, 1 - age / 1.3);
      }
      mixSet(o, c.c1, c.c2, L.r, 0.04 + v);
    },
  },
  {
    id: 'audiocolor', name: 'Color por música', group: 'audio', audio: true, needs: 'rgb', icon: '🎨',
    desc: 'El tono cambia con los agudos y el brillo con el volumen.',
    px(L, c, o) {
      const k = hsv(c.t * 0.05 + c.audio.treble * 0.35 + L.x * 0.25, 1, 0.12 + c.audio.level * 1.1);
      o[0] = k[0]; o[1] = k[1]; o[2] = k[2];
    },
  },
  {
    id: 'audiochase', name: 'Persecución rítmica', group: 'audio', audio: true, icon: '↻',
    desc: 'La luz gira más rápido cuanto más fuerte suena.',
    frame(c) {
      const s = c.state;
      s.pos = (s.pos ?? 0) + c.dt * (0.08 + c.audio.level * 1.4 + c.audio.beat * 0.4);
    },
    px(L, c, o) {
      const d = fract(c.state.pos - L.p * 2);
      mixSet(o, c.c1, c.c2, d, 0.04 + Math.pow(1 - d, 3) * (0.5 + c.audio.level));
    },
  },
];

// ───────────────────────── Animaciones personalizadas ─────────────────────────

const customs = new Map();
const HELPERS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, abs: Math.abs, min: Math.min, max: Math.max,
  floor: Math.floor, pow: Math.pow, sqrt: Math.sqrt, atan2: Math.atan2, exp: Math.exp, PI: Math.PI, TAU,
  clamp, fract, lerp, tri, smoothstep, hsv, mix, hash, noise,
  rgb: (r, g, b) => [r, g, b], hex: hexToRgb,
};

export const CUSTOM_TEMPLATE = `// x, y     posición del LED (0 a 1, y hacia abajo)
// i         índice del LED          · t   tiempo en segundos (según velocidad)
// a         sonido: a.level a.bass a.mid a.treble a.beat a.spec[]  (0 a 1)
// L         más datos: L.r (radio) L.ang (ángulo) L.p (recorrido) L.zone L.gx L.gy
// c1,c2,c3  colores de la paleta  ·  utilidades: sin, hsv, mix, noise, smoothstep…
// Devuelve [r,g,b] (0 a 1), un color "#rrggbb", o un número 0-1 (brillo del color 1)

const onda = sin((x + y) * 6 - t * 3) * 0.5 + 0.5;
return mix(c1, c2, onda);`;

export const CUSTOM_EXAMPLES = {
  'Onda diagonal': CUSTOM_TEMPLATE,
  'Arcoíris con graves': `// El arcoíris respira con los graves
return hsv(x * 0.6 + t * 0.1, 1, 0.35 + a.bass * 0.8);`,
  'Espiral': `const g = fract(L.ang * 3 + L.r * 2 - t * 0.4);
return mix(c1, c2, g) .map(v => v * (0.15 + 0.85 * g));`,
  'Destello aleatorio': `// Cada LED parpadea a su ritmo
const k = hash(i) * 6.28;
return pow(max(0, sin(t * 3 + k)), 6);`,
  'Sirena al ritmo': `const lado = x < 0.5 ? c1 : c2;
const on = (a.beatCount % 2 === 0) === (x < 0.5);
return on ? lado.map(v => v * (0.2 + a.beat)) : [0, 0, 0];`,
};

export function compileCustom(id, name, code) {
  const entry = { id, name, code, error: null, fn: null };
  try {
    const body = `const {${Object.keys(HELPERS).join(',')}} = H;\n${code}`;
    entry.fn = new Function('x', 'y', 'i', 't', 'a', 'L', 'c1', 'c2', 'c3', 'H', body);
    // Prueba de humo para detectar errores de sintaxis/ejecución evidentes
    entry.fn(0.5, 0.5, 0, 0, { level: 0, bass: 0, mid: 0, treble: 0, beat: 0, beatCount: 0, spec: new Array(32).fill(0) },
      { r: 0, ang: 0, p: 0, zone: 0, gx: 0, gy: 0 }, [1, 0, 0], [0, 1, 0], [0, 0, 1], HELPERS);
  } catch (e) {
    entry.error = String(e && e.message ? e.message : e);
  }
  customs.set(id, entry);
  return entry;
}

export function removeCustom(id) { customs.delete(id); }
export function listCustoms() { return [...customs.values()]; }

function customEffect(entry) {
  return {
    id: entry.id, name: entry.name, group: 'custom', audio: true, icon: '</>', custom: true,
    desc: 'Animación escrita por ti.',
    px(L, c, o) {
      if (entry.error || !entry.fn) { o[0] = o[1] = o[2] = 0; return; }
      let r;
      try {
        r = entry.fn(L.x, L.y, L.i, c.t, c.audio, L, c.c1, c.c2, c.c3, HELPERS);
      } catch (e) {
        entry.error = String(e && e.message ? e.message : e);
        o[0] = o[1] = o[2] = 0;
        return;
      }
      if (typeof r === 'number') set(o, c.c1, r);
      else if (typeof r === 'string') set(o, hexToRgb(r));
      else if (r && r.length >= 3) { o[0] = +r[0] || 0; o[1] = +r[1] || 0; o[2] = +r[2] || 0; }
      else { o[0] = o[1] = o[2] = 0; }
    },
  };
}

const byId = new Map(EFFECTS.map((e) => [e.id, e]));
export function getEffect(id) {
  if (byId.has(id)) return byId.get(id);
  if (customs.has(id)) return customEffect(customs.get(id));
  return byId.get('solid');
}

/** ¿Está disponible este efecto en el modelo dado? */
export function effectAvailable(effect, model) {
  if (effect.needs === 'rgb') return model.color.type === 'rgb';
  if (effect.needs === 'text') return !!model.textable;
  return true;
}
