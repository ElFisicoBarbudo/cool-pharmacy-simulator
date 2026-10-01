import * as THREE from 'three';
import { OrbitControls } from '../vendor/jsm/controls/OrbitControls.js';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js';
import { RectAreaLightUniformsLib } from '../vendor/jsm/lights/RectAreaLightUniformsLib.js';

const SIGN = 2.4; // lado máximo de la señal en unidades del mundo
const SIGN_Y = 2.35; // altura del centro de la señal
RectAreaLightUniformsLib.init();

export const MOUNTS = { wall: 'Fachada', flag: 'Bandera', totem: 'Tótem' };

function wallTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#6d6a66'; g.fillRect(0, 0, 512, 512);
  const bh = 32, bw = 84;
  for (let r = 0; r * bh < 512; r++) {
    for (let x = -(r % 2) * bw / 2; x < 512; x += bw) {
      const v = 95 + Math.random() * 40;
      g.fillStyle = `rgb(${v + 14},${v},${v - 8})`;
      g.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function haloTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,.45)');
  gr.addColorStop(0.6, 'rgba(255,255,255,.1)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

/** Vista 3D con three.js: carcasa extruida, LED instanciados, bloom y luz que ilumina la fachada. */
export class View3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.NoToneMapping; // conserva los colores saturados de los LED
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 16;
    this.controls.maxPolarAngle = Math.PI * 0.52;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.75, 0.55);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.ambientLight = new THREE.HemisphereLight(0x8aa0c8, 0x202028, 0.25);
    this.scene.add(this.ambientLight);
    this.lights = []; // luces de área que reproducen el color de cada región de la señal
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTexture(), color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false, depthTest: true,
    }));
    this.scene.add(this.halo);

    this.env = new THREE.Group();
    this.scene.add(this.env);
    this.signGroup = new THREE.Group();
    this.scene.add(this.signGroup);

    this.wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.88, metalness: 0 });
    this.wallMat.map.repeat.set(4, 3);
    this.groundMat = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.28, metalness: 0.15 });
    this.metal = new THREE.MeshStandardMaterial({ color: 0x1a1d22, metalness: 0.7, roughness: 0.4 });
    this.model = null;
    this.mount = 'wall';
    this.ambient = 0;
    this.autoRotate = false;
    this.w = this.h = 0;
    this._buildEnv();
  }

  _buildEnv() {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(26, 12), this.wallMat);
    wall.position.set(0, 6, 0);
    this.wall = wall;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 8);
    this.env.add(wall, ground);
    // escaparate para dar escala
    const win = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.2, 0.08), new THREE.MeshStandardMaterial({ color: 0x0a0c10, metalness: 0.9, roughness: 0.15 }));
    win.position.set(-6.2, 1.4, 0.04);
    const win2 = win.clone(); win2.position.x = 6.2;
    this.env.add(win, win2);
  }

  setModel(model) { this.model = model; this._buildSign(); }
  setMount(m) { this.mount = m; if (this.model) this._buildSign(); }
  setAmbient(a) { this.ambient = a; }
  setAutoRotate(v) { this.autoRotate = v; this.controls.autoRotate = v; this.controls.autoRotateSpeed = 1.2; }

  _dispose(obj) {
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.isInstancedMesh) o.dispose();
    });
  }

  _buildSign() {
    const m = this.model;
    this._dispose(this.signGroup);
    this.signGroup.clear();
    const W = SIGN, H = SIGN / m.aspect;
    const depth = Math.max(0.12, m.depth * SIGN * 1.1);

    // Carcasa
    const shape = new THREE.Shape();
    m.outline.forEach(([x, y], i) => {
      const px = (x - 0.5) * W, py = -(y - 0.5) * H;
      i ? shape.lineTo(px, py) : shape.moveTo(px, py);
    });
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2 });
    geo.translate(0, 0, -depth / 2);
    const cabinet = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x15171b, metalness: 0.65, roughness: 0.42 }));
    this.sign = new THREE.Group();
    this.sign.add(cabinet);

    // LED instanciados (cara frontal y, si procede, trasera)
    const n = m.leds.length;
    const lr = m.ledR * W;
    const lg = new THREE.SphereGeometry(lr, 12, 8);
    lg.scale(1, 1, 0.55);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: true });
    const front = new THREE.InstancedMesh(lg, mat, n);
    const dummy = new THREE.Object3D();
    const zf = depth / 2 + 0.025 + lr * 0.1;
    m.leds.forEach((l, i) => {
      dummy.position.set((l.x - 0.5) * W, -(l.y - 0.5) * H, zf);
      dummy.updateMatrix();
      front.setMatrixAt(i, dummy.matrix);
      front.setColorAt(i, new THREE.Color(0, 0, 0));
    });
    front.instanceMatrix.needsUpdate = true;
    this.front = front;
    this.sign.add(front);
    if (this.mount !== 'wall') {
      const back = front.clone();
      back.instanceColor = front.instanceColor; // comparten color
      back.rotation.y = Math.PI;
      this.sign.add(back);
    }

    // Montaje
    const g = this.signGroup;
    const dark = this.metal;
    this.wall.visible = true;
    this.wall.position.z = 0;
    this.wallMat.map.repeat.set(4, 3);
    if (this.mount === 'wall') {
      this.sign.position.set(0, SIGN_Y, depth / 2 + 0.22);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.2), dark);
      plate.position.set(0, SIGN_Y, 0.1);
      g.add(plate);
      this._cam(new THREE.Vector3(0, SIGN_Y + 0.25, 7.2), new THREE.Vector3(0, SIGN_Y - 0.15, 0));
    } else if (this.mount === 'flag') {
      const standoff = 0.5 + W / 2;
      this.sign.rotation.y = Math.PI / 2;
      this.sign.position.set(0, SIGN_Y, standoff);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, standoff), dark);
      arm.position.set(0, SIGN_Y + H / 2 + 0.12, standoff / 2);
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, standoff * 0.85), dark);
      brace.position.set(0, SIGN_Y + H / 2 - 0.35, standoff * 0.5);
      brace.rotation.x = -0.45;
      const hang = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.05), dark);
      hang.position.set(0, SIGN_Y + H / 2 + 0.02, standoff);
      g.add(arm, brace, hang);
      this._cam(new THREE.Vector3(4.6, SIGN_Y + 0.6, standoff + 5), new THREE.Vector3(0, SIGN_Y - 0.2, standoff * 0.7));
    } else {
      this.wall.position.z = -5;
      this.wallMat.map.repeat.set(5, 3);
      const poleH = SIGN_Y - H / 2;
      this.sign.position.set(0, SIGN_Y, 0.5);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, poleH, 14), dark);
      pole.position.set(0, poleH / 2, 0.5);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.12, 20), dark);
      base.position.set(0, 0.06, 0.5);
      g.add(pole, base);
      this._cam(new THREE.Vector3(3.8, SIGN_Y + 0.4, 6.8), new THREE.Vector3(0, SIGN_Y - 0.3, 0.5));
    }
    g.add(this.sign);
    g.updateMatrixWorld(true);
    this._buildLights(W, H, zf, this.mount !== 'wall');
    const wp = this.sign.getWorldPosition(new THREE.Vector3());
    this.halo.position.set(wp.x, wp.y, this.mount === 'wall' ? 0.25 : wp.z);
    this.halo.scale.setScalar(W * 2.4);
  }

  /** Reparte la señal en regiones; cada una emite luz de área con su color medio. */
  _buildLights(W, H, zf, double) {
    this.lights.forEach((l) => { this.scene.remove(l.light); l.light.dispose?.(); });
    this.lights = [];
    const m = this.model, wide = m.aspect > 2;
    const nx = wide ? (double ? 4 : 6) : (double ? 2 : 3), ny = wide ? 1 : (double ? 2 : 3);
    this.nBins = nx * ny;
    this.binOf = new Int16Array(m.leds.length);
    this.binN = new Float32Array(this.nBins);
    m.leds.forEach((l, i) => {
      const b = Math.min(ny - 1, Math.floor(l.y * ny)) * nx + Math.min(nx - 1, Math.floor(l.x * nx));
      this.binOf[i] = b; this.binN[b]++;
    });
    this.maxBin = Math.max(...this.binN) || 1;
    this.binSum = new Float32Array(this.nBins * 3);
    for (let by = 0; by < ny; by++) {
      for (let bx = 0; bx < nx; bx++) {
        const bin = by * nx + bx;
        if (!this.binN[bin]) continue;
        const cx = ((bx + 0.5) / nx - 0.5) * W, cy = -((by + 0.5) / ny - 0.5) * H;
        // En fachada, además, una luz trasera ilumina la pared (sin espejar el eje x)
        for (const side of double ? [1, -1] : [1, 'wall']) {
          const wall = side === 'wall';
          const sx = side === -1 ? -1 : 1, sz = wall ? -1 : side;
          const light = new THREE.RectAreaLight(0xffffff, 0, W / nx, H / ny);
          const p = this.sign.localToWorld(new THREE.Vector3(sx * cx, cy, sz * (zf + (wall ? 0 : 0.06))));
          const t = this.sign.localToWorld(new THREE.Vector3(sx * cx, cy, sz * (zf + 3)));
          light.position.copy(p);
          light.lookAt(t);
          this.scene.add(light);
          this.lights.push({ light, bin });
        }
      }
    }
  }

  _cam(pos, target) {
    this.camera.position.copy(pos);
    this.controls.target.copy(target);
    this.controls.update();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(10, Math.floor(r.width)), h = Math.max(10, Math.floor(r.height));
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w; this.h = h; this.dpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(engine) {
    if (!this.front) return;
    const buf = engine.buf, col = this.front.instanceColor.array;
    const sum = this.binSum;
    sum.fill(0);
    for (let i = 0, n = this.binOf.length; i < n; i++) {
      const r = buf[i * 3], g = buf[i * 3 + 1], b = buf[i * 3 + 2], k = this.binOf[i] * 3;
      col[i * 3] = r + 0.012; col[i * 3 + 1] = g + 0.012; col[i * 3 + 2] = b + 0.012;
      sum[k] += r; sum[k + 1] += g; sum[k + 2] += b;
    }
    this.front.instanceColor.needsUpdate = true;

    const amb = this.ambient;
    const dim = 1 - amb * 0.8;
    const KI = 16 * dim; // intensidad de las luces de área
    for (const { light, bin } of this.lights) {
      const n = this.binN[bin], d = (n / this.maxBin) / n;
      light.color.setRGB(sum[bin * 3] * d, sum[bin * 3 + 1] * d, sum[bin * 3 + 2] * d);
      light.intensity = KI;
    }
    const avg = engine.averageColor();
    const peak = Math.max(avg[0], avg[1], avg[2]);
    this.halo.material.color.setRGB(avg[0], avg[1], avg[2]);
    this.halo.material.opacity = this.mount === 'wall' ? 0 : Math.min(0.55, peak * 1.6) * dim;
    this.ambientLight.intensity = 0.22 + amb * 2.6;
    this.scene.background = new THREE.Color().setHSL(0.62, 0.45, 0.025 + amb * 0.5);
    this.scene.fog = new THREE.Fog(this.scene.background, 18, 40);
    this.bloom.strength = 0.75 * (1 - amb * 0.8);
    this.controls.update();
    this.composer.render();
  }

  capture() { return this.canvas.toDataURL('image/png'); }
}
