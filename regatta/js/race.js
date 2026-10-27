/* ============================================================
   Колдунчик · Регата — гонка (без DOM, работает и в Node)
   Лодка — та же модель SIM, что в тренажёре: ветер в её точке берётся
   с дистанции, скорость зависит от настройки парусов. Здесь — положение
   на карте, руль с плавной перекладкой, экипаж, столкновения и правила:
   старт с отсчётом и фальстартом, огибание знаков нужным бортом,
   штрафной оборот за касание знака, остановка на камнях и мели, финиш.
   Соперники идут по поляре с долей мастерства и подчиняются упрощённым
   правилам расхождения: лодка на штрафном обороте уступает всем; у знака
   ближняя к нему лодка получает место; лодка в повороте оверштаг или
   фордевинд уступает тем, кто не поворачивает; левый галс уступает правому,
   на одном галсе наветренная лодка уступает подветренной, догоняющая —
   идущей впереди. Столкновение — штраф в два оборота той лодке, которая должна
   была уступить. Финишировавшие лодки в гонке уже не участвуют, но сквозь
   них не пройти.
   События гонки складываются в race.events; их разбирает интерфейс.
   ============================================================ */
(function (G) {
'use strict';
const SIM = G.SIM, GEO = G.GEO, KWIND = G.KWIND, KCOURSES = G.KCOURSES;
const { clamp, wrap180, sgn, D2R } = SIM;
const { KN, vec, dist, angOf, bearing, dirOf, sub, dot, closestOnSeg, segSeg, sideOf, alongOf } = GEO;

// корпус в плане: отрезок от кормы до носа с радиусом полуширины, киль чуть впереди середины
const HULL = { bow: 6.4, stern: -6.3, r: 1.9, keel: 0.4 };
// руль: скорость перекладки и возврата (доля полной за секунду), множитель поворота, сопротивление
const HELM = { rate: 2.8, back: 3.6, gain: 1.25, drag: 0.04 };
const STUCK = 2.5;           // с без хода после удара о камень или мель
const TURN_RATE = { tack: 9, gybe: 8, penalty: 8 }; // °/с поворота в манёвре на полном ходу
const CARRY = 0.5;           // у линии ветра лодка теряет ход вдвое медленнее: идёт по инерции
const PEN_LATE = 120;        // с за каждый невыполненный штрафной оборот на финише
const SIGNALS = [60, 30, 10, 5, 4, 3, 2, 1];
const Q_ALL = ['jibSheet', 'car', 'open', 'mainsheet', 'travLee', 'vang', 'outhaul', 'luff', 'backstay'];
const Q_PLAYER = { auto: [], quick: ['jibSheet', 'mainsheet', 'travLee'], deck: Q_ALL };
const MODES = ['auto', 'quick', 'deck'];
const PEN_HIT = 2;           // оборотов штрафа за столкновение по своей вине
const HIT_GAP = 8;           // с: касание той же пары лодок за это время — то же столкновение
const ZONE = 38;             // м: зона у знака — три корпуса; ближней к знаку лодке там дают место
const TOUCH_GAP = 5;         // с: то же для касания знака
const TURN_CALM = 2.5;       // с прямого хода (меньше 1.5°/с) — штрафной оборот начинается заново
const LANES = [-0.3, 0.26, -0.15, 0.13, 0.36];   // полосы старта соперников, доли длины линии от середины
// соперники: имя, цвет корпуса, доля поляры, лавируют ли по заходам
const RIVALS = [
  { name: { ru: 'Альбатрос', en: 'Albatross' }, color: 0xd2343a, skill: 0.975, tactics: true },
  { name: { ru: 'Буревестник', en: 'Petrel' }, color: 0x2f6fd6, skill: 0.96, tactics: true },
  { name: { ru: 'Чайка', en: 'Seagull' }, color: 0x1b9a55, skill: 0.95, tactics: false },
  { name: { ru: 'Баклан', en: 'Cormorant' }, color: 0xe0a21a, skill: 0.94, tactics: true },
  { name: { ru: 'Крачка', en: 'Tern' }, color: 0x8a5cd6, skill: 0.93, tactics: false }
];

function setWind(S, w) {
  const W = S.wind;
  W.baseTws = W.tws = w.tws; W.baseTwd = W.twd = w.twd;
  W.gusts = false; W.ramps.length = 0;
}
function emit(race, type, b, data) {
  race.events.push(Object.assign({ type, boat: b ? b.id : null, player: !!(b && b.player), t: race.t }, data || {}));
  if (race.events.length > 200) race.events.shift();
}

function createRace(courseDef, opts) {
  opts = opts || {};
  const C = KCOURSES.buildCourse(courseDef);
  const wind = KWIND.createWind(courseDef.wind, C.area, { before: C.countdown + 900, until: 7200 });
  const race = { C, wind, t: -C.countdown, events: [], boats: [], puffs: [], pairs: new Map(), riskT: 0 };
  race.puffs = wind.puffsAt(race.t);
  addBoat(race, { id: 'you', player: true, mode: opts.mode, pos: C.boat0.pos, hdg: C.boat0.hdg });
  // у каждого соперника своя полоса старта, середина — игроку. К началу отсчёта соперник
  // ниже линии и правее своей полосы и подходит к ней правым галсом, как все: курсы не пересекаются
  const n = clamp(opts.rivals || 0, 0, RIVALS.length), L = C.start;
  for (let i = 0; i < n; i++) {
    const R = RIVALS[i], lane = LANES[i] * L.len;
    const pos = GEO.add(GEO.add(L.mid, L.along, lane + 40), L.n, -48);
    const hdg = bearing(pos, GEO.add(GEO.add(L.mid, L.along, lane), L.n, -18));
    addBoat(race, { id: 'rival' + i, rival: R, pos, hdg, lane });
  }
  return race;
}

// Соперник — без модели парусов: скорость по поляре, руль и манёвры — как у SIM.
function rivalState(w, hdg) {
  const twa = wrap180(w.twd - hdg);
  return {
    t: 0, mode: 'rival', events: [], D: null, boomSide: -sgn(twa), rig: { main: 0.3, furl: 0 }, quick: {},
    wind: { tws: w.tws, twd: w.twd, baseTws: w.tws, baseTwd: w.twd, gusts: false, ramps: [] },
    boat: { hdg, bsp: SIM.polarSpeed(w.tws, Math.abs(twa)) * 0.8, heel: 0, dist: 0 },
    helm: { cmd: 0, auto: null, lash: false }
  };
}
function addBoat(race, o) {
  const w = race.wind.sample(o.pos.x, o.pos.y, race.t, race.puffs);
  if (o.rival) {
    const S = rivalState(w, o.hdg);
    const b = baseBoat(o, S, 'rival');
    Object.assign(b, { name: o.rival.name, color: o.rival.color, skill: o.rival.skill, tactics: o.rival.tactics, lane: o.lane || 0 });
    rivalPhysics(b, 0);
    race.boats.push(b);
    return b;
  }
  const S = SIM.createState(), B = S.boat;
  setWind(S, w);
  B.hdg = o.hdg; B.heel = 0;
  const twa = wrap180(w.twd - o.hdg);
  B.bsp = SIM.polarSpeed(w.tws, Math.abs(twa)) * 0.8;
  S.boomSide = -sgn(twa); S.boomAngle = 0;
  SIM.applySolution(S, SIM.solveTrim(S));
  for (let i = 0; i < 80; i++) SIM.step(S, 0.05);
  S.events.length = 0;
  const mode = MODES.includes(o.mode) ? o.mode : 'auto';
  if (mode === 'deck') SIM.setMode(S, 'deck');
  const b = baseBoat(o, S, mode);
  race.boats.push(b);
  return b;
}
function baseBoat(o, S, mode) {
  return {
    id: o.id, player: !!o.player, rival: !o.player, mode, S, x: o.pos.x, y: o.pos.y,
    helm: 0, rudder: 0, fine: false, maneuver: null, crewT: 0, trim: null, throttle: 1,
    leg: 0, started: false, ocs: false, startT: null, finishT: null, finN: 0, parked: false, sPrev: null, fPrev: null,
    rnd: null, legT: [], pen: { due: 0, acc: 0, calm: 0, done: 0 }, contacts: new Set(), touchT: {}, stuck: 0,
    trail: [{ x: o.pos.x, y: o.pos.y }], trailT: 0,
    st: { dist: 0, tacks: 0, gybes: 0, crashes: 0, touches: 0, aground: 0, ocs: 0, trimSum: 0, trimN: 0, wrong: 0, hits: 0 }
  };
}

/* ---------- шаг гонки ---------- */
function step(race, dt) {
  let left = dt;
  while (left > 1e-9) { const h = Math.min(0.05, left); left -= h; tick(race, h); }
}
function tick(race, dt) {
  const t0 = race.t, t1 = t0 + dt;
  race.t = t1;
  // отсчёт стартует ровно с −countdown: первый сигнал срабатывает на первом шаге
  for (const s of SIGNALS) if (t0 <= -s && t1 > -s) emit(race, 'signal', null, { left: s });
  race.puffs = race.wind.puffsAt(t1);
  if (t0 < 0 && t1 >= 0) {
    emit(race, 'gun', null);
    for (const b of race.boats) {
      if (sideOf(race.C.start, bowOf(b)) > 0) { b.ocs = true; b.st.ocs++; emit(race, 'ocs', b); }
    }
  }
  for (const b of race.boats) boatTick(race, b, dt);
  if (race.boats.length > 1) { fleetContacts(race); risk(race, dt); }
}

const bowOf = b => { const h = b.S.boat.hdg * D2R; return vec(b.x + HULL.bow * Math.sin(h), b.y + HULL.bow * Math.cos(h)); };
const sternOf = b => { const h = b.S.boat.hdg * D2R; return vec(b.x + HULL.stern * Math.sin(h), b.y + HULL.stern * Math.cos(h)); };

function boatTick(race, b, dt) {
  const S = b.S, B = S.boat;
  setWind(S, race.wind.sample(b.x, b.y, race.t, race.puffs));
  steer(b, dt);
  const hdg0 = B.hdg, bsp0 = B.bsp;
  if (b.rival) rivalPhysics(b, dt);
  else {
    crew(b, dt);
    SIM.step(S, dt);
    // поворот оверштаг проходят по инерции, а не встают как вкопанные
    if (S.D && S.D.twaAbs < 40 && B.bsp < bsp0 && bsp0 > 0) B.bsp = bsp0 + (B.bsp - bsp0) * CARRY;
    simEvents(race, b);
  }
  if (!S.helm.auto) b.maneuver = null;
  // переложенный руль тормозит, а после удара лодка какое-то время стоит
  if (b.rudder) B.bsp -= B.bsp * HELM.drag * b.rudder * b.rudder * dt;
  if (b.stuck > 0) { b.stuck -= dt; if (B.bsp > 0) B.bsp = 0; }
  const v = B.bsp * KN, h = B.hdg * D2R;
  b.x += v * Math.sin(h) * dt; b.y += v * Math.cos(h) * dt;
  collide(race, b);
  rules(race, b, hdg0, dt);
  if (b.started && b.finishT == null) {
    b.st.dist += Math.abs(v) * dt;
    if (S.D) { b.st.trimSum += S.D.score * dt; b.st.trimN += dt; }
  }
  b.trailT += dt;
  if (b.trailT >= 2) { b.trailT = 0; b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 3000) b.trail.shift(); }
}

// Соперник: поворот как в SIM (руль и манёвры), скорость — поляра с долей мастерства и инерцией.
// Перед стартом автопилот гасит ход, как потравленными шкотами (throttle < 1). После финиша
// лодка идёт вполсилы к своему месту за линией (его тоже выбирает автопилот) и там встаёт.
function rivalPhysics(b, dt) {
  const S = b.S, B = S.boat, W = S.wind, H = S.helm;
  const eff = clamp(Math.abs(B.bsp) / 3, 0.45, 1);
  if (H.auto) {
    const d = Math.min(H.auto.left, H.auto.rate * Math.max(eff, 0.5) * dt);
    B.hdg = ((B.hdg + H.auto.dir * d) % 360 + 360) % 360; H.auto.left -= d;
    if (H.auto.left <= 1e-6) H.auto = null;
  } else if (H.cmd) B.hdg = ((B.hdg + H.cmd * 6 * eff * dt) % 360 + 360) % 360;
  const twa = wrap180(W.twd - B.hdg), a = Math.abs(twa), polar = SIM.polarSpeed(W.tws, a);
  const target = b.parked || a < 32 ? 0 : polar * b.skill * (b.finishT != null ? 0.7 : b.throttle);
  const tau = target > B.bsp ? 4 : b.throttle < 1 ? 3 : a < 40 ? 12 : 6;
  B.bsp += (target - B.bsp) * Math.min(1, dt / tau);
  const tack = twa >= 0 ? 1 : -1;
  if (S.D && tack !== S.D.tack) { if (a < 100) b.st.tacks++; else b.st.gybes++; }
  S.boomSide = -tack;
  S.D = { t: S.t += dt, tws: W.tws, twd: W.twd, hdg: B.hdg, twa, twaAbs: a, tack, bsp: B.bsp, polar, score: b.skill, heel: 0 };
}

/* ---------- руль ---------- */
function steer(b, dt) {
  const S = b.S, want = clamp(b.helm, -1, 1) * (b.fine ? 0.35 : 1), r = b.rudder;
  const toward = Math.abs(want) > Math.abs(r) && (want === 0 || sgn(want) === sgn(r) || r === 0);
  const rate = toward ? HELM.rate : HELM.back;
  b.rudder = r + clamp(want - r, -rate * dt, rate * dt);
  if (Math.abs(b.rudder) < 1e-4) b.rudder = 0;
  // руль в руках — автоматический манёвр прекращается
  if (Math.abs(want) > 0.05) abort(b);
  S.helm.cmd = S.helm.auto ? 0 : b.rudder * HELM.gain;
  S.helm.lash = false;
}
/* ---------- лодки между собой ---------- */
// Лодка крутит штрафной оборот: кнопкой или сама, повернув уже больше чем на 150°.
const spinning = b => b.finishT == null && b.pen.due > 0 && (b.maneuver === 'penalty' || Math.abs(b.pen.acc) > 150);
// Лодка в повороте оверштаг или фордевинд: курс меняется сам, и до конца поворота она не отвернёт.
const turning = b => !!b.S.helm.auto && (b.maneuver === 'tack' || b.maneuver === 'gybe');
// Кто должен уступить: лодка на штрафном обороте — всем; у знака, который огибают обе, — та,
// что дальше от него (кроме лодок на разных галсах в лавировку); лодка в повороте — той, что
// не поворачивает; левый галс — правому; на одном галсе догоняющая — идущей впереди, при
// перекрытии — наветренная подветренной. Наветренная — та, что с наветренного борта другой:
// в бейдевинд она бывает чуть позади, на фордевинде — впереди.
function rightOfWay(race, a, b) {
  const sa = spinning(a), sb = spinning(b);
  if (sa !== sb) return { boat: sa ? a : b, why: 'penalty' };
  const ta = a.S.D ? a.S.D.tack : 1, tb = b.S.D ? b.S.D.tack : 1;
  const leg = race.C.legs[a.leg];
  if (a.started && b.started && a.leg === b.leg && leg.type === 'mark' && a.finishT == null && b.finishT == null) {
    const m = leg.mark.pos, da = dist(a, m), db = dist(b, m);
    const beat = Math.abs(a.S.D.twa) < 70 && Math.abs(b.S.D.twa) < 70;
    if (da < ZONE && db < ZONE && !(beat && ta !== tb)) return { boat: da > db ? a : b, why: 'room' };
  }
  const ma = turning(a), mb = turning(b);
  if (ma !== mb) return { boat: ma ? a : b, why: 'turning' };
  if (ta !== tb) return { boat: ta < 0 ? a : b, why: 'port' };
  const astern = (p, q) => dot(sub(bowOf(p), sternOf(q)), dirOf(q.S.boat.hdg)) < 0;
  if (astern(a, b)) return { boat: a, why: 'astern' };
  if (astern(b, a)) return { boat: b, why: 'astern' };
  // на правом галсе ветер справа: наветренный борт — правый
  const side = dot(sub(a, b), dirOf(b.S.boat.hdg + 90)) * ta;
  return { boat: side > 0 ? a : b, why: 'windward' };
}
const hullOf = b => ({ a: sternOf(b), b: bowOf(b) });
// автоматический манёвр прерван: руль снова у рулевого
function abort(b) {
  if (b.S.helm.auto) { b.S.helm.auto = null; b.maneuver = null; }
}
function fleetContacts(race) {
  const list = race.boats.filter(b => b.finishT == null);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const p = list[i], q = list[j], hp = hullOf(p), hq = hullOf(q);
    if (Math.abs(p.x - q.x) > 20 || Math.abs(p.y - q.y) > 20) continue;
    const r = segSeg(hp.a, hp.b, hq.a, hq.b), pen = 2 * HULL.r - r.d;
    if (pen <= 0) continue;
    const key = p.id + '|' + q.id, last = race.pairs.get(key);
    race.pairs.set(key, race.t);
    if (last == null || race.t - last > HIT_GAP) {
      const rw = rightOfWay(race, p, q), guilty = rw.boat, other = guilty === p ? q : p;
      guilty.pen.due += PEN_HIT; guilty.pen.acc = 0; guilty.st.hits++;
      emit(race, 'collision', guilty, { other: other.id, otherPlayer: other.player, why: rw.why });
      for (const b of [p, q]) { if (b.S.boat.bsp > 1) b.S.boat.bsp *= 0.55; abort(b); }
    }
    // расталкиваем поровну
    let dx = r.c1.x - r.c2.x, dy = r.c1.y - r.c2.y, d = Math.hypot(dx, dy);
    if (d < 1e-6) { dx = p.x - q.x; dy = p.y - q.y; d = Math.hypot(dx, dy) || 1; }
    const k = (pen + 0.4) / 2 / d;
    p.x += dx * k; p.y += dy * k; q.x -= dx * k; q.y -= dy * k;
  }
}
// Опасное сближение: где окажутся лодки через tc секунд при нынешних курсах
function closing(a, b, horizon) {
  const va = dirOf(a.S.boat.hdg), vb = dirOf(b.S.boat.hdg), sa = a.S.boat.bsp * KN, sb = b.S.boat.bsp * KN;
  const rx = b.x - a.x, ry = b.y - a.y, vx = vb.x * sb - va.x * sa, vy = vb.y * sb - va.y * sa, v2 = vx * vx + vy * vy;
  const tc = v2 > 1e-6 ? clamp(-(rx * vx + ry * vy) / v2, 0, horizon) : 0;
  return { tc, d: Math.hypot(rx + vx * tc, ry + vy * tc), now: Math.hypot(rx, ry) };
}
// игроку — предупреждение, если он должен уступить и лодки сходятся
function risk(race, dt) {
  race.riskT -= dt;
  if (race.riskT > 0) return;
  race.riskT = 0.5;
  const me = race.boats.find(b => b.player);
  if (!me || me.finishT != null) return;
  for (const o of race.boats) {
    if (o === me || o.finishT != null) continue;
    if (Math.abs(o.x - me.x) > 160 || Math.abs(o.y - me.y) > 160) continue;
    const c = closing(me, o, 20);
    if (c.d < 14 && c.tc > 1) {
      const rw = rightOfWay(race, me, o);
      if (rw.boat === me) { emit(race, 'giveWay', me, { other: o.id, why: rw.why }); break; }
    }
  }
}
// места: финишировавшие по времени со штрафом, остальные — по пройденным знакам и расстоянию до цели
function standings(race) {
  const rank = b => {
    if (b.finishT != null) return [0, b.finishT + b.pen.due * PEN_LATE];
    const tg = target(race, b);
    return [1, -(b.started ? b.leg : 0), tg.dist || 0];
  };
  return race.boats.slice().sort((p, q) => { const a = rank(p), c = rank(q); for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (c[i] || 0)) return (a[i] || 0) - (c[i] || 0); return 0; });
}

