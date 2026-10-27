/* ============================================================
   Колдунчик · Регата — геометрия на карте (без DOM, работает и в Node)
   Карта: x — восток, y — север, метры. Пеленг — от севера по часовой стрелке.
   В 3D (scene.js) та же точка — (x, 0, −y): ось z мира смотрит на юг.
   Угол точки вокруг центра (angOf) — математический: против часовой стрелки плюс.
   ============================================================ */
(function (G) {
'use strict';
const { D2R, R2D, wrap360, clamp } = G.SIM;

const KN = 0.5144; // м/с в узле
const vec = (x, y) => ({ x, y });
const dirOf = b => vec(Math.sin(b * D2R), Math.cos(b * D2R));
const bearing = (from, to) => wrap360(Math.atan2(to.x - from.x, to.y - from.y) * R2D);
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const angOf = (p, c) => Math.atan2(p.y - c.y, p.x - c.x) * R2D;
const mathDir = a => vec(Math.cos(a * D2R), Math.sin(a * D2R));
const add = (a, b, k) => vec(a.x + b.x * (k == null ? 1 : k), a.y + b.y * (k == null ? 1 : k));
const sub = (a, b) => vec(a.x - b.x, a.y - b.y);
const dot = (a, b) => a.x * b.x + a.y * b.y;
const norm = a => { const l = Math.hypot(a.x, a.y) || 1; return vec(a.x / l, a.y / l); };
// поворот вектора на 90° вправо (по часовой) и влево
const right = a => vec(a.y, -a.x);
const left = a => vec(-a.y, a.x);

// Ближайшая к p точка отрезка ab: параметр t ∈ [0, 1], сама точка и расстояние.
function closestOnSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  const t = L2 > 1e-12 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / L2, 0, 1) : 0;
  const x = a.x + dx * t, y = a.y + dy * t;
  return { t, x, y, d: Math.hypot(p.x - x, p.y - y) };
}

// Кратчайшее расстояние между отрезками p1q1 и p2q2 и ближайшие точки на них.
function segSeg(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s, t;
  if (a <= 1e-12 && e <= 1e-12) { s = 0; t = 0; }
  else if (a <= 1e-12) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = dot(d1, r);
    if (e <= 1e-12) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = dot(d1, d2), den = a * e - b * b;
      s = den > 1e-12 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  const c1 = add(p1, d1, s), c2 = add(p2, d2, t);
  return { d: dist(c1, c2), c1, c2 };
}

// Линия между точками a и b; нормаль n смотрит в сторону toward.
function lineOf(a, b, toward) {
  const len = dist(a, b), along = norm(sub(b, a));
  let n = left(along);
  const mid = vec((a.x + b.x) / 2, (a.y + b.y) / 2);
  if (toward && dot(n, sub(toward, mid)) < 0) n = vec(-n.x, -n.y);
  return { a, b, mid, along, n, len };
}
// Знаковое расстояние точки до линии: плюс — по нормали.
const sideOf = (L, p) => dot(sub(p, L.a), L.n);
// Параметр проекции точки на линию: 0 — конец a, 1 — конец b.
const alongOf = (L, p) => dot(sub(p, L.a), L.along) / (L.len || 1);

G.GEO = { KN, vec, dirOf, bearing, dist, angOf, mathDir, add, sub, dot, norm, right, left, closestOnSeg, segSeg, lineOf, sideOf, alongOf };
})(typeof window !== 'undefined' ? window : globalThis);
