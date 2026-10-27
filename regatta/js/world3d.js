/* ============================================================
   Колдунчик · Регата — 3D-объекты дистанции поверх сцены тренажёра:
   знаки и подсветка следующего (столб света, кольцо и стрелка огибания),
   судейские суда, стартовая и финишная линии, камни, острова с маяком,
   кардинальные буи; порывы, мели и пена у камней — полями на воде.
   Карта (x, y) — это мир three.js (x, 0, −y).
   ============================================================ */
(function (G) {
'use strict';
const T = G.THREE;
if (!T) return;
const { clamp, D2R } = G.SIM;
const KWIND = G.KWIND;

const COL = { mark: 0xff7a1c, markBand: 0x2a2f36, pin: 0xffb21a, port: 0xff4b55, stbd: 0x2fd37c, hull: 0xf3f5f2, cabin: 0xdfe4e2, glass: 0x23313d, flagStart: 0xff8a1a, flagFinish: 0x2f6fd6, rock: 0x6a645a, sand: 0xd9c79b, grass: 0x6b8a48, forest: 0x4a6a3a, cliff: 0x8a8478, yellow: 0xf2c21b, black: 0x22262b, white: 0xf4f4f0, red: 0xd2343a };
const mat = (color, o) => new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.6, metalness: 0 }, o || {}));
const P3 = (p, h) => new T.Vector3(p.x, h || 0, -p.y);

// полоса пунктира на воде для линии старта и финиша
function dashTexture() {
  const c = G.document.createElement('canvas'); c.width = 64; c.height = 8;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.95)'; g.fillRect(0, 0, 40, 8);
  const tx = new T.CanvasTexture(c);
  tx.wrapS = T.RepeatWrapping; tx.encoding = T.sRGBEncoding;
  return tx;
}

