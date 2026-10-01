export const TAU = Math.PI * 2;
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const fract = (v) => v - Math.floor(v);
export const tri = (x) => 1 - Math.abs(fract(x) * 2 - 1);
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

const hexCache = new Map();
export function hexToRgb(h) {
  let c = hexCache.get(h);
  if (c) return c;
  let s = String(h).replace('#', '');
  if (s.length === 3) s = s.split('').map((ch) => ch + ch).join('');
  const n = parseInt(s, 16) || 0;
  c = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  hexCache.set(h, c);
  return c;
}

export function rgbToHex([r, g, b]) {
  const f = (v) => Math.round(clamp(v) * 255).toString(16).padStart(2, '0');
  return `#${f(r)}${f(g)}${f(b)}`;
}

export function hsv(h, s, v) {
  h = fract(h) * 6;
  const i = Math.floor(h), f = h - i;
  const p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

export const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Deterministic pseudo-random in 0..1. */
export function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Smooth value noise in 0..1. */
export function noise(x, y = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const h = (a, b) => hash(a * 57.31 + b * 113.7);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export const debounce = (fn, ms) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};