// Манёвр целиком: поворот оверштаг, фордевинд или штрафной оборот. Оборот по умолчанию начинается
// с приведения (сначала оверштаг), dir = −1 — с уваливания; уже начатый оборот не сбрасывается.
function maneuver(race, b, kind, dir) {
  const S = b.S, D = S.D;
  if (!D || b.stuck > 0) return false;
  if (kind === 'penalty') {
    if (b.pen.due <= 0 || b.finishT != null) return false;
    if (b.maneuver === 'penalty' && S.helm.auto) return true;
    S.helm.auto = { dir: (dir || 1) * (sgn(D.twa) || 1), left: 370, rate: TURN_RATE.penalty };
    b.pen.acc = 0; b.pen.calm = 0;
  } else {
    if (!SIM.startManeuver(S, kind)) return false;
    S.helm.auto.rate = TURN_RATE[kind];
  }
  b.maneuver = kind; b.helm = 0;
  return true;
}
// Где пройдёт лодка, если начнёт манёвр сейчас (kind и dir — как в maneuver; без kind — остаток
// начатого манёвра), и ещё after секунд после него прямо: курс меняется, как в rivalPhysics,
// ход — по поляре с инерцией. Точки через 0,5 с: время от начала, положение и курс.
function turnPath(b, kind, dir, after) {
  const S = b.S, D = S.D, W = S.wind, A = S.helm.auto, s = sgn(D.twa) || 1;
  let left, turn, rate = TURN_RATE[kind];
  if (!kind) { if (!A) return []; left = A.left; turn = A.dir; rate = A.rate; }
  else if (kind === 'penalty') { left = 370; turn = (dir || 1) * s; }
  else if (kind === 'tack') { left = D.twaAbs + Math.max(SIM.optimalBeatTWA(W.tws), 40); turn = s; }
  else { left = 360 - D.twaAbs - Math.max(SIM.optimalRunTWA(W.tws), 150); turn = -s; }
  const skill = b.skill || 1, dt = 0.25, out = [];
  let x = b.x, y = b.y, hdg = S.boat.hdg, bsp = S.boat.bsp, t = 0, tail = after || 0;
  while (left > 1e-6 || tail > 1e-6) {
    if (left > 1e-6) {
      const d = Math.min(left, rate * Math.max(clamp(Math.abs(bsp) / 3, 0.45, 1), 0.5) * dt);
      hdg += turn * d; left -= d;
    } else tail -= dt;
    const a = Math.abs(wrap180(W.twd - hdg)), target = a < 32 ? 0 : SIM.polarSpeed(W.tws, a) * skill;
    bsp += (target - bsp) * Math.min(1, dt / (target > bsp ? 4 : a < 40 ? 12 : 6));
    x += bsp * KN * Math.sin(hdg * D2R) * dt; y += bsp * KN * Math.cos(hdg * D2R) * dt;
    t += dt;
    if (Math.round(t / dt) % 2 === 0 || (left <= 1e-6 && tail <= 1e-6)) out.push({ t, x, y, h: hdg });
  }
  return out;
}

