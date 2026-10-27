/* ============================================================
   Колдунчик · Регата — трассы (без DOM, работает и в Node)
   Координаты трассы задаются в её собственных осях: u — вправо,
   v — на ветер (метры, начало — середина стартовой линии). Поворот на
   направление ветра превращает их в карту (x — восток, y — север).
   Стартовая линия: буй (pin) — левый конец, судейское судно (cb) — правый.
   Знак огибают левым (port) или правым (stbd) бортом.
   Препятствия: камни (rock), острова из нескольких холмов (island),
   отмели (shoal) с кардинальным буем, отдельные буи (buoy).
   route — точки для автопилота на ногах, где прямой путь закрыт.
   ============================================================ */
(function (G) {
'use strict';
const SIM = G.SIM, GEO = G.GEO;
const { wrap180 } = SIM;
const { vec, dirOf, dist, lineOf, angOf, sub, norm, bearing } = GEO;

const COURSES = [
  {
    id: 'intro', level: 1,
    title: { ru: 'Первая гонка', en: 'First race' },
    brief: {
      ru: 'Короткая гонка в ровный ветер: старт, лавировка к наветренному знаку и попутный ветер обратно через стартовую линию.',
      en: 'A short race in a steady breeze: start, beat to the windward mark and run back across the start line to finish.'
    },
    wind: { twd: 20, tws: 10, osc: [[4, 260, 0.4]], puffs: { every: 55, life: [200, 320], gain: [0.1, 0.2], r: [60, 100], shift: [-3, 3] }, seed: 1101 },
    countdown: 60,
    start: { pin: [-90, 0], cb: [90, 0] },
    boat0: { at: [-70, -115], twa: -90 },
    marks: { W: { at: [0, 450], kind: 'windward' } },
    legs: [['W', 'port']],
    finish: 'start',
    obstacles: []
  },
  {
    id: 'wl', level: 2,
    title: { ru: 'Наветренно-подветренная', en: 'Windward–leeward' },
    brief: {
      ru: 'Классика: лавировка, фордевинд и снова лавировка к финишу у наветренного знака. Ветер колеблется, по воде идут порывы. По краям — отмель и камень.',
      en: 'The classic: a beat, a run and another beat to a finish near the windward mark. The wind oscillates and puffs roll down the course. A shoal and a rock guard the corners.'
    },
    wind: { twd: 225, tws: 13, osc: [[7, 330, 0.2], [3, 140, 2.1]], grad: { tws: 0.04 }, puffs: { every: 26, life: [220, 360], gain: [0.15, 0.32], r: [70, 150], shift: [-6, 6], lull: 0.22 }, seed: 2207 },
    countdown: 60,
    start: { pin: [-110, 0], cb: [110, 0] },
    boat0: { at: [60, -135], twa: 92 },
    marks: { W: { at: [0, 740], kind: 'windward' }, L: { at: [0, 140], kind: 'leeward' } },
    legs: [['W', 'port'], ['L', 'port']],
    finish: { pin: [-55, 620], cb: [55, 620] },
    obstacles: [
      { type: 'shoal', blobs: [[-470, 380, 75], [-520, 450, 60], [-440, 310, 45]], buoy: [-375, 385] },
      { type: 'rock', at: [450, 520], r: 7, h: 3 },
      { type: 'rock', at: [468, 540], r: 4, h: 1.6 }
    ]
  },
  {
    id: 'triangle', level: 2,
    title: { ru: 'Треугольник у маяка', en: 'Lighthouse triangle' },
    brief: {
      ru: 'Лавировка, два полных курса с поворотом фордевинд у бокового знака и лавировка к финишу. На полных курсах всё решает настройка парусов. Свежий ветер.',
      en: 'A beat, two reaches with a gybe at the wing mark, then a beat to the finish. On the reaches trim is everything. A fresh breeze.'
    },
    wind: { twd: 300, tws: 15, osc: [[5, 380, 1.0]], trend: 0.6, puffs: { every: 30, life: [240, 380], gain: [0.15, 0.3], r: [80, 150], shift: [-6, 6], lull: 0.15 }, seed: 3313 },
    countdown: 60,
    start: { pin: [-120, 0], cb: [120, 0] },
    boat0: { at: [-60, -140], twa: -95 },
    marks: { W: { at: [0, 820], kind: 'windward' }, X: { at: [-470, 430], kind: 'wing' }, L: { at: [0, 110], kind: 'leeward' } },
    legs: [['W', 'port'], ['X', 'port'], ['L', 'port']],
    finish: { pin: [-55, 640], cb: [55, 640] },
    obstacles: [
      { type: 'rock', at: [-260, 870], r: 9, h: 4 },
      { type: 'rock', at: [-236, 850], r: 5, h: 2 },
      { type: 'shoal', blobs: [[-730, 470, 80], [-770, 385, 70]], buoy: [-640, 440] },
      { type: 'island', blobs: [[-960, 110, 120, 26], [-1040, 200, 90, 18], [-900, 30, 70, 12]], lighthouse: [-965, 95] }
    ]
  },
  {
    id: 'skerries', level: 3,
    title: { ru: 'Шхеры', en: 'Skerries' },
    brief: {
      ru: 'Лавировка узким проливом между островами, огибание знака правым бортом и обратный путь вокруг острова. Камни, отмели, затишья у берегов.',
      en: 'A beat up a narrow channel between islands, a windward mark left to starboard and the way back around an island. Rocks, shoals and lulls near the shore.'
    },
    wind: { twd: 170, tws: 12, osc: [[6, 300, 0.7], [2, 110, 2.5]], puffs: { every: 28, life: [200, 340], gain: [0.15, 0.32], r: [60, 130], shift: [-7, 7], lull: 0.2 }, seed: 4421 },
    countdown: 60,
    start: { pin: [-100, 0], cb: [100, 0] },
    boat0: { at: [50, -130], twa: 90 },
    marks: { W: { at: [-20, 1150], kind: 'windward' }, E: { at: [560, 560], kind: 'turn' } },
    legs: [['W', 'stbd'], ['E', 'port']],
    finish: { pin: [230, 160], cb: [370, 160] },
    obstacles: [
      { type: 'island', blobs: [[-300, 650, 170, 30], [-420, 770, 130, 22], [-215, 525, 85, 14]] },
      { type: 'island', blobs: [[300, 700, 150, 26], [385, 820, 110, 18]] },
      { type: 'rock', at: [-95, 610], r: 8, h: 3.5 },
      { type: 'rock', at: [80, 770], r: 6, h: 2.5 },
      { type: 'rock', at: [-75, 900], r: 7, h: 3 },
      { type: 'shoal', blobs: [[125, 540, 60], [155, 590, 45]], buoy: [55, 545] },
      { type: 'shoal', blobs: [[660, 420, 70]], buoy: [585, 405] }
    ],
    route: { 1: [[0, 280], [-20, 520], [5, 690], [0, 900]], 2: [[230, 1060], [540, 960]] },
    corridor: 60
  }
];

const MARK_R = 1.0, PIN_R = 0.9, CB_HALF = 4.6, CB_R = 1.8;
// стоянка после финиша: в off м за линией, через gap м в стороны от её концов,
// не ближе clear к камням и знакам и не ближе leg к прямой между знаками
const PARK = { off: 70, gap: 32, n: 8, clear: 40, leg: 60 };

function parking(C) {
  const L = C.finish, out = [];
  const free = p => C.solids.every(o => dist(p, o) > o.r + PARK.clear)
    && C.shoals.every(sh => sh.blobs.every(b => dist(p, b.pos) > b.r + PARK.clear))
    && C.touch.every(o => (o.cap ? GEO.closestOnSeg(p, o.a, o.b).d : dist(p, o)) > PARK.clear)
    && C.legs.slice(1).every(l => GEO.closestOnSeg(p, l.from, l.type === 'mark' ? l.mark.pos : l.line.mid).d > PARK.leg);
  for (let j = 0; out.length < PARK.n && j < 30; j++) {
    for (const s of [1, -1]) {
      const p = GEO.add(GEO.add(L.mid, L.n, PARK.off), L.along, s * (L.len / 2 + 25 + PARK.gap * j));
      if (out.length < PARK.n && free(p)) out.push(p);
    }
  }
  // без свободных мест — хотя бы прямо за линией
  return out.length ? out : [GEO.add(L.mid, L.n, PARK.off)];
}

// Трасса в координатах карты: знаки, ноги, линии, препятствия, коллайдеры.
function buildCourse(def) {
  const twd = def.wind.twd, U = dirOf(twd), R = dirOf(twd + 90);
  const P = a => vec(a[0] * R.x + a[1] * U.x, a[0] * R.y + a[1] * U.y);
  const C = { def, id: def.id, twd, U, R, toMap: P, countdown: def.countdown || 60 };
  C.toCourse = p => ({ u: p.x * R.x + p.y * R.y, v: p.x * U.x + p.y * U.y });

  // знаки
  const marks = {};
  for (const id in def.marks) marks[id] = { id, kind: def.marks[id].kind, pos: P(def.marks[id].at), r: MARK_R };
  C.marks = marks;

  // стартовая линия: нормаль — к первому знаку
  const first = marks[def.legs[0][0]].pos;
  const pin = P(def.start.pin), cb = P(def.start.cb);
  C.start = Object.assign(lineOf(pin, cb, first), { pin, cb });
  // финиш: нормаль — по ходу от последнего знака
  const lastMark = marks[def.legs[def.legs.length - 1][0]].pos;
  if (def.finish === 'start') C.finish = Object.assign(lineOf(pin, cb, null), { pin, cb, same: true });
  else { const fp = P(def.finish.pin), fc = P(def.finish.cb); C.finish = Object.assign(lineOf(fp, fc, null), { pin: fp, cb: fc, same: false }); }
  if (GEO.dot(C.finish.n, sub(C.finish.mid, lastMark)) < 0) C.finish.n = vec(-C.finish.n.x, -C.finish.n.y);

  // ноги: 0 — старт, 1..n — знаки, n+1 — финиш
  const legs = [{ type: 'start', line: C.start }];
  const pts = [C.start.mid].concat(def.legs.map(l => marks[l[0]].pos), [C.finish.mid]);
  def.legs.forEach((l, i) => {
    const m = marks[l[0]], side = l[1] === 'port' ? 1 : -1;
    const prev = pts[i], next = pts[i + 2];
    // биссектриса угла поворота снаружи знака: при огибании левым бортом лодка обходит
    // знак против часовой стрелки — от направления на предыдущую точку к направлению на следующую.
    // Почти разворот (w близко к нулю) — это полный обход знака, а не проход мимо.
    const aP = angOf(prev, m.pos), aN = angOf(next, m.pos);
    let w = side > 0 ? ((aN - aP) % 360 + 360) % 360 : ((aP - aN) % 360 + 360) % 360;
    if (w < 30) w += 360;
    const beta = aP + side * w / 2;
    const inDir = norm(sub(m.pos, prev)), outDir = norm(sub(next, m.pos));
    legs.push({ type: 'mark', mark: m, side, beta, wreq: w, inDir, outDir, from: prev, to: next, n: i + 1 });
  });
  legs.push({ type: 'finish', line: C.finish, from: pts[pts.length - 2] });
  C.legs = legs;
  C.nMarks = def.legs.length;

  // препятствия
  const rocks = [], islands = [], shoals = [], buoys = [];
  for (const o of def.obstacles || []) {
    if (o.type === 'rock') rocks.push({ pos: P(o.at), r: o.r, h: o.h || 2.5 });
    else if (o.type === 'island') islands.push({ blobs: o.blobs.map(b => ({ pos: P([b[0], b[1]]), r: b[2], h: b[3] || 15 })), lighthouse: o.lighthouse ? P(o.lighthouse) : null });
    else if (o.type === 'shoal') {
      const blobs = o.blobs.map(b => ({ pos: P([b[0], b[1]]), r: b[2] }));
      shoals.push({ blobs });
      if (o.buoy) {
        // кардинальный буй ставят с той стороны, где чистая вода: сторона света — от центра отмели к бую
        const c = blobs.reduce((s, b) => vec(s.x + b.pos.x / blobs.length, s.y + b.pos.y / blobs.length), vec(0, 0));
        const bp = P(o.buoy), q = Math.round(bearing(c, bp) / 90) % 4;
        buoys.push({ pos: bp, r: 0.9, kind: ['north', 'east', 'south', 'west'][q] });
      }
    } else if (o.type === 'buoy') buoys.push({ pos: P(o.at), r: 0.9, kind: o.kind || 'danger' });
  }
  C.rocks = rocks; C.islands = islands; C.shoals = shoals; C.buoys = buoys;

  // судейские суда стоят носом на ветер
  const cbShape = p => ({ a: GEO.add(p, U, -CB_HALF), b: GEO.add(p, U, CB_HALF), r: CB_R });
  C.boats = [Object.assign({ role: 'start', pos: C.start.cb }, cbShape(C.start.cb))];
  if (!C.finish.same) C.boats.push(Object.assign({ role: 'finish', pos: C.finish.cb }, cbShape(C.finish.cb)));

  // твёрдые препятствия (камни, берег, буи) и знаки (касание — штраф)
  const solids = [];
  rocks.forEach((r, i) => solids.push({ id: 'rock' + i, kind: 'rock', x: r.pos.x, y: r.pos.y, r: r.r }));
  islands.forEach((isl, i) => isl.blobs.forEach((b, j) => solids.push({ id: `shore${i}.${j}`, kind: 'shore', x: b.pos.x, y: b.pos.y, r: b.r })));
  buoys.forEach((b, i) => solids.push({ id: 'buoy' + i, kind: 'buoy', x: b.pos.x, y: b.pos.y, r: b.r }));
  C.solids = solids;
  const touch = [];
  for (const id in marks) touch.push({ id: 'mark:' + id, kind: 'mark', x: marks[id].pos.x, y: marks[id].pos.y, r: MARK_R });
  touch.push({ id: 'pin:start', kind: 'mark', x: C.start.pin.x, y: C.start.pin.y, r: PIN_R });
  if (!C.finish.same) touch.push({ id: 'pin:finish', kind: 'mark', x: C.finish.pin.x, y: C.finish.pin.y, r: PIN_R });
  C.boats.forEach(b => touch.push({ id: 'cb:' + b.role, kind: 'mark', cap: true, a: b.a, b: b.b, r: b.r, solid: true }));
  C.touch = touch;
  // где встают лодки после финиша
  C.park = parking(C);

  // маршрут для автопилота
  C.route = {};
  for (const k in def.route || {}) C.route[k] = def.route[k].map(P);
  C.corridor = def.corridor || null;

  // прямоугольник дистанции в осях трассы — для порывов
  const all = [C.start.pin, C.start.cb, C.finish.pin, C.finish.cb].concat(Object.values(marks).map(m => m.pos));
  const cs = all.map(C.toCourse);
  const uMin = Math.min(...cs.map(c => c.u)) - 250, uMax = Math.max(...cs.map(c => c.u)) + 250;
  const vMin = Math.min(...cs.map(c => c.v)) - 250, vMax = Math.max(...cs.map(c => c.v)) + 200;
  const cu = (uMin + uMax) / 2, cv = (vMin + vMax) / 2, cc = P([cu, cv]);
  C.area = { cx: cc.x, cy: cc.y, uMin: uMin - cu, uMax: uMax - cu, vMin: vMin - cv, vMax: vMax - cv };
  // рамка карты: всё, что стоит рисовать
  const pts2 = all.concat(rocks.map(r => r.pos), buoys.map(b => b.pos));
  islands.forEach(isl => isl.blobs.forEach(b => { pts2.push(GEO.add(b.pos, vec(b.r, b.r))); pts2.push(GEO.add(b.pos, vec(-b.r, -b.r))); }));
  shoals.forEach(s => s.blobs.forEach(b => { pts2.push(GEO.add(b.pos, vec(b.r, b.r))); pts2.push(GEO.add(b.pos, vec(-b.r, -b.r))); }));
  C.bounds = {
    minX: Math.min(...pts2.map(p => p.x)), maxX: Math.max(...pts2.map(p => p.x)),
    minY: Math.min(...pts2.map(p => p.y)), maxY: Math.max(...pts2.map(p => p.y))
  };

  // стартовая позиция
  const b0 = def.boat0;
  C.boat0 = { pos: P(b0.at), hdg: ((twd - b0.twa) % 360 + 360) % 360 };

  // длина дистанции и оценка времени по поляре
  let len = 0, est = 0;
  const tws = def.wind.tws, beat = SIM.optimalBeatTWA(tws), run = SIM.optimalRunTWA(tws);
  const vBeat = SIM.polarSpeed(tws, beat) * Math.cos(beat * SIM.D2R), vRun = -SIM.polarSpeed(tws, run) * Math.cos(run * SIM.D2R);
  for (let i = 0; i + 1 < pts.length; i++) {
    const d = dist(pts[i], pts[i + 1]); len += d;
    const twa = Math.abs(wrap180(twd - bearing(pts[i], pts[i + 1])));
    const v = twa < beat ? vBeat / Math.max(0.3, Math.cos(twa * SIM.D2R)) : twa > run ? vRun / Math.max(0.3, -Math.cos(twa * SIM.D2R)) : SIM.polarSpeed(tws, twa);
    est += d / (Math.max(v, 0.5) * GEO.KN);
  }
  C.length = len; C.estimate = est * 1.08;
  return C;
}

G.KCOURSES = { COURSES, buildCourse, byId: id => COURSES.find(c => c.id === id) };
})(typeof window !== 'undefined' ? window : globalThis);
