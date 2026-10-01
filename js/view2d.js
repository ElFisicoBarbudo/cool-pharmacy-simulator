/** Vista 2D: fachada frontal con la señal, dibujada en canvas con brillo y resplandor. */
export class View2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.layers = { wall: document.createElement('canvas'), cab: document.createElement('canvas') };
    this.glow1 = document.createElement('canvas');
    this.glow2 = document.createElement('canvas');
    this.dirty = true;
    this.model = null;
    this.ambient = 0;
    this.w = this.h = 0;
  }

  setModel(model) { this.model = model; this.dirty = true; }
  setAmbient(a) { if (a !== this.ambient) { this.ambient = a; this.dirty = true; } }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(10, Math.round(r.width * dpr)), h = Math.max(10, Math.round(r.height * dpr));
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.canvas.width = w; this.canvas.height = h;
    for (const c of Object.values(this.layers)) { c.width = w; c.height = h; }
    this.glow1.width = Math.ceil(w / 4); this.glow1.height = Math.ceil(h / 4);
    this.glow2.width = Math.ceil(w / 16); this.glow2.height = Math.ceil(h / 16);
    this.dirty = true;
  }

  _rect() {
    const m = this.model, w = this.w, h = this.h;
    const maxW = w * 0.8, maxH = h * 0.76;
    const W = Math.min(maxW, maxH * m.aspect), H = W / m.aspect;
    return { x: (w - W) / 2, y: (h - H) / 2 - h * 0.01, W, H };
  }

  _buildLayers() {
    const { w, h, ambient: amb } = this;
    const m = this.model, R = this._rect();
    // — Pared —
    let c = this.layers.wall.getContext('2d');
    const lum = (v) => Math.round(v * (1 + amb * 5.5));
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `rgb(${lum(14)},${lum(17)},${lum(24)})`);
    g.addColorStop(1, `rgb(${lum(9)},${lum(11)},${lum(15)})`);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // ladrillos suaves
    const bh = Math.max(14, h / 22), bw = bh * 2.6;
    c.lineWidth = 1;
    c.strokeStyle = `rgba(0,0,0,${0.35 - amb * 0.15})`;
    for (let row = 0, y = 0; y < h; row++, y += bh) {
      c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
      for (let x = (row % 2) * bw / 2; x < w; x += bw) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + bh); c.stroke(); }
    }
    const vg = c.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${0.55 - amb * 0.3})`);
    c.fillStyle = vg; c.fillRect(0, 0, w, h);

    // — Carcasa y lentes —
    c = this.layers.cab.getContext('2d');
    c.clearRect(0, 0, w, h);
    const path = () => {
      c.beginPath();
      m.outline.forEach(([x, y], i) => {
        const px = R.x + x * R.W, py = R.y + y * R.H;
        i ? c.lineTo(px, py) : c.moveTo(px, py);
      });
      c.closePath();
    };
    c.save();
    c.shadowColor = 'rgba(0,0,0,.65)'; c.shadowBlur = R.W * 0.05; c.shadowOffsetY = R.W * 0.02;
    c.lineJoin = 'round';
    path();
    const cg = c.createLinearGradient(R.x, R.y, R.x + R.W, R.y + R.H);
    cg.addColorStop(0, '#24282e'); cg.addColorStop(1, '#0d0f12');
    c.fillStyle = cg; c.fill();
    c.restore();
    path(); c.lineWidth = Math.max(2, R.W * 0.008); c.strokeStyle = '#3a4048'; c.lineJoin = 'round'; c.stroke();
    c.save(); path(); c.clip();
    path(); c.lineWidth = R.W * 0.035; c.strokeStyle = 'rgba(0,0,0,.55)'; c.stroke();
    c.restore();
    const lr = m.ledR * R.W;
    for (const l of m.leds) {
      const x = R.x + l.x * R.W, y = R.y + l.y * R.H;
      c.fillStyle = '#050607'; c.beginPath(); c.arc(x, y, lr * 1.3, 0, 6.2832); c.fill();
      c.fillStyle = '#2a2f36'; c.beginPath(); c.arc(x, y, lr, 0, 6.2832); c.fill();
      c.fillStyle = 'rgba(255,255,255,.12)'; c.beginPath(); c.arc(x - lr * 0.25, y - lr * 0.3, lr * 0.4, 0, 6.2832); c.fill();
    }
    this.dirty = false;
  }

  render(engine) {
    if (!this.model) return;
    if (this.dirty) this._buildLayers();
    const { ctx, w, h } = this;
    const m = this.model, R = this._rect(), buf = engine.buf;
    const amb = this.ambient;
    const dim = 1 - amb * 0.7;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(this.layers.wall, 0, 0);

    // Resplandor sobre la pared
    const avg = engine.averageColor();
    const peak = Math.max(avg[0], avg[1], avg[2]);
    if (peak > 0.005) {
      const k = 255 / Math.max(peak, 0.001);
      const grd = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, R.W * 1.25);
      const col = `${Math.round(avg[0] * k)},${Math.round(avg[1] * k)},${Math.round(avg[2] * k)}`;
      const a = Math.min(0.32, peak * 0.9) * dim;
      grd.addColorStop(0, `rgba(${col},${a})`);
      grd.addColorStop(1, `rgba(${col},0)`);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(this.layers.cab, 0, 0);

    // LED + halo
    const lr = m.ledR * R.W, gm = m.glow || 1;
    const g1 = this.glow1.getContext('2d');
    g1.globalCompositeOperation = 'source-over';
    g1.clearRect(0, 0, this.glow1.width, this.glow1.height);
    g1.globalCompositeOperation = 'lighter';
    ctx.globalCompositeOperation = 'lighter';
    const TAU = 6.2832;
    const sx = this.glow1.width / w;
    for (let i = 0, n = m.leds.length; i < n; i++) {
      const r = buf[i * 3], g = buf[i * 3 + 1], b = buf[i * 3 + 2];
      const I = Math.max(r, g, b);
      if (I < 0.025) continue;
      const l = m.leds[i];
      const x = R.x + l.x * R.W, y = R.y + l.y * R.H;
      const R8 = Math.round(r * 255), G8 = Math.round(g * 255), B8 = Math.round(b * 255);
      // halo suave
      ctx.fillStyle = `rgba(${R8},${G8},${B8},${0.12 * I * dim})`;
      ctx.beginPath(); ctx.arc(x, y, lr * 2.0 * gm, 0, TAU); ctx.fill();
      // núcleo (se vuelve blanco al saturar)
      const k = I * I * 0.2;
      const wr = R8 + (255 - R8) * k, wg = G8 + (255 - G8) * k, wb = B8 + (255 - B8) * k;
      ctx.fillStyle = `rgb(${wr | 0},${wg | 0},${wb | 0})`;
      ctx.globalAlpha = Math.min(1, 0.25 + I);
      ctx.beginPath(); ctx.arc(x, y, lr, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      // buffer de bloom
      g1.fillStyle = `rgba(${R8},${G8},${B8},${0.4 * I})`;
      g1.beginPath(); g1.arc(x * sx, y * sx, Math.max(1.2, lr * 3.2 * gm * sx), 0, TAU); g1.fill();
    }
    const g2 = this.glow2.getContext('2d');
    g2.clearRect(0, 0, this.glow2.width, this.glow2.height);
    g2.drawImage(this.glow1, 0, 0, this.glow2.width, this.glow2.height);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = 0.55 * dim;
    ctx.drawImage(this.glow1, 0, 0, w, h);
    ctx.globalAlpha = 0.7 * dim;
    ctx.drawImage(this.glow2, 0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