/* ---------- экипаж: в «Авто» настраивает всё, в «Быстрых» — всё, кроме шкотов и погона ---------- */
function crew(b, dt) {
  if (b.mode === 'deck') return;
  const S = b.S, Q = S.quick;
  b.crewT -= dt;
  if (b.crewT <= 0 || !b.trim) { b.crewT = 0.25; b.trim = SIM.solveTrim(S); }
  const T = b.trim, mine = Q_PLAYER[b.mode], k = 1 - Math.exp(-dt / (b.mode === 'auto' ? 1.1 : 1.5));
  for (const key of Q_ALL) if (!mine.includes(key)) Q[key] += (T[key] - Q[key]) * k;
  Q.reef = T.reef; Q.goose = T.goose; Q.jibLock = 0;
  // перед поворотом фордевинд и «на рауле» экипаж выбирает грот к центру: гик перейдёт без удара
  const D = S.D;
  if (b.mode === 'auto' && D) {
    const byLee = S.boomSide !== -sgn(D.awa) && D.awaAbs > 90 ? 180 - D.awaAbs : 0;
    if (b.maneuver === 'gybe' || b.maneuver === 'penalty' || byLee > 2) Q.mainsheet = Math.min(Q.mainsheet, 0.08);
  }
}

function simEvents(race, b) {
  const E = b.S.events;
  for (const e of E) {
    if (e.type === 'tack') b.st.tacks++;
    else if (e.type === 'gybe') b.st.gybes++;
    else if (e.type === 'crash') { b.st.gybes++; b.st.crashes++; emit(race, 'crash', b); }
    else if (e.type === 'broach') emit(race, 'broach', b);
    else if (e.type === 'irons') emit(race, 'irons', b);
  }
  E.length = 0;
}

