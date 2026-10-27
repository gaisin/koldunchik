/* ============================================================
   Колдунчик — 3D-сцена (Three.js r147, UMD)
   Лодка: x — нос, y — вверх, z — правый борт.
   Мир: x — восток, z — юг, курс 0° = север (−z).
   Без опций лодка стоит в начале координат, а движется море (тренажёр).
   С опцией { world: true } лодка идёт по воде: положение передаётся
   в update через opts.pos, волны и камера живут в мировых координатах (регата).
   ============================================================ */
(function (G) {
'use strict';
if (!G.THREE || !G.THREE.OrbitControls) return;
const T = G.THREE, SIM = G.SIM;
const { clamp, lerp, smooth, wrap180, D2R, sgn } = SIM;
if (T.ColorManagement) T.ColorManagement.legacyMode = false;

const COL = {
  hull: 0xf4f5f2, boot: 0x1b2f4a, anti: 0x2b3643, hullWin: 0x1a2530,
  deck: 0xd2d6d0, gel: 0xf2f3ef, teak: 0xa8723f, teakDark: 0x7f532c,
  metal: 0xb3bac0, metalDark: 0x59616a, wire: 0x87929b, black: 0x22262b,
  sail: 0xf4f2eb, uv: 0x2a3c5a, lazy: 0x394150,
  red: 0xe3323a, green: 0x1dac59, leech: 0xf2552c,
  sky: 0x5b9dd2, horizon: 0xdbe9f0, deep: 0x0f3a55, shallow: 0x2a7090, sun: 0xfff0d2,
  hl: 0xd63a9a
};
const V3 = (x, y, z) => new T.Vector3(x, y, z);
const UPV = V3(0, 1, 0);
const _a = V3(0, 0, 0), _b = V3(0, 0, 0), _c = V3(0, 0, 0), _d = V3(0, 0, 0), _e = V3(0, 0, 0);
const mat = (color, o) => new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.6, metalness: 0 }, o || {}));
const CYL = new T.CylinderGeometry(1, 1, 1, 10, 1, false);
const CYL6 = new T.CylinderGeometry(1, 1, 1, 6, 1, true);
function placeRod(me, a, b, r) {
  _a.subVectors(b, a); const len = _a.length();
  if (len < 1e-5) { me.visible = false; return; }
  me.visible = true;
  me.position.addVectors(a, b).multiplyScalar(0.5);
  me.quaternion.setFromUnitVectors(UPV, _a.multiplyScalar(1 / len));
  me.scale.set(r, len, r);
}
function rod(a, b, r, m, parent, geom) { const me = new T.Mesh(geom || CYL, m); placeRod(me, a, b, r); parent.add(me); return me; }
function box(w, h, d, m, x, y, z, parent) { const me = new T.Mesh(new T.BoxGeometry(w, h, d), m); me.position.set(x, y, z); parent.add(me); return me; }

class Rope {
  constructor(parent, color, r, n) {
    this.base = new T.Color(color);
    this.mat = mat(color, { roughness: 0.8 });
    this.r = r; this.hl = false; this.segs = [];
    for (let i = 0; i < n; i++) { const m = new T.Mesh(CYL6, this.mat); m.visible = false; parent.add(m); this.segs.push(m); }
  }
  set(pts) {
    const r = this.hl ? this.r * 2.4 : this.r;
    for (let i = 0; i < this.segs.length; i++) {
      if (i < pts.length - 1) placeRod(this.segs[i], pts[i], pts[i + 1], r); else this.segs[i].visible = false;
    }
  }
  highlight(on) {
    if (this.hl === on) return;
    this.hl = on;
    this.mat.color.copy(on ? new T.Color(COL.hl) : this.base);
    this.mat.emissive = new T.Color(on ? COL.hl : 0x000000);
    this.mat.emissiveIntensity = on ? 0.55 : 0;
  }
}
// провисающая снасть: точки между a и b с провисом
function sag(a, b, amount, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n; const p = V3(0, 0, 0).lerpVectors(a, b, t); p.y -= amount * 4 * t * (1 - t); pts.push(p); }
  return pts;
}

/* ---------- Обводы корпуса ---------- */
const LOA = 13.1, XS = -6.55;
const tOf = x => (x - XS) / LOA;
const sheerY = x => 1.12 + 0.3 * Math.pow(clamp(tOf(x), 0, 1), 1.6);
function halfBeam(x) {
  const t = clamp(tOf(x), 0, 1);
  if (t <= 0.45) return 2.12 * (1 - 0.1 * Math.pow((0.45 - t) / 0.45, 2));
  return 2.12 * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.45) / 0.55, 1.7)));
}
const KEEL_K = [[0, 0.18], [0.1, -0.12], [0.3, -0.48], [0.5, -0.62], [0.75, -0.52], [0.9, -0.25], [0.97, -0.05], [1, 0.05]];
function keelY(x) {
  const t = clamp(tOf(x), 0, 1), K = KEEL_K;
  let i = 0; while (i < K.length - 2 && t > K[i + 1][0]) i++;
  const p0 = K[Math.max(0, i - 1)], p1 = K[i], p2 = K[i + 1], p3 = K[Math.min(K.length - 1, i + 2)];
  const h = p2[0] - p1[0], u = (t - p1[0]) / h;
  const m1 = (p2[1] - p0[1]) / (p2[0] - p0[0] || 1) * h, m2 = (p3[1] - p1[1]) / (p3[0] - p1[0] || 1) * h;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p1[1] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2[1] + (u3 - u2) * m2;
}
function sectionW(x, y) {
  const b = halfBeam(x), ys = sheerY(x), yk = keelY(x), ych = Math.min(0.35, ys - 0.1);
  if (y >= ych) return b * (0.955 + 0.045 * (y - ych) / Math.max(0.01, ys - ych));
  if (y <= yk) return 0;
  const n = lerp(1.8, 2.5, clamp(1 - tOf(x) * 1.2, 0, 1));
  const r = (ych - y) / (ych - yk);
  return 0.955 * b * Math.pow(Math.max(0, 1 - Math.pow(r, n)), 1 / n);
}
const deckY = (x, z) => { const b = Math.max(halfBeam(x), 0.01); return sheerY(x) + 0.06 * (1 - Math.min(1, (z / b) * (z / b))); };
const CR_X0 = -1.7, CR_X1 = 2.9;
function crW(x) { const t = (x - CR_X0) / (CR_X1 - CR_X0); if (t < 0.7) return lerp(1.34, 1.08, t / 0.7); const u = (t - 0.7) / 0.3; return 1.08 * Math.sqrt(Math.max(0.02, 1 - u * u * 0.85)); }
const crH = x => lerp(0.44, 0.34, (x - CR_X0) / (CR_X1 - CR_X0));
const crTopY = x => deckY(x, 0) + crH(x) + 0.04;

/* ---------- Ключевые точки палубы и рангоута ---------- */
const P = {
  mastX: 1.3, mastBase: crTopY(1.3), mastTop: 19.4, hounds: 18.0,
  goose: V3(1.16, 2.55, 0), luffX: 1.12,
  tack: V3(6.38, 1.95, 0), stem: V3(6.47, 1.47, 0),
  primX: -4.3, primZ: 1.52, roofWX: -1.45, roofWZ: 0.82, clutchX: -1.05, travX: -0.6, travW: 0.72,
  trackZ: 1.5, trackX0: 0.0, trackX1: -1.6
};
P.headFull = P.tack.clone().add(V3(P.mastX, P.hounds, 0).sub(P.tack).normalize().multiplyScalar(16.2));
P.clewFull = V3(0.55, 2.7, 0);
const clutchZ = (bank, slot) => (bank === 'P' ? -1 : 1) * (0.3 + slot * 0.13);
const roofY = x => crTopY(x) + 0.01;

/* ---------- Текстуры парусов ---------- */
function sailTexture(kind) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f2eb'; g.fillRect(0, 0, 512, 1024);
  g.strokeStyle = 'rgba(120,112,95,0.38)'; g.lineWidth = 2;
  for (let i = 1; i < 14; i++) { const y = 1024 - i * 1024 / 14; g.beginPath(); g.moveTo(0, y + 18); g.lineTo(512, y - 14); g.stroke(); }
  if (kind === 'main') {
    g.fillStyle = 'rgba(120,112,95,0.28)';
    for (const s of [0.24, 0.43, 0.62, 0.8]) { const y = 1024 - s * 1024; g.fillRect(330, y - 7, 182, 14); }
    g.fillStyle = 'rgba(90,85,75,0.55)';
    for (const s of [0.105, 0.2]) { const y = 1024 - s * 1024; for (let x = 30; x < 500; x += 36) { g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.fill(); } g.fillStyle = 'rgba(160,150,130,0.4)'; g.fillRect(0, y - 16, 36, 32); g.fillRect(476, y - 16, 36, 32); g.fillStyle = 'rgba(90,85,75,0.55)'; }
    g.fillStyle = 'rgba(140,130,110,0.35)'; g.fillRect(0, 0, 512, 26); g.fillRect(0, 990, 60, 34); g.fillRect(452, 990, 60, 34);
  } else {
    g.fillStyle = '#2a3c5a'; g.fillRect(476, 0, 36, 1024); g.fillRect(0, 990, 512, 34);
    g.fillStyle = 'rgba(140,130,110,0.35)'; g.fillRect(0, 0, 30, 1024);
  }
  const tx = new T.CanvasTexture(c);
  tx.encoding = T.sRGBEncoding; tx.anisotropy = 4;
  return tx;
}

