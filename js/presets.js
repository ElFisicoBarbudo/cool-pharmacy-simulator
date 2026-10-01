export const PALETTES = [
  { name: 'Farmacia', colors: ['#00ff66', '#ffffff', '#00a8ff'] },
  { name: 'Fuego', colors: ['#ff2a00', '#ffb300', '#fff2a8'] },
  { name: 'Océano', colors: ['#00e5ff', '#2962ff', '#7c4dff'] },
  { name: 'Neón', colors: ['#ff00c8', '#00f0ff', '#faff00'] },
  { name: 'Candy', colors: ['#ff5ea8', '#7cf3ff', '#ffe27a'] },
  { name: 'Emergencia', colors: ['#ff0022', '#0033ff', '#ffffff'] },
  { name: 'Navidad', colors: ['#ff1a1a', '#14ff6a', '#ffe9a8'] },
];

export const DEFAULT_COLORS = PALETTES[0].colors;
export const BICOLOR_DEFAULT = ['#00ff00', '#ff0000', '#ffff00'];

const s = (anim, colors, extra = {}) => ({ anim, colors, params: {}, speed: 1, rev: 0, ...extra });

/** Programas de ejemplo: listas de escenas con su duración (segundos). */
export const PROGRAMS = {
  'Noche tranquila': [
    { name: 'Fijo', dur: 8, scene: s('solid', ['#00ff66', '#00ff66', '#00a8ff']) },
    { name: 'Respiración', dur: 10, scene: s('pulse', ['#00ff66', '#ffffff', '#00a8ff']) },
    { name: 'Latido', dur: 8, scene: s('heartbeat', ['#00ff66', '#ffffff', '#00a8ff']) },
    { name: 'Onda', dur: 10, scene: s('wave', ['#00ff66', '#00a8ff', '#ffffff']) },
  ],
  'Show completo': [
    { name: 'Arcoíris', dur: 7, scene: s('rainbow', DEFAULT_COLORS) },
    { name: 'Persecución', dur: 7, scene: s('chase', ['#00ff66', '#00a8ff', '#ffffff']) },
    { name: 'Ondas', dur: 7, scene: s('ripple', ['#ff00c8', '#00f0ff', '#faff00']) },
    { name: 'Fuego', dur: 7, scene: s('fire', DEFAULT_COLORS) },
    { name: 'Plasma', dur: 7, scene: s('plasma', DEFAULT_COLORS) },
    { name: 'Emergencia', dur: 6, scene: s('police', ['#ff0022', '#0033ff', '#ffffff']) },
    { name: 'Centelleo', dur: 7, scene: s('sparkle', ['#ffe27a', '#7cf3ff', '#ffffff']) },
    { name: 'Construcción', dur: 8, scene: s('build', ['#00ff66', '#ffffff', '#00a8ff']) },
  ],
  'Fiesta': [
    { name: 'Arcoíris radial', dur: 8, scene: s('rainbow', DEFAULT_COLORS, { params: { mode: 1 } }) },
    { name: 'Emergencia', dur: 6, scene: s('police', ['#ff00c8', '#00f0ff', '#ffffff']) },
    { name: 'Centelleo', dur: 8, scene: s('sparkle', ['#ff5ea8', '#7cf3ff', '#ffffff']) },
    { name: 'Persecución', dur: 8, scene: s('chase', ['#faff00', '#ff00c8', '#ffffff'], { params: { heads: 4 } }) },
    { name: 'Plasma', dur: 8, scene: s('plasma', DEFAULT_COLORS) },
  ],
  'Cartel con mensajes (pantalla)': [
    { name: 'Texto', dur: 14, scene: s('text', ['#00ff66', '#00ff66', '#ffffff'], { params: { src: 0, rb: 0, msg: 'FARMACIA 24 H' } }) },
    { name: 'Reloj', dur: 8, scene: s('text', ['#ffb000', '#ffb000', '#ffffff'], { params: { src: 1, rb: 0 } }) },
    { name: 'Texto arcoíris', dur: 14, scene: s('text', DEFAULT_COLORS, { params: { src: 0, rb: 1, msg: 'FARMACIA DE GUARDIA' } }) },
    { name: 'Lluvia digital', dur: 8, scene: s('rain', ['#00ff66', '#ffffff', '#00a8ff']) },
  ],
};