/* ---------- столкновения ---------- */
function pushOut(b, from, to, pen) {
  let dx = to.x - from.x, dy = to.y - from.y, d = Math.hypot(dx, dy);
  if (d < 1e-6) { const h = b.S.boat.hdg * D2R; dx = -Math.sin(h); dy = -Math.cos(h); d = 1; }
  b.x += dx / d * (pen + 0.05); b.y += dy / d * (pen + 0.05);
}
function stop(b) {
  const B = b.S.boat;
  B.bsp = B.bsp > 1.5 ? -0.4 : Math.min(B.bsp, 0);
  b.stuck = STUCK;
  abort(b);
}
function collide(race, b) {
  const C = race.C, h = b.S.boat.hdg * D2R, s = Math.sin(h), c = Math.cos(h);
  const ha = vec(b.x + HULL.stern * s, b.y + HULL.stern * c), hb = vec(b.x + HULL.bow * s, b.y + HULL.bow * c);
  const now = new Set();
  for (const o of C.solids) {
    const q = closestOnSeg(o, ha, hb), pen = HULL.r + o.r - q.d;
    if (pen <= 0) continue;
    const id = o.kind === 'shore' ? o.id.split('.')[0] : o.id;
    pushOut(b, o, q, pen); stop(b);
    if (!now.has(id) && !b.contacts.has(id)) { b.st.aground++; emit(race, 'aground', b, { what: o.kind }); }
    now.add(id);
  }
  for (const o of C.touch) {
    let d, pa, pb;
    if (o.cap) { const r = segSeg(ha, hb, o.a, o.b); d = r.d; pa = r.c1; pb = r.c2; }
    else { const q = closestOnSeg(o, ha, hb); d = q.d; pa = q; pb = o; }
    const pen = HULL.r + o.r - d;
    if (pen <= -0.05) continue;
    now.add(o.id);
    // штрафной оборот о знак не докрутить: прерываем, руль снова у рулевого
    if (b.maneuver === 'penalty') abort(b);
    // одно касание — один штраф, даже если корпус проскальзывает вдоль знака
    const last = b.touchT[o.id];
    b.touchT[o.id] = race.t;
    if ((last == null || race.t - last > TOUCH_GAP) && b.finishT == null) { b.pen.due++; b.pen.acc = 0; b.st.touches++; emit(race, 'touch', b, { what: o.id }); }
    if (pen > 0) { pushOut(b, pb, pa, pen); if (o.solid && b.S.boat.bsp > 1) b.S.boat.bsp *= 0.5; }
  }
  // финишировавшие лодки в гонке уже не участвуют, но сквозь них не пройти: штрафа нет, только теряем ход
  for (const o of race.boats) {
    if (o === b || o.finishT == null || Math.abs(o.x - b.x) > 20 || Math.abs(o.y - b.y) > 20) continue;
    const ho = hullOf(o), r = segSeg(ha, hb, ho.a, ho.b), pen = 2 * HULL.r - r.d;
    if (pen > 0) { pushOut(b, r.c2, r.c1, pen); if (b.S.boat.bsp > 1) b.S.boat.bsp *= 0.5; }
  }
  const k = vec(b.x + HULL.keel * s, b.y + HULL.keel * c);
  C.shoals.forEach((sh, i) => {
    for (const bl of sh.blobs) {
      const d = dist(k, bl.pos);
      if (d >= bl.r) continue;
      pushOut(b, bl.pos, k, bl.r - d + 0.3); stop(b);
      const id = 'shoal' + i;
      if (!now.has(id) && !b.contacts.has(id)) { b.st.aground++; emit(race, 'aground', b, { what: 'shoal' }); }
      now.add(id);
    }
  });
  b.contacts = now;
}