/* ---------- Сетка паруса ---------- */
function sailMesh(NU, NV, material) {
  const n = NU * NV, pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = [];
  for (let j = 0; j < NV - 1; j++) for (let i = 0; i < NU - 1; i++) {
    const a = j * NU + i, b = a + 1, c = a + NU, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const me = new T.Mesh(geo, material);
  me.frustumCulled = false;
  return me;
}
const camberShape = (u, p) => (u < p ? 1 - Math.pow((p - u) / p, 2) : 1 - Math.pow((u - p) / (1 - p), 2));
function interpA(arr, v) {
  const H = [0.1, 0.3, 0.5, 0.7, 0.9];
  if (v <= H[0]) return arr[0];
  if (v >= H[4]) return arr[4];
  const k = Math.min(3, Math.floor((v - 0.1) / 0.2));
  return lerp(arr[k], arr[k + 1], (v - H[k]) / 0.2);
}

/* ---------- Колдунчик-ленточка ---------- */
class Ribbon {
  constructor(parent, color, n, len, width) {
    this.n = n; this.len = len; this.w = width;
    this.pts = []; for (let i = 0; i < n; i++) this.pts.push(V3(0, 0, 0));
    const geo = new T.BufferGeometry();
    this.pos = new Float32Array(n * 2 * 3);
    geo.setAttribute('position', new T.BufferAttribute(this.pos, 3));
    const idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    this.mat = new T.MeshBasicMaterial({ color, side: T.DoubleSide });
    this.mesh = new T.Mesh(geo, this.mat); this.mesh.frustumCulled = false;
    parent.add(this.mesh);
    this.seed = Math.random() * 100;
  }
  build(base, dirs, camLocal) {
    const p = this.pts, seg = this.len / (this.n - 1);
    p[0].copy(base);
    for (let i = 1; i < this.n; i++) p[i].copy(p[i - 1]).addScaledVector(dirs[i - 1], seg);
    for (let i = 0; i < this.n; i++) {
      const d = i < this.n - 1 ? _a.subVectors(p[i + 1], p[i]) : _a.subVectors(p[i], p[i - 1]);
      _b.subVectors(camLocal, p[i]);
      _c.crossVectors(d, _b).normalize().multiplyScalar(this.w * (1 - 0.35 * i / this.n));
      const k = i * 6;
      this.pos[k] = p[i].x + _c.x; this.pos[k + 1] = p[i].y + _c.y; this.pos[k + 2] = p[i].z + _c.z;
      this.pos[k + 3] = p[i].x - _c.x; this.pos[k + 4] = p[i].y - _c.y; this.pos[k + 5] = p[i].z - _c.z;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.computeBoundingSphere();
  }
}

/* ---------- Сцена ---------- */
const MAX_GUSTS = 16, MAX_SHOALS = 24;
function createScene(canvas, sopts) {
  const WORLD = !!(sopts && sopts.world);
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(G.devicePixelRatio || 1, 2));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.NoToneMapping;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(42, 1.6, 0.1, 4000);
  const sunDir = V3(0.52, 0.66, 0.54).normalize();
  // в мире дальние острова и знаки тонут в дымке так же, как море у горизонта
  if (WORLD) scene.fog = new T.Fog(COL.horizon, 350, 2600);

  scene.add(new T.HemisphereLight(0xdcecff, 0x34586a, 0.85));
  const sun = new T.DirectionalLight(0xfff4e2, 1.05); sun.position.copy(sunDir).multiplyScalar(100); scene.add(sun);

  /* небо */
  const skyU = { uSky: { value: new T.Color(COL.sky) }, uHorizon: { value: new T.Color(COL.horizon) }, uSunDir: { value: sunDir }, uSunCol: { value: new T.Color(COL.sun) } };
  const sky = new T.Mesh(new T.SphereGeometry(3000, 32, 16), new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, uniforms: skyU,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uSky, uHorizon, uSunDir, uSunCol; varying vec3 vDir;
      void main(){ float y = vDir.y; vec3 col = mix(uHorizon, uSky, pow(clamp(y,0.0,1.0), 0.5));
        float s = max(dot(normalize(vDir), uSunDir), 0.0); col += uSunCol * (pow(s, 900.0) * 2.0 + pow(s, 14.0) * 0.16);
        gl_FragColor = vec4(col, 1.0);
        #include <encodings_fragment>
      }`
  }));
  sky.renderOrder = -10; scene.add(sky);

  /* море */
  const WDEF = [{ off: 0, len: 26, amp: 1.0, st: 0.55 }, { off: 32, len: 15, amp: 0.55, st: 0.5 }, { off: -27, len: 9.5, amp: 0.36, st: 0.45 }, { off: 14, len: 5.5, amp: 0.18, st: 0.35 }];
  const waves = WDEF.map(w => ({ k: 2 * Math.PI / w.len, om: Math.sqrt(9.81 * 2 * Math.PI / w.len), dx: 0, dz: 1, amp: 0.2, off: Math.random() * 6, st: w.st, def: w }));
  const seaU = {
    uTime: { value: 0 }, uW: { value: [0, 0, 0, 0].map(() => new T.Vector4()) }, uP: { value: [0, 0, 0, 0].map(() => new T.Vector4()) },
    uDeep: { value: new T.Color(COL.deep) }, uShallow: { value: new T.Color(COL.shallow) }, uSky: skyU.uSky, uHorizon: skyU.uHorizon,
    uSunDir: { value: sunDir }, uSunCol: { value: new T.Color(COL.sun) }, uAmp: { value: 0.3 }, uCaps: { value: 0 }, uOff: { value: new T.Vector2() }
  };
  if (WORLD) {
    // порывы (тёмная рябь) и мели (светлая вода, пена у камней) — только в мире
    Object.assign(seaU, {
      uGust: { value: Array.from({ length: MAX_GUSTS }, () => new T.Vector4()) }, uGustN: { value: 0 }, uGustDir: { value: new T.Vector2(0, 1) },
      uShoal: { value: Array.from({ length: MAX_SHOALS }, () => new T.Vector4()) }, uShoalN: { value: 0 }, uShoalCol: { value: new T.Color(0x3fae9f) }
    });
  }
  const WAVE_GLSL = `uniform float uTime; uniform vec4 uW[4]; uniform vec4 uP[4];
    vec3 waveAt(vec2 xz, out vec2 grad){ float h = 0.0; vec2 disp = vec2(0.0); grad = vec2(0.0);
      for (int i = 0; i < 4; i++){ vec4 w = uW[i]; vec4 q = uP[i]; float ph = w.z * dot(w.xy, xz) - q.x * uTime + q.y;
        float s = sin(ph), c = cos(ph); h += w.w * s; grad += w.w * w.z * w.xy * c; disp += w.xy * (q.z * w.w) * c; }
      return vec3(disp.x, h, disp.y); }`;
  const seaGeo = (() => {
    const rings = [0]; let r = 0.6; while (r < 2700) { rings.push(r); r = r * 1.06 + 0.3; }
    const segs = 180, pos = [0, 0, 0], idx = [];
    for (let i = 1; i < rings.length; i++) for (let j = 0; j < segs; j++) { const a = j / segs * Math.PI * 2; pos.push(Math.cos(a) * rings[i], 0, Math.sin(a) * rings[i]); }
    for (let j = 0; j < segs; j++) idx.push(0, 1 + (j + 1) % segs, 1 + j);
    for (let i = 1; i < rings.length - 1; i++) {
      const b0 = 1 + (i - 1) * segs, b1 = 1 + i * segs;
      for (let j = 0; j < segs; j++) { const j1 = (j + 1) % segs; idx.push(b0 + j, b0 + j1, b1 + j, b0 + j1, b1 + j1, b1 + j); }
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
  })();
  const sea = new T.Mesh(seaGeo, new T.ShaderMaterial({
    uniforms: seaU, defines: WORLD ? { KOLD_WORLD: '' } : {},
    vertexShader: WAVE_GLSL + `
      varying vec3 vPos; varying vec3 vN; varying float vH;
      void main(){ vec3 p = position; vec2 g;
        #ifdef KOLD_WORLD
        vec3 w = waveAt((modelMatrix * vec4(p, 1.0)).xz, g);
        #else
        vec3 w = waveAt(p.xz, g);
        #endif
        float fade = 1.0 - smoothstep(220.0, 900.0, length(p.xz)); w *= fade; g *= fade;
        p.y = w.y; p.xz -= w.xz; vH = w.y; vN = normalize(vec3(-g.x, 1.0, -g.y));
        vec4 wp = modelMatrix * vec4(p, 1.0); vPos = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform vec3 uDeep, uShallow, uSky, uHorizon, uSunDir, uSunCol; uniform float uAmp, uTime, uCaps; uniform vec2 uOff;
      varying vec3 vPos; varying vec3 vN; varying float vH;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
      #ifdef KOLD_WORLD
      uniform vec4 uGust[${MAX_GUSTS}]; uniform float uGustN; uniform vec2 uGustDir;
      uniform vec4 uShoal[${MAX_SHOALS}]; uniform float uShoalN; uniform vec3 uShoalCol;
      // порыв: эллипс, вытянутый по ветру, с мягкой кромкой; w > 0 — порыв, w < 0 — затишье
      float gustField(vec2 p){ float g = 0.0;
        for (int i = 0; i < ${MAX_GUSTS}; i++){ if (float(i) >= uGustN) break; vec4 q = uGust[i]; vec2 d = p - q.xy;
          float a = dot(d, uGustDir), c = dot(d, vec2(-uGustDir.y, uGustDir.x));
          g += q.w * (1.0 - smoothstep(0.45, 1.0, sqrt(a * a * 0.4 + c * c) / q.z)); }
        return g; }
      #endif
      void main(){ vec3 V = normalize(cameraPosition - vPos); float dist = length(cameraPosition - vPos);
        vec2 uv = (vPos.xz + uOff) * 0.8;
        float n1 = vn(uv + uTime * 0.5), n2 = vn(uv * 2.1 - uTime * 0.8), n3 = vn(uv * 0.23 + uTime * 0.05);
        float near = 1.0 - smoothstep(25.0, 260.0, dist);
        vec3 N = normalize(vN + vec3((n1 - 0.5) * 0.22 + (n3 - 0.5) * 0.1, 0.0, (n2 - 0.5) * 0.22) * near);
        float glintK = 1.0;
        #ifdef KOLD_WORLD
        // в порыве вода темнее и без солнечных бликов, в затишье — гладкая и светлая
        float gf = gustField(vPos.xz), gp = clamp(gf, 0.0, 1.0), gl = clamp(-gf, 0.0, 1.0);
        N = normalize(N - vec3(N.x, 0.0, N.z) * 0.6 * gl * near);
        glintK = 1.0 - 0.9 * gp;
        #endif
        float fres = mix(0.04, 1.0, pow(1.0 - max(dot(N, V), 0.0), 4.0));
        vec3 R = reflect(-V, N);
        vec3 skyc = mix(uHorizon, uSky, clamp(R.y * 1.6, 0.0, 1.0));
        vec3 base = mix(uDeep, uShallow, clamp(vH / (uAmp * 2.0 + 0.01) + 0.45, 0.0, 1.0) * 0.45);
        vec3 col = mix(base, skyc, fres * 0.8);
        col += uSunCol * pow(max(dot(R, uSunDir), 0.0), 240.0) * 1.4 * glintK;
        float cap = smoothstep(0.62, 1.0, vH / (uAmp * 1.3 + 0.01)) * smoothstep(0.5, 0.85, vn(uv * 0.5 + uTime * 0.15)) * uCaps;
        col = mix(col, vec3(0.94, 0.96, 0.97), cap * 0.85);
        #ifdef KOLD_WORLD
        // рябь порыва — короткие тёмные полосы поперёк ветра
        vec2 gq = vec2(dot(vPos.xz, uGustDir), dot(vPos.xz, vec2(-uGustDir.y, uGustDir.x)));
        float rip = vn(vec2(gq.x * 1.7 - uTime * 2.2, gq.y * 0.35)) * 0.65 + vn(vec2(gq.x * 3.1 - uTime * 3.0, gq.y * 0.8)) * 0.35;
        col = mix(col, vec3(0.010, 0.040, 0.068) * (0.65 + 0.7 * rip), 0.82 * gp);
        col = mix(col, skyc, 0.3 * gl);
        float sh = 0.0, foam = 0.0;
        for (int i = 0; i < ${MAX_SHOALS}; i++){ if (float(i) >= uShoalN) break; vec4 q = uShoal[i]; float d = length(vPos.xz - q.xy);
          if (q.w > 0.0) sh = max(sh, q.w * (1.0 - smoothstep(q.z * 0.45, q.z, d)));
          else foam = max(foam, -q.w * (1.0 - smoothstep(0.0, 3.5, abs(d - q.z - 1.2)))); }
        col = mix(col, uShoalCol, sh * 0.62 * (1.0 - 0.55 * fres));
        foam *= 0.45 + 0.55 * vn(vPos.xz * 1.2 + uTime * 0.9);
        col = mix(col, vec3(0.94, 0.96, 0.97), foam * 0.85);
        #endif
        col = mix(col, uHorizon, smoothstep(120.0, 1900.0, dist));
        gl_FragColor = vec4(col, 1.0);
        #include <encodings_fragment>
      }`
  }));
  sea.frustumCulled = false; scene.add(sea);
  function waveH(x, z, t) { let h = 0; for (const w of waves) h += w.amp * Math.sin(w.k * (w.dx * x + w.dz * z) - w.om * t + w.off); return h; }

  /* лодка */
  const yawG = new T.Group(); scene.add(yawG);
  const boat = new T.Group(); yawG.add(boat);
  const M = {
    hull: mat(0xffffff, { vertexColors: true, roughness: 0.32, metalness: 0.05 }),
    gel: mat(COL.gel, { roughness: 0.4 }), deck: mat(0xffffff, { vertexColors: true, roughness: 0.85 }),
    teak: mat(COL.teak, { roughness: 0.8 }), teakD: mat(COL.teakDark, { roughness: 0.8 }),
    win: mat(COL.hullWin, { roughness: 0.15, metalness: 0.4, side: T.DoubleSide }), metal: mat(COL.metal, { roughness: 0.35, metalness: 0.6 }),
    metalD: mat(COL.metalDark, { roughness: 0.45, metalness: 0.4 }), black: mat(COL.black, { roughness: 0.6 }),
    wire: mat(COL.wire, { roughness: 0.4, metalness: 0.5 }), lazy: mat(COL.lazy, { roughness: 0.9, side: T.DoubleSide }),
    chrome: mat(0xd8dde1, { roughness: 0.18, metalness: 0.85 })
  };
  const cHull = new T.Color(COL.hull), cBoot = new T.Color(COL.boot), cAnti = new T.Color(COL.anti);
  const cDeck = new T.Color(COL.deck), cGel = new T.Color(COL.gel);

  // корпус
  {
    const NS = 46, LV = 19, pos = [], col = [], idx = [];
    const xs = []; for (let i = 0; i < NS; i++) xs.push(XS + LOA * (0.5 - 0.5 * Math.cos(Math.PI * i / (NS - 1))));
    const levels = ys => [ys, ys - 0.03, ys - 0.12, lerp(ys, 0.35, 0.4), lerp(ys, 0.35, 0.75), 0.35, 0.26, 0.18, 0.121, 0.119, 0.031, 0.029, -0.06, -0.16, -0.26, -0.36, -0.46, -0.56, -0.66];
    for (const side of [1, -1]) {
      for (let i = 0; i < NS; i++) {
        const x = xs[i], yk = keelY(x), L = levels(sheerY(x));
        for (let j = 0; j < LV; j++) {
          const y = Math.max(L[j], yk), w = sectionW(x, y);
          pos.push(x, y, side * w);
          const c = j <= 8 ? cHull : j <= 10 ? cBoot : cAnti;
          col.push(c.r, c.g, c.b);
        }
      }
    }
    const off = NS * LV;
    for (let i = 0; i < NS - 1; i++) for (let j = 0; j < LV - 1; j++) {
      const a = i * LV + j, b = (i + 1) * LV + j, c = a + 1, d = b + 1;
      idx.push(a, c, b, b, c, d);
      idx.push(off + a, off + b, off + c, off + b, off + d, off + c);
    }
    // транец
    const x0 = xs[0], ys0 = sheerY(x0), yk0 = keelY(x0);
    const ci = pos.length / 3; pos.push(x0, (ys0 + yk0) / 2, 0); col.push(cHull.r, cHull.g, cHull.b);
    const ring = [];
    for (let j = 0; j < LV; j++) ring.push(off + j);
    for (let j = LV - 1; j >= 0; j--) ring.push(j);
    for (let k = 0; k < ring.length - 1; k++) idx.push(ci, ring[k], ring[k + 1]);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    boat.add(new T.Mesh(g, M.hull));
    // окна в бортах
    for (const side of [1, -1]) {
      const p2 = [], i2 = [], N = 14;
      for (let i = 0; i <= N; i++) {
        const x = lerp(-1.4, 2.5, i / N), taper = Math.sin(Math.PI * i / N) ** 0.3;
        const y0 = 0.86 - 0.05 * taper, y1 = 0.86 + 0.07 * taper;
        p2.push(x, y0, side * (sectionW(x, y0) + 0.006), x, y1, side * (sectionW(x, y1) + 0.006));
        if (i < N) { const a = i * 2; if (side > 0) i2.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); else i2.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      const gw = new T.BufferGeometry(); gw.setAttribute('position', new T.Float32BufferAttribute(p2, 3)); gw.setIndex(i2); gw.computeVertexNormals();
      boat.add(new T.Mesh(gw, M.win));
    }
    // киль и перо руля (видны при крене)
    const keel = new T.Mesh(new T.BoxGeometry(1.3, 1.6, 0.16), M.black); keel.position.set(0.45, -1.35, 0); boat.add(keel);
    const bulb = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 2.0, 12), M.black); bulb.rotation.z = Math.PI / 2; bulb.position.set(0.3, -2.1, 0); boat.add(bulb);
    const rud = new T.Mesh(new T.BoxGeometry(0.55, 1.5, 0.08), M.black); rud.position.set(-5.0, -0.85, 0); boat.add(rud);
  }
  // палуба
  function strip(xFrom, xTo, nx, zIn, zOut, nz, color) {
    const pos = [], col = [], idx = [];
    for (let i = 0; i <= nx; i++) {
      const x = lerp(xFrom, xTo, i / nx);
      for (let k = 0; k <= nz; k++) {
        const z = lerp(zIn(x), zOut(x), k / nz);
        pos.push(x, deckY(x, z), z);
        const b = Math.max(halfBeam(x), 0.01), edge = Math.abs(z) / b > 0.93;
        const c = color || (edge ? cGel : cDeck); col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      const a = i * (nz + 1) + k, b = a + 1, c = a + nz + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    const me = new T.Mesh(g, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: T.DoubleSide })); boat.add(me); return me;
  }
  strip(CR_X0, 6.55, 40, x => -halfBeam(x) * 0.998, x => halfBeam(x) * 0.998, 14);
  strip(XS, CR_X0, 12, () => 1.42, x => halfBeam(x) * 0.998, 4);
  strip(XS, CR_X0, 12, x => -halfBeam(x) * 0.998, () => -1.42, 4);
  // кокпит
  {
    const fl = new T.Mesh(new T.BoxGeometry(4.85, 0.06, 2.84), M.teak); fl.position.set((XS + CR_X0) / 2, 0.62, 0); boat.add(fl);
    for (const s of [1, -1]) {
      box(2.9, 0.38, 0.46, M.teak, -3.25, 0.83, s * 1.19, boat);
      box(0.7, 0.38, 1.05, M.teak, -6.0, 0.83, s * 0.9, boat);
      const wall = new T.Mesh(new T.BoxGeometry(4.85, 0.62, 0.05), M.gel); wall.position.set((XS + CR_X0) / 2, 0.93, s * 1.43); boat.add(wall);
      box(3.3, 0.07, 0.14, M.teakD, -3.3, sheerY(-3.3) + 0.1, s * 1.47, boat);
    }
    // стол и колонки штурвалов
    box(1.4, 0.05, 0.62, M.teak, -3.15, 1.3, 0, boat);
    box(0.22, 0.66, 0.22, M.metalD, -3.15, 0.95, 0, boat);
    for (const s of [1, -1]) {
      const wx = -5.05, wy = 1.55, wz = s * 0.82;
      rod(V3(wx, 0.62, wz), V3(wx + 0.05, 1.32, wz), 0.06, M.metalD, boat);
      const rim = new T.Mesh(new T.TorusGeometry(0.52, 0.022, 8, 40), M.metal); rim.position.set(wx + 0.18, wy, wz); rim.rotation.y = Math.PI / 2; boat.add(rim);
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; rod(V3(wx + 0.18, wy, wz), V3(wx + 0.18, wy + Math.cos(a) * 0.5, wz + Math.sin(a) * 0.5), 0.012, M.metal, boat); }
    }
    // транцевая платформа
    box(0.55, 0.07, 3.0, M.teak, XS - 0.2, 0.36, 0, boat);
  }
  // рубка
  {
    const NX = 18, pos = [], idx = [];
    const sec = x => { const wb = crW(x), wt = Math.max(0.05, wb - 0.16), yb = deckY(x, wb) - 0.02, yt = deckY(x, 0) + crH(x);
      return [[-wb, yb], [-wt, yt], [-wt * 0.5, yt + 0.03], [0, yt + 0.04], [wt * 0.5, yt + 0.03], [wt, yt], [wb, yb]]; };
    for (let i = 0; i <= NX; i++) { const x = lerp(CR_X0, CR_X1, i / NX); for (const [z, y] of sec(x)) pos.push(x, y, z); }
    const NP = 7;
    for (let i = 0; i < NX; i++) for (let k = 0; k < NP - 1; k++) { const a = i * NP + k, b = a + 1, c = a + NP, d = c + 1; idx.push(a, c, b, b, c, d); }
    const last = NX * NP, ci = pos.length / 3; pos.push(CR_X1 + 0.02, deckY(CR_X1, 0) + crH(CR_X1) * 0.6, 0);
    for (let k = 0; k < NP - 1; k++) idx.push(ci, last + k, last + k + 1);
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    boat.add(new T.Mesh(g, new T.MeshStandardMaterial({ color: COL.gel, roughness: 0.4, side: T.DoubleSide })));
    // кормовая переборка с входом
    const topA = deckY(CR_X0, 0) + crH(CR_X0);
    box(0.05, topA - 0.62, 2.68, M.gel, CR_X0 - 0.01, (topA + 0.62) / 2, 0, boat);
    box(0.03, topA - 0.8, 0.72, M.win, CR_X0 - 0.04, (topA + 0.8) / 2, 0, boat);
    // окна рубки
    for (const s of [1, -1]) {
      const p2 = [], i2 = [], N = 12;
      for (let i = 0; i <= N; i++) {
        const x = lerp(-1.2, 2.3, i / N), wb = crW(x), wt = Math.max(0.05, wb - 0.16), yb = deckY(x, wb) - 0.02, yt = deckY(x, 0) + crH(x);
        const f0 = 0.3, f1 = 0.72;
        p2.push(x, lerp(yb, yt, f0), s * (lerp(wb, wt, f0) + 0.008), x, lerp(yb, yt, f1), s * (lerp(wb, wt, f1) + 0.008));
        if (i < N) { const a = i * 2; if (s > 0) i2.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); else i2.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      const gw = new T.BufferGeometry(); gw.setAttribute('position', new T.Float32BufferAttribute(p2, 3)); gw.setIndex(i2); gw.computeVertexNormals();
      boat.add(new T.Mesh(gw, M.win));
    }
    for (const hx of [0.2, 2.2]) box(0.55, 0.02, 0.55, M.win, hx, crTopY(hx) + 0.005, 0, boat);
  }
  // релинги
  {
    const sx = [-5.7, -4.1, -2.5, -0.9, 0.7, 2.3, 3.9];
    for (const s of [1, -1]) {
      const tops = [], mids = [];
      for (const x of sx) {
        const z = s * (halfBeam(x) - 0.08), y0 = deckY(x, z);
        rod(V3(x, y0, z), V3(x, y0 + 0.64, z), 0.013, M.metal, boat);
        tops.push(V3(x, y0 + 0.64, z)); mids.push(V3(x, y0 + 0.34, z));
      }
      const bx = 5.6, bz = s * (halfBeam(bx) - 0.06), by = deckY(bx, bz) + 0.64;
      tops.push(V3(bx, by, bz)); mids.push(V3(bx, by - 0.3, bz));
      for (const arr of [tops, mids]) for (let i = 0; i < arr.length - 1; i++) rod(arr[i], arr[i + 1], 0.005, M.wire, boat);
      rod(V3(bx, by, bz), V3(6.35, deckY(6.35, 0) + 0.62, 0), 0.016, M.metal, boat);
      rod(V3(bx, by, bz), V3(bx, by - 0.64, bz), 0.016, M.metal, boat);
      const ax = -6.3, az = s * 1.6, ay = sheerY(ax) + 0.66;
      rod(V3(ax, sheerY(ax), az), V3(ax, ay, az), 0.016, M.metal, boat);
      rod(V3(ax, ay, az), V3(-5.7, sheerY(-5.7) + 0.64, s * (halfBeam(-5.7) - 0.08)), 0.016, M.metal, boat);
    }
  }
  // лебёдки
  function winch(x, y, z) {
    const g = new T.Group(); g.position.set(x, y, z);
    const b = new T.Mesh(new T.CylinderGeometry(0.12, 0.13, 0.05, 20), M.metalD); b.position.y = 0.025; g.add(b);
    const d = new T.Mesh(new T.CylinderGeometry(0.075, 0.095, 0.14, 20), M.chrome); d.position.y = 0.12; g.add(d);
    const t = new T.Mesh(new T.CylinderGeometry(0.085, 0.075, 0.05, 20), M.black); t.position.y = 0.215; g.add(t);
    boat.add(g); return g;
  }
  const winchPos = {
    PP: V3(P.primX, sheerY(P.primX) + 0.1, -P.primZ), PS: V3(P.primX, sheerY(P.primX) + 0.1, P.primZ),
    RP: V3(P.roofWX, roofY(P.roofWX), -P.roofWZ), RS: V3(P.roofWX, roofY(P.roofWX), P.roofWZ)
  };
  for (const k in winchPos) winch(winchPos[k].x, winchPos[k].y, winchPos[k].z);
  const winchTop = k => winchPos[k].clone().add(V3(0, 0.15, 0));
  // пианино
  const clutchMesh = {};
  for (const k of SIM.CLUTCH_LINES) {
    const L = SIM.LINES[k], z = clutchZ(L.bank, L.slot), y = roofY(P.clutchX);
    box(0.13, 0.05, 0.08, M.black, P.clutchX, y + 0.025, z, boat);
    const lever = new T.Mesh(new T.BoxGeometry(0.12, 0.018, 0.05), mat(0x2b2f35, { roughness: 0.5 }));
    const pv = new T.Group(); pv.position.set(P.clutchX + 0.05, y + 0.05, z); pv.add(lever); lever.position.x = -0.06; boat.add(pv);
    clutchMesh[k] = pv;
  }
  // погон гика-шкота
  const travBar = rod(V3(P.travX, roofY(P.travX) + 0.02, -P.travW), V3(P.travX, roofY(P.travX) + 0.02, P.travW), 0.018, M.metal, boat);
  const travCar = box(0.11, 0.06, 0.12, M.black, P.travX, roofY(P.travX) + 0.05, 0, boat);
  // погоны и каретки стакселя
  const cars = {};
  for (const s of [-1, 1]) {
    const z = s * P.trackZ;
    rod(V3(P.trackX0, deckY(P.trackX0, z) + 0.01, z), V3(P.trackX1, deckY(P.trackX1, z) + 0.01, z), 0.014, M.metal, boat);
    cars[s] = box(0.14, 0.07, 0.07, M.black, 0, 0, z, boat);
  }
  // рангоут
  const mastMesh = new T.Mesh(new T.CylinderGeometry(0.075, 0.105, P.mastTop - P.mastBase, 14), M.metal);
  mastMesh.scale.z = 0.62; mastMesh.position.set(P.mastX, (P.mastTop + P.mastBase) / 2, 0); boat.add(mastMesh);
  const spreaders = [];
  for (const [y, L] of [[8.2, 1.18], [13.6, 0.86]]) for (const s of [1, -1]) {
    const tip = V3(P.mastX - L * Math.sin(22 * D2R), y, s * L * Math.cos(22 * D2R));
    rod(V3(P.mastX, y, 0), tip, 0.022, M.metal, boat); spreaders.push({ y, s, tip });
  }
  const chain = s => V3(0.75, deckY(0.75, s * (halfBeam(0.75) - 0.12)) + 0.02, s * (halfBeam(0.75) - 0.12));
  for (const s of [1, -1]) {
    const t1 = spreaders.find(q => q.y === 8.2 && q.s === s).tip, t2 = spreaders.find(q => q.y === 13.6 && q.s === s).tip;
    rod(V3(P.mastX, P.hounds, 0), t2, 0.007, M.wire, boat); rod(t2, t1, 0.007, M.wire, boat); rod(t1, chain(s), 0.008, M.wire, boat);
    rod(V3(P.mastX, 7.9, 0), V3(1.1, deckY(1.1, s * (halfBeam(1.1) - 0.15)), s * (halfBeam(1.1) - 0.15)), 0.007, M.wire, boat);
  }
  rod(P.stem, V3(P.mastX, P.hounds, 0), 0.007, M.wire, boat);
  const foil = rod(P.tack.clone().add(V3(0, -0.15, 0)), P.headFull.clone().add(V3(0.05, 0.2, 0)), 0.022, M.metal, boat);
  const drum = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 0.2, 16), M.black); drum.position.set(P.tack.x + 0.03, P.tack.y - 0.22, 0); boat.add(drum);
  const roll = new T.Mesh(CYL, mat(COL.uv, { roughness: 0.9 })); boat.add(roll);
  const bsTop = V3(P.mastX - 0.15, P.mastTop - 0.05, 0), bsSplit = V3(-4.9, 6.0, 0);
  const backstayParts = [rod(bsTop, bsSplit, 0.007, M.wire, boat)];
  for (const s of [1, -1]) backstayParts.push(rod(bsSplit, V3(-6.42, sheerY(-6.42) + 0.08, s * 1.55), 0.007, M.wire, boat));
  const bsBlock = new T.Mesh(new T.SphereGeometry(0.06, 10, 8), M.black); bsBlock.position.copy(bsSplit); boat.add(bsBlock);
  // гик с лэйзибэгом
  const boomPivot = new T.Group(); boomPivot.position.copy(P.goose); boomPivot.rotation.order = 'YZX'; boat.add(boomPivot);
  { const bm = new T.Mesh(new T.BoxGeometry(5.15, 0.19, 0.12), M.metal); bm.position.set(-2.575, 0, 0); boomPivot.add(bm);
    for (const s of [1, -1]) { const lp = new T.Mesh(new T.PlaneGeometry(4.9, 0.36), M.lazy); lp.position.set(-2.55, 0.2, s * 0.13); lp.rotation.x = s * 0.22; boomPivot.add(lp); } }
  // виндекс
  const windex = new T.Group(); windex.position.set(P.mastX, P.mastTop + 0.12, 0); boat.add(windex);
  { const arm = new T.Mesh(new T.BoxGeometry(0.9, 0.02, 0.02), M.black); arm.position.x = 0.15; windex.add(arm);
    const vane = new T.Mesh(new T.BoxGeometry(0.22, 0.16, 0.008), mat(0xe8452f)); vane.position.x = -0.24; windex.add(vane);
    const tip = new T.Mesh(new T.ConeGeometry(0.035, 0.12, 8), M.black); tip.rotation.z = -Math.PI / 2; tip.position.x = 0.63; windex.add(tip);
    for (const s of [1, -1]) { const tab = new T.Mesh(new T.BoxGeometry(0.28, 0.012, 0.012), mat(0xf2c33a)); tab.position.set(P.mastX - 0.14 * Math.cos(32 * D2R), P.mastTop + 0.08, s * 0.14 * Math.sin(32 * D2R)); tab.rotation.y = -s * (180 - 32) * D2R; boat.add(tab); } }

  /* паруса */
  const NU = 14, NV = 18;
  const mainMat = new T.MeshStandardMaterial({ map: sailTexture('main'), roughness: 0.82, side: T.DoubleSide });
  const jibMat = new T.MeshStandardMaterial({ map: sailTexture('jib'), roughness: 0.82, side: T.DoubleSide });
  const mainMesh = sailMesh(NU, NV, mainMat), jibMesh = sailMesh(NU, NV, jibMat);
  boat.add(mainMesh); boat.add(jibMesh);

  const vis = { theta: -2, jib: -10, tauM: 6, tauJ: 6, crash: 0, first: true, jibA: [15, 15, 15, 15, 15], mainA: [15, 15, 15, 15, 15] };
  let SS = null, DD = null, time = 0;

  function mainCtx() {
    const D = DD, R = SS.rig, hp = D.hoist;
    return { sBot: hp.sBottom, headAbs: hp.headH * 15.6, slack: hp.slack, side: D.main.side, theta: vis.theta, tau: vis.tauM,
      lift: (1 - D.main.leech) * 7 * D2R * (D.main.sheetBind ? 1 - R.main : 1), depth: D.depthM, pos: clamp(D.draftPos, 0.35, 0.6), flog: D.mainFlog, A: vis.mainA };
  }
  const chordM = s => 5.0 * (1 - s) + 0.2 * s + 0.5 * Math.pow(Math.sin(Math.PI * s), 1.5) * (1 - 0.3 * s);
  function mainRow(c, v, o) {
    const s = c.sBot + v * (1 - c.sBot), yL = 2.62 + v * c.headAbs, ch = chordM(s), lift = (1 - v) * c.lift;
    const d = (c.theta + c.side * c.tau * v) * D2R, chH = ch * Math.cos(lift);
    o.L.set(P.luffX, yL, 0); o.C.set(-chH * Math.cos(d), ch * Math.sin(lift), chH * Math.sin(d));
    o.N.set(c.side * Math.sin(d), 0, c.side * Math.cos(d));
    const a = interpA(c.A, v);
    o.luff = c.flog ? 1 : 1 - smooth(-1, 8, a); o.ch = ch; o.s = s; o.v = v;
    o.dep = c.depth * (1 - 0.25 * v) * (1 - 0.7 * o.luff) + c.slack * 0.05;
    o.p = c.pos; o.flog = c.flog; o.slack = c.slack;
    return o;
  }
  function jibCtx() {
    const D = DD, R = SS.rig, k = Math.sqrt(clamp(1 - R.furl, 0, 1));
    const aback = D.tell.jib[1] === 'aback';
    return { k, fill: D.jib.fill, camp: aback ? -D.jib.fill : D.jib.fill, delta: vis.jib, tau: vis.tauJ, depth: D.depthJ * (1 - 0.8 * D.shadow), shadow: D.shadow,
      sag: (1 - R.backstay) * Math.min(1, D.aws / 16), flog: D.jibFlog, A: vis.jibA, pole: !!R.pole };
  }
  const _Lp = V3(0, 0, 0), _Rp = V3(0, 0, 0), _Hk = V3(0, 0, 0), _Ck = V3(0, 0, 0);
  function jibRow(c, v, o) {
    _Hk.copy(P.tack).lerp(P.headFull, c.k);
    _Ck.copy(P.tack).lerp(P.clewFull, c.k); _Ck.y += (1 - c.k) * 0.9;
    _Lp.copy(P.tack).lerp(_Hk, v); _Rp.copy(_Ck).lerp(_Hk, v);
    const dxA = Math.max(0.01, _Lp.x - _Rp.x), dy = _Rp.y - _Lp.y;
    const d = (c.delta + c.fill * c.tau * v) * D2R;
    const sg = 4 * v * (1 - v) * c.sag;
    o.L.set(_Lp.x - 0.12 * sg, _Lp.y, c.fill * 0.28 * sg);
    o.C.set(-dxA * Math.cos(d), dy, dxA * Math.sin(d));
    o.N.set(c.camp * Math.sin(d), 0, c.camp * Math.cos(d));
    const a = interpA(c.A, v);
    o.luff = c.flog ? 1 : 1 - smooth(-2, 9, a); o.ch = Math.hypot(dxA, dy); o.v = v; o.s = v;
    o.dep = c.depth * (1 - 0.15 * v) * (1 - 0.6 * o.luff); o.p = 0.38; o.flog = c.flog; o.slack = 0; o.shadow = c.shadow; o.k = c.k;
    return o;
  }
  const mkRow = () => ({ L: V3(0, 0, 0), C: V3(0, 0, 0), N: V3(0, 0, 0) });
  function sailPt(o, u, out, isJib) {
    let off = o.dep * o.ch * camberShape(u, o.p);
    if (o.luff > 0.02) {
      off -= o.luff * o.dep * o.ch * 2.4 * Math.exp(-Math.pow((u - 0.1) / 0.13, 2));
      off += o.luff * o.luff * o.ch * 0.05 * u * Math.sin(time * 14 + u * 9 + o.v * 5);
    }
    if (o.flog) off += o.ch * 0.14 * u * Math.sin(time * 10 + u * 7 - o.v * 4) + o.ch * 0.05 * Math.sin(time * 23 + u * 15);
    if (isJib && o.shadow > 0.3) off += o.shadow * o.ch * 0.06 * u * Math.sin(time * 3.1 + u * 5 + o.v * 3);
    if (o.slack > 0.01 && u < 0.2) off += o.slack * 0.35 * (1 - u / 0.2) * Math.sin(o.v * 70);
    out.copy(o.L).addScaledVector(o.C, u).addScaledVector(o.N, off);
    return out;
  }
  const rowTmp = mkRow(), rowTmp2 = mkRow();
  function updateSail(mesh, ctx, rowFn, isJib) {
    const pos = mesh.geometry.attributes.position.array, uv = mesh.geometry.attributes.uv.array;
    for (let j = 0; j < NV; j++) {
      const v = j / (NV - 1); rowFn(ctx, v, rowTmp);
      for (let i = 0; i < NU; i++) {
        const u = i / (NU - 1); sailPt(rowTmp, u, _d, isJib);
        const k = j * NU + i;
        pos[k * 3] = _d.x; pos[k * 3 + 1] = _d.y; pos[k * 3 + 2] = _d.z;
        if (isJib) { uv[k * 2] = 1 - ctx.k * (1 - u); uv[k * 2 + 1] = v; } else { uv[k * 2] = u; uv[k * 2 + 1] = rowTmp.s; }
      }
    }
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.attributes.uv.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingSphere();
  }
  function ptAt(ctx, rowFn, u, v, out, isJib) { rowFn(ctx, v, rowTmp2); return sailPt(rowTmp2, u, out, isJib); }

  /* колдунчики */
  const jibTT = [0.25, 0.5, 0.75].map(() => ({ a: new Ribbon(boat, COL.red, 7, 0.6, 0.026), b: new Ribbon(boat, COL.green, 7, 0.6, 0.026) }));
  const leechTT = [0.2, 0.42, 0.64, 0.86].map(() => ({ r: new Ribbon(boat, COL.leech, 7, 0.62, 0.028), st: 0, seed: Math.random() * 50 }));
  const dirs = []; for (let i = 0; i < 8; i++) dirs.push(V3(0, 0, 0));
  const camLocal = V3(0, 0, 0);
  const TELL_MODE = { ok: ['stream', 'stream'], wind: ['flutter', 'stream'], luff: ['whip', 'flutter'], lee: ['stream', 'lift'], stall: ['stream', 'curl'], limp: ['hang', 'hang'], aback: ['whip', 'whip'], flog: ['whip', 'whip'], pole: ['curl', 'curl'] };
  function tellDirs(mode, t, n, b, seed) {
    // t — вдоль потока, n — наружу от поверхности, b — вверх по парусу
    for (let i = 0; i < 6; i++) {
      const ph = time * (mode === 'whip' ? 26 : mode === 'flutter' ? 17 : mode === 'stream' ? 7 : 3) + i * 0.9 + seed;
      let th, out;
      switch (mode) {
        case 'stream': th = 0.07 * Math.sin(ph); out = 0.05; break;
        case 'flutter': th = 0.85 + 0.5 * Math.sin(ph) + 0.2 * Math.sin(ph * 2.3); out = 0.5; break;
        case 'whip': th = 1.3 * Math.sin(ph) + 0.6 * Math.sin(ph * 1.7 + 1); out = 0.7 + 0.3 * Math.sin(ph * 0.7); break;
        case 'lift': th = 1.0 + 0.35 * Math.sin(ph * 0.8) + i * 0.08; out = 0.55; break;
        case 'curl': th = 2.0 + 0.45 * Math.sin(ph * 0.6) + i * 0.12; out = 0.75; break;
        default: th = -1.45 + 0.15 * Math.sin(ph * 0.5); out = 0.1;
      }
      const d = dirs[i];
      if (mode === 'hang') d.set(0, -1, 0).addScaledVector(n, 0.12).addScaledVector(t, 0.1 * Math.sin(ph));
      else d.copy(t).multiplyScalar(Math.cos(th)).addScaledVector(b, Math.sin(th) * (1 - out)).addScaledVector(n, Math.abs(Math.sin(th)) * out + 0.04);
      d.normalize();
    }
    return dirs;
  }
  function updateTelltales(jc, mc) {
    camLocal.copy(camera.position); boat.worldToLocal(camLocal);
    const D = DD;
    [0.25, 0.5, 0.75].forEach((vv, i) => {
      const show = SS.rig.furl < 0.97;
      const tt = jibTT[i]; tt.a.mesh.visible = tt.b.mesh.visible = show;
      if (!show) return;
      const v = vv * 0.96, u = 0.13;
      const base = ptAt(jc, jibRow, u, v, V3(0, 0, 0), true);
      const pu = ptAt(jc, jibRow, u + 0.04, v, V3(0, 0, 0), true), pd = ptAt(jc, jibRow, u, v + 0.03, V3(0, 0, 0), true);
      const t = pu.sub(base).normalize(), b = pd.sub(base).normalize();
      const n = V3(0, 0, 0).crossVectors(t, b).normalize();
      jibRow(jc, v, rowTmp2); if (n.dot(rowTmp2.N) < 0) n.negate();
      const st = TELL_MODE[D.tell.jib[i]] || TELL_MODE.ok;
      // наветренная сторона — против выпуклости (−n), подветренная — по выпуклости (+n)
      const winFace = n.clone().negate(), leeFace = n;
      const winRib = winFace.z > 0 ? tt.b : tt.a, leeRib = winFace.z > 0 ? tt.a : tt.b;
      winRib.build(base.clone().addScaledVector(winFace, 0.012), tellDirs(st[0], t, winFace, b, winRib.seed).map(x => x.clone()), camLocal);
      leeRib.build(base.clone().addScaledVector(leeFace, 0.012), tellDirs(st[1], t, leeFace, b, leeRib.seed).map(x => x.clone()), camLocal);
    });
    [0.2, 0.42, 0.64, 0.86].forEach((vv, i) => {
      const L = leechTT[i];
      const ok = DD.hoist.headH > 0.3 && vv > mc.sBot + 0.03;
      L.r.mesh.visible = ok; if (!ok) return;
      const fv = clamp((vv - mc.sBot) / (1 - mc.sBot), 0.02, 0.98);
      const base = ptAt(mc, mainRow, 1, fv, V3(0, 0, 0), false);
      const back = ptAt(mc, mainRow, 0.93, fv, V3(0, 0, 0), false);
      const t = base.clone().sub(back).normalize();
      mainRow(mc, fv, rowTmp2);
      const n = rowTmp2.N.clone(), b = UPV.clone();
      const p = D.tell.main[i];
      const wob = 0.5 + 0.5 * Math.sin(time * 0.9 + L.seed) * Math.sin(time * 0.37 + L.seed * 2);
      const target = p > wob ? 1 : 0;
      L.st += (target - L.st) * 0.08;
      for (let k = 0; k < 6; k++) {
        const ph = time * 8 + k * 0.9 + L.seed;
        const dStream = t.clone().addScaledVector(b, 0.08 * Math.sin(ph)).addScaledVector(n, 0.05 * Math.sin(ph * 1.3));
        const dStall = t.clone().multiplyScalar(-0.15 - k * 0.12).addScaledVector(n, 0.85).addScaledVector(b, -0.35 + 0.1 * Math.sin(ph * 0.4));
        dirs[k].copy(dStream.normalize()).lerp(dStall.normalize(), L.st).normalize();
      }
      L.r.build(base, dirs.map(x => x.clone()), camLocal);
    });
  }

  /* снасти */
  const ropes = {};
  const LC = SIM.LINES;
  for (const k in LC) ropes[k] = new Rope(boat, LC[k].color, 0.012, 7);
  ropes.trav = new Rope(boat, 0x7a5a3a, 0.008, 3);
  const vangStrut = rod(V3(0, 0, 0), V3(0, 1, 0), 0.03, M.metalD, boat);
  const tails = {}; for (const k of SIM.CLUTCH_LINES) tails[k] = new Rope(boat, LC[k].color, 0.012, 2);
  const mastBase = V3(P.mastX - 0.1, P.mastBase + 0.06, 0);
  const clutchPt = k => V3(P.clutchX + 0.07, roofY(P.clutchX) + 0.04, clutchZ(LC[k].bank, LC[k].slot));
  const boomDir = (th, lift) => V3(-Math.cos(lift) * Math.cos(th), Math.sin(lift), Math.cos(lift) * Math.sin(th));
  function updateRopes(jc, mc) {
    const R = SS.rig, th = vis.theta * D2R, lift = mc.lift;
    const bd = boomDir(th, lift);
    const boomAt = d => P.goose.clone().addScaledVector(bd, d);
    const car = V3(P.travX, roofY(P.travX) + 0.06, P.travW * R.trav);
    travCar.position.set(car.x, car.y - 0.01, car.z);
    // гика-шкот
    ropes.main.set([boomAt(1.85).add(V3(0, -0.1, 0)), car, V3(P.travX - 0.1, car.y - 0.02, car.z * 0.5), clutchPt('main')]);
    // оттяжка гика: жёсткая + хвост
    placeRod(vangStrut, V3(P.mastX - 0.08, P.mastBase + 0.25, 0), boomAt(1.2).add(V3(0, -0.08, 0)), 0.028);
    ropes.vang.set([V3(P.mastX - 0.08, P.mastBase + 0.25, 0), mastBase.clone(), clutchPt('vang')]);
    // фал
    ropes.halyard.set([V3(P.mastX - 0.06, 2.6, -0.05), V3(P.mastX - 0.06, P.mastBase + 0.08, -0.05), clutchPt('halyard')]);
    // рифы
    const boomEnd = boomAt(5.0), goose = P.goose.clone();
    for (const [key, i] of [['reef1', 1], ['reef2', 2]]) {
      const rh = SIM.BOAT.reefH[i];
      const fv = (rh - mc.sBot) / (1 - mc.sBot);
      const cr = fv > 0 ? ptAt(mc, mainRow, 0.985, Math.min(fv, 1), V3(0, 0, 0), false) : boomAt(4.6);
      ropes[key].set([cr, boomAt(4.7), goose, mastBase.clone().add(V3(0, 0, -0.04 * i)), clutchPt(key)]);
    }
    ropes.outhaul.set([boomEnd, goose.clone().add(V3(0, -0.08, 0)), mastBase.clone().add(V3(0, 0, 0.05)), clutchPt('outhaul')]);
    // закрутка
    ropes.furl.set([V3(P.tack.x - 0.05, P.tack.y - 0.3, 0.1), V3(5.4, deckY(5.4, 0.9) + 0.05, 0.9), V3(2.4, deckY(2.4, 1.5) + 0.05, 1.5), V3(0.2, deckY(0.2, 1.3) + 0.05, 1.3), V3(-0.75, roofY(-0.75) + 0.04, 0.56), clutchPt('furl')]);
    // шкоты стакселя
    const clew = ptAt(jc, jibRow, 1, 0, V3(0, 0, 0), true);
    for (const s of [-1, 1]) {
      const key = s < 0 ? 'sheetP' : 'sheetS';
      const c = s < 0 ? R.carP : R.carS, cx = lerp(P.trackX0, P.trackX1, c), cz = s * P.trackZ;
      const carPt = V3(cx, deckY(cx, cz) + 0.08, cz);
      cars[s].position.set(cx, deckY(cx, cz) + 0.045, cz);
      const wp = winchTop(s < 0 ? 'PP' : 'PS');
      const active = DD.jib.bind && DD.jib.ctrl === s;
      const slack = active ? 0 : clamp((R[key] - 0.8 * R.furl) * 0.25, 0.08, 0.5);
      if (active) ropes[key].set([clew, carPt, wp]);
      else {
        const via = V3(P.mastX + 0.5, 1.95, s * 0.1);
        const pts = sag(clew, via, slack * 0.6, 2).concat(sag(via, carPt, slack, 2).slice(1));
        pts.push(wp); ropes[key].set(pts);
      }
    }
    // погон
    ropes.trav.set([V3(P.travX, car.y, -P.travW), car, V3(P.travX, car.y, P.travW)]);
    // хвосты на лебёдках в режиме «Палуба»
    for (const k of SIM.CLUTCH_LINES) {
      const w = SS.mode === 'deck' && SIM.onWinch(SS.deck, k) ? SIM.winchFor(k) : null;
      if (w) { tails[k].set([clutchPt(k).add(V3(-0.13, 0, 0)), winchTop(w)]); }
      else tails[k].set([]);
      const pv = clutchMesh[k];
      const open = SS.mode === 'deck' && SS.deck.clutch[k] === 0;
      pv.rotation.z += ((open ? -1.0 : 0) - pv.rotation.z) * 0.25;
    }
  }

  /* ветер: стрелка на воде и струйки */
  const arrowGeo = new T.BufferGeometry();
  arrowGeo.setAttribute('position', new T.Float32BufferAttribute([-7, 0, -0.35, 4, 0, -0.35, 4, 0, 0.35, -7, 0, 0.35, 4, 0, -1.3, 7.5, 0, 0, 4, 0, 1.3], 3));
  arrowGeo.setIndex([0, 2, 1, 0, 3, 2, 4, 6, 5]);
  const windArrow = new T.Mesh(arrowGeo, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false }));
  const aroundG = new T.Group(); scene.add(aroundG);
  windArrow.renderOrder = 2; aroundG.add(windArrow);
  const NSTREAK = 260, streakPos = new Float32Array(NSTREAK * 6), streaks = [];
  for (let i = 0; i < NSTREAK; i++) streaks.push(V3((Math.random() - 0.5) * 60, 0.6 + Math.random() * 22, (Math.random() - 0.5) * 60));
  const streakGeo = new T.BufferGeometry(); streakGeo.setAttribute('position', new T.BufferAttribute(streakPos, 3));
  const streakLines = new T.LineSegments(streakGeo, new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
  streakLines.frustumCulled = false; aroundG.add(streakLines);

  /* кильватер */
  const wakeU = { uTime: seaU.uTime, uW: seaU.uW, uP: seaU.uP, uScroll: { value: 0 }, uStr: { value: 0 } };
  const wakeGeo = (() => {
    const pos = [], uv = [], idx = [], N = 40;
    for (let i = 0; i <= N; i++) { const t = i / N, x = -5.8 - t * 70, w = 1.0 + t * 11; pos.push(x, 0.06, -w, x, 0.06, w); uv.push(t, 0, t, 1); }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
  })();
  const wake = new T.Mesh(wakeGeo, new T.ShaderMaterial({
    uniforms: wakeU, transparent: true, depthWrite: false, side: T.DoubleSide,
    vertexShader: WAVE_GLSL + `varying vec2 vUv; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vec2 g; vec3 w = waveAt(wp.xz, g); wp.y += w.y; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform float uScroll, uStr, uTime; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 15731.743); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
      void main(){ float across = abs(vUv.y - 0.5) * 2.0; float along = vUv.x;
        float n = vn(vec2(along * 60.0 + uScroll * 0.9, vUv.y * 9.0 + uTime * 0.3)) * 0.6 + vn(vec2(along * 150.0 + uScroll * 2.2, vUv.y * 25.0)) * 0.4;
        float edge = smoothstep(1.0, 0.55, across) * (0.35 + 0.65 * smoothstep(0.0, 0.25, across));
        float a = smoothstep(0.42, 0.85, n) * edge * (1.0 - smoothstep(0.1, 1.0, along)) * uStr;
        gl_FragColor = vec4(vec3(0.95, 0.97, 0.98), a * 0.85);
        #include <encodings_fragment>
      }`
  }));
  wake.frustumCulled = false; yawG.add(wake);

  /* камера */
  const controls = new T.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 5; controls.maxDistance = WORLD ? 420 : 120; controls.maxPolarAngle = 88 * D2R;
  controls.target.set(0.5, 6.5, 0);
  let view = 'free', lastYaw = null, highlightKey = null;
  let camAnim = null, lastKey = 'all', userMoved = false, lastAspect = 0, frameMargin = 1;
  controls.addEventListener('start', () => { camAnim = null; userMoved = true; });
  const boatLocalToWorld = (x, y, z) => { yawG.updateMatrixWorld(); return V3(x, y, z).applyMatrix4(yawG.matrixWorld); };
  const wrapPi = a => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  // Ракурсы: tgt — что показываем (z к подветру), dir — откуда смотрим (s: 'win' с наветра, 'lee' с подветра), r — радиус кадра, м
  const PRESETS = {
    all: { tgt: [0.4, 8.4, 0.3], dir: [-1.55, 0.45, 1.0], s: 'win', r: 11.0 },
    stern: { tgt: [0.2, 8.2, 0.4], dir: [-1, 0.3, 0.12], s: 'win', r: 10.6 },
    top: { tgt: [-0.4, 2.2, 0.3], dir: [-0.07, 1, 0.02], s: 'win', r: 13.5 },
    side: { tgt: [0.4, 8.2, 0], dir: [0.02, 0.06, 1], s: 'lee', r: 11.0 },
    trim: { tgt: [0.6, 5.5, 0.6], dir: [-0.8, 1.25, 0.3], s: 'win', r: 10.5 },
    jibTwist: { tgt: [2.7, 7.0, 0.8], dir: [0.45, 0.22, 1], s: 'lee', r: 9.0 },
    twist: { tgt: [0, 8.8, 1.0], dir: [-0.75, 0.2, 1], s: 'lee', r: 10.4 },
    shape: { tgt: [0.3, 7.0, 0.6], dir: [-0.3, 0.14, 1], s: 'lee', r: 9.8 },
    area: { tgt: [0.6, 8.4, 0.2], dir: [0.06, 0.1, 1], s: 'lee', r: 11.0 },
    // регата: за лодкой с видом вперёд и высоко над дистанцией
    chase: { tgt: [70, 0, 0], dir: [-0.965, 0.262, 0], s: 'win', r: 46 },
    high: { tgt: [120, 0, 0], dir: [-0.84, 1, 0], s: 'win', r: 136 }
  };
  function presetWorld(key) {
    const p = PRESETS[key] || PRESETS.all, lee = SS ? SS.boomSide : -1, side = p.s === 'lee' ? lee : -lee;
    const tl = V3(p.tgt[0], p.tgt[1], p.tgt[2] * lee).applyAxisAngle(V3(1, 0, 0), boat.rotation.x);
    const dir = V3(p.dir[0], p.dir[1], p.dir[2] * side).normalize();
    const vf = camera.fov * D2R, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    const dist = clamp(p.r / Math.sin(Math.min(vf, hf) / 2) * frameMargin, 8, WORLD ? 400 : 110);
    return { tgt: boatLocalToWorld(tl.x, tl.y, tl.z), pos: boatLocalToWorld(tl.x + dir.x * dist, tl.y + dir.y * dist, tl.z + dir.z * dist) };
  }
  function goTo(key, instant) {
    lastKey = key; userMoved = false;
    const w = presetWorld(key);
    controls.enableDamping = false; controls.update(); controls.enableDamping = true;
    if (instant) { camAnim = null; camera.position.copy(w.pos); controls.target.copy(w.tgt); controls.update(); return; }
    const s0 = new T.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    const s1 = new T.Spherical().setFromVector3(w.pos.clone().sub(w.tgt));
    camAnim = { t: 0, dur: 0.9, tg0: controls.target.clone(), tg1: w.tgt, s0, s1 };
  }
  function setView(name, o) {
    o = o || {};
    view = name; camAnim = null;
    const rigid = name === 'cockpit' || name === 'helm';
    controls.enabled = !rigid;
    if (rigid) { camera.fov = 50; camera.updateProjectionMatrix(); return; }
    camera.fov = 42; camera.updateProjectionMatrix();
    goTo(name === 'auto' || name === 'free' ? (o.focus || 'all') : name, !!o.instant);
  }
  function focus(key, instant) { if (view === 'auto' && PRESETS[key]) goTo(key, !!instant); }
  function highlight(key) {
    highlightKey = key;
    for (const k in ropes) ropes[k].highlight(k === key || (key === 'trav' && k === 'trav'));
    for (const k in tails) tails[k].highlight(k === key);
    const bsOn = key === 'backstay';
    for (const r of backstayParts) r.material = bsOn ? new T.MeshStandardMaterial({ color: COL.hl, emissive: COL.hl, emissiveIntensity: 0.6 }) : M.wire;
    travBar.material = key === 'trav' ? new T.MeshStandardMaterial({ color: COL.hl, emissive: COL.hl, emissiveIntensity: 0.5 }) : M.metal;
    for (const s of [-1, 1]) cars[s].material = (key === 'car' + (s < 0 ? 'P' : 'S')) ? new T.MeshStandardMaterial({ color: COL.hl, emissive: COL.hl, emissiveIntensity: 0.5 }) : M.black;
  }

  /* обновление кадра */
  let waveAng = null, lastPos = null;
  const tmpW = V3(0, 0, 0), center = V3(0, 0, 0);
  const rotAround = (v, a) => v.sub(center).applyAxisAngle(UPV, a).add(center);
  function update(S, D, dt, opts) {
    SS = S; DD = D; time += dt;
    if (!D) return;
    const B = S.boat;
    // волны
    const windTo = (S.wind.twd + 180) * D2R;
    const targetAng = windTo;
    if (waveAng == null) waveAng = targetAng;
    waveAng += wrap180((targetAng - waveAng) / D2R) * D2R * Math.min(1, dt / 12);
    const ampMain = clamp(0.0024 * S.wind.tws * S.wind.tws, 0.03, 1.25);
    // где лодка: в мире она идёт по воде, в тренажёре стоит, а вода течёт мимо
    const bx = WORLD && opts.pos ? opts.pos.x : 0, bz = WORLD && opts.pos ? opts.pos.z : 0;
    waves.forEach((w, i) => {
      const a = waveAng + w.def.off * D2R, dx0 = w.dx, dz0 = w.dz;
      w.dx = Math.sin(a); w.dz = -Math.cos(a); w.amp = ampMain * w.def.amp;
      if (!WORLD) w.off = (w.off + w.k * (w.dx * (B.vx || 0) + w.dz * (B.vz || 0)) * dt) % (Math.PI * 2);
      // в мире волны поворачиваются вслед за ветром вокруг лодки, а не вокруг начала координат
      else w.off = (w.off - w.k * ((w.dx - dx0) * bx + (w.dz - dz0) * bz)) % (Math.PI * 2);
      seaU.uW.value[i].set(w.dx, w.dz, w.k, w.amp); seaU.uP.value[i].set(w.om, w.off, w.st, 0);
    });
    seaU.uTime.value = time; seaU.uAmp.value = ampMain; seaU.uCaps.value = smooth(11, 22, S.wind.tws);
    if (WORLD) { yawG.position.set(bx, 0, bz); sea.position.set(bx, 0, bz); aroundG.position.set(bx, 0, bz); center.set(bx, 0, bz); }
    else { const ox = seaU.uOff.value; ox.x = (ox.x + (B.vx || 0) * dt) % 4096; ox.y = (ox.y + (B.vz || 0) * dt) % 4096; }
    // положение лодки
    const yaw = Math.PI / 2 - B.hdg * D2R;
    yawG.rotation.y = yaw;
    const fx = Math.sin(B.hdg * D2R), fz = -Math.cos(B.hdg * D2R), rx = -fz, rz = fx;
    const hB = waveH(bx + fx * 5, bz + fz * 5, time), hS = waveH(bx - fx * 5, bz - fz * 5, time), hR = waveH(bx + rx * 1.8, bz + rz * 1.8, time), hL = waveH(bx - rx * 1.8, bz - rz * 1.8, time);
    boat.position.y = (hB + hS + hR + hL) * 0.2;
    boat.rotation.z = Math.atan2(hB - hS, 10) * 0.8;
    const crashKick = S.crashT > 0 ? Math.sin(S.crashT * 30) * S.crashT * 0.08 : 0;
    boat.rotation.x = B.heel * D2R + Math.atan2(hR - hL, 3.6) * 0.5 + crashKick;
    // визуальные углы с ограничением скорости
    const rate = S.crashT > 0 ? 320 : 70;
    const dth = clamp(S.boomAngle - vis.theta, -rate * dt, rate * dt);
    vis.theta = vis.first ? S.boomAngle : vis.theta + dth;
    const dj = clamp(D.jib.delta - vis.jib, -110 * dt, 110 * dt);
    vis.jib = vis.first ? D.jib.delta : vis.jib + dj;
    vis.tauM += (D.main.tau - vis.tauM) * Math.min(1, dt * 4);
    vis.tauJ += (D.jib.tau - vis.tauJ) * Math.min(1, dt * 4);
    for (let i = 0; i < 5; i++) { vis.jibA[i] += (D.jibAlpha[i] - vis.jibA[i]) * Math.min(1, dt * 6); vis.mainA[i] += (D.mainAlpha[i] - vis.mainA[i]) * Math.min(1, dt * 6); }
    vis.first = false;
    // гик и паруса
    const mc = mainCtx(), jc = jibCtx();
    boomPivot.rotation.y = vis.theta * D2R; boomPivot.rotation.z = -mc.lift;
    mainMesh.visible = D.hoist.headH > 0.02;
    updateSail(mainMesh, mc, mainRow, false);
    jibMesh.visible = S.rig.furl < 0.985;
    if (jibMesh.visible) updateSail(jibMesh, jc, jibRow, true);
    const rr = 0.024 + 0.085 * S.rig.furl;
    placeRod(roll, P.tack.clone().add(V3(0, -0.05, 0)), P.headFull.clone(), rr);
    // виндекс
    const awaTop = D.awa + sgn(D.awa) * D.gamma;
    windex.rotation.y = -awaTop * D2R;
    // снасти и колдунчики
    updateRopes(jc, mc);
    updateTelltales(jc, mc);
    // стрелка истинного ветра
    const tdx = -Math.sin(S.wind.twd * D2R), tdz = Math.cos(S.wind.twd * D2R);
    windArrow.position.set(-tdx * 22, 0.35 + waveH(bx - tdx * 22, bz - tdz * 22, time), -tdz * 22);
    windArrow.rotation.y = Math.atan2(-tdz, tdx);
    windArrow.visible = opts.showWind;
    // струйки вымпельного ветра
    streakLines.visible = opts.showWind;
    if (opts.showWind) {
      const tws = S.wind.tws * 0.5144;
      const ax = tdx * tws - (B.vx || 0), az = tdz * tws - (B.vz || 0);
      const sp = Math.hypot(ax, az) || 1e-3, ux = ax / sp, uz = az / sp;
      for (let i = 0; i < NSTREAK; i++) {
        const p = streaks[i], gk = Math.pow(clamp(p.y / 10, 0.1, 2), 0.12);
        p.x += ax * gk * dt; p.z += az * gk * dt;
        if (p.x > 30) p.x -= 60; if (p.x < -30) p.x += 60; if (p.z > 30) p.z -= 60; if (p.z < -30) p.z += 60;
        const l = clamp(sp * 0.22, 0.3, 2.6) * gk, k = i * 6;
        streakPos[k] = p.x; streakPos[k + 1] = p.y; streakPos[k + 2] = p.z;
        streakPos[k + 3] = p.x - ux * l; streakPos[k + 4] = p.y; streakPos[k + 5] = p.z - uz * l;
      }
      streakGeo.attributes.position.needsUpdate = true;
    }
    // кильватер
    wakeU.uScroll.value = B.dist; wakeU.uStr.value = smooth(0.6, 6.5, B.bsp);
    // камера
    if (lastYaw == null) lastYaw = yaw;
    // камера едет вместе с лодкой
    if (WORLD) {
      if (!lastPos) lastPos = V3(bx, 0, bz);
      tmpW.set(bx - lastPos.x, 0, bz - lastPos.z); lastPos.set(bx, 0, bz);
      if (tmpW.x || tmpW.z) {
        camera.position.add(tmpW); controls.target.add(tmpW);
        if (camAnim) { camAnim.tg0.add(tmpW); camAnim.tg1.add(tmpW); }
      }
    }
    const dy = yaw - lastYaw; lastYaw = yaw;
    if (view === 'cockpit' || view === 'helm') {
      boat.updateMatrixWorld();
      const win = -S.boomSide;
      let cp, lookP;
      if (view === 'helm') {
        // у наветренного штурвала, взгляд вперёд по курсу
        cp = boat.localToWorld(V3(-5.75, 2.5, win * 0.9));
        lookP = boat.localToWorld(V3(45, 1.2, win * 0.4));
      } else {
        cp = boat.localToWorld(V3(-3.6, 2.55, win * 1.95));
        const lp = ptAt(jc, jibRow, 0.12, 0.5, V3(0, 0, 0), true);
        lookP = boat.localToWorld(lp.lerp(V3(1.5, 9, 0), 0.15));
      }
      const k = view === 'helm' && opts.rdt != null ? opts.rdt : dt;
      camera.position.lerp(cp, Math.min(1, k * 5)); camera.lookAt(lookP);
    } else {
      if (Math.abs(dy) > 1e-7) {
        rotAround(camera.position, dy);
        rotAround(controls.target, dy);
        if (camAnim) { rotAround(camAnim.tg0, dy); rotAround(camAnim.tg1, dy); camAnim.s0.theta += dy; camAnim.s1.theta += dy; }
      }
      if (camAnim) {
        const a = camAnim;
        a.t += opts.rdt != null ? opts.rdt : dt;
        const k = smooth(0, 1, a.t / a.dur);
        controls.target.lerpVectors(a.tg0, a.tg1, k);
        const sp = new T.Spherical(lerp(a.s0.radius, a.s1.radius, k), lerp(a.s0.phi, a.s1.phi, k), a.s0.theta + wrapPi(a.s1.theta - a.s0.theta) * k);
        camera.position.setFromSpherical(sp).add(controls.target);
        camera.lookAt(controls.target);
        if (a.t >= a.dur) { camAnim = null; controls.update(); }
      } else controls.update();
    }
    sky.position.copy(camera.position);
  }
  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1); camera.updateProjectionMatrix();
    if (lastAspect && Math.abs(camera.aspect / lastAspect - 1) > 0.06 && !userMoved && !camAnim && view !== 'cockpit' && view !== 'helm') goTo(lastKey, true);
    lastAspect = camera.aspect;
  }
  function setFrameMargin(m) { frameMargin = m; }
  function render() { renderer.render(scene, camera); }
  // поля на воде для мира: порывы {x, z, r, w} и мели {x, z, r, w}; w < 0 у мели — кольцо пены вокруг камня
  function setSeaFields(f) {
    if (!WORLD) return;
    const put = (list, arr, nU, max) => { const n = Math.min(list.length, max); for (let i = 0; i < n; i++) { const g = list[i]; arr[i].set(g.x, g.z, g.r, g.w); } nU.value = n; };
    if (f.gusts) put(f.gusts, seaU.uGust.value, seaU.uGustN, MAX_GUSTS);
    if (f.gustDir) seaU.uGustDir.value.set(f.gustDir.x, f.gustDir.z).normalize();
    if (f.shoals) put(f.shoals, seaU.uShoal.value, seaU.uShoalN, MAX_SHOALS);
  }
  return {
    update, render, resize, setView, focus, setFrameMargin, highlight, getView: () => view, renderer, camera,
    scene, controls, setSeaFields, maxGusts: MAX_GUSTS, maxShoals: MAX_SHOALS,
    waveH: (x, z) => waveH(x, z, time), time: () => time
  };
}

G.KScene = { createScene };
})(typeof window !== 'undefined' ? window : globalThis);
