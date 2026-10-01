/** Rasteriza texto a un mapa de bits en blanco/negro con la altura de la matriz LED. */
const cache = new Map();

export function textBitmap(text, rows) {
  const key = rows + '|' + text;
  let bmp = cache.get(key);
  if (bmp) return bmp;
  const font = `700 ${Math.round(rows * 0.86)}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = font;
  const w = Math.max(1, Math.ceil(probe.measureText(text).width) + 2);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = rows;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(text, 1, rows / 2 + 1);
  const px = ctx.getImageData(0, 0, w, rows).data;
  const data = new Uint8Array(w * rows);
  for (let i = 0; i < data.length; i++) data[i] = px[i * 4 + 3] > 110 ? 1 : 0;
  bmp = { w, h: rows, data };
  if (cache.size > 40) cache.clear();
  cache.set(key, bmp);
  return bmp;
}
