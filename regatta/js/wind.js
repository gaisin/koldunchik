/* ============================================================
   Колдунчик · Регата — ветер на дистанции (без DOM, работает и в Node)
   Средний ветер задаёт трасса. Поверх него:
   — колебания направления (заходы и отходы) с периодом в минуты; сдвиг
     приходит сверху по ветру раньше, чем снизу;
   — плавный сдвиг (тренд) и разница давления по ширине дистанции;
   — порывы и затишья: пятна, которые дрейфуют по ветру, усиливают
     или ослабляют ветер и немного меняют его направление.
   Всё детерминировано зерном трассы: одна и та же гонка повторяется точно.
   ============================================================ */
(function (G) {
'use strict';
const { lerp, smooth, wrap360 } = G.SIM;
const { KN, dirOf } = G.GEO;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Пятно порыва: эллипс, вытянутый по ветру (полуось вдоль ветра в 1/√ALONG раз длиннее),
// сила постоянна до EDGE радиуса и плавно спадает к краю — та же формула, что в шейдере моря.
const ALONG = 0.4, EDGE = 0.45;
const edgeK = e => (e >= 1 ? 0 : e <= EDGE ? 1 : 1 - smooth(EDGE, 1, e));

// w — ветер трассы, area — прямоугольник дистанции в осях трассы (u вправо, v на ветер).
function createWind(w, area, opts) {
  opts = opts || {};
  const rnd = mulberry32(w.seed || 1);
  const twd0 = w.twd, tws0 = w.tws;
  const U = dirOf(twd0), R = dirOf(twd0 + 90);
  const V = Math.max(1, tws0 * KN * 0.85); // скорость дрейфа порывов, м/с
  const osc = w.osc || [], oscS = w.oscS || [];
  const trend = w.trend || 0, grad = w.grad || {};
  const cx = area.cx, cy = area.cy;
  const toU = (x, y) => (x - cx) * R.x + (y - cy) * R.y;
  const toV = (x, y) => (x - cx) * U.x + (y - cy) * U.y;

  // расписание порывов на всю гонку
  const puffs = [];
  const P = w.puffs;
  if (P) {
    const tFrom = -(opts.before || 900), tTo = opts.until || 7200;
    let t = tFrom;
    while (t < tTo) {
      t += -Math.log(1 - rnd() * 0.999) * P.every;
      const life = lerp(P.life[0], P.life[1], rnd());
      const lull = rnd() < (P.lull || 0);
      puffs.push({
        t0: t, life,
        u0: lerp(area.uMin - 120, area.uMax + 120, rnd()),
        v0: lerp(area.vMin - 80, area.vMax + V * life * 0.8, rnd()),
        r: lerp(P.r[0], P.r[1], rnd()),
        gain: lull ? -lerp(0.12, 0.24, rnd()) : lerp(P.gain[0], P.gain[1], rnd()),
        shift: lerp(P.shift[0], P.shift[1], rnd())
      });
    }
  }
  const envOf = (p, t) => { const k = (t - p.t0) / p.life; return k <= 0 || k >= 1 ? 0 : smooth(0, 0.18, k) * (1 - smooth(0.75, 1, k)); };
  // порывы, видимые в момент t: центр на карте, радиус, сила с учётом проявления
  function puffsAt(t) {
    const out = [];
    for (const p of puffs) {
      if (t < p.t0 || t >= p.t0 + p.life) continue;
      const k = envOf(p, t);
      if (k < 0.02) continue;
      const u = p.u0, v = p.v0 - V * (t - p.t0);
      out.push({ x: cx + u * R.x + v * U.x, y: cy + u * R.y + v * U.y, r: p.r, gain: p.gain, k, shift: p.shift });
    }
    return out;
  }
  // средний ветер (без порывов) в точке: направление и множитель силы
  function base(x, y, t) {
    const u = toU(x, y), v = toV(x, y);
    const te = t + v / V;
    let twd = twd0 + trend * te / 60 + (grad.twd || 0) * u / 1000;
    for (const o of osc) twd += o[0] * Math.sin(2 * Math.PI * te / o[1] + o[2]);
    let k = 1 + (grad.tws || 0) * u / 1000;
    for (const o of oscS) k += o[0] * Math.sin(2 * Math.PI * te / o[1] + o[2]);
    return { twd, k };
  }
  // ветер в точке карты в момент t
  function sample(x, y, t, list) {
    const b = base(x, y, t);
    let tws = tws0 * b.k, twd = b.twd;
    const act = list || null;
    const consider = p => {
      const dx = x - p.x, dy = y - p.y;
      const a = dx * U.x + dy * U.y, c = dx * R.x + dy * R.y;
      const f = p.k * edgeK(Math.sqrt(a * a * ALONG + c * c) / p.r);
      tws += tws0 * p.gain * f; twd += p.shift * f;
    };
    if (act) for (const p of act) consider(p);
    else for (const p of puffs) {
      if (t < p.t0 || t >= p.t0 + p.life) continue;
      const k = envOf(p, t); if (k < 0.02) continue;
      const u = p.u0, v = p.v0 - V * (t - p.t0);
      consider({ x: cx + u * R.x + v * U.x, y: cy + u * R.y + v * U.y, r: p.r, gain: p.gain, shift: p.shift, k });
    }
    return { tws: Math.max(0, tws), twd: wrap360(twd) };
  }
  return { twd0, tws0, U, R, drift: V, puffs, puffsAt, sample, base, along: ALONG };
}

G.KWIND = { createWind, mulberry32 };
})(typeof window !== 'undefined' ? window : globalThis);