function createWorld(sc, race) {
  const C = race.C, root = new T.Group();
  sc.scene.add(root);
  const rnd = KWIND.mulberry32((C.def.wind.seed || 1) * 7 + 3);
  const bobbers = [];
  const bob = (obj, p, base, k) => { bobbers.push({ obj, x: p.x, z: -p.y, base: base || 0, k: k == null ? 1 : k }); return obj; };

  /* ---------- знаки ---------- */
  const markGeo = new T.CylinderGeometry(0.78, 0.92, 1.9, 22);
  const capGeo = new T.SphereGeometry(0.78, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const bandGeo = new T.CylinderGeometry(0.93, 0.95, 0.28, 22);
  const markMat = mat(COL.mark, { roughness: 0.5 }), bandMat = mat(COL.markBand, { roughness: 0.7 });
  function buoy(p, color, scale) {
    const g = new T.Group();
    const body = new T.Mesh(markGeo, color === COL.mark ? markMat : mat(color, { roughness: 0.5 }));
    body.position.y = 0.6; g.add(body);
    const cap = new T.Mesh(capGeo, body.material); cap.position.y = 1.55; g.add(cap);
    const band = new T.Mesh(bandGeo, bandMat); band.position.y = -0.2; g.add(band);
    g.scale.setScalar(scale || 1);
    root.add(g);
    return bob(g, p, 0, 1);
  }
  for (const id in C.marks) buoy(C.marks[id].pos, COL.mark, 1.15);

  /* ---------- концы линий: буй с флажком и судейское судно ---------- */
  const flagGeo = new T.PlaneGeometry(1.1, 0.75);
  function pinBuoy(p, flagColor) {
    const g = buoy(p, COL.pin, 0.95);
    const staff = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 2.6, 6), mat(0x444a50));
    staff.position.y = 3.0; g.add(staff);
    const flag = new T.Mesh(flagGeo, mat(flagColor, { side: T.DoubleSide, roughness: 0.8 }));
    flag.position.set(0.55, 3.9, 0); g.add(flag);
    return g;
  }
  function committee(cb, flagColor) {
    const g = new T.Group();
    const hullShape = new T.Shape();
    hullShape.moveTo(-4.6, -1.5); hullShape.lineTo(3.2, -1.5); hullShape.quadraticCurveTo(4.9, -0.4, 5.0, 0); hullShape.quadraticCurveTo(4.9, 0.4, 3.2, 1.5); hullShape.lineTo(-4.6, 1.5); hullShape.lineTo(-4.6, -1.5);
    const hull = new T.Mesh(new T.ExtrudeGeometry(hullShape, { depth: 1.5, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 2 }), mat(COL.hull, { roughness: 0.35 }));
    hull.rotation.x = -Math.PI / 2; hull.position.y = -0.55; g.add(hull);
    const stripe = new T.Mesh(new T.BoxGeometry(9.2, 0.18, 3.08), mat(0x1d3c66, { roughness: 0.5 }));
    stripe.position.set(0.1, 0.3, 0); g.add(stripe);
    const cabin = new T.Mesh(new T.BoxGeometry(3.6, 1.5, 2.3), mat(COL.cabin, { roughness: 0.4 }));
    cabin.position.set(-0.6, 1.75, 0); g.add(cabin);
    const win = new T.Mesh(new T.BoxGeometry(3.64, 0.5, 2.34), mat(COL.glass, { roughness: 0.15, metalness: 0.4 }));
    win.position.set(-0.6, 2.05, 0); g.add(win);
    const mast = new T.Mesh(new T.CylinderGeometry(0.06, 0.07, 5.2, 8), mat(0xb3bac0, { metalness: 0.5, roughness: 0.35 }));
    mast.position.set(-1.2, 4.8, 0); g.add(mast);
    const flag = new T.Mesh(new T.PlaneGeometry(1.6, 1.05), mat(flagColor, { side: T.DoubleSide, roughness: 0.8 }));
    flag.position.set(-2.05, 6.7, 0); g.add(flag);
    // нос — против ветра; качка — на внешней группе, чтобы наклон шёл по осям мира
    g.rotation.y = Math.atan2(C.U.y, C.U.x);
    const tilt = new T.Group(); tilt.add(g);
    root.add(tilt);
    return bob(tilt, cb.pos, 0, 0.6);
  }
  committee(C.boats[0], COL.flagStart);
  pinBuoy(C.start.pin, COL.flagStart);
  if (!C.finish.same) { committee(C.boats[1], COL.flagFinish); pinBuoy(C.finish.pin, COL.flagFinish); }

  // линии на воде
  const dashTx = dashTexture();
  function lineStrip(L) {
    const len = L.len, tx = dashTx.clone(); tx.needsUpdate = true; tx.repeat.set(len / 9, 1);
    const m = new T.Mesh(new T.PlaneGeometry(len, 1.1), new T.MeshBasicMaterial({ map: tx, transparent: true, opacity: 0.85, depthWrite: false, fog: true }));
    m.rotation.x = -Math.PI / 2;
    const holder = new T.Group(); holder.add(m);
    holder.position.copy(P3(L.mid, 0.45));
    holder.rotation.y = Math.atan2(L.along.y, L.along.x);
    holder.visible = false; root.add(holder);
    return holder;
  }
  const startLine = lineStrip(C.start);
  const finishLine = C.finish.same ? startLine : lineStrip(C.finish);

  /* ---------- камни ---------- */
  function rockGeo(r, h) {
    const geo = new T.IcosahedronGeometry(1, 2), pos = geo.attributes.position;
    const seed = rnd() * 10;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const n = 1 + 0.18 * Math.sin(x * 3.1 + seed) * Math.cos(z * 2.7 + seed * 2) + 0.1 * Math.sin(y * 5.3 + x * 2 + seed);
      pos.setXYZ(i, x * n * r, y * n * (h + 1.6) * (y > 0 ? 1 : 0.6), z * n * r);
    }
    geo.computeVertexNormals();
    return geo;
  }
  const rockMat = mat(COL.rock, { roughness: 0.92, flatShading: true });
  for (const r of C.rocks) {
    const m = new T.Mesh(rockGeo(r.r * 0.95, r.h), rockMat);
    m.position.copy(P3(r.pos, -1.4)); m.rotation.y = rnd() * 6.28; root.add(m);
    for (let k = 0; k < 3; k++) {
      const a = rnd() * 6.28, d = r.r * (0.8 + rnd() * 0.5), s = 0.25 + rnd() * 0.3;
      const sm = new T.Mesh(rockGeo(r.r * s, r.h * s * 0.6), rockMat);
      sm.position.set(r.pos.x + Math.cos(a) * d, -1.0, -(r.pos.y + Math.sin(a) * d)); root.add(sm);
    }
  }

  /* ---------- острова ---------- */
  // высота острова в точке карты (максимум по холмам) — и для маяка
  function islandHeight(isl, p) {
    let h = -2;
    for (const b of isl.blobs) {
      const d = Math.hypot(p.x - b.pos.x, p.y - b.pos.y) / b.r;
      if (d > 1.06) continue;
      let y;
      if (d > 1) y = -2 * (d - 1) / 0.06;
      else if (d > 0.92) y = 1.1 * (1 - d) / 0.08;
      else y = 1.1 + (b.h - 1.1) * Math.pow(1 - Math.pow(d / 0.92, 2), 1.15);
      h = Math.max(h, y);
    }
    return h;
  }
  const cSand = new T.Color(COL.sand), cGrass = new T.Color(COL.grass), cForest = new T.Color(COL.forest), cCliff = new T.Color(COL.cliff);
  const islandMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: false });
  const trees = [];
  for (const isl of C.islands) {
    for (const b of isl.blobs) {
      const SEG = 56, RINGS = 18, pos = [], col = [], idx = [];
      const ph = rnd() * 10, ph2 = rnd() * 10;
      for (let i = 0; i <= RINGS; i++) {
        const rho = 1.06 * Math.pow(i / RINGS, 0.8);
        for (let j = 0; j < SEG; j++) {
          const a = j / SEG * Math.PI * 2;
          const wob = 0.975 + 0.02 * Math.sin(3 * a + ph) + 0.008 * Math.sin(7 * a + ph2);
          const rr = rho * b.r * (rho > 0.9 ? wob : 1);
          const x = b.pos.x + Math.cos(a) * rr, y = b.pos.y + Math.sin(a) * rr;
          let h;
          const d = rho;
          if (d > 1) h = -2 * (d - 1) / 0.06;
          else if (d > 0.92) h = 1.1 * (1 - d) / 0.08;
          else h = 1.1 + (b.h - 1.1) * Math.pow(1 - Math.pow(d / 0.92, 2), 1.15) * (1 + 0.09 * Math.sin(x * 0.045 + ph) * Math.cos(y * 0.038 + ph2));
          pos.push(x, h, -y);
          const c = h < 1.6 ? cSand : h > b.h * 0.72 ? cForest.clone().lerp(cCliff, 0.25) : cGrass.clone().lerp(cForest, clamp((h - 2) / b.h, 0, 1) * 0.8);
          if (h > 1.6 && Math.sin(x * 0.06 + ph2) * Math.cos(y * 0.05 + ph) > 0.55) c.lerp(cCliff, 0.55);
          col.push(c.r, c.g, c.b);
        }
      }
      for (let i = 0; i < RINGS; i++) for (let j = 0; j < SEG; j++) {
        const a0 = i * SEG + j, a1 = i * SEG + (j + 1) % SEG, b0 = (i + 1) * SEG + j, b1 = (i + 1) * SEG + (j + 1) % SEG;
        idx.push(a0, b0, a1, a1, b0, b1);
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      root.add(new T.Mesh(geo, islandMat));
      // деревья на склонах
      const n = Math.round(b.r * b.r / 900);
      for (let k = 0; k < n; k++) {
        const a = rnd() * 6.28, d = Math.sqrt(rnd()) * 0.8 * b.r;
        const p = { x: b.pos.x + Math.cos(a) * d, y: b.pos.y + Math.sin(a) * d };
        const h = islandHeight(isl, p);
        if (h > 2.2) trees.push({ p, h, s: 0.7 + rnd() * 0.7 });
      }
    }
    if (isl.lighthouse) {
      const p = isl.lighthouse, base = islandHeight(isl, p) - 0.3, g = new T.Group();
      const tower = new T.Mesh(new T.CylinderGeometry(1.2, 1.7, 14, 20), mat(COL.white, { roughness: 0.5 }));
      tower.position.y = 7; g.add(tower);
      const rAt = y => 1.7 - 0.5 * y / 14 + 0.03;
      for (const yb of [4.5, 10]) { const band = new T.Mesh(new T.CylinderGeometry(rAt(yb + 1.1), rAt(yb - 1.1), 2.2, 20), mat(COL.red, { roughness: 0.5 })); band.position.y = yb; g.add(band); }
      const gallery = new T.Mesh(new T.CylinderGeometry(1.7, 1.7, 0.3, 20), mat(0x30363c)); gallery.position.y = 14.1; g.add(gallery);
      const lamp = new T.Mesh(new T.CylinderGeometry(0.9, 0.9, 1.6, 16), mat(0xfff1b8, { emissive: 0xffd76a, emissiveIntensity: 0.9 })); lamp.position.y = 15.0; g.add(lamp);
      const roof = new T.Mesh(new T.ConeGeometry(1.2, 1.3, 16), mat(COL.red)); roof.position.y = 16.45; g.add(roof);
      g.position.copy(P3(p, base)); root.add(g);
    }
  }
  if (trees.length) {
    const tg = new T.ConeGeometry(1.6, 5.5, 7); tg.translate(0, 2.6, 0);
    const im = new T.InstancedMesh(tg, mat(0x3c5a33, { roughness: 0.95, flatShading: true }), trees.length);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3();
    trees.forEach((tr, i) => { s.set(tr.s, tr.s * (0.8 + rnd() * 0.5), tr.s); m4.compose(P3(tr.p, tr.h - 0.4), q, s); im.setMatrixAt(i, m4); });
    root.add(im);
  }

  /* ---------- кардинальные буи ---------- */
  // цвета сверху вниз и топовая фигура: нижний и верхний конус, 1 — вершиной вверх
  const CARD = { north: { bands: [COL.black, COL.yellow], cones: [1, 1] }, south: { bands: [COL.yellow, COL.black], cones: [-1, -1] },
    east: { bands: [COL.black, COL.yellow, COL.black], cones: [-1, 1] }, west: { bands: [COL.yellow, COL.black, COL.yellow], cones: [1, -1] },
    danger: { bands: [COL.black, COL.red, COL.black], cones: [0, 0] } };
  for (const bu of C.buoys) {
    const spec = CARD[bu.kind] || CARD.danger, g = new T.Group(), H = 3.4, n = spec.bands.length;
    spec.bands.forEach((c, i) => { const seg = new T.Mesh(new T.CylinderGeometry(0.55, 0.62, H / n, 14), mat(c, { roughness: 0.55 })); seg.position.y = H - (i + 0.5) * H / n - 0.6; g.add(seg); });
    const pole = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 1.3, 6), mat(COL.black)); pole.position.y = H - 0.6 + 0.6; g.add(pole);
    spec.cones.forEach((d, i) => {
      const cone = d ? new T.Mesh(new T.ConeGeometry(0.42, 0.55, 12), mat(COL.black)) : new T.Mesh(new T.SphereGeometry(0.3, 10, 8), mat(COL.black));
      if (d < 0) cone.rotation.x = Math.PI;
      cone.position.y = H + 0.2 + i * 0.7; g.add(cone);
    });
    root.add(g); bob(g, bu.pos, 0, 0.8);
  }

  /* ---------- подсветка следующего знака ---------- */
  const beamMat = new T.MeshBasicMaterial({ color: COL.port, transparent: true, opacity: 0.32, depthWrite: false, blending: T.AdditiveBlending, fog: false });
  const beamGeo = new T.CylinderGeometry(0.7, 1.6, 46, 16, 1, true); beamGeo.translate(0, 23, 0);
  const beam = new T.Mesh(beamGeo, beamMat); beam.renderOrder = 5; root.add(beam);
  const ringMat = new T.MeshBasicMaterial({ color: COL.port, transparent: true, opacity: 0.55, depthWrite: false, side: T.DoubleSide, fog: false });
  const ring = new T.Mesh(new T.RingGeometry(4.2, 5.2, 48), ringMat); ring.rotation.x = -Math.PI / 2; ring.renderOrder = 5;
  const ringG = new T.Group(); ringG.add(ring); root.add(ringG);
  // стрелка огибания: дуга снаружи поворота и наконечник по ходу
  const arcG = new T.Group(); root.add(arcG);
  const arcMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, side: T.DoubleSide, fog: false });
  let arcFor = null;
  function buildArc(leg) {
    while (arcG.children.length) {
      const c = arcG.children[0];
      arcG.remove(c);
      c.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }
    const half = Math.min(75, leg.wreq / 2 - 8) * D2R, R0 = 11, R1 = 12.6;
    const start = leg.beta * D2R - half;
    const arc = new T.Mesh(new T.RingGeometry(R0, R1, 40, 1, start, 2 * half), arcMat);
    arc.rotation.x = -Math.PI / 2; arcG.add(arc);
    // наконечник: в конце дуги по ходу огибания
    const endA = leg.side > 0 ? start + 2 * half : start, dir = leg.side;
    const tri = new T.Shape(); tri.moveTo(0, 2.4 * dir); tri.lineTo(-1.9, -0.6 * dir); tri.lineTo(1.9, -0.6 * dir); tri.lineTo(0, 2.4 * dir);
    const head = new T.Mesh(new T.ShapeGeometry(tri), arcMat);
    const hg = new T.Group(); hg.add(head);
    head.position.set((R0 + R1) / 2, 0, 0);
    hg.rotation.z = endA;
    const hold = new T.Group(); hold.add(hg); hold.rotation.x = -Math.PI / 2;
    arcG.add(hold);
    arcFor = leg;
  }

  /* ---------- поля на воде: мели, пена у камней, светлая вода у островов ---------- */
  const shoals = [];
  for (const sh of C.shoals) for (const b of sh.blobs) shoals.push({ x: b.pos.x, z: -b.pos.y, r: b.r * 1.08, w: 0.95 });
  for (const r of C.rocks) shoals.push({ x: r.pos.x, z: -r.pos.y, r: r.r * 0.9, w: -0.9 });
  for (const isl of C.islands) for (const b of isl.blobs) shoals.push({ x: b.pos.x, z: -b.pos.y, r: b.r * 1.2, w: 0.5 });
  sc.setSeaFields({ shoals: shoals.slice(0, sc.maxShoals), gusts: [], gustDir: { x: C.U.x, z: -C.U.y } });

  /* ---------- соперники: простые лодки того же размера ---------- */
  const hullShape = new T.Shape();
  hullShape.moveTo(-6.3, -1.5); hullShape.lineTo(0.8, -2.05); hullShape.quadraticCurveTo(5.0, -1.6, 6.45, 0); hullShape.quadraticCurveTo(5.0, 1.6, 0.8, 2.05); hullShape.lineTo(-6.3, 1.5); hullShape.lineTo(-6.3, -1.5);
  const hullGeo = new T.ExtrudeGeometry(hullShape, { depth: 1.35, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.1, bevelSegments: 1 });
  const bootGeo = new T.ExtrudeGeometry(hullShape, { depth: 0.22, bevelEnabled: false });
  const hullMat = mat(COL.hull, { roughness: 0.35 }), sailMat = mat(0xf4f2eb, { roughness: 0.85, side: T.DoubleSide });
  const mastGeo = new T.CylinderGeometry(0.06, 0.09, 18, 8);
  const triGeo = pts => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pts, 3)); g.computeVertexNormals(); return g; };
  const mainGeo = triGeo([0, 2.3, 0, 0, 18.6, 0, -5.0, 2.5, 0]), jibGeo = triGeo([0, 0, 0, -4.9, 15.2, 0, -5.2, 0.5, 0]);
  const fleet = race.boats.filter(o => !o.player).map(o => {
    const yaw = new T.Group(), heel = new T.Group(); yaw.add(heel);
    const hull = new T.Mesh(hullGeo, hullMat); hull.rotation.x = -Math.PI / 2; hull.position.y = -0.55; heel.add(hull);
    const boot = new T.Mesh(bootGeo, mat(o.color || 0x2a3c5a, { roughness: 0.5 })); boot.rotation.x = -Math.PI / 2; boot.position.y = -0.05; boot.scale.set(1.012, 1.03, 1); heel.add(boot);
    const mast = new T.Mesh(mastGeo, mat(0xb3bac0, { metalness: 0.5, roughness: 0.35 })); mast.position.set(1.3, 9.6, 0); heel.add(mast);
    const main = new T.Group(); main.position.set(1.2, 0, 0); main.add(new T.Mesh(mainGeo, sailMat)); heel.add(main);
    const band = new T.Mesh(triGeo([0, 15.6, 0.01, 0, 18.6, 0.01, -1.1, 15.7, 0.01]), mat(o.color || 0x2a3c5a, { side: T.DoubleSide })); main.add(band);
    const jib = new T.Group(); jib.position.set(6.1, 1.45, 0); jib.add(new T.Mesh(jibGeo, sailMat)); heel.add(jib);
    root.add(yaw);
    return { o, yaw, heel, main, jib, boom: 0, heelA: 0 };
  });
  function updateFleet(dt) {
    for (const f of fleet) {
      const o = f.o, S = o.S, D = S.D, x = o.x, z = -o.y;
      f.yaw.position.set(x, sc.waveH(x, z) * 0.8, z);
      f.yaw.rotation.y = Math.PI / 2 - S.boat.hdg * D2R;
      if (!D) continue;
      // гик и стаксель под ветер, крен от силы и угла ветра
      const side = -Math.sign(D.twa || 1), a = D.twaAbs;
      const boom = side * clamp(a * 0.48 - 6, 6, 78), jibA = side * clamp(a * 0.36 - 5, 6, 60);
      f.boom += (boom - f.boom) * Math.min(1, dt * 2.5);
      f.main.rotation.y = f.boom * D2R; f.jib.rotation.y = jibA * D2R;
      const k = a < 30 ? 0.3 : a < 70 ? 1 : a < 120 ? 0.8 : 0.35;
      const heelT = side * Math.min(25, (D.tws / 13) * (D.tws / 13) * 15 * k);
      f.heelA += (heelT - f.heelA) * Math.min(1, dt);
      f.heel.rotation.x = f.heelA * D2R;
    }
  }

  let gustT = 0;
  function update(dt, b, tgt) {
    const time = sc.time();
    updateFleet(dt);
    for (const o of bobbers) {
      const h = sc.waveH(o.x, o.z), hx = sc.waveH(o.x + 1.5, o.z) - sc.waveH(o.x - 1.5, o.z), hz = sc.waveH(o.x, o.z + 1.5) - sc.waveH(o.x, o.z - 1.5);
      o.obj.position.set(o.x, o.base + h * o.k, o.z);
      // ось буя — по нормали к воде: (−dh/dx, 1, −dh/dz)
      o.obj.rotation.x = clamp(-hz / 3, -0.25, 0.25) * o.k; o.obj.rotation.z = clamp(hx / 3, -0.25, 0.25) * o.k;
    }
    // следующий знак
    const isMark = tgt && tgt.kind === 'mark';
    beam.visible = ringG.visible = arcG.visible = !!isMark;
    if (isMark) {
      const col = tgt.side > 0 ? COL.port : COL.stbd, p = tgt.mark.pos;
      beamMat.color.setHex(col); ringMat.color.setHex(col);
      beam.position.copy(P3(p, 0)); ringG.position.copy(P3(p, 0.35 + sc.waveH(p.x, -p.y) * 0.8)); arcG.position.copy(ringG.position);
      const pulse = 0.5 + 0.5 * Math.sin(time * 3);
      beamMat.opacity = 0.22 + 0.12 * pulse; ringMat.opacity = 0.35 + 0.3 * pulse;
      ring.scale.setScalar(1 + 0.15 * pulse);
      if (arcFor !== tgt.leg) buildArc(tgt.leg);
    }
    startLine.visible = !!tgt && (tgt.kind === 'start' || tgt.kind === 'ocs' || (C.finish.same && tgt.kind === 'finish'));
    if (!C.finish.same) finishLine.visible = !!tgt && tgt.kind === 'finish';
    // порывы: ближайшие к лодке
    gustT -= dt;
    if (gustT <= 0) {
      gustT = 0.15;
      const list = race.puffs.map(p => ({ p, d: Math.hypot(p.x - b.x, p.y - b.y) - p.r })).sort((a, c) => a.d - c.d).slice(0, sc.maxGusts);
      sc.setSeaFields({ gusts: list.map(({ p }) => ({ x: p.x, z: -p.y, r: p.r, w: clamp(p.gain / 0.26, -1, 1) * p.k })) });
    }
  }
  function dispose() {
    sc.scene.remove(root);
    root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); });
    sc.setSeaFields({ gusts: [], shoals: [] });
  }
  return { update, dispose, root, fleet };
}

G.KWorld = { createWorld };
})(window);
