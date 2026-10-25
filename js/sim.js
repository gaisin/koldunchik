/* ============================================================
   Колдунчик — ядро симуляции (без DOM, запускается и в Node)
   Оси лодки: x — нос, y — вверх, z — правый борт.
   Углы ветра: TWA/AWA > 0 — ветер с правого борта (правый галс).
   ============================================================ */
(function (G) {
'use strict';

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const wrap180 = a => (((a + 180) % 360) + 360) % 360 - 180;
const wrap360 = a => ((a % 360) + 360) % 360;
const sgn = x => (x < 0 ? -1 : 1);
const r0 = x => Math.round(x);

/* ---------- Лодка: 13 м, шлюп с бермудским вооружением ---------- */
const BOAT = {
  mainArea: 45, jibArea: 43,
  luff: 15.6, boomLen: 5.1,
  reefH: [0, 0.105, 0.2],      // доля передней шкаторины под 1-й и 2-й риф
  TENS: 0.04,                  // ход фала на натяжение шкаторины
  jibMin: 9,                   // угол проводки шкота стакселя
  travRange: 20,               // угол гика у края погона при выбранном шкоте
  boomMax: 76, boomRec: 72,    // гик на вантах / рекомендованный предел
  mass: 9400, GM: 1.5, ceMain: 10.0, ceJib: 8.6,
  holes: 15                    // отверстия погона каретки стакселя
};

/* ---------- Поляра круизной яхты 43 фута (узлы) ---------- */
const POLAR = {
  tws: [4, 6, 8, 10, 12, 14, 16, 20, 25, 30],
  twa: [0, 30, 36, 42, 52, 60, 75, 90, 110, 120, 135, 150, 165, 180],
  v: [
    [0, 0, 1.6, 2.6, 3.3, 3.6, 4.0, 4.2, 4.1, 3.9, 3.4, 2.8, 2.4, 2.2],
    [0, 0, 2.6, 3.9, 4.7, 5.1, 5.5, 5.7, 5.7, 5.5, 4.9, 4.1, 3.5, 3.2],
    [0, 0, 3.3, 4.8, 5.6, 6.0, 6.4, 6.6, 6.7, 6.5, 5.9, 5.1, 4.4, 4.1],
    [0, 0, 3.8, 5.4, 6.2, 6.6, 7.0, 7.2, 7.3, 7.2, 6.7, 5.9, 5.2, 4.9],
    [0, 0, 4.1, 5.8, 6.6, 7.0, 7.4, 7.6, 7.8, 7.7, 7.3, 6.6, 5.9, 5.6],
    [0, 0, 4.3, 6.0, 6.8, 7.2, 7.6, 7.9, 8.1, 8.1, 7.8, 7.1, 6.5, 6.2],
    [0, 0, 4.4, 6.1, 6.9, 7.3, 7.7, 8.1, 8.4, 8.5, 8.2, 7.6, 7.0, 6.7],
    [0, 0, 4.4, 6.2, 7.0, 7.4, 7.9, 8.3, 8.8, 9.0, 8.9, 8.4, 7.8, 7.4],
    [0, 0, 4.2, 6.0, 6.9, 7.4, 7.9, 8.4, 9.1, 9.5, 9.6, 9.2, 8.6, 8.1],
    [0, 0, 3.8, 5.6, 6.6, 7.2, 7.8, 8.4, 9.3, 9.8, 10.0, 9.7, 9.1, 8.6]
  ]
};
function seg(xs, x) {
  if (x <= xs[0]) return [0, 0];
  const n = xs.length;
  if (x >= xs[n - 1]) return [n - 2, 1];
  let i = 0; while (x > xs[i + 1]) i++;
  return [i, (x - xs[i]) / (xs[i + 1] - xs[i])];
}
function polarSpeed(tws, twaAbs) {
  if (tws <= 0) return 0;
  const [i, ti] = seg(POLAR.tws, tws), [j, tj] = seg(POLAR.twa, twaAbs), v = POLAR.v;
  const a = lerp(v[i][j], v[i][j + 1], tj), b = lerp(v[i + 1][j], v[i + 1][j + 1], tj);
  let s = lerp(a, b, ti);
  if (tws < 4) s *= tws / 4;
  return s;
}
function optimalBeatTWA(tws) {
  let best = -1, bt = 42;
  for (let a = 34; a <= 60; a += 0.5) { const v = polarSpeed(tws, a) * Math.cos(a * D2R); if (v > best) { best = v; bt = a; } }
  return bt;
}
function optimalRunTWA(tws) {
  let best = -1, bt = 150;
  for (let a = 120; a <= 180; a += 1) { const v = -polarSpeed(tws, a) * Math.cos(a * D2R); if (v > best) { best = v; bt = a; } }
  return bt;
}
function apparent(tws, twa, bsp) {
  const t = twa * D2R, x = tws * Math.cos(t) + bsp, y = tws * Math.sin(t);
  return { aws: Math.hypot(x, y), awa: Math.atan2(y, x) * R2D };
}
function pointOfSail(a) {
  if (a < 30) return 'Левентик';
  if (a < 38) return 'Слишком остро';
  if (a < 55) return 'Крутой бейдевинд';
  if (a < 80) return 'Полный бейдевинд';
  if (a < 100) return 'Галфвинд';
  if (a < 135) return 'Крутой бакштаг';
  if (a < 160) return 'Полный бакштаг';
  return 'Фордевинд';
}

/* ---------- Аэродинамика паруса по сечениям ---------- */
const SECT_H = [0.1, 0.3, 0.5, 0.7, 0.9];
const W_JIB = [0.34, 0.27, 0.2, 0.13, 0.06];
const W_MAIN = [0.3, 0.26, 0.2, 0.15, 0.09];
const ALPHA_P = 17;
function CL(a) {
  if (a < 0) return Math.max(-0.8, a / 12);
  if (a < ALPHA_P) return Math.sin(Math.PI / 2 * a / ALPHA_P);
  if (a < ALPHA_P + 10) return 1 - 0.025 * (a - ALPHA_P);
  if (a <= 90) return 0.75 * Math.cos(clamp((a - ALPHA_P - 10) / (90 - ALPHA_P - 10), 0, 1) * Math.PI / 2);
  return -0.25 * Math.min(1, (a - 90) / 60);
}
function CD(a) {
  const aa = Math.abs(a), l = CL(a);
  let d = 0.07 + 0.05 * l * l;
  const st = smooth(ALPHA_P - 2, ALPHA_P + 22, aa);
  const s = Math.sin(Math.min(aa, 180) * D2R);
  d += 1.15 * st * s * s;
  if (a > -5 && a < 5) d += 0.08 * (1 - Math.abs(a) / 5);
  if (a < 0) d += 0.25 * Math.min(1, -a / 20);
  return d;
}
const gammaOf = awaAbs => 6 * clamp(1 - awaAbs / 150, 0.1, 1);
function alphaAt(fill, deltaFoot, tau, awaS, gamma, h, shift) {
  const aw = awaS + sgn(awaS) * gamma * h;
  const d = deltaFoot + fill * tau * h;
  return -fill * wrap180(aw + d) - (shift || 0);
}
function evalSail(fill, deltaFoot, tau, awaS, gamma, w, shift) {
  let cr = 0, ch = 0, cl = 0; const al = [0, 0, 0, 0, 0];
  for (let k = 0; k < 5; k++) {
    const h = SECT_H[k];
    const aw = awaS + sgn(awaS) * gamma * h;
    const a = -fill * wrap180(aw + deltaFoot + fill * tau * h) - shift;
    al[k] = a;
    const b = Math.abs(aw) * D2R, l = CL(a), dd = CD(a);
    cr += w[k] * (l * Math.sin(b) - dd * Math.cos(b));
    ch += w[k] * (l * Math.cos(b) + dd * Math.sin(b));
    cl += w[k] * l;
  }
  return { cr, ch, cl, al };
}
function flogSail(awaS, w) {
  const b = Math.abs(awaS) * D2R, dd = CD(0);
  return { cr: -dd * Math.cos(b) * 0.8, ch: dd * Math.sin(b) * 0.6, cl: 0, al: [0, 0, 0, 0, 0], flog: true };
}
function bestSail(fill, awaS, gamma, w, shift, dMin, dMax, tauFixed) {
  let best = -9, bd = dMin, bt = 6;
  const taus = tauFixed == null ? [0, 3, 6, 9, 12, 16, 22] : [tauFixed];
  for (const tau of taus) {
    for (let d = dMin; d <= dMax + 1e-9; d += 1.5) {
      const r = evalSail(fill, fill * d, tau, awaS, gamma, w, shift);
      if (r.cr > best) { best = r.cr; bd = d; bt = tau; }
    }
  }
  for (let d = bd - 1.5; d <= bd + 1.5; d += 0.25) {
    if (d < dMin || d > dMax) continue;
    const r = evalSail(fill, fill * d, bt, awaS, gamma, w, shift);
    if (r.cr > best) { best = r.cr; bd = d; }
  }
  return { cr: best, d: bd, tau: bt };
}

/* ---------- Геометрия по настройкам ---------- */
const JIB_G = e => 51 * Math.pow(Math.max(e, 0), 1.1);
function mainHoist(R) {
  const d1 = BOAT.reefH[1] * R.reef1, d2 = BOAT.reefH[2] * R.reef2;
  const sBottom = Math.max(d1, d2);
  const hTaut = 1 - sBottom;
  const H = R.halyard;
  const tension = clamp((H - hTaut) / BOAT.TENS, 0, 1);
  const slack = clamp((hTaut - H) / Math.max(hTaut, 0.1), 0, 1);
  const headH = Math.min(H, hTaut);
  const reefLevel = R.reef2 > 0.98 ? 2 : R.reef1 > 0.98 ? 1 : 0;
  const reefPartial = (R.reef1 > 0.02 && R.reef1 < 0.98) || (R.reef2 > 0.02 && R.reef2 < 0.98);
  return { sBottom, hTaut, tension, slack, headH, reefLevel, reefPartial };
}
function mainGeom(R, awaS, boomSide, prevTheta, hoist) {
  const m = clamp(R.main, 0, 1), carAng = BOAT.travRange * R.trav;
  const dTh = 80 * Math.pow(m, 1.3);
  const sLo = carAng - dTh, sHi = carAng + dTh;
  const lo = Math.max(sLo, -BOAT.boomMax), hi = Math.min(sHi, BOAT.boomMax);
  const awaAbs = Math.abs(awaS), windLee = -sgn(awaS);
  let side = boomSide, event = null;
  if (side !== windLee) {
    if (awaAbs < 90) { side = windLee; event = 'tack'; }
    else {
      const byLee = 180 - awaAbs;
      const canCross = lo <= 3 && hi >= -3 && Math.abs(prevTheta) < 15;
      if (byLee > 15) { side = windLee; event = Math.abs(prevTheta) > 25 ? 'crash' : 'gybe'; }
      else if (byLee > 3 && canCross) { side = windLee; event = 'gybe'; }
    }
  }
  const free = side * (side === windLee ? Math.min(awaAbs, 100) : 100);
  const theta = clamp(free, lo, hi);
  const sheetBind = (free > hi && hi === sHi) || (free < lo && lo === sLo);
  const onShrouds = Math.abs(theta) >= BOAT.boomMax - 0.01;
  const sheetLeech = sheetBind ? Math.pow(clamp(1 - m / 0.3, 0, 1), 0.8) : 0;
  const vangLeech = 0.95 * Math.pow(clamp(R.vang, 0, 1), 0.9);
  const leech = Math.max(sheetLeech, vangLeech);
  const tau = 4 + 26 * (1 - leech) + 10 * hoist.slack;
  return { side, theta, tau, event, sheetBind, onShrouds, sheetLeech, vangLeech, leech, carAng, dTh, free, bound: sheetBind || onShrouds };
}
function jibGeom(R, awaS) {
  const f = R.furl, min = BOAT.jibMin;
  const eP = R.sheetP - 0.8 * f, eS = R.sheetS - 0.8 * f;
  const gP = JIB_G(eP), gS = JIB_G(eS);
  const awaAbs = Math.abs(awaS);
  const free = -sgn(awaS) * Math.min(awaAbs, 100);
  let delta, ctrl = 0, bind = false, infeasible = false;
  if (R.pole) {
    const p = R.pole, e = p > 0 ? eS : eP;
    delta = p * clamp(min + JIB_G(e), min, 88); ctrl = p; bind = true;
  } else {
    const loP = -min - gP, hiP = -min + gP, loS = min - gS, hiS = min + gS;
    const lo = Math.max(loP, loS), hi = Math.min(hiP, hiS);
    if (lo > hi) { infeasible = true; delta = (lo + hi) / 2; ctrl = eP < eS ? -1 : 1; bind = true; }
    else if (free > hi) { delta = hi; bind = true; ctrl = hiP < hiS ? -1 : 1; }
    else if (free < lo) { delta = lo; bind = true; ctrl = loP > loS ? -1 : 1; }
    else delta = free;
  }
  const fill = Math.abs(delta) > 2 ? sgn(delta) : -sgn(awaS);
  const e = ctrl > 0 ? eS : ctrl < 0 ? eP : Math.min(eP, eS);
  const car = ctrl > 0 ? R.carS : ctrl < 0 ? R.carP : (fill > 0 ? R.carS : R.carP);
  const c0 = 0.5 - 0.45 * f;
  let tau = bind ? 4 + 30 * (car - c0) + 14 * clamp(e, 0, 1.3) : 0;
  tau = clamp(tau, -6, 40);
  return { delta, ctrl, bind, fill, e, car, tau, infeasible, eP, eS, c0 };
}
function sheetsFeasible(sP, sS, f) {
  const gP = JIB_G(sP - 0.8 * f), gS = JIB_G(sS - 0.8 * f), m = BOAT.jibMin;
  return Math.max(-m - gP, m - gS) <= Math.min(-m + gP, m + gS) + 1e-9;
}

/* ---------- Цели настройки для условий ---------- */
function computeTargets(tws, twaAbs, awaAbs, aws) {
  const up = clamp((75 - twaAbs) / 30, 0, 1);
  const down = clamp((twaAbs - 120) / 40, 0, 1);
  const ws = clamp((tws - 13) / 9, 0, 1);
  const light = clamp((8 - tws) / 4, 0, 1);
  const effWind = Math.max(aws, 0.85 * tws);
  const reef = effWind >= 27 ? 2 : effWind >= 21 ? 1 : 0;
  const furl = effWind <= 19 ? 0 : effWind <= 26 ? 0.35 * (effWind - 19) / 7 : Math.min(0.6, 0.35 + 0.15 * (effWind - 26) / 6);
  const tauJ = lerp(lerp(7, 9, light) + 6 * ws, 9 + 3 * ws, 1 - up);
  const tauM = lerp(lerp(lerp(6, 10, light) + 8 * ws, 11 + 3 * ws, 1 - up), 12, down);
  const dMup = lerp(lerp(0.145, 0.125, light), 0.10, ws);
  const depthM = lerp(dMup, 0.155 - 0.02 * ws, 1 - up);
  const backstay = lerp(lerp(lerp(0.35, 1.0, ws), 0.25, light), lerp(0.1, 0.45, ws), 1 - up);
  const pos = lerp(lerp(lerp(0.46, 0.45, ws), 0.48, light), 0.50, 1 - up);
  const vangBase = lerp(lerp(0.15, 0.6, ws), 0.3, 1 - up);
  return { up, down, ws, light, effWind, reef, furl, tauJ, tauM, depthM, backstay, pos, vangBase };
}

/* ---------- Снасти, стопора, лебёдки ---------- */
const LINES = {
  halyard: { name: 'Фал грота', short: 'Фал грота', tag: 'Фал', bank: 'P', slot: 0, color: '#2F6FD6', pull: 1, min: 0, max: 1 + BOAT.TENS, rate: 0.1, ease: 0.12, run: 0.9,
    about: 'Поднимает грот и натягивает переднюю шкаторину. Туже — пузо смещается вперёд, у мачты парус площе.' },
  reef1: { name: 'Риф-шкентель 1', short: 'Риф 1', tag: 'Риф 1', bank: 'P', slot: 1, color: '#2E9E5B', pull: 1, min: 0, max: 1, rate: 0.16, ease: 0.2, run: 0.9,
    about: 'Притягивает к гику кренгельсы первого рифа. Идёт, только когда фал потравлен до метки рифа.' },
  reef2: { name: 'Риф-шкентель 2', short: 'Риф 2', tag: 'Риф 2', bank: 'P', slot: 2, color: '#C99A0E', pull: 1, min: 0, max: 1, rate: 0.14, ease: 0.2, run: 0.9,
    about: 'Второй риф: ещё ниже по передней и задней шкаторинам. Фал травят глубже, до второй метки.' },
  vang: { name: 'Оттяжка гика', short: 'Оттяжка гика', tag: 'Оттяжка', bank: 'P', slot: 3, color: '#59606E', pull: 1, min: 0, max: 1, rate: 0.22, ease: 0.3, run: 0.8,
    about: 'Тянет гик вниз и держит заднюю шкаторину, когда гика-шкот потравлен. Главный регулятор скрутки грота на полных курсах.' },
  main: { name: 'Гика-шкот', short: 'Гика-шкот', tag: 'Гика-шкот', bank: 'S', slot: 0, color: '#C9372F', pull: -1, min: 0, max: 1, rate: 0.12, ease: 0.22, run: 0.8,
    about: 'Задаёт угол гика, а пока гик близко к диаметральной плоскости — ещё и натяжение задней шкаторины.' },
  outhaul: { name: 'Аутхол', short: 'Аутхол', tag: 'Аутхол', bank: 'S', slot: 1, color: '#E0822A', pull: 1, min: 0, max: 1, rate: 0.2, ease: 0.3, run: 0.6,
    about: 'Натягивает нижнюю шкаторину грота вдоль гика. Туже — нижняя треть грота площе.' },
  furl: { name: 'Закрутка стакселя', short: 'Закрутка', tag: 'Закрутка', bank: 'S', slot: 2, color: '#1C9AA6', pull: 1, min: 0, max: 1, rate: 0.12, ease: 0.2, run: 0.5,
    about: 'Накручивает стаксель на штаг. Закручивают, потравив шкот. Раскрывают, открыв стопор и выбирая шкот.' },
  sheetP: { name: 'Шкот стакселя, левый', short: 'Левый шкот', tag: 'Шкот Л', primary: 'P', color: '#253F8F', pull: -1, min: 0, max: 2.4, rate: 0.22, ease: 0.3, run: 1.4,
    about: 'Левый шкот стакселя на основной лебёдке левого борта. Работает, когда стаксель стоит слева.' },
  sheetS: { name: 'Шкот стакселя, правый', short: 'Правый шкот', tag: 'Шкот П', primary: 'S', color: '#253F8F', pull: -1, min: 0, max: 2.4, rate: 0.22, ease: 0.3, run: 1.4,
    about: 'Правый шкот стакселя на основной лебёдке правого борта. Работает, когда стаксель стоит справа.' }
};
const CLUTCH_LINES = ['halyard', 'reef1', 'reef2', 'vang', 'main', 'outhaul', 'furl'];
const WINCH_NAMES = { RP: 'левая лебёдка на рубке', RS: 'правая лебёдка на рубке', PP: 'левая основная лебёдка', PS: 'правая основная лебёдка' };
const WINCH_ACC = { RP: 'левую лебёдку на рубке', RS: 'правую лебёдку на рубке', PP: 'левую основную лебёдку', PS: 'правую основную лебёдку' };
const winchFor = line => { const L = LINES[line]; return L.primary ? (L.primary === 'P' ? 'PP' : 'PS') : (L.bank === 'P' ? 'RP' : 'RS'); };
const onWinch = (d, line) => d.winch[winchFor(line)] === line;
const isHeld = (d, line) => (LINES[line].primary ? onWinch(d, line) : (d.clutch[line] === 1 || onWinch(d, line)));

const MSG = {
  notOnWinch: l => `«${LINES[l].short}» не на лебёдке. Сначала заведите снасть на лебёдку.`,
  clutchClosed: l => `Стопор «${LINES[l].short}» закрыт и не даёт травить. Откройте стопор — снасть удержит лебёдка.`,
  halyardMax: () => 'Фал выбран до упора: передняя шкаторина натянута до предела.',
  halyardReef: () => 'Фал не идёт выше: взят риф, натяжение ограничено меткой рифа.',
  reefBlocked: () => 'Риф-шкентель не идёт: сначала потравите фал грота до метки рифа.',
  furlSheet: () => 'Закрутка не идёт: шкот стакселя держит шкотовый угол. Сначала потравите шкот.',
  sheetFurl: () => 'Шкот не идёт: стаксель держит закрутка. Откройте стопор закрутки — стаксель раскроется, пока вы выбираете шкот.',
  sheetOther: () => 'Шкот не идёт: второй шкот держит стаксель на другом борту. Отдайте его — снимите с лебёдки.',
  carLoaded: () => 'Каретка под нагрузкой и не двигается. Потравите шкот этого борта, переставьте каретку и снова выберите шкот.',
  winchBusy: (l, o) => `Лебёдка занята: на ней «${LINES[o].short}». Сначала снимите её с лебёдки.`,
  max: l => `«${LINES[l].short}»: дальше выбирать некуда.`,
  min: l => `«${LINES[l].short}»: снасть уже потравлена полностью.`,
  hoistLoaded: () => 'Грот наполнен ветром — фал идёт тяжело. Потравите гика-шкот или приведитесь.',
  reefVang: () => 'Оттяжка гика туго — гик мешает притянуть шкотовый угол рифа. Потравите оттяжку.',
  poleWind: () => 'Выносной гик ставят только на фордевинде и полном бакштаге.'
};

function createDeck() {
  return {
    clutch: { halyard: 1, reef1: 1, reef2: 1, vang: 1, main: 1, outhaul: 1, furl: 1 },
    winch: { RP: null, RS: null, PP: 'sheetP', PS: 'sheetS' },
    hold: null, msg: null, log: [], running: {}
  };
}
function normalizeDeck(S) {
  const d = S.deck;
  for (const k of CLUTCH_LINES) d.clutch[k] = 1;
  d.winch.RP = null; d.winch.RS = null; d.winch.PP = 'sheetP'; d.winch.PS = 'sheetS';
  d.hold = null; d.running = {};
}

/* ---------- Состояние ---------- */
function createState() {
  const S = {
    t: 0, mode: 'quick', paused: false,
    wind: { tws: 12, twd: 0, baseTws: 12, baseTwd: 0, gusts: false, ramps: [] },
    boat: { hdg: 318, bsp: 6.2, heel: 15, dist: 0 },
    helm: { cmd: 0, auto: null },
    rig: { sheetP: 0.1, sheetS: 2.4, carP: 0.5, carS: 0.5, furl: 0, pole: 0, main: 0.03, trav: 0, vang: 0.15, outhaul: 0.4, halyard: 1.02, reef1: 0, reef2: 0, backstay: 0.35 },
    quick: { jibSheet: 0.05, car: 0.55, open: 1, mainsheet: 0.03, travLee: 0, vang: 0.15, outhaul: 0.4, luff: 0.6, reef: 0, backstay: 0.35, goose: false },
    boomSide: -1, boomAngle: -2,
    deck: createDeck(),
    events: [], scn: null, bestCache: null, D: null,
    broachT: 0, broaching: 0, ironsT: 0, crashT: 0, lastRun: {}
  };
  return S;
}
function emit(S, type, data) { S.events.push({ type, data, t: S.t }); if (S.events.length > 60) S.events.shift(); }
function log(S, text, kind) {
  S.deck.log.unshift({ text, kind: kind || 'info', t: S.t });
  if (S.deck.log.length > 7) S.deck.log.pop();
}
function block(S, reason, line, other) {
  const fn = MSG[reason]; if (!fn) return;
  const text = fn(line, other);
  const d = S.deck;
  if (!d.msg || d.msg.text !== text || S.t - d.msg.t > 2.5) { d.msg = { text, t: S.t, reason }; emit(S, 'block', text); }
  else d.msg.t = S.t;
}

/* ---------- Быстрый режим: ползунки -> физические настройки ---------- */
function applyQuick(S, awaS) {
  const Q = S.quick, R = S.rig;
  const windLee = -sgn(awaS);
  R.furl = clamp(1 - Q.open, 0, 1);
  let jibSide = windLee;
  if (Q.goose && Math.abs(awaS) > 110) { jibSide = -windLee; R.pole = jibSide; }
  else { R.pole = 0; if (Q.goose) Q.goose = false; }
  const eLee = 1.3 * Q.jibSheet + 0.8 * R.furl;
  if (jibSide > 0) { R.sheetS = eLee; R.sheetP = 2.4; } else { R.sheetP = eLee; R.sheetS = 2.4; }
  R.carP = R.carS = Q.car;
  R.main = Q.mainsheet;
  R.trav = clamp(Q.travLee * S.boomSide, -1, 1);
  R.vang = Q.vang; R.outhaul = Q.outhaul; R.backstay = Q.backstay;
  R.reef1 = Q.reef >= 1 ? 1 : 0; R.reef2 = Q.reef >= 2 ? 1 : 0;
  const hp = mainHoist(R);
  R.halyard = hp.hTaut + BOAT.TENS * Q.luff;
}
function rigToQuick(S) {
  const R = S.rig, Q = S.quick, D = S.D, jg = D && D.jib;
  Q.open = 1 - R.furl;
  const lee = jg && jg.ctrl ? (jg.ctrl > 0 ? R.sheetS : R.sheetP) : Math.min(R.sheetP, R.sheetS);
  Q.jibSheet = clamp((lee - 0.8 * R.furl) / 1.3, 0, 1);
  Q.car = jg && jg.ctrl ? (jg.ctrl > 0 ? R.carS : R.carP) : R.carP;
  Q.mainsheet = clamp(R.main, 0, 1); Q.travLee = clamp(R.trav * S.boomSide, -1, 1);
  Q.vang = R.vang; Q.outhaul = R.outhaul; Q.backstay = R.backstay;
  Q.reef = R.reef2 > 0.5 ? 2 : R.reef1 > 0.5 ? 1 : 0;
  Q.luff = mainHoist(R).tension;
  Q.goose = R.pole !== 0;
}
function setMode(S, mode) {
  if (mode === S.mode) return;
  if (mode === 'quick') rigToQuick(S);
  else normalizeDeck(S);
  S.mode = mode;
}

/* ---------- Режим «Палуба»: действия со снастями ---------- */
function tryMove(S, line, v) {
  const R = S.rig, L = LINES[line];
  const cur = R[line];
  let nv = clamp(v, L.min, L.max);
  if (line === 'halyard' && nv > cur) {
    const hp = mainHoist(R), top = hp.hTaut + BOAT.TENS;
    if (nv > top) { nv = Math.max(cur, top); if (nv <= cur + 1e-7) return { ok: false, reason: hp.sBottom > 0.01 ? 'halyardReef' : 'halyardMax' }; }
  }
  if ((line === 'reef1' || line === 'reef2') && nv > cur) {
    const i = line === 'reef1' ? 1 : 2;
    const pmax = clamp((1 + BOAT.TENS - R.halyard) / BOAT.reefH[i], 0, 1);
    if (nv > pmax) { nv = Math.max(cur, pmax); if (nv <= cur + 1e-7) return { ok: false, reason: 'reefBlocked' }; }
  }
  if (line === 'furl' && nv > cur) {
    for (const sh of ['sheetP', 'sheetS']) {
      const need = 0.8 * nv;
      if (R[sh] < need) {
        if (isHeld(S.deck, sh)) {
          const maxF = R[sh] / 0.8;
          if (maxF <= cur + 1e-7) return { ok: false, reason: 'furlSheet' };
          nv = Math.min(nv, maxF);
        } else R[sh] = need;
      }
    }
  }
  if ((line === 'sheetP' || line === 'sheetS') && nv < cur) {
    const need = 0.8 * R.furl;
    if (nv < need) {
      if (!isHeld(S.deck, 'furl')) R.furl = clamp(nv / 0.8, 0, 1);
      else { nv = need; if (cur <= need + 1e-7) return { ok: false, reason: 'sheetFurl' }; }
    }
    const sP = line === 'sheetP' ? nv : R.sheetP, sS = line === 'sheetS' ? nv : R.sheetS;
    if (!R.pole && !sheetsFeasible(sP, sS, R.furl)) return { ok: false, reason: 'sheetOther' };
  }
  if (Math.abs(nv - cur) < 1e-9) return { ok: false, reason: (L.pull > 0 ? nv >= L.max : nv <= L.min) ? 'max' : 'min' };
  R[line] = nv;
  return { ok: true };
}
function lineAction(S, line, dir, dt) {
  const d = S.deck, R = S.rig, L = LINES[line], loads = (S.D && S.D.loads) || {};
  if (!onWinch(d, line)) { block(S, 'notOnWinch', line); return; }
  if (dir > 0) {
    let rate = L.rate * (1 - 0.6 * clamp(loads[line] || 0, 0, 1));
    const hp = mainHoist(R);
    if (line === 'halyard' && R.halyard >= hp.hTaut - 0.002) rate *= 0.3;
    if (line === 'halyard' && R.halyard < hp.hTaut && (loads.main || 0) > 0.35) { rate *= 0.4; block(S, 'hoistLoaded', line); }
    if ((line === 'reef1' || line === 'reef2') && R.vang > 0.5) { rate *= 0.6; block(S, 'reefVang', line); }
    rate = Math.max(rate, line === 'halyard' && R.halyard >= hp.hTaut - 0.002 ? 0.01 : 0.04);
    const res = tryMove(S, line, R[line] + L.pull * rate * dt);
    if (!res.ok) block(S, res.reason, line);
  } else {
    if (!L.primary && d.clutch[line] === 1) { block(S, 'clutchClosed', line); return; }
    const res = tryMove(S, line, R[line] - L.pull * L.ease * dt);
    if (!res.ok) block(S, res.reason === 'max' ? 'min' : res.reason, line);
  }
}
function deckTick(S, dt) {
  const d = S.deck, R = S.rig, D = S.D;
  if (!D) return;
  const loads = D.loads || {};
  const h = d.hold;
  if (h) {
    if (h.kind === 'line') lineAction(S, h.line, h.dir, dt);
    else if (h.kind === 'car') {
      const sh = h.side === 'P' ? 'sheetP' : 'sheetS', key = h.side === 'P' ? 'carP' : 'carS';
      if ((loads[sh] || 0) > 0.22) block(S, 'carLoaded', sh);
      else R[key] = clamp(R[key] + h.dir * 0.35 * dt, 0, 1);
    } else if (h.kind === 'trav') {
      const towardLee = h.dir === S.boomSide;
      const rate = towardLee ? 0.5 : Math.max(0.05, 0.4 * (1 - 0.8 * clamp(loads.main || 0, 0, 1)));
      R.trav = clamp(R.trav + h.dir * rate * dt, -1, 1);
    } else if (h.kind === 'bs') {
      R.backstay = clamp(R.backstay + h.dir * (h.dir > 0 ? 0.22 : 0.35) * dt, 0, 1);
    }
  }
  for (const line in LINES) {
    if (isHeld(d, line)) { d.running[line] = 0; continue; }
    const ld = loads[line] || 0, L = LINES[line];
    if (ld > 0.06) {
      const before = R[line];
      tryMove(S, line, before - L.pull * L.run * (0.5 + ld) * dt);
      if (Math.abs(R[line] - before) > 1e-5) {
        if (!d.running[line]) {
          d.running[line] = 1;
          log(S, `«${L.short}» ушёл под нагрузкой!`, 'bad');
          emit(S, 'run', line);
        }
      } else d.running[line] = 0;
    } else d.running[line] = 0;
  }
}
function deckRelease(S) {
  const h = S.deck.hold;
  if (h && h.kind === 'car') {
    const key = h.side === 'P' ? 'carP' : 'carS';
    S.rig[key] = Math.round(S.rig[key] * (BOAT.holes - 1)) / (BOAT.holes - 1);
  }
  S.deck.hold = null;
}
function deckToggleClutch(S, line) {
  const d = S.deck;
  if (LINES[line].primary) return;
  d.clutch[line] = d.clutch[line] ? 0 : 1;
  log(S, d.clutch[line] ? `Стопор «${LINES[line].short}» закрыт` : `Стопор «${LINES[line].short}» открыт`);
}
function deckToggleWinch(S, line) {
  const d = S.deck, w = winchFor(line);
  if (d.winch[w] === line) {
    d.winch[w] = null;
    log(S, `«${LINES[line].short}» снят с лебёдки`);
    return true;
  }
  if (d.winch[w]) { block(S, 'winchBusy', line, d.winch[w]); return false; }
  d.winch[w] = line;
  log(S, `«${LINES[line].short}» заведён на ${WINCH_ACC[w]}`);
  return true;
}
function deckSetPole(S, side) {
  const D = S.D;
  if (side && D && D.awaAbs < 110) { block(S, 'poleWind', 'sheetP'); return false; }
  S.rig.pole = side;
  log(S, side ? `Выносной гик поставлен на ${side > 0 ? 'правый' : 'левый'} борт` : 'Выносной гик убран');
  return true;
}

/* ---------- Ветер и руль ---------- */
const noise = (t, a, b, c) => 0.5 * Math.sin(1.3 * t + a) + 0.3 * Math.sin(2.9 * t + b) + 0.2 * Math.sin(7.1 * t + c);
function updateWind(S, dt) {
  const W = S.wind;
  for (const r of W.ramps) {
    const k = smooth(0, 1, (S.t - r.t0) / r.dur);
    if (r.kind === 'twd') W.baseTwd = wrap360(r.from + r.delta * k);
    else W.baseTws = lerp(r.from, r.to, k);
    if (S.t - r.t0 >= r.dur) r.done = true;
  }
  W.ramps = W.ramps.filter(r => !r.done);
  let tws = W.baseTws, twd = W.baseTwd;
  if (W.gusts) {
    tws *= 1 + 0.2 * noise(S.t * 0.13, 0.3, 1.1, 2.0);
    twd += 7 * noise(S.t * 0.07, 2.1, 0.4, 1.3);
  }
  W.tws = Math.max(0, tws); W.twd = wrap360(twd);
}
function setWind(S, o) {
  const W = S.wind;
  if (o.tws != null) { W.baseTws = clamp(o.tws, 0, 35); W.ramps = W.ramps.filter(r => r.kind !== 'tws'); }
  if (o.twd != null) { W.baseTwd = wrap360(o.twd); W.ramps = W.ramps.filter(r => r.kind !== 'twd'); }
  if (o.shift) W.ramps.push({ kind: 'twd', from: W.baseTwd, delta: o.shift, t0: S.t, dur: o.dur || 3 });
  if (o.toTws != null) W.ramps.push({ kind: 'tws', from: W.baseTws, to: o.toTws, t0: S.t, dur: o.dur || 6 });
  if (o.gusts != null) W.gusts = !!o.gusts;
}
function updateHelm(S, dt) {
  const B = S.boat, H = S.helm;
  const eff = clamp(Math.abs(B.bsp) / 3, 0.22, 1);
  if (H.auto) {
    const d = Math.min(H.auto.left, H.auto.rate * Math.max(eff, 0.5) * dt);
    B.hdg = wrap360(B.hdg + H.auto.dir * d);
    H.auto.left -= d;
    if (H.auto.left <= 1e-6) H.auto = null;
  } else if (H.cmd) {
    B.hdg = wrap360(B.hdg + H.cmd * (H.fine ? 2 : 6) * eff * dt);
  }
  if (S.broaching > 0) {
    const twa = wrap180(S.wind.twd - B.hdg);
    B.hdg = wrap360(B.hdg + sgn(twa) * 7 * dt);
    S.broaching -= dt;
  }
  // стаксель «на ветру» у линии ветра уваливает нос
  const D = S.D;
  if (D && D.jib.bind && !S.rig.pole && D.twaAbs < 60 && D.tell && D.tell.jib[1] === 'aback' && !H.auto) {
    B.hdg = wrap360(B.hdg - sgn(D.twa) * 3 * clamp(D.aws / 12, 0.3, 1) * dt);
  }
}
function startManeuver(S, kind) {
  const D = S.D; if (!D) return;
  const a = D.twaAbs, s = sgn(D.twa);
  if (kind === 'tack') {
    if (a > 100) return false;
    const target = Math.max(optimalBeatTWA(D.tws), 40);
    S.helm.auto = { dir: s, left: a + target, rate: 5 };
  } else {
    if (a < 110) return false;
    const target = Math.max(optimalRunTWA(D.tws), 150);
    S.helm.auto = { dir: -s, left: (180 - a) + (180 - target), rate: 4 };
  }
  return true;
}

/* ---------- Вычисление состояния за кадр ---------- */
function jibTell(a, shadow, pole, bind) {
  if (pole) return 'pole';
  if (!bind) return 'flog';
  if (shadow > 0.55) return 'limp';
  if (a < -3) return 'aback';
  if (a < 6) return 'luff';
  if (a < 11) return 'wind';
  if (a <= 20) return 'ok';
  if (a <= 28) return 'lee';
  return 'stall';
}
function derive(S) {
  const W = S.wind, B = S.boat, R = S.rig;
  const D = { t: S.t };
  D.tws = W.tws; D.twd = W.twd; D.hdg = B.hdg;
  D.twa = wrap180(W.twd - B.hdg); D.twaAbs = Math.abs(D.twa);
  const aw = apparent(W.tws, D.twa, B.bsp);
  D.aws = aw.aws; D.awa = aw.awa; D.awaAbs = Math.abs(aw.awa);
  D.tack = D.twa >= 0 ? 1 : -1;
  D.pos = pointOfSail(D.twaAbs);
  const awaS = D.awa, gamma = gammaOf(D.awaAbs);
  D.gamma = gamma;

  const hoist = mainHoist(R); D.hoist = hoist;
  const mainVis = BOAT.mainArea * Math.pow(1 - hoist.sBottom, 1.85) * clamp(hoist.headH / Math.max(hoist.hTaut, 0.05), 0, 1);
  const jibVis = BOAT.jibArea * clamp(1 - R.furl, 0, 1);
  D.mainVis = mainVis; D.jibVis = jibVis;

  const mg = mainGeom(R, awaS, S.boomSide, S.boomAngle, hoist);
  if (mg.event) {
    S.boomSide = mg.side;
    if (mg.event === 'crash') { S.crashT = 0.8; emit(S, 'crash'); }
    else emit(S, mg.event);
  }
  S.boomAngle = mg.theta;
  D.main = mg;

  const jg = jibGeom(R, awaS); D.jib = jg;
  const shadow = (!R.pole && jibVis > 0.5 && jg.fill === mg.side && D.awaAbs > 120) ? clamp((D.awaAbs - 120) / 40, 0, 0.9) : 0;
  D.shadow = shadow;

  const rJ = jg.bind ? evalSail(jg.fill, jg.delta, jg.tau, awaS, gamma, W_JIB, 0) : flogSail(awaS, W_JIB);
  const aJmid = jg.bind ? alphaAt(jg.fill, jg.delta, jg.tau, awaS, gamma, 0.5, 0) : 0;
  const jibDrawing = jg.bind && aJmid > 5 && shadow < 0.5 && jibVis > 1;
  const upF = clamp((90 - D.awaAbs) / 50, 0, 1);
  const shift = 6 * (jibVis / BOAT.jibArea) * (jibDrawing ? 1 : 0.3) * upF;
  D.mainShift = shift;
  const rM = mg.bound ? evalSail(mg.side, mg.theta, mg.tau, awaS, gamma, W_MAIN, shift) : flogSail(awaS, W_MAIN);
  D.rJ = rJ; D.rM = rM;
  D.jibAlpha = jg.bind ? rJ.al : [0, 0, 0, 0, 0];
  D.mainAlpha = mg.bound ? rM.al : [0, 0, 0, 0, 0];
  D.jibFlog = !jg.bind; D.mainFlog = !mg.bound;

  // лучшее достижимое (кэш ~10 раз в секунду)
  let bc = S.bestCache;
  if (!bc || S.t - bc.t > 0.1 || bc.pole !== R.pole || Math.abs(wrap180(bc.awa - awaS)) > 4) {
    const lee = -sgn(awaS);
    const jFill = R.pole ? R.pole : lee;
    const jr = R.pole ? [30, 88] : [BOAT.jibMin, 62];
    const T = computeTargets(D.tws, D.twaAbs, D.awaAbs, D.aws);
    const shiftBest = 6 * (jibVis / BOAT.jibArea) * (R.pole ? 0.3 : 1) * upF;
    bc = S.bestCache = {
      t: S.t, awa: awaS, pole: R.pole, T, lee, jFill, shiftBest,
      jAll: bestSail(jFill, awaS, gamma, W_JIB, 0, jr[0], jr[1], null),
      jTau: bestSail(jFill, awaS, gamma, W_JIB, 0, jr[0], jr[1], T.tauJ),
      mAll: bestSail(lee, awaS, gamma, W_MAIN, shiftBest, -6, BOAT.boomRec, null),
      mTau: bestSail(lee, awaS, gamma, W_MAIN, shiftBest, -6, BOAT.boomRec, T.tauM)
    };
  }
  const T = bc.T; D.T = T; D.best = bc;

  const etaJ = bc.jAll.cr > 0.02 ? clamp(rJ.cr / bc.jAll.cr, -0.4, 1.03) : 0;
  const etaM = (bc.mAll.cr > 0.02 ? clamp(rM.cr / bc.mAll.cr, -0.4, 1.03) : 0) * clamp(1 - 4 * hoist.slack, 0, 1);
  const wJ = jibVis * Math.max(0, bc.jAll.cr), wM = mainVis * Math.max(0, bc.mAll.cr);
  const etaRig = (wJ + wM) > 1e-6 ? (wJ * etaJ * (1 - shadow) + wM * etaM) / (wJ + wM) : 0;
  D.etaJ = etaJ; D.etaM = etaM;

  const Aratio = (mainVis + jibVis) / (BOAT.mainArea + BOAT.jibArea);
  const need = Math.min(1, Math.pow(12 / Math.max(D.tws, 1), 2));
  const etaArea = Math.pow(Math.min(1, Aratio / need), 0.5);

  D.depthM = 0.165 - 0.035 * R.outhaul - 0.03 * R.backstay + 0.004 * clamp((D.aws - 10) / 10, -1, 1.5) + 0.03 * hoist.slack;
  D.depthJ = 0.12 + 0.035 * (1 - R.backstay) * Math.min(1, D.aws / 16) + 0.02 * R.furl;
  D.draftPos = 0.47 + 0.035 * (D.aws - 14) / 10 - 0.12 * (hoist.tension - 0.5) + 0.1 * hoist.slack;
  const etaDepth = clamp(1 - 1.4 * clamp(Math.abs(D.depthM - T.depthM) - 0.006, 0, 0.1) - 0.3 * clamp(Math.abs(R.backstay - T.backstay) - 0.15, 0, 1) * Math.min(1, D.tws / 20), 0.6, 1);
  const etaDraft = clamp(1 - 0.7 * clamp(Math.abs(D.draftPos - T.pos) - 0.015, 0, 0.2), 0.6, 1);

  // крен
  const q = 0.5 * 1.225 * Math.pow(D.aws * 0.5144, 2);
  const chM = rM.ch * clamp(1 - 2 * hoist.slack, 0.2, 1), chJ = rJ.ch * (1 - shadow);
  const mh0 = q * (mainVis * chM * BOAT.ceMain + jibVis * chJ * BOAT.ceJib);
  const RM0 = BOAT.mass * 9.81 * BOAT.GM;
  let phi = 0.2;
  for (let i = 0; i < 10; i++) { const c = Math.cos(phi); phi = Math.asin(clamp(Math.abs(mh0) * c * c / RM0, 0, 0.95)); }
  D.heelTarget = phi * R2D * (-sgn(awaS)) * sgn(mh0);
  const hAbs = Math.abs(B.heel);
  const etaHeel = hAbs <= 20 ? 1 : clamp(1 - 0.02 * (hAbs - 20) - 0.0012 * (hAbs - 20) * (hAbs - 20), 0.3, 1);
  const fM = mainVis * Math.max(0, chM), fJ = jibVis * Math.max(0, chJ);
  const share = fM + fJ > 1e-6 ? fM / (fM + fJ) : 0.5;
  D.rudder = (1.5 + 0.28 * Math.max(0, hAbs - 8) + 10 * (share - 0.5)) * clamp(q / 40, 0, 1);
  const etaHelm = D.rudder > 5 ? clamp(1 - 0.0035 * Math.pow(D.rudder - 5, 2), 0.6, 1) : 1;

  const pol = polarSpeed(D.tws, D.twaAbs);
  const eta = clamp(etaRig, -0.4, 1.03) * etaArea * etaHeel * etaHelm * etaDepth * etaDraft;
  D.eta = eta; D.etaRig = etaRig; D.etaArea = etaArea; D.etaHeel = etaHeel; D.polar = pol;
  D.bspTarget = eta >= 0 ? pol * Math.pow(eta, 0.6) : Math.max(-0.6, eta * 2);

  // колдунчики
  D.tell = {
    jib: [0.25, 0.5, 0.75].map(h => jibTell(jg.bind ? alphaAt(jg.fill, jg.delta, jg.tau, awaS, gamma, h, 0) : 0, shadow, !!R.pole, jg.bind)),
    jibA: [0.25, 0.5, 0.75].map(h => (jg.bind ? alphaAt(jg.fill, jg.delta, jg.tau, awaS, gamma, h, 0) : 0)),
    main: [0.2, 0.42, 0.64, 0.86].map(h => (mg.bound ? smooth(16, 24, alphaAt(mg.side, mg.theta, mg.tau, awaS, gamma, h, shift)) : 0.5))
  };

  // нагрузки на снасти
  const qn = Math.pow(D.aws / 20, 2), mR = mainVis / BOAT.mainArea, jR = jibVis / BOAT.jibArea;
  const jl = qn * jR * (0.3 + Math.abs(rJ.cl)) + 0.02;
  D.loads = {
    main: mg.sheetBind ? qn * mR * (0.3 + Math.max(0, rM.cl)) : 0.02,
    sheetP: jg.bind && jg.ctrl < 0 ? jl : 0.01,
    sheetS: jg.bind && jg.ctrl > 0 ? jl : 0.01,
    vang: R.vang > 0.03 ? qn * mR * (1 - mg.sheetLeech) * 0.7 + 0.03 : 0,
    outhaul: R.outhaul > 0.02 ? 0.08 + 0.5 * qn * mR : 0,
    halyard: R.halyard > 0.005 ? 0.3 + 0.4 * hoist.tension + 0.3 * qn : 0,
    reef1: R.reef1 > 0.005 ? 0.12 + 0.45 * qn * mg.leech * mR : 0,
    reef2: R.reef2 > 0.005 ? 0.12 + 0.45 * qn * mg.leech * mR : 0,
    furl: R.furl > 0.005 && R.furl < 0.985 ? 0.1 + 0.8 * qn * (1 - R.furl) : (R.furl >= 0.985 ? 0.02 : 0)
  };
  return D;
}

/* ---------- Оценка и подсказки ---------- */
const ITEM_DEFS = [
  { id: 'course', name: 'Курс к ветру', sub: 'руль', w: 15 },
  { id: 'jibAoA', name: 'Шкот стакселя', sub: 'угол стакселя', w: 14 },
  { id: 'jibTwist', name: 'Каретка стакселя', sub: 'скрутка стакселя', w: 7 },
  { id: 'furl', name: 'Раскрытие стакселя', sub: 'площадь', w: 8 },
  { id: 'mainAoA', name: 'Гика-шкот и погон', sub: 'угол грота', w: 14 },
  { id: 'mainTwist', name: 'Оттяжка гика', sub: 'скрутка грота', w: 8 },
  { id: 'depth', name: 'Аутхол и ахтерштаг', sub: 'пузо парусов', w: 7 },
  { id: 'luff', name: 'Фал грота', sub: 'передняя шкаторина', w: 6 },
  { id: 'reef', name: 'Рифы', sub: 'площадь грота', w: 8 },
  { id: 'heel', name: 'Крен и руль', sub: 'баланс', w: 9 },
  { id: 'deck', name: 'Снасти закреплены', sub: 'стопора и лебёдки', w: 4, deckOnly: true }
];
const sfe = (err, tol, span) => clamp(1 - Math.max(0, Math.abs(err) - tol) / span, 0, 1);
const SIDE_GEN = s => (s > 0 ? 'правого' : 'левого');
const SIDE_NOM = s => (s > 0 ? 'правый' : 'левый');

function turnAdvice(S, D, dirSign, deg) {
  // dirSign > 0 — повернуть вправо (курс растёт)
  const up = dirSign === sgn(D.twa);
  return `${up ? 'Приведитесь' : 'Увалитесь'} на ${r0(deg)}° (${dirSign > 0 ? 'вправо' : 'влево'})`;
}
function courseItem(S, D) {
  const it = { score: 1, diag: 'Курс подходит для задачи', act: '' };
  const obj = (S.scn && S.scn.def.objective) || { type: 'free' };
  const a = D.twaAbs, beat = optimalBeatTWA(D.tws), run = optimalRunTWA(D.tws);
  const byLee = (S.boomSide !== -sgn(D.awa) && D.awaAbs > 90) ? 180 - D.awaAbs : 0;
  const beatAdvice = () => {
    if (a < beat - 4) { it.score = sfe(beat - 4 - a, 0, 8); it.diag = `Слишком остро: ${r0(a)}° к ветру — лодка теряет ход, наветренные колдунчики трепещут`; it.act = `${turnAdvice(S, D, -sgn(D.twa), beat - a)}. Для этой лодки лучший бейдевинд — около ${r0(beat)}–${r0(beat + 3)}° к истинному ветру.`; }
    else if (a > beat + 6) { it.score = sfe(a - beat - 6, 0, 14); it.diag = `Для лавировки слишком полно: ${r0(a)}° к ветру`; it.act = `${turnAdvice(S, D, sgn(D.twa), a - beat)} и выберите шкоты, пока колдунчики снова не встанут ровно. Так лодка быстрее продвигается против ветра.`; }
    else it.diag = `Хороший бейдевинд: ${r0(a)}° к ветру`;
  };
  if (a < 30) {
    it.score = 0; it.diag = `Левентик: нос почти в ветер (${r0(a)}°) — паруса не работают`;
    it.act = `${turnAdvice(S, D, -sgn(D.twa), beat - a)}. Если лодка остановилась — дайте стакселю наполниться и уваливайтесь до ${r0(beat)}°.`;
    return it;
  }
  if (byLee > 3) {
    it.score = byLee > 8 ? 0.15 : 0.5;
    it.diag = `Ветер дует со стороны гика («на рауле» ${r0(byLee)}°) — грозит самопроизвольный поворот фордевинд`;
    it.act = `Поверните на ${r0(byLee + 12)}° ${S.boomSide > 0 ? 'влево' : 'вправо'} — ветер должен снова дуть с борта, противоположного гику (для галса, на котором стоит гик, это приведение). Или сделайте контролируемый поворот: выберите гика-шкот к центру, переложите руль, после перехода гика — потравите.`;
    return it;
  }
  switch (obj.type) {
    case 'beat': beatAdvice(); break;
    case 'tack':
      if (S.scn && D.tack === S.scn.startTack) { it.score = 0.3; it.diag = 'Вы ещё на исходном галсе'; it.act = 'Сделайте поворот оверштаг: кнопка «Оверштаг» или приводитесь, пока нос не пройдёт линию ветра, и ложитесь на 42–45° на другом галсе.'; }
      else beatAdvice();
      break;
    case 'heading': {
      const twaT = wrap180(D.twd - obj.hdg);
      if (Math.abs(twaT) < 38) {
        beatAdvice();
        if (it.score >= 0.85) it.diag = `Цель ${obj.hdg}° теперь в мёртвом секторе — верно идёте крутым бейдевиндом (${r0(a)}°)`;
        else it.diag += `. Цель ${obj.hdg}° в мёртвом секторе — к ней только лавировкой`;
      } else {
        const err = wrap180(D.hdg - obj.hdg);
        it.score = sfe(err, obj.tol, 15);
        if (it.score < 0.999) { it.diag = `Курс ${r0(wrap360(D.hdg))}°, а цель — ${obj.hdg}°`; it.act = `${turnAdvice(S, D, -sgn(err), Math.abs(err))}. На свободных курсах курс держат на цель, а под новый ветер подстраивают паруса.`; }
        else it.diag = `Курс на цель: ${r0(wrap360(D.hdg))}°`;
      }
      break;
    }
    case 'gybe':
      if (S.scn && D.tack === S.scn.startTack) { it.score = 0.3; it.diag = 'Поворот фордевинд ещё не сделан'; it.act = 'Выберите гика-шкот почти к центру, затем уваливайтесь, пока корма не пройдёт линию ветра. После перехода гика потравите гика-шкот на новом борту.'; break; }
      // fallthrough
    case 'run':
      if (a < 145) { it.score = sfe(145 - a, 0, 20); it.diag = `Курс острее фордевинда: ${r0(a)}° к ветру`; it.act = `${turnAdvice(S, D, -sgn(D.twa), run - a)} — до ${r0(run)}° к ветру.`; }
      else if (a > 175) { it.score = 0.75; it.diag = 'Прямо по ветру — курс неустойчивый, легко уйти «на раул»'; it.act = `${turnAdvice(S, D, sgn(D.twa), a - 165)}: на 160–170° лодка устойчивее, гик не перебросит.`; }
      else it.diag = `Безопасный фордевинд/бакштаг: ${r0(a)}° к ветру`;
      break;
    default:
      if (a < 38) { it.score = sfe(38 - a, 0, 8); it.diag = `Слишком остро: ${r0(a)}° к ветру — лодка теряет ход`; it.act = `${turnAdvice(S, D, -sgn(D.twa), beat - a)}. Оптимальный бейдевинд — около ${r0(beat)}°.`; }
      else it.diag = `${D.pos}, ${r0(a)}° к ветру, ${D.tack > 0 ? 'правый' : 'левый'} галс`;
  }
  return it;
}

function hint(mode, quick, deck) { return mode === 'deck' ? deck : quick; }

function scoreItems(S, D) {
  const R = S.rig, T = D.T, bc = D.best, mg = D.main, jg = D.jib, hp = D.hoist, mode = S.mode;
  const awaS = D.awa, gamma = D.gamma;
  const items = [];
  const add = (id, it) => {
    const def = ITEM_DEFS.find(x => x.id === id);
    it.id = id; it.name = def.name; it.sub = def.sub; it.w = def.w;
    if (!it.na) it.status = it.score >= 0.85 ? 'ok' : it.score >= 0.5 ? 'warn' : 'bad';
    else it.status = 'na';
    items.push(it);
  };
  const jibSideName = SIDE_GEN(jg.ctrl || jg.fill);
  const jibSheetWhere = hint(mode, 'Ползунок «Шкот стакселя».', `Шкот ${jibSideName} борта на основной лебёдке ${jibSideName} борта.`);

  add('course', courseItem(S, D));

  /* --- шкот стакселя --- */
  {
    const it = { score: 1, diag: '', act: '' };
    if (D.jibVis < 0.05 * BOAT.jibArea) { it.na = true; it.diag = 'Стаксель закручен'; }
    else if (R.pole) {
      const aAct = Math.abs(jg.delta), aBest = bc.jAll.d;
      if (D.awaAbs < 120) { it.score = 0.1; it.diag = 'Стаксель на выносном гике «на ветру» — курс стал слишком острым'; it.act = hint(mode, 'Снимите «бабочку» или увалитесь до фордевинда.', 'Уберите выносной гик (карточка стакселя на схеме) или увалитесь до фордевинда.'); }
      else { it.score = sfe(aAct - aBest, 12, 25); it.diag = it.score >= 0.85 ? 'Бабочка: стаксель стоит на выносном гике' : (aAct < aBest ? 'Стаксель на выносном гике выбран слишком сильно' : 'Стаксель на выносном гике потравлен слишком сильно'); it.act = 'На выносном гике шкот наветренного борта держит стаксель почти перпендикулярно ветру. ' + jibSheetWhere; }
    } else if (!jg.bind) { it.score = 0.05; it.diag = 'Стаксель полощет: шкот отдан или слишком потравлен'; it.act = `Выберите шкот ${SIDE_GEN(-sgn(awaS))} (подветренного) борта, пока наветренные колдунчики не перестанут трепетать. ` + hint(mode, 'Ползунок «Шкот стакселя» — к «выбран».', `Шкот на основной лебёдке ${SIDE_GEN(-sgn(awaS))} борта → «Выбирать».`); }
    else {
      const aAct = alphaAt(jg.fill, jg.delta, jg.tau, awaS, gamma, 0.5, 0);
      const aBest = alphaAt(bc.jFill, bc.jFill * bc.jTau.d, T.tauJ, awaS, gamma, 0.5, 0);
      const err = aAct - aBest;
      if (aAct < -3) { it.score = 0; it.diag = 'Стаксель «на ветру»: его держит шкот наветренного борта'; it.act = hint(mode, 'Стаксель заполаскивает с обратной стороны. Это бывает сразу после поворота — переложите шкот.', `Отдайте шкот ${SIDE_GEN(jg.ctrl)} борта (снимите с лебёдки) и выберите шкот ${SIDE_GEN(-jg.ctrl)} борта.`); }
      else if (D.shadow > 0.55) { it.score = 0.45; it.diag = 'Стаксель в тени грота — колдунчики висят'; it.act = hint(mode, 'На фордевинде стаксель не получает ветра. Включите «Бабочку» (стаксель на выносном гике на другой борт), приведитесь до ~150° или закрутите стаксель.', 'Поставьте выносной гик на наветренный борт и выберите наветренный шкот, или приведитесь до ~150°, или закрутите стаксель.'); }
      else {
        it.score = sfe(err, 3.5, 8);
        if (err < -3.5) {
          if (jg.e < 0.03 && D.awaAbs < 26) { it.score = Math.min(it.score, 0.6); it.diag = 'Шкот выбран до упора, но наветренные колдунчики трепещут'; it.act = `Дело не в шкоте, а в курсе: вы идёте слишком остро. Увалитесь на ${r0(Math.max(3, -err))}°.`; }
          else { it.diag = 'Наветренные колдунчики трепещут — стаксель потравлен'; it.act = `Выберите шкот, пока наветренные колдунчики не встанут ровно (или увалитесь, если курс не важен). ${jibSheetWhere}`; }
        } else if (err > 3.5) { it.diag = 'Подветренные колдунчики срываются — стаксель перетянут'; it.act = `Потравите шкот, пока подветренные колдунчики не потекут ровно (или приведитесь, если цель на ветре). ${jibSheetWhere}`; }
        else it.diag = 'Колдунчики стакселя текут ровно с обеих сторон';
        if (aAct < 8 && it.score > 0.6) { it.score = 0.6; it.diag = 'Стаксель заполаскивает у передней шкаторины'; it.act = 'Наветренные колдунчики трепещут: выберите шкот или увалитесь. ' + jibSheetWhere; }
      }
    }
    add('jibAoA', it);
  }

  /* --- каретка стакселя (скрутка) --- */
  {
    const it = { score: 1, diag: '', act: '' };
    if (D.jibVis < 0.05 * BOAT.jibArea || !jg.bind || R.pole || D.shadow > 0.55) { it.na = true; it.diag = R.pole ? 'На выносном гике каретка не важна' : 'Не оценивается'; }
    else {
      const err = jg.tau - T.tauJ;
      it.score = sfe(err, 3, 7);
      const carWhere = hint(mode, 'Ползунок «Каретка стакселя».', `Каретка на погоне ${SIDE_GEN(jg.ctrl)} борта. Под нагрузкой она не двигается: потравите шкот, переставьте каретку, снова выберите.`);
      if (err > 3) { it.diag = 'Верх стакселя открыт: верхние колдунчики заполаскивают раньше нижних'; it.act = `Каретку вперёд на ${Math.max(1, r0(err / 30 * 14))} отв. — шкот потянет шкаторину вниз и закроет верх. ${R.furl > 0.1 ? 'После закрутки шкотовый угол поднялся — каретку всегда двигают вперёд. ' : ''}${carWhere}`; }
      else if (err < -3) { it.diag = 'Нижние колдунчики заполаскивают раньше, верх стакселя закрыт'; it.act = `Каретку назад на ${Math.max(1, r0(-err / 30 * 14))} отв. — верх откроется, низ станет площе. ${carWhere}`; }
      else it.diag = 'Колдунчики на всех высотах срываются одновременно — каретка на месте';
      if (T.ws > 0.4 && Math.abs(err) <= 3) it.diag += '; в сильный ветер верх чуть открыт — так меньше крен';
    }
    add('jibTwist', it);
  }

  /* --- раскрытие стакселя --- */
  {
    const it = { score: 1, diag: '', act: '' };
    const err = R.furl - T.furl;
    const runBlank = D.twaAbs > 150 && !R.pole;
    const pct = v => r0((1 - v) * 100);
    if (runBlank && R.furl > 0.5) { it.score = 1; it.diag = 'На фордевинде стаксель в тени — закрутить его разумно'; }
    else {
      it.score = sfe(err, 0.1, 0.25);
      if (err < -0.1) { it.diag = `Стакселя слишком много для ${r0(T.effWind)} уз вымпельного ветра — лодка перегружена`; it.act = `Закрутите стаксель до ~${pct(T.furl)}% раскрытия: потравите шкот немного, тяните закрутку, затем выберите шкот и сдвиньте каретку вперёд. ` + hint(mode, 'Ползунок «Раскрытие стакселя».', 'Закрутка — в пианино правого борта, на правую лебёдку на рубке. Если там гика-шкот, снимите его: стопор гика-шкота закрыт и удержит шкот.'); }
      else if (err > 0.1) { it.diag = 'Стаксель закручен, а ветра немного — не хватает мощности'; it.act = `Раскройте стаксель до ~${pct(T.furl)}%. ` + hint(mode, 'Ползунок «Раскрытие стакселя».', 'Заведите закрутку на правую лебёдку на рубке, откройте её стопор и выбирайте шкот стакселя — стаксель раскрутится. Потом закройте стопор и сдвиньте каретку назад.'); }
      else it.diag = `Площадь стакселя по ветру: ${pct(R.furl)}% раскрытия`;
    }
    add('furl', it);
  }

  /* --- угол грота --- */
  {
    const it = { score: 1, diag: '', act: '' };
    const mWhere = hint(mode, 'Ползунки «Гика-шкот» и «Погон».', 'Гика-шкот — в пианино правого борта, на правую лебёдку на рубке. Погон — каретка на рубке.');
    if (hp.headH < 0.3) { it.score = 0; it.diag = 'Грот не поднят'; it.act = hint(mode, 'Поднимите грот — ползунок «Фал грота».', 'Заведите фал грота на левую лебёдку на рубке и выбирайте.'); }
    else if (!mg.bound) { it.score = 0.05; it.diag = 'Грот полощет: гика-шкот слишком потравлен'; it.act = 'Выберите гика-шкот, пока парус не перестанет полоскать у мачты. ' + mWhere; }
    else {
      const aAct = alphaAt(mg.side, mg.theta, mg.tau, awaS, gamma, 0.5, D.mainShift);
      const aBest = alphaAt(bc.lee, bc.lee * bc.mTau.d, T.tauM, awaS, gamma, 0.5, bc.shiftBest);
      const err = aAct - aBest;
      const feather = 3.5 + 6 * T.ws * T.up;
      it.score = err < 0 ? sfe(err, feather, 8) : sfe(err, 3.5, 8);
      if (aAct < -3) { it.score = 0; it.diag = 'Грот заполаскивает с обратной стороны'; it.act = 'Гик на наветренной стороне — переставьте каретку погона под ветер и потравите гика-шкот.'; }
      else if (err < -feather) { it.diag = 'Грот заполаскивает у мачты — пузырь по передней шкаторине'; it.act = (D.awaAbs < 45 ? 'Подтяните каретку погона на ветер или выберите гика-шкот, пока пузырь не исчезнет.' : 'Выберите гика-шкот, пока пузырь у мачты не исчезнет.') + ' ' + mWhere; }
      else if (err > 3.5) {
        if (D.awaAbs > 110 && Math.abs(mg.theta) < 60) { it.diag = 'На полном курсе гик слишком выбран'; it.act = 'Вытравите гика-шкот, чтобы гик стоял почти перпендикулярно ветру (65–72°), но не лёг на краспицы. ' + mWhere; }
        else { it.diag = 'Грот перетянут: колдунчики на задней шкаторине заворачиваются за парус'; it.act = (D.awaAbs < 45 ? 'Опустите каретку погона под ветер (гик отойдёт, а задняя шкаторина останется натянутой) или немного потравите гика-шкот.' : 'Потравите гика-шкот, пока колдунчики задней шкаторины не начнут струиться.') + ' ' + mWhere; }
      } else if (err < -3.5) it.diag = 'Грот слегка разгружен у мачты — в сильный ветер это нормально';
      else it.diag = 'Угол грота верный: колдунчики задней шкаторины струятся';
      if (mg.onShrouds) { it.score = Math.min(it.score, 0.7); it.diag = 'Гик лёг на ванты — парус трётся о краспицы'; it.act = 'Подберите гика-шкот на 3–4°, чтобы грот не давил на краспицы. ' + mWhere; }
    }
    add('mainAoA', it);
  }

  /* --- скрутка грота --- */
  {
    const it = { score: 1, diag: '', act: '' };
    if (!mg.bound || hp.headH < 0.3) { it.na = true; it.diag = 'Не оценивается'; }
    else {
      const err = mg.tau - T.tauM;
      it.score = sfe(err, 3, 8);
      const upwind = D.awaAbs < 45 && mg.sheetBind && R.main < 0.3;
      if (err > 3) {
        it.diag = 'Слишком большая скрутка: верх грота открыт и не тянет';
        it.act = upwind ? 'На бейдевинде скрутку регулирует гика-шкот: выберите его, а гик удержите кареткой погона (опустите её под ветер). ' + hint(mode, 'Ползунки «Гика-шкот» и «Погон».', 'Гика-шкот — правая лебёдка на рубке.')
          : 'На полных курсах скрутку держит оттяжка гика: подтяните её, пока верхний колдунчик задней шкаторины не начнёт иногда заворачиваться. ' + hint(mode, 'Ползунок «Оттяжка гика».', 'Оттяжка — в пианино левого борта, на левую лебёдку на рубке.');
      } else if (err < -3) {
        it.diag = 'Задняя шкаторина закрыта: верхний колдунчик всё время за парусом';
        it.act = R.vang > 0.5 && mg.vangLeech >= mg.sheetLeech ? 'Потравите оттяжку гика — верх грота должен немного открыться. ' + hint(mode, 'Ползунок «Оттяжка гика».', 'Оттяжка: левая лебёдка на рубке, стопор открыть, травить.')
          : 'Немного потравите гика-шкот, а гик верните кареткой погона на ветер. ' + hint(mode, 'Ползунки «Гика-шкот» и «Погон».', 'Гика-шкот: правая лебёдка, стопор открыть, травить.');
      } else it.diag = 'Скрутка грота по ветру';
    }
    add('mainTwist', it);
  }

  /* --- пузо: аутхол и ахтерштаг --- */
  {
    const it = { score: 1, diag: '', act: '' };
    const e1 = (D.depthM - T.depthM) / 0.012, e2 = (R.backstay - T.backstay) / 0.3;
    const err = Math.max(Math.abs(e1), Math.abs(e2));
    it.score = clamp(1 - Math.max(0, err - 1) / 2, 0, 1);
    const w = hint(mode, 'Ползунки «Аутхол» и «Ахтерштаг».', 'Аутхол — правое пианино, правая лебёдка на рубке. Ахтерштаг — таль на корме.');
    if (err <= 1) it.diag = 'Пузо парусов подходит для ветра';
    else if (e1 > 1 || e2 < -1) { it.diag = T.ws > 0.3 ? `Паруса слишком пузатые для ${r0(D.tws)} уз` : 'Паруса глубже, чем нужно'; it.act = (e1 > 1 ? 'Подтяните аутхол (нижняя часть грота станет площе). ' : '') + (e2 < -1 ? 'Подтяните ахтерштаг: мачта прогнётся, грот станет площе, провис штага уменьшится. ' : '') + w; }
    else { it.diag = T.up < 0.5 ? 'На полном курсе паруса слишком плоские' : 'Паруса слишком плоские — не хватает мощности'; it.act = (e1 < -1 ? 'Потравите аутхол. ' : '') + (e2 > 1 ? 'Потравите ахтерштаг. ' : '') + w; }
    add('depth', it);
  }

  /* --- фал грота --- */
  {
    const it = { score: 1, diag: '', act: '' };
    if (hp.slack > 0.02) { it.score = clamp(0.45 - hp.slack * 3, 0, 0.45); it.diag = hp.headH < 0.5 ? 'Грот упал: фал потравлен' : 'Грот поднят не полностью — передняя шкаторина провисла'; it.act = hint(mode, 'Ползунок «Фал грота».', 'Заведите фал грота на левую лебёдку на рубке и выбирайте. Стопор можно не открывать: на выбирание он снасть пропускает.'); }
    else {
      const err = D.draftPos - T.pos;
      it.score = sfe(err, 0.02, 0.05);
      if (err > 0.02) { it.diag = 'Пузо грота уехало назад, у мачты горизонтальные складки'; it.act = 'Подтяните фал — пузо сместится вперёд. ' + hint(mode, 'Ползунок «Фал грота».', 'Фал — левая лебёдка на рубке, выбирайте через закрытый стопор.'); }
      else if (err < -0.02) { it.diag = 'Вертикальная складка вдоль мачты — фал перетянут'; it.act = 'Потравите фал на пару сантиметров. ' + hint(mode, 'Ползунок «Фал грота».', 'Фал на левую лебёдку на рубке → откройте стопор → «Травить» → закройте стопор → снимите с лебёдки.'); }
      else it.diag = 'Передняя шкаторина натянута по ветру';
    }
    add('luff', it);
  }

  /* --- рифы --- */
  {
    const it = { score: 1, diag: '', act: '' };
    const lvl = hp.reefLevel, tgt = T.reef, ew = T.effWind;
    const near = th => Math.abs(ew - th) < 1.5;
    if (hp.reefPartial) { it.score = 0.4; it.diag = 'Риф взят не до конца'; it.act = hint(mode, 'Выберите нужный риф переключателем «Рифы».', 'Потравите фал до метки рифа и выберите риф-шкентель до конца, затем натяните фал.'); }
    else if (lvl === tgt) it.diag = lvl ? `Взят ${lvl}-й риф — по ветру` : 'Полный грот — по ветру';
    else if (Math.abs(lvl - tgt) === 1 && near(Math.max(lvl, tgt) === 2 ? 27 : 21)) { it.score = 0.9; it.diag = 'На границе: подойдут оба варианта'; }
    else if (lvl < tgt) {
      it.score = tgt - lvl === 1 ? 0.45 : 0.1;
      it.diag = `Пора брать ${tgt}-й риф: ${r0(ew)} уз вымпельного ветра`;
      it.act = hint(mode, `Переключите «Рифы» на «${tgt}-й». На настоящей лодке: оттяжку и гика-шкот потравить, фал потравить до метки, выбрать риф-шкентель, снова натянуть фал.`,
        `1) Потравите оттяжку гика и немного гика-шкот. 2) Фал на левую лебёдку на рубке, откройте стопор и травите до метки ${tgt}-го рифа. 3) Закройте стопор фала, снимите фал с лебёдки. 4) Риф-шкентель ${tgt} на ту же лебёдку — выбирайте до конца. 5) Снимите его, снова фал на лебёдку — натяните переднюю шкаторину. 6) Настройте гика-шкот и оттяжку.`);
    } else {
      it.score = lvl - tgt === 1 ? 0.5 : 0.15;
      it.diag = `Риф лишний: ветра ${r0(ew)} уз, лодке не хватает мощности`;
      it.act = hint(mode, `Переключите «Рифы» на «${tgt ? tgt + '-й' : 'нет'}».`, 'Риф-шкентель на левую лебёдку на рубке → откройте его стопор → потравите. Затем фал на лебёдку и выбирайте до полного подъёма грота.');
    }
    add('reef', it);
  }

  /* --- крен и руль --- */
  {
    const it = { score: 1, diag: '', act: '' };
    const h = Math.abs(S.boat.heel), r = D.rudder;
    const s1 = h <= 21 ? 1 : clamp(1 - (h - 21) / 7, 0, 1);
    const s2 = r > 6 ? clamp(1 - (r - 6) / 5, 0, 1) : (r < -1 ? 0.6 : 1);
    it.score = Math.min(s1, s2);
    if (h > 21) { it.diag = `Крен ${r0(h)}°: лодка перегружена, руль тянет к ветру (${r0(Math.max(0, r))}°)`; it.act = 'Разгрузите грот: каретку погона под ветер, потравите гика-шкот, подтяните ахтерштаг. Если не помогает — риф и закрутка стакселя.'; }
    else if (r > 6) { it.diag = `Руль тянет к ветру (${r0(r)}°) — перегружен грот`; it.act = 'Опустите каретку погона под ветер, подтяните фал и оттяжку, проверьте скрутку грота. Если стаксель сильно закручен, а грот полный — возьмите риф.'; }
    else if (r < -1) { it.diag = 'Лодка уваливается сама: стаксель перевешивает грот'; it.act = 'Выберите грот (гика-шкот или каретку погона на ветер) или немного закрутите стаксель.'; }
    else it.diag = `Крен ${r0(h)}°, руль ${r0(Math.max(0, r))}° — лодка сбалансирована`;
    add('heel', it);
  }

  /* --- палуба --- */
  if (mode === 'deck') {
    const it = { score: 1, diag: 'Все нагруженные снасти держат стопора или лебёдки', act: '' };
    const run = Object.keys(S.deck.running).filter(k => S.deck.running[k]);
    if (run.length) { it.score = 0; it.diag = `«${LINES[run[0]].short}» свободен и уходит под нагрузкой`; it.act = 'Закройте стопор или заведите снасть на лебёдку.'; }
    add('deck', it);
  }

  let sw = 0, ss = 0;
  for (const it of items) if (!it.na) { sw += it.w; ss += it.w * it.score; }
  return { items, score: sw ? ss / sw : 0 };
}
function topFix(items) {
  let best = null, bv = 0.02;
  for (const it of items) { if (it.na) continue; const v = it.w * (1 - it.score); if (v > bv) { bv = v; best = it; } }
  return best;
}

/* ---------- «Правильная настройка» для текущих условий ---------- */
function solveTrim(S) {
  const W = S.wind, B = S.boat;
  const twa = wrap180(W.twd - B.hdg), twaAbs = Math.abs(twa);
  const aw = apparent(W.tws, twa, Math.max(polarSpeed(W.tws, twaAbs) * 0.97, 0.01));
  const awaS = aw.awa, awaAbs = Math.abs(awaS);
  const T = computeTargets(W.tws, twaAbs, awaAbs, aw.aws);
  const Q = {};
  Q.reef = T.reef;
  const goose = twaAbs >= 155 && awaAbs > 120;
  const f = T.furl;
  Q.open = 1 - f; Q.goose = goose;
  const gamma = gammaOf(awaAbs), lee = -sgn(awaS);
  const jFill = goose ? -lee : lee;
  const jb = bestSail(jFill, awaS, gamma, W_JIB, 0, goose ? 30 : BOAT.jibMin, goose ? 88 : 62, T.tauJ);
  const e = Math.pow(Math.max(0, jb.d - BOAT.jibMin) / 51, 1 / 1.1);
  Q.jibSheet = clamp(e / 1.3, 0, 1);
  Q.car = clamp(0.5 - 0.45 * f + (T.tauJ - 4 - 14 * clamp(e, 0, 1.3)) / 30, 0, 1);
  Q.car = Math.round(Q.car * (BOAT.holes - 1)) / (BOAT.holes - 1);
  const upF = clamp((90 - awaAbs) / 50, 0, 1);
  const shift = 6 * (1 - f) * (goose ? 0.3 : 1) * upF;
  const mb = bestSail(lee, awaS, gamma, W_MAIN, shift, -6, BOAT.boomRec, T.tauM);
  const th = mb.d;
  const L = clamp(1 - (T.tauM - 4) / 26, 0, 1);
  let m = 0.3 * (1 - Math.pow(L, 1 / 0.8));
  let dTh = 80 * Math.pow(m, 1.3);
  let tl = (th - dTh) / BOAT.travRange;
  if (tl > 1) { tl = 1; dTh = th - BOAT.travRange; m = Math.pow(Math.max(0, dTh) / 80, 1 / 1.3); }
  if (tl < -0.7) { tl = -0.7; dTh = th + 0.7 * BOAT.travRange; m = Math.pow(Math.max(0, dTh) / 80, 1 / 1.3); }
  const sheetLeech = Math.pow(clamp(1 - m / 0.3, 0, 1), 0.8);
  const vNeed = L >= 0.95 ? 1 : Math.pow(L / 0.95, 1 / 0.9);
  let v = T.vangBase;
  if (sheetLeech < L - 0.01) v = vNeed; else v = Math.min(v, Math.max(0, vNeed - 0.02));
  Q.mainsheet = clamp(m, 0, 1); Q.travLee = clamp(tl, -1, 1); Q.vang = clamp(v, 0, 1);
  Q.backstay = clamp(T.backstay, 0, 1);
  const stretch = 0.004 * clamp((aw.aws - 10) / 10, -1, 1.5);
  Q.outhaul = clamp((0.165 - 0.03 * Q.backstay + stretch - T.depthM) / 0.035, 0, 1);
  Q.luff = clamp(0.5 + (0.47 + 0.035 * (aw.aws - 14) / 10 - T.pos) / 0.12, 0, 1);
  return Q;
}
function applySolution(S, Q) {
  Object.assign(S.quick, Q);
  const twa = wrap180(S.wind.twd - S.boat.hdg);
  const aw = apparent(S.wind.tws, twa, S.boat.bsp);
  const md = S.mode;
  applyQuick(S, aw.awa);
  if (md === 'deck') normalizeDeck(S);
  S.bestCache = null;
}

/* ---------- Сценарии ---------- */
const SCENARIOS = [
  { id: 'beat-header', group: 'Лавировка', title: 'Ветер зашёл на 20°', level: 1,
    brief: 'Крутой бейдевинд правым галсом, 12 узлов. Вы лавируете к знаку на ветре, паруса настроены. Скоро ветер зайдёт — сместится к носу на 20°.',
    setup: { tws: 12, twd: 0, hdg: 318 },
    events: [{ at: 7, kind: 'twd', delta: -20, dur: 3, text: 'Ветер зашёл на 20°: теперь он дует ближе к носу.' }],
    objective: { type: 'beat' },
    todo: ['Паруса заполоскали, а шкоты уже выбраны до упора — выбирать дальше некуда.', 'Увалитесь примерно на 20° — снова до 42–45° к ветру (курс около 298°).', 'Если сдвиг устойчивый — сделайте поворот оверштаг: на левом галсе этот заход станет отходом и курс пойдёт прямо на знак.'],
    why: 'На бейдевинде шкоты уже выбраны до предела, поэтому на заход ветра отвечают рулём: уваливаются, чтобы вернуть рабочий угол к ветру. Колдунчики подсказывают сразу: наветренные трепещут на всех высотах. На лавировке устойчивый заход — сигнал поворачивать на другой галс.' },
  { id: 'beat-lift', group: 'Лавировка', title: 'Ветер отошёл на 20°', level: 1,
    brief: 'Тот же бейдевинд правым галсом к знаку на ветре. Скоро ветер отойдёт — сместится к корме на 20°.',
    setup: { tws: 12, twd: 0, hdg: 318 },
    events: [{ at: 7, kind: 'twd', delta: 20, dur: 3, text: 'Ветер отошёл на 20°: теперь он дует больше сбоку.' }],
    objective: { type: 'beat' },
    todo: ['Подветренные колдунчики срываются: для нового угла паруса перетянуты.', 'Цель на ветре — поэтому не травите шкоты, а приводитесь примерно на 20° (курс около 338°), пока колдунчики снова не встанут ровно.'],
    why: 'Отход ветра на лавировке — подарок: можно идти острее, прямо к цели. Если вместо этого потравить шкоты, лодка ускорится, но пойдёт полнее и к знаку на ветре не приблизится. Приведитесь, сохранив настройку парусов.' },
  { id: 'tack', group: 'Лавировка', title: 'Поворот оверштаг', level: 2,
    brief: 'Крутой бейдевинд правым галсом, 12 узлов. Сделайте поворот оверштаг и настройтесь на левом галсе. В режиме «Палуба» шкоты перекладываете вы сами.',
    setup: { tws: 12, twd: 0, hdg: 318 },
    events: [],
    objective: { type: 'tack' },
    todo: ['Проверьте, что ленивый (наветренный) шкот лежит на своей лебёдке.', 'Приводитесь (или кнопка «Оверштаг»). Когда стаксель заполощет — отдайте рабочий шкот: снимите его с лебёдки.', 'Выберите новый подветренный шкот, пока колдунчики не встанут ровно.', 'Ложитесь на 42–45° к ветру. Каретку погона переставьте на новый подветренный борт.'],
    why: 'При повороте оверштаг нос проходит линию ветра. Старый шкот надо отдать вовремя: если держать его, стаксель встанет «на ветру» и затормозит лодку. Новый шкот выбирают быстро, пока стаксель не наполнился, — потом это тяжело. Каретку погона гика-шкота тоже переставляют: её положение считается от подветренного борта.' },
  { id: 'reach-header', group: 'Галфвинд и полные курсы', title: 'Галфвинд: ветер зашёл', level: 1,
    brief: 'Галфвинд левым галсом, курс 90° на остров, 12 узлов. Курс менять нельзя. Скоро ветер зайдёт на 20°.',
    setup: { tws: 12, twd: 0, hdg: 90 },
    events: [{ at: 7, kind: 'twd', delta: 20, dur: 3, text: 'Ветер зашёл на 20°: теперь это полный бейдевинд.' }],
    objective: { type: 'heading', hdg: 90, tol: 6 },
    todo: ['Курс держим на цель — 90°.', 'Наветренные колдунчики трепещут: выберите шкот стакселя и гика-шкот.', 'Погон поднимите ближе к центру; оттяжку гика можно ослабить — заднюю шкаторину теперь держит гика-шкот.', 'Шкот стакселя выбран сильнее — проверьте каретку: верх и низ должны заполаскивать одновременно.'],
    why: 'На свободных курсах при заходе ветра курс сохраняют, а паруса подбирают: угол атаки возвращается к норме, когда шкоты выбраны примерно на те же 20°. Главный индикатор — колдунчики стакселя: выбирайте, пока наветренные не перестанут трепетать.' },
  { id: 'reach-lift', group: 'Галфвинд и полные курсы', title: 'Галфвинд: ветер отошёл', level: 1,
    brief: 'Галфвинд левым галсом, курс 90° на остров, 12 узлов. Курс менять нельзя. Скоро ветер отойдёт на 20°.',
    setup: { tws: 12, twd: 0, hdg: 90 },
    events: [{ at: 7, kind: 'twd', delta: -20, dur: 3, text: 'Ветер отошёл на 20°: теперь это крутой бакштаг.' }],
    objective: { type: 'heading', hdg: 90, tol: 6 },
    todo: ['Курс держим — 90°.', 'Подветренные колдунчики срываются: потравите шкот стакселя и гика-шкот.', 'Гика-шкот потравлен — заднюю шкаторину теперь держит оттяжка гика: подтяните её.', 'Каретку стакселя чуть вперёд: при потравленном шкоте верх открывается слишком сильно.'],
    why: 'Когда ветер отходит, паруса перетянуты: поток срывается с подветренной стороны. Шкоты травят, пока подветренные колдунчики не потекут ровно. Чем дальше потравлен гика-шкот, тем меньше он тянет гик вниз — эту работу берёт на себя оттяжка гика.' },
  { id: 'close-reach', group: 'Галфвинд и полные курсы', title: 'Полный бейдевинд → крутой', level: 2,
    brief: 'Полный бейдевинд левым галсом, курс 65° к марине, 14 узлов. Скоро ветер зайдёт на 20°, но до цели ещё можно дойти без лавировки.',
    setup: { tws: 14, twd: 0, hdg: 65 },
    events: [{ at: 7, kind: 'twd', delta: 20, dur: 3, text: 'Ветер зашёл на 20°: курс стал крутым бейдевиндом.' }],
    objective: { type: 'heading', hdg: 65, tol: 6 },
    todo: ['Курс 65° сохраняем: угол к ветру 45° ещё рабочий.', 'Выберите шкоты стакселя и грота почти до упора — как на лавировке.', 'Каретку стакселя назад, в положение для бейдевинда.', 'Погон к центру, оттяжку ослабить, ахтерштаг подтянуть — как на крутом бейдевинде.'],
    why: 'Пока цель вне мёртвого сектора, курс сохраняют, а паруса переводят в настройку для бейдевинда. Это не только шкоты: каретка стакселя, погон и оттяжка гика тоже меняют роль.' },
  { id: 'broad-run', group: 'Бакштаг и фордевинд', title: 'Бакштаг → фордевинд', level: 2,
    brief: 'Полный бакштаг левым галсом, курс 140°, 14 узлов. Скоро ветер отойдёт ещё на 25°, и вы окажетесь почти на фордевинде.',
    setup: { tws: 14, twd: 0, hdg: 140 },
    events: [{ at: 7, kind: 'twd', delta: -25, dur: 3, text: 'Ветер отошёл на 25°: теперь он дует почти с кормы.' }],
    objective: { type: 'heading', hdg: 140, tol: 8 },
    todo: ['Курс сохраняем.', 'Гик вытравите почти перпендикулярно ветру, но не до краспиц.', 'Стаксель в тени грота: поставьте «бабочку» на выносном гике на другой борт или закрутите стаксель.', 'Оттяжку гика держите натянутой: она не даёт гику задираться и раскачивать лодку.'],
    why: 'На фордевинде парусa работают как «парашют», колдунчики почти бесполезны. Грот закрывает стаксель от ветра, поэтому его ставят бабочкой на другой борт или убирают. Гик не должен лечь на ванты: парус трётся о краспицы.' },
  { id: 'run-bylee', group: 'Бакштаг и фордевинд', title: 'Фордевинд: ветер «на раул»', level: 2,
    brief: 'Фордевинд, гик справа, 16 узлов, стаксель закручен. Скоро ветер сместится и задует со стороны гика — это опасно, реагировать нужно быстро.',
    setup: { tws: 16, twd: 0, hdg: 170, quick: { open: 0, goose: false } },
    events: [{ at: 7, kind: 'twd', delta: -14, dur: 3, text: 'Ветер сместился: дует со стороны гика — лодка идёт «на рауле».' },
      { at: 15, kind: 'twd', delta: -8, dur: 3, text: 'Ветер продолжает заходить со стороны гика.' }],
    objective: { type: 'run' },
    todo: ['Это «раул»: ветер дует с той же стороны, что и гик. Ещё 5° — и гик перебросит через кокпит.', 'Срочно приведитесь на 15–20° (влево), чтобы ветер снова дул с левой раковины.', 'Если нужно идти этим курсом — сделайте контролируемый поворот фордевинд: гика-шкот к центру, руль, потом потравить на новом борту.'],
    why: 'Самопроизвольный поворот фордевинд — одна из самых опасных ситуаций на яхте: гик с силой проходит над кокпитом. Если ветер зашёл со стороны гика, сначала уходят из опасного сектора рулём, а потом спокойно решают, менять ли галс.' },
  { id: 'gybe', group: 'Бакштаг и фордевинд', title: 'Поворот фордевинд', level: 3,
    brief: 'Полный бакштаг левым галсом, 14 узлов. Сделайте контролируемый поворот фордевинд на правый галс.',
    setup: { tws: 14, twd: 0, hdg: 155, quick: { open: 0, goose: false } },
    events: [],
    objective: { type: 'gybe' },
    todo: ['Выберите гика-шкот почти до центра (до 10–15°).', 'Уваливайтесь, пока корма не пройдёт линию ветра, — гик перейдёт спокойно.', 'Сразу потравите гика-шкот на новом борту и переставьте погон.', 'Если стаксель раскрыт — переложите шкоты.'],
    why: 'Неконтролируемый поворот фордевинд опасен для людей и такелажа: гик пролетает через кокпит. Поэтому гик сначала подтягивают к диаметральной плоскости — тогда ему некуда разгоняться — и только потом проводят корму через ветер.' },
  { id: 'build', group: 'Сила ветра', title: 'Ветер усилился до 22 узлов', level: 2,
    brief: 'Крутой бейдевинд правым галсом, 12 узлов, полные паруса. Скоро ветер усилится до 22 узлов.',
    setup: { tws: 12, twd: 0, hdg: 318 },
    events: [{ at: 7, kind: 'tws', to: 22, dur: 8, text: 'Ветер усиливается до 22 узлов.' }],
    objective: { type: 'beat' },
    todo: ['Сначала быстрые средства: каретку погона под ветер, ахтерштаг туго, аутхол и фал туже.', 'Каретку стакселя чуть назад — верх стакселя откроется, крен уменьшится.', 'Возьмите 1-й риф и закрутите стаксель на четверть-треть, каретку стакселя вперёд.', 'Цель — крен до 20° и руль, который почти не тянет к ветру.'],
    why: 'Перегруженная лодка кренится, уваливается под рулём и медленнее идёт против ветра. Разгружать начинают с настроек: плоские паруса и открытая скрутка уменьшают кренящую силу. Если этого мало — уменьшают площадь: риф и закрутка стакселя.' },
  { id: 'drop', group: 'Сила ветра', title: 'Ветер стих до 7 узлов', level: 2,
    brief: 'Крутой бейдевинд, 20 узлов: взят риф, стаксель частично закручен. Скоро ветер стихнет до 7 узлов.',
    setup: { tws: 20, twd: 0, hdg: 318 },
    events: [{ at: 7, kind: 'tws', to: 7, dur: 8, text: 'Ветер стихает до 7 узлов.' }],
    objective: { type: 'beat' },
    todo: ['Отдайте риф и раскройте стаксель полностью.', 'Каретку стакселя назад: стаксель снова полный.', 'Потравите ахтерштаг, аутхол и фал — паруса глубже и мощнее.', 'Погон к центру или чуть на ветер, гика-шкот немного потравить — больше скрутки в слабый ветер.'],
    why: 'В слабый ветер лодке нужна мощность: вся площадь и более глубокие паруса. Немного больше скрутки помогает потоку не срываться с верха паруса.' },
  { id: 'squall', group: 'Сила ветра', title: 'Шквал на полном курсе', level: 3,
    brief: 'Галфвинд правым галсом, курс 270°, 11 узлов. Приближается шквал: ветер усилится до 24 узлов и зайдёт на 15°.',
    setup: { tws: 11, twd: 0, hdg: 270 },
    events: [{ at: 6, kind: 'tws', to: 24, dur: 5, text: 'Шквал: ветер резко усиливается.' }, { at: 8, kind: 'twd', delta: -15, dur: 4, text: 'В шквале ветер заходит на 15°.' }],
    objective: { type: 'heading', hdg: 270, tol: 8 },
    todo: ['Курс держим 270°.', 'Крен растёт: потравите гика-шкот и опустите погон, грот можно немного разгрузить.', 'Возьмите 1-й риф, закрутите стаксель примерно на треть.', 'Ветер зашёл — подберите шкоты под новый угол, но паруса держите плоскими: аутхол, фал и ахтерштаг туго.'],
    why: 'В шквале сила ветра и его направление меняются одновременно. Первым делом снимают перегрузку (гика-шкот, погон), затем уменьшают площадь, и только потом точно подстраивают углы по колдунчикам.' }
];
function startScenario(S, id) {
  const def = SCENARIOS.find(s => s.id === id);
  if (!def) return;
  const W = S.wind;
  W.ramps = []; W.gusts = !!def.setup.gusts;
  W.baseTws = W.tws = def.setup.tws; W.baseTwd = W.twd = def.setup.twd;
  S.boat.hdg = def.setup.hdg; S.helm.auto = null; S.helm.cmd = 0;
  const twa = wrap180(def.setup.twd - def.setup.hdg);
  S.boomSide = -sgn(twa); S.boomAngle = 0;
  S.boat.bsp = polarSpeed(def.setup.tws, Math.abs(twa)) * 0.95;
  S.broachT = 0; S.broaching = 0; S.ironsT = 0;
  const Q = solveTrim(S);
  Object.assign(Q, def.setup.quick || {});
  if (def.setup.quick && def.setup.quick.open === 0) Q.car = Math.round(0.6 * (BOAT.holes - 1)) / (BOAT.holes - 1);
  applySolution(S, Q);
  S.deck.log = [];
  S.scn = { def, phase: def.events.length ? 'steady' : 'respond', t: 0, evIdx: 0, okT: 0, mistakes: [], tEvent: def.events.length ? null : 0, startTack: sgn(twa), lockUntil: 0, doneT: null };
  emit(S, 'scenarioStart', def.id);
}
function fireEvent(S) {
  const sc = S.scn; if (!sc) return;
  const ev = sc.def.events[sc.evIdx]; if (!ev) return;
  if (ev.kind === 'twd') setWind(S, { shift: ev.delta, dur: ev.dur });
  else if (ev.kind === 'tws') setWind(S, { toTws: ev.to, dur: ev.dur });
  emit(S, 'windEvent', ev.text);
  sc.evIdx++;
  sc.lockUntil = Math.max(sc.lockUntil, S.t + (ev.dur || 3) + 1);
  if (sc.phase !== 'respond') { sc.phase = 'respond'; sc.tEvent = sc.t; }
  // следующие события сдвигаются относительно текущего
  const nx = sc.def.events[sc.evIdx];
  if (nx) sc.nextAt = sc.t + (nx.at - ev.at);
}
function fireNow(S) {
  const sc = S.scn; if (!sc || sc.phase === 'done') return;
  if (sc.def.events[sc.evIdx]) fireEvent(S);
}
function scenarioTick(S, dt, D, sc0) {
  const sc = S.scn; if (!sc || sc.phase === 'done') return;
  sc.t += dt;
  const ev = sc.def.events[sc.evIdx];
  if (ev) {
    const at = sc.nextAt != null ? sc.nextAt : ev.at;
    if (sc.t >= at) fireEvent(S);
  }
  if (sc.phase === 'respond' && S.t >= sc.lockUntil && !sc.def.events[sc.evIdx]) {
    const course = sc0.items.find(i => i.id === 'course');
    const good = sc0.score >= 0.85 && course.status === 'ok' && !sc0.items.some(i => i.status === 'bad');
    sc.okT = good ? sc.okT + dt : 0;
    if (sc.okT >= 4) {
      sc.phase = 'done'; sc.doneT = sc.t - (sc.tEvent || 0);
      sc.finalScore = sc0.score;
      emit(S, 'scenarioDone', sc.def.id);
    }
  }
}
function randomEvent(S) {
  const r = Math.random();
  const twa = wrap180(S.wind.twd - S.boat.hdg);
  let text;
  if (r < 0.65) {
    const mag = 10 + Math.round(Math.random() * 15);
    const dir = Math.random() < 0.5 ? -1 : 1;
    setWind(S, { shift: dir * mag, dur: 3 });
    // заход = ветер смещается к носу: |TWA| уменьшается
    const after = Math.abs(wrap180(S.wind.baseTwd + dir * mag - S.boat.hdg));
    text = `Ветер ${after < Math.abs(twa) ? 'зашёл' : 'отошёл'} на ${mag}°.`;
  } else {
    const to = Math.round(clamp(S.wind.baseTws + (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 7), 5, 26));
    setWind(S, { toTws: to, dur: 6 });
    text = `Ветер ${to > S.wind.baseTws ? 'усиливается' : 'слабеет'} до ${to} уз.`;
  }
  emit(S, 'windEvent', text);
  return text;
}

/* ---------- Шаг симуляции ---------- */
function step(S, dt) {
  if (S.paused) return S.D;
  dt = Math.min(dt, 0.05);
  S.t += dt;
  updateWind(S, dt);
  updateHelm(S, dt);
  if (S.mode === 'quick') {
    const twa = wrap180(S.wind.twd - S.boat.hdg);
    applyQuick(S, apparent(S.wind.tws, twa, S.boat.bsp).awa);
  } else deckTick(S, dt);
  const D = derive(S);
  const B = S.boat;
  const tau = D.bspTarget > B.bsp ? 4 : 6;
  B.bsp += (D.bspTarget - B.bsp) * Math.min(1, dt / tau);
  B.heel += (D.heelTarget - B.heel) * Math.min(1, dt / 1.3);
  const ms = B.bsp * 0.5144;
  B.vx = ms * Math.sin(B.hdg * D2R); B.vz = -ms * Math.cos(B.hdg * D2R);
  B.dist += Math.abs(ms) * dt;
  D.bsp = B.bsp; D.heel = B.heel; D.vmg = B.bsp * Math.cos(D.twaAbs * D2R);
  // брочинг и левентик
  if (Math.abs(B.heel) > 30 && D.rudder > 10) S.broachT += dt; else S.broachT = Math.max(0, S.broachT - 2 * dt);
  if (S.broachT > 1.2 && S.broaching <= 0) { S.broaching = 2; S.broachT = 0; emit(S, 'broach'); }
  if (D.twaAbs < 30 && Math.abs(B.bsp) < 0.6) { S.ironsT += dt; if (S.ironsT > 4 && !S.ironsFlag) { S.ironsFlag = true; emit(S, 'irons'); } }
  else { S.ironsT = 0; S.ironsFlag = false; }
  if (S.crashT > 0) S.crashT -= dt;
  const sc = scoreItems(S, D);
  D.items = sc.items; D.score = sc.score; D.top = topFix(sc.items);
  S.D = D;
  if (S.scn) {
    for (const e of S.events) {
      if (e.t !== S.t || e.seen) continue;
      if (e.type === 'crash') S.scn.mistakes.push('Неконтролируемый поворот фордевинд: гик перебросило');
      if (e.type === 'run') S.scn.mistakes.push(`«${LINES[e.data].short}» ушёл под нагрузкой`);
      if (e.type === 'broach') S.scn.mistakes.push('Лодку развернуло к ветру (брочинг) — слишком много парусов');
      if (e.type === 'irons') S.scn.mistakes.push('Лодка встала в левентик и потеряла ход');
    }
    scenarioTick(S, dt, D, sc);
  }
  return D;
}

G.SIM = {
  BOAT, LINES, CLUTCH_LINES, WINCH_NAMES, WINCH_ACC, SCENARIOS, ITEM_DEFS, MSG,
  clamp, lerp, smooth, wrap180, wrap360, sgn, D2R, R2D,
  polarSpeed, optimalBeatTWA, optimalRunTWA, apparent, pointOfSail, mainHoist, computeTargets,
  createState, step, derive, setMode, applyQuick, rigToQuick, solveTrim, applySolution,
  setWind, startManeuver, startScenario, fireNow, randomEvent,
  winchFor, onWinch, isHeld, deckToggleClutch, deckToggleWinch, deckRelease, deckSetPole, normalizeDeck, log
};
})(typeof window !== 'undefined' ? window : globalThis);
