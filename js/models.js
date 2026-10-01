import { TAU, fract } from './util.js';

/*
 * Cada modelo describe una señal física: dónde están sus LED (en coordenadas
 * unitarias x,y ∈ [0,1], y hacia abajo), qué tipo de LED lleva (mono, bicolor
 * o RGB), cuántas zonas direccionables tiene y la silueta de su carcasa.
 */

const AW = 1 / 3; // grosor del brazo de la cruz (relación con el lado)

export const LED_TONES = {
  green: '#22ff44',
  red: '#ff2a1a',
  amber: '#ffb000',
  white: '#ffffff',
};

function crossPoly(ext = 0.5, w = AW) {
  const h = w / 2;
  return [
    [-h, -ext], [h, -ext], [h, -h], [ext, -h], [ext, h], [h, h],
    [h, ext], [-h, ext], [-h, h], [-ext, h], [-ext, -h], [-h, -h],
  ].map(([x, y]) => [x + 0.5, y + 0.5]);
}

/** Profundidad (distancia al borde) de un punto dentro de la cruz; <0 si está fuera. */
function crossDepth(x, y, w = AW) {
  const dx = Math.abs(x - 0.5), dy = Math.abs(y - 0.5);
  const h = Math.min(w / 2 - dy, 0.5 - dx);
  const v = Math.min(w / 2 - dx, 0.5 - dy);
  return Math.max(h, v);
}

function circlePoly(r = 0.5, n = 72) {
  return Array.from({ length: n }, (_, i) => [0.5 + Math.cos((i / n) * TAU) * r, 0.5 + Math.sin((i / n) * TAU) * r]);
}

/** Reparte puntos a lo largo de un polígono cerrado con separación aproximada `spacing`. */
function resample(poly, spacing, zone) {
  const out = [];
  let total = 0;
  const lens = poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
    total += l;
    return l;
  });
  let acc = 0;
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const n = Math.max(1, Math.round(lens[i] / spacing));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push({ x: p[0] + (q[0] - p[0]) * t, y: p[1] + (q[1] - p[1]) * t, zone, p: (acc + lens[i] * t) / total });
    }
    acc += lens[i];
  });
  return out;
}

function crossGrid(N, { scale = 1, zoneFn = () => 0, offset = 0.5 } = {}) {
  const out = [];
  for (let gy = 0; gy < N; gy++) {
    for (let gx = 0; gx < N; gx++) {
      const lx = (gx + 0.5) / N, ly = (gy + 0.5) / N;
      const depth = crossDepth(lx, ly);
      if (depth < 0) continue;
      out.push({
        x: offset + (lx - 0.5) * scale, y: offset + (ly - 0.5) * scale,
        gx, gy, depth: depth * N, zone: zoneFn(depth * N), cell: 1 / N,
      });
    }
  }
  return out;
}

function rectGrid(W, H) {
  const out = [];
  for (let gy = 0; gy < H; gy++) {
    for (let gx = 0; gx < W; gx++) out.push({ x: (gx + 0.5) / W, y: (gy + 0.5) / H, gx, gy, zone: 0, depth: 1 });
  }
  return out;
}

const ringZone = (d) => (d < 1 ? 0 : 1);

