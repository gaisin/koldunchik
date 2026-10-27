/* ============================================================
   Колдунчик — приборы на холсте: циферблат ветра и табло колдунчиков.
   Общие для тренажёра и регаты: тексты — через I18N, данные — из SIM.derive.
   ============================================================ */
(function (G) {
'use strict';
const I18N = G.I18N;
const { D2R } = G.SIM;
const t = (k, ...a) => I18N.t(k, ...a);
const r0 = Math.round;

function fitCanvas(cv) {
  const dpr = Math.min(G.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return null;
  if (cv.width !== r0(w * dpr) || cv.height !== r0(h * dpr)) { cv.width = r0(w * dpr); cv.height = r0(h * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  return { g, w, h };
}
const FONT = '"Sofia Sans Condensed", "Arial Narrow", sans-serif';
function drawWindDial(cv, D) {
  const c = fitCanvas(cv); if (!c || !D) return;
  const { g, w, h } = c, cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 3;
  const A = a => (a - 90) * D2R;
  g.lineWidth = 1; g.strokeStyle = 'rgba(234,243,246,0.2)'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  g.lineWidth = R * 0.1; g.lineCap = 'butt';
  g.strokeStyle = '#e0474c'; g.beginPath(); g.arc(cx, cy, R * 0.87, A(-60), A(-20)); g.stroke();
  g.strokeStyle = '#2bbf6a'; g.beginPath(); g.arc(cx, cy, R * 0.87, A(20), A(60)); g.stroke();
  for (let a = 0; a < 360; a += 10) {
    const big = a % 30 === 0, r1 = R * (big ? 0.74 : 0.79), r2 = R * 0.95;
    g.strokeStyle = big ? 'rgba(234,243,246,0.85)' : 'rgba(234,243,246,0.35)'; g.lineWidth = big ? 1.5 : 1;
    g.beginPath(); g.moveTo(cx + r1 * Math.cos(A(a)), cy + r1 * Math.sin(A(a))); g.lineTo(cx + r2 * Math.cos(A(a)), cy + r2 * Math.sin(A(a))); g.stroke();
  }
  g.fillStyle = 'rgba(234,243,246,0.7)'; g.font = `600 ${Math.max(8, R * 0.14)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const a of [60, 120]) for (const s of [1, -1]) g.fillText(String(a), cx + R * 0.6 * Math.cos(A(s * a)), cy + R * 0.6 * Math.sin(A(s * a)));
  const bl = R * 0.4;
  g.fillStyle = 'rgba(234,243,246,0.16)';
  g.beginPath(); g.moveTo(cx, cy - bl);
  g.bezierCurveTo(cx + bl * 0.44, cy - bl * 0.35, cx + bl * 0.36, cy + bl * 0.6, cx + bl * 0.26, cy + bl * 0.78);
  g.lineTo(cx - bl * 0.26, cy + bl * 0.78);
  g.bezierCurveTo(cx - bl * 0.36, cy + bl * 0.6, cx - bl * 0.44, cy - bl * 0.35, cx, cy - bl); g.fill();
  const needle = (ang, col, len, wdt) => {
    const a = A(ang), tx = cx + len * Math.cos(a), ty = cy + len * Math.sin(a);
    g.strokeStyle = col; g.lineWidth = wdt; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx + R * 0.3 * Math.cos(a), cy + R * 0.3 * Math.sin(a)); g.lineTo(tx, ty); g.stroke();
    g.fillStyle = col; g.beginPath();
    g.moveTo(cx + (len + R * 0.08) * Math.cos(a), cy + (len + R * 0.08) * Math.sin(a));
    g.lineTo(tx + R * 0.07 * Math.cos(a + Math.PI / 2), ty + R * 0.07 * Math.sin(a + Math.PI / 2));
    g.lineTo(tx - R * 0.07 * Math.cos(a + Math.PI / 2), ty - R * 0.07 * Math.sin(a + Math.PI / 2)); g.fill();
  };
  needle(D.twa, '#7fd0ff', R * 0.8, Math.max(2, R * 0.035));
  needle(D.awa, '#ff6fc0', R * 0.82, Math.max(3, R * 0.06));
  g.fillStyle = '#eaf3f6'; g.font = `700 ${R * 0.27}px ${FONT}`; g.fillText(`${r0(D.awaAbs)}°`, cx, cy - R * 0.03);
  g.fillStyle = 'rgba(234,243,246,0.72)'; g.font = `600 ${R * 0.13}px ${FONT}`; g.fillText(t('dial_true', r0(D.twaAbs)), cx, cy + R * 0.2);
}

/* ---------- колдунчики (2D-табло) ---------- */
const TELL_MODE = { ok: ['stream', 'stream'], wind: ['flutter', 'stream'], luff: ['whip', 'flutter'], lee: ['stream', 'lift'], stall: ['stream', 'curl'], limp: ['hang', 'hang'], aback: ['whip', 'whip'], flog: ['whip', 'whip'], pole: ['curl', 'curl'] };
const RIB = { stream: [0, 0.07, 7], flutter: [-0.95, 0.55, 17], whip: [-0.5, 1.2, 25], lift: [-1.05, 0.3, 5], curl: [-2.3, 0.35, 3], hang: [1.45, 0.1, 2] };
const tellDot = st => (st === 'ok' ? '#3cd18a' : (st === 'wind' || st === 'lee' || st === 'pole' || st === 'limp') ? '#f2be4b' : '#ff7b6e');
const jibCols = D => (D.jib.fill < 0 ? ['#2bbf6a', '#ec4a50'] : ['#ec4a50', '#2bbf6a']);
// У каждого табло своё время анимации и сглаживание колдунчиков задней шкаторины.
function createTell() {
  let tellT = 0, furl = 0;
  const leechVis = [0, 0, 0, 0], leechSeed = [0.7, 2.3, 3.9, 5.1];
  function ribbon(g, x, y, mode, color, len, seed, lw) {
    const P = RIB[mode] || RIB.stream;
    g.strokeStyle = color; g.lineWidth = lw || 3; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(x, y);
    let px = x, py = y;
    for (let i = 1; i <= 7; i++) {
      const a = P[0] + P[1] * Math.sin(tellT * P[2] + i * 0.9 + seed) * (0.3 + i / 7);
      px += Math.cos(a) * len / 7; py += Math.sin(a) * len / 7; g.lineTo(px, py);
    }
    g.stroke();
  }
  function updateLeech(D) {
    for (let idx = 0; idx < 4; idx++) {
      const p = D.tell.main[idx];
      const wob = 0.5 + 0.5 * Math.sin(tellT * 0.9 + leechSeed[idx]) * Math.sin(tellT * 0.37 + leechSeed[idx] * 2);
      leechVis[idx] += ((p > wob ? 1 : 0) - leechVis[idx]) * 0.12;
    }
  }
  function drawTellFull(g, w, h, D) {
    g.save(); g.scale(w / 236, h / 150);
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.font = `700 10px ${FONT}`; g.fillStyle = '#93b2c0';
    g.fillText(t('tt_genoa'), 4, 8); g.fillText(t('tt_main'), 168, 8);
    g.font = `600 10px ${FONT}`; g.textAlign = 'center';
    g.fillText(t('tt_win'), 68, 23); g.fillText(t('tt_lee'), 114, 23);
    g.textAlign = 'left';
    const [winCol, leeCol] = jibCols(D);
    [['tt_top', 2], ['tt_mid', 1], ['tt_low', 0]].forEach(([name, i], r) => {
      const y = 44 + r * 33;
      g.fillStyle = 'rgba(234,243,246,0.86)'; g.font = `600 11px ${FONT}`; g.fillText(t(name), 4, y);
      if (furl >= 0.97) { g.fillStyle = '#93b2c0'; g.fillText(t('tt_furled'), 52, y); return; }
      const st = D.tell.jib[i], m = TELL_MODE[st] || TELL_MODE.ok;
      g.strokeStyle = 'rgba(234,243,246,0.3)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(50, y - 9); g.lineTo(50, y + 9); g.moveTo(96, y - 9); g.lineTo(96, y + 9); g.stroke();
      ribbon(g, 51, y, m[0], winCol, 34, i * 1.7);
      ribbon(g, 97, y, m[1], leeCol, 34, i * 2.3 + 1);
      g.fillStyle = tellDot(st); g.beginPath(); g.arc(146, y, 3.6, 0, Math.PI * 2); g.fill();
    });
    const xl = y => 172 + 34 * (y - 18) / 124;
    g.strokeStyle = 'rgba(234,243,246,0.35)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(168, 18); g.lineTo(168, 142); g.lineTo(206, 142); g.moveTo(172, 18); g.lineTo(206, 142); g.stroke();
    const hp = D.hoist;
    [0.86, 0.64, 0.42, 0.2].forEach((vv, k) => {
      const idx = 3 - k, y = 142 - vv * 124, x = xl(y);
      if (hp.headH < 0.3 || vv < hp.sBottom + 0.03) return;
      ribbon(g, x, y, leechVis[idx] > 0.5 ? 'curl' : 'stream', '#f2552c', 26, idx * 1.3);
    });
    g.restore();
  }
  function drawTellCompact(g, w, h, D) {
    g.save(); g.scale(w / 140, h / 66);
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.font = `600 8.5px ${FONT}`; g.fillStyle = '#93b2c0';
    g.textAlign = 'center'; g.fillText(t('tt_win_s'), 20, 6); g.fillText(t('tt_lee_s'), 54, 6);
    g.textAlign = 'left'; g.fillText(t('tt_main_s'), 104, 6);
    const [winCol, leeCol] = jibCols(D);
    if (furl >= 0.97) { g.fillStyle = '#93b2c0'; g.font = `600 10px ${FONT}`; g.fillText(t('tt_furled_long'), 6, 36); }
    else [2, 1, 0].forEach((i, r) => {
      const y = 21 + r * 16, st = D.tell.jib[i], m = TELL_MODE[st] || TELL_MODE.ok;
      g.strokeStyle = 'rgba(234,243,246,0.3)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(5, y - 6); g.lineTo(5, y + 6); g.moveTo(39, y - 6); g.lineTo(39, y + 6); g.stroke();
      ribbon(g, 6, y, m[0], winCol, 27, i * 1.7, 2.4);
      ribbon(g, 40, y, m[1], leeCol, 27, i * 2.3 + 1, 2.4);
      g.fillStyle = tellDot(st); g.beginPath(); g.arc(80, y, 3, 0, Math.PI * 2); g.fill();
    });
    g.strokeStyle = 'rgba(234,243,246,0.35)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(98, 13); g.lineTo(120, 63); g.stroke();
    const hp = D.hoist;
    [0.86, 0.64, 0.42, 0.2].forEach((vv, k) => {
      const idx = 3 - k;
      if (hp.headH < 0.3 || vv < hp.sBottom + 0.03) return;
      const y = 63 - vv * 50, x = 120 - vv * 22;
      ribbon(g, x, y, leechVis[idx] > 0.5 ? 'curl' : 'stream', '#f2552c', 14, idx * 1.3, 2.2);
    });
    g.restore();
  }
  function draw(cv, D, furlNow, dt) {
    const c = fitCanvas(cv); if (!c || !D) return;
    furl = furlNow; tellT += dt; updateLeech(D);
    if (c.w < 200) drawTellCompact(c.g, c.w, c.h, D); else drawTellFull(c.g, c.w, c.h, D);
  }
  return { draw };
}

G.KGauges = { fitCanvas, FONT, drawWindDial, createTell };
})(window);