/* ---------- правила ---------- */
function rules(race, b, hdg0, dt) {
  const C = race.C, P = b.pen;
  // штрафной оборот: непрерывный поворот на 360° в одну сторону, когда лодка уже отошла от знака.
  // Прямой ход дольше TURN_CALM или поворот в другую сторону начинают счёт заново.
  // После финиша обороты не считаются: невыполненные уже стали добавкой ко времени.
  if (P.due > 0 && b.finishT == null) {
    const nearMark = [...b.contacts].some(id => /^(mark|pin|cb):/.test(id));
    const dh = wrap180(b.S.boat.hdg - hdg0);
    if (nearMark) { P.acc = 0; P.calm = 0; }
    else {
      P.calm = Math.abs(dh) < 1.5 * dt ? P.calm + dt : 0;
      if (P.calm > TURN_CALM || (P.acc && dh && Math.sign(dh) !== Math.sign(P.acc) && Math.abs(P.acc) > 10)) P.acc = 0;
      P.acc += dh;
      if (Math.abs(P.acc) >= 360) {
        P.due--; P.done++; P.acc = 0;
        if (b.maneuver === 'penalty') abort(b);
        emit(race, 'penaltyDone', b, { left: P.due });
      }
    }
  }
  if (b.finishT != null) return;
  if (!b.started) {
    const bow = bowOf(b), s = sideOf(C.start, bow);
    if (race.t >= 0) {
      if (b.ocs) {
        if (s < 0 && sideOf(C.start, sternOf(b)) < 0) { b.ocs = false; emit(race, 'ocsClear', b); }
      } else if (b.sPrev != null && b.sPrev <= 0 && s > 0) {
        const u = alongOf(C.start, bow);
        if (u >= 0 && u <= 1) {
          b.started = true; b.startT = race.t; b.leg = 1; b.rnd = null;
          emit(race, 'started', b, { late: race.t });
        } else emit(race, 'missLine', b);
      }
    }
    b.sPrev = s;
    return;
  }
  const leg = C.legs[b.leg];
  if (leg.type === 'mark') rounding(race, b, leg);
  else finishing(race, b, leg);
}