export const MODELS = {
  'clasica-verde': {
    name: 'Clásica Verde',
    tier: 'Básico',
    desc: 'La cruz de toda la vida. Un único color de LED (verde) con efectos de brillo.',
    color: { type: 'mono', tone: LED_TONES.green },
    aspect: 1, depth: 0.1, ledR: 0.019, zones: ['Cruz'],
    build: () => ({ leds: crossGrid(18), outline: crossPoly() }),
  },
  'ambar-retro': {
    name: 'Ámbar Retro',
    tier: 'Básico',
    desc: 'Módulos ámbar de bajo consumo, aspecto cálido. Un solo color y pocos LED grandes.',
    color: { type: 'mono', tone: LED_TONES.amber },
    aspect: 1, depth: 0.1, ledR: 0.024, zones: ['Cruz'],
    build: () => ({ leds: crossGrid(15), outline: crossPoly() }),
  },
  'bicolor': {
    name: 'Bicolor Verde/Rojo',
    tier: 'Básico+',
    desc: 'Cada LED lleva dos chips: verde y rojo. Mezclados dan ámbar. Tres colores en total.',
    color: { type: 'bicolor', red: LED_TONES.red, green: LED_TONES.green },
    aspect: 1, depth: 0.1, ledR: 0.019, zones: ['Cruz'],
    build: () => ({ leds: crossGrid(18), outline: crossPoly() }),
  },
  'rgb-pro': {
    name: 'Cruz RGB Pro',
    tier: 'Pro',
    desc: 'Alta densidad RGB de 16 millones de colores y dos zonas independientes: borde e interior.',
    color: { type: 'rgb' },
    aspect: 1, depth: 0.1, ledR: 0.0155, zones: ['Borde', 'Interior'],
    build: () => ({ leds: crossGrid(24, { zoneFn: ringZone }), outline: crossPoly() }),
  },
  'neon-doble': {
    name: 'Neón Doble Contorno',
    tier: 'Pro',
    desc: 'Dos tubos de neón digital RGB siguiendo el contorno de la cruz. Ideal para persecuciones.',
    color: { type: 'rgb' },
    aspect: 1, depth: 0.07, ledR: 0.0085, glow: 2.4, zones: ['Tubo exterior', 'Tubo interior'],
    build: () => ({
      leds: [...resample(crossPoly(0.47, AW - 0.06), 0.024, 0), ...resample(crossPoly(0.41, AW - 0.18), 0.024, 1)],
      outline: crossPoly(),
    }),
  },
  'anillo': {
    name: 'Anillo Pharma',
    tier: 'Pro',
    desc: 'Cruz rodeada por un anillo luminoso RGB. Dos zonas: anillo y cruz.',
    color: { type: 'rgb' },
    aspect: 1, depth: 0.1, ledR: 0.0115, zones: ['Anillo', 'Cruz'],
    build: () => {
      const ring = circlePoly(0.455, 76).map((p, i, a) => ({ x: p[0], y: p[1], zone: 0, p: i / a.length }));
      const cross = crossGrid(15, { scale: 0.54, zoneFn: () => 1 });
      return { leds: [...ring, ...cross], outline: circlePoly(0.5, 90) };
    },
  },
  'pixel-30': {
    name: 'Cruz Pixel 30×30',
    tier: 'Pro Max',
    desc: 'Matriz de píxeles RGB en forma de cruz. Permite lluvia digital, plasma, fuego y más.',
    color: { type: 'rgb' },
    aspect: 1, depth: 0.08, ledR: 0.0125, zones: ['Todo'],
    grid: { w: 30, h: 30 },
    build: () => ({ leds: crossGrid(30), outline: crossPoly() }),
  },
  'pantalla-64x16': {
    name: 'Pantalla Matriz 64×16',
    tier: 'Pro Max',
    desc: 'Panel LED RGB con texto desplazable y reloj. Para mensajes: «FARMACIA 24 H», guardias…',
    color: { type: 'rgb' },
    aspect: 4, depth: 0.12, ledR: 0.0062, zones: ['Todo'], textable: true,
    grid: { w: 64, h: 16 },
    build: () => ({
      leds: rectGrid(64, 16),
      outline: [[0, 0], [1, 0], [1, 1], [0, 1]],
    }),
  },
};

export const MODEL_IDS = Object.keys(MODELS);

/** Completa cada LED con coordenadas derivadas que usan los efectos. */
export function buildModel(id) {
  const m = MODELS[id];
  const { leds, outline } = m.build();
  const maxd = Math.hypot(m.aspect / 2, 0.5);
  leds.forEach((l, i) => {
    const dx = (l.x - 0.5) * m.aspect, dy = l.y - 0.5;
    l.i = i;
    l.r = Math.hypot(dx, dy) / maxd;
    l.ang = fract(Math.atan2(dy, dx) / TAU);
    if (l.p === undefined) l.p = m.textable ? l.x : l.ang;
    if (l.gx === undefined) { l.gx = Math.floor(l.x * 32); l.gy = Math.floor(l.y * 32); }
    // Brazo de la cruz: 0 centro, 1 arriba, 2 derecha, 3 abajo, 4 izquierda
    const ax = Math.abs(l.x - 0.5), ay = Math.abs(l.y - 0.5);
    l.arm = ax < AW / 2 && ay < AW / 2 ? 0 : ax > ay ? (l.x > 0.5 ? 2 : 4) : (l.y > 0.5 ? 3 : 1);
  });
  return { ...m, id, leds, outline, zoneCount: m.zones.length };
}

/** Convierte un color RGB de animación en el color físico que emite el LED del modelo. */
export function makeColorMapper(model) {
  const t = model.color.type;
  if (t === 'rgb') return null;
  if (t === 'mono') {
    const tone = hexRgb(model.color.tone);
    return (c, o) => {
      const v = Math.max(c[0], c[1], c[2]);
      o[0] = tone[0] * v; o[1] = tone[1] * v; o[2] = tone[2] * v;
    };
  }
  const red = hexRgb(model.color.red), green = hexRgb(model.color.green);
  return (c, o) => {
    const r = c[0], g = c[1];
    o[0] = Math.min(1, red[0] * r + green[0] * g);
    o[1] = Math.min(1, red[1] * r + green[1] * g);
    o[2] = Math.min(1, red[2] * r + green[2] * g);
  };
}

function hexRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Paleta utilizable por cada tipo de LED. */
export const BICOLOR_CHOICES = [
  { id: '#00ff00', name: 'Verde' },
  { id: '#ff0000', name: 'Rojo' },
  { id: '#ffff00', name: 'Ámbar (mezcla)' },
];

const builtCache = {};
export const builtModel = (id) => (builtCache[id] ??= buildModel(id));
export const ledCount = (id) => builtModel(id).leds.length;