// Знак обогнут, когда лодка пересекла луч биссектрисы снаружи поворота в нужную сторону.
// Пересечения в обратную сторону вычитаются: так работает правило «натянутой нитки».
function rounding(race, b, leg) {
  const m = leg.mark.pos, rel = wrap180(angOf(b, m) - leg.beta);
  if (!b.rnd) b.rnd = { cnt: 0, prev: null, warned: false };
  const R = b.rnd, p = R.prev;
  if (p != null && Math.abs(rel) < 90 && Math.abs(p) < 90 && (p < 0) !== (rel < 0)) {
    R.cnt += (rel > p ? 1 : -1) * leg.side;
    if (R.cnt >= 1) {
      b.legT.push(race.t);
      emit(race, 'mark', b, { n: leg.n, of: race.C.nMarks, id: leg.mark.id });
      b.leg++; b.rnd = null; b.fPrev = null;
      return;
    }
    if (R.cnt < 0 && !R.warned && dist(b, m) < 250) { R.warned = true; b.st.wrong++; emit(race, 'wrongSide', b, { n: leg.n, side: leg.side }); }
    if (R.cnt >= 0) R.warned = false;
  }
  R.prev = rel;
}
function finishing(race, b, leg) {
  const L = leg.line, bow = bowOf(b), s = sideOf(L, bow);
  if (b.fPrev != null && b.fPrev <= 0 && s > 0) {
    const u = alongOf(L, bow);
    if (u >= 0 && u <= 1) {
      b.finishT = race.t; b.legT.push(race.t);
      b.finN = race.boats.filter(o => o.finishT != null).length;
      if (b.maneuver === 'penalty') abort(b);
      emit(race, 'finish', b, { time: race.t, penalty: b.pen.due * PEN_LATE });
      return;
    }
    emit(race, 'missLine', b);
  }
  b.fPrev = s;
}

/* ---------- что дальше: для приборов, карты и автопилота ---------- */
function target(race, b) {
  const C = race.C;
  if (b.finishT != null) return { kind: 'done' };
  if (!b.started) {
    const q = closestOnSeg(b, C.start.a, C.start.b);
    return { kind: b.ocs ? 'ocs' : 'start', line: C.start, pos: vec(q.x, q.y), dist: q.d, brg: bearing(b, q) };
  }
  const leg = C.legs[b.leg];
  if (leg.type === 'mark') return { kind: 'mark', leg, mark: leg.mark, pos: leg.mark.pos, side: leg.side, n: leg.n, of: C.nMarks, dist: dist(b, leg.mark.pos), brg: bearing(b, leg.mark.pos) };
  const q = closestOnSeg(b, leg.line.a, leg.line.b);
  return { kind: 'finish', line: leg.line, pos: vec(q.x, q.y), dist: q.d, brg: bearing(b, q) };
}
function result(race, b) {
  const pen = b.pen.due * PEN_LATE;
  return {
    course: race.C.id, mode: b.mode, time: b.finishT, penalty: pen, total: b.finishT + pen,
    startDelay: b.startT, legs: b.legT.slice(), dist: b.st.dist, avg: b.st.dist / Math.max(1, b.finishT - b.startT) / KN,
    trim: b.st.trimN ? b.st.trimSum / b.st.trimN : 0,
    tacks: b.st.tacks, gybes: b.st.gybes, crashes: b.st.crashes, touches: b.st.touches, turnsDone: b.pen.done, turnsDue: b.pen.due,
    aground: b.st.aground, ocs: b.st.ocs, wrong: b.st.wrong
  };
}
const windAt = (race, x, y) => race.wind.sample(x, y, race.t, race.puffs);

G.KRACE = { createRace, addBoat, step, maneuver, turnPath, abort, target, result, windAt, bowOf, rightOfWay, closing, standings, HULL, PEN_LATE, PEN_HIT, MODES, Q_PLAYER, RIVALS };
})(typeof window !== 'undefined' ? window : globalThis);
