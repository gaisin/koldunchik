/* ============================================================
   Колдунчик · Регата — карта дистанции (2D-холст).
   Ветер сверху: ось трассы смотрит вверх, отклонение стрелки ветра —
   его сдвиг. Видны отмели, острова, камни, буи, порывы и затишья,
   линии старта и финиша, знаки (следующий — со стрелкой огибания),
   лейлайны к следующей цели, путь лодки и сама лодка.
   Два масштаба: «Отрезок» (лодка и цель) и «Вся трасса».
   ============================================================ */
(function (G) {
'use strict';
const SIM = G.SIM, GEO = G.GEO, I18N = G.I18N, KG = G.KGauges;
const { clamp, wrap180, D2R } = SIM;
const t = (k, ...a) => I18N.t(k, ...a);

function createMap(cv) {
  const st = { mode: 'leg', k: 0, cu: 0, cv: 0, ready: false, pulse: 0 };

  function draw(race, b, tgt, dt) {
    const c = KG.fitCanvas(cv);
    if (!c || !race) return;
    const { g, w: W, h: H } = c, C = race.C, U = C.U, R = C.R;
    st.pulse += dt || 0;
    const uv = p => ({ u: p.x * R.x + p.y * R.y, v: p.x * U.x + p.y * U.y });
    g.fillStyle = '#2d6888'; g.fillRect(0, 0, W, H);
    // масштаб и центр
    let pts;
    if (st.mode === 'course') {
      const B = C.bounds;
      pts = [{ x: B.minX, y: B.minY }, { x: B.maxX, y: B.minY }, { x: B.minX, y: B.maxY }, { x: B.maxX, y: B.maxY }].map(uv);
    } else {
      pts = [uv(b)];
      if (tgt && tgt.pos) pts.push(uv(tgt.pos));
      if (tgt && tgt.line) { pts.push(uv(tgt.line.a)); pts.push(uv(tgt.line.b)); }
    }
    let u0 = Math.min(...pts.map(p => p.u)), u1 = Math.max(...pts.map(p => p.u)), v0 = Math.min(...pts.map(p => p.v)), v1 = Math.max(...pts.map(p => p.v));
    const minHalf = st.mode === 'course' ? 0 : 180;
    const cu = (u0 + u1) / 2, cvv = (v0 + v1) / 2;
    const hu = Math.max((u1 - u0) / 2 * 1.18 + 30, minHalf), hv = Math.max((v1 - v0) / 2 * 1.18 + 30, minHalf);
    const k = Math.min(W / 2 / hu, H / 2 / hv);
    // плавно, чтобы карта не дёргалась
    const a = st.ready ? clamp((dt || 0) * 3, 0, 1) : 1;
    st.k += (k - st.k) * a; st.cu += (cu - st.cu) * a; st.cv += (cvv - st.cv) * a; st.ready = true;
    const K = st.k;
    const S = p => { const q = uv(p); return [W / 2 + (q.u - st.cu) * K, H / 2 - (q.v - st.cv) * K]; };
    const circle = (p, r, fill, stroke, lw) => { const [x, y] = S(p); g.beginPath(); g.arc(x, y, Math.max(r * K, 0.8), 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1; g.stroke(); } };

    // порывы и затишья: эллипсы вдоль ветра, как пятна на воде
    for (const p of race.puffs) {
      const [x, y] = S(p), rx = p.r * K, ry = p.r * K * 1.58;
      if (rx < 0.5) continue;
      const al = clamp(Math.abs(p.gain) / 0.26, 0, 1) * p.k;
      const gr = g.createRadialGradient(x, y, 0, x, y, ry);
      const col = p.gain > 0 ? `rgba(6,26,44,${0.62 * al})` : `rgba(190,226,240,${0.4 * al})`;
      gr.addColorStop(0, col); gr.addColorStop(0.45, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.save(); g.translate(x, y); g.scale(rx / ry, 1); g.translate(-x, -y);
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, ry, 0, Math.PI * 2); g.fill(); g.restore();
    }
    // мели, острова, камни, буи
    for (const sh of C.shoals) for (const bl of sh.blobs) circle(bl.pos, bl.r, 'rgba(78,196,182,0.55)');
    for (const isl of C.islands) for (const bl of isl.blobs) circle(bl.pos, bl.r * 1.12, 'rgba(78,196,182,0.35)');
    for (const isl of C.islands) for (const bl of isl.blobs) circle(bl.pos, bl.r, '#d8c79b');
    for (const isl of C.islands) for (const bl of isl.blobs) circle(bl.pos, bl.r * 0.86, '#6f8c4b');
    for (const r of C.rocks) { circle(r.pos, r.r + 4, 'rgba(255,255,255,0.35)'); circle(r.pos, r.r, '#4c463e'); }
    for (const bu of C.buoys) { const [x, y] = S(bu.pos); g.fillStyle = '#f2c21b'; g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill(); g.fillStyle = '#22262b'; g.fillRect(x - 1, y - 1, 2, 2); }

    // линии старта и финиша
    const line = (L, col, dash) => {
      const [x0, y0] = S(L.a), [x1, y1] = S(L.b);
      g.setLineDash(dash); g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.setLineDash([]);
    };
    const showStart = !tgt || tgt.kind === 'start' || tgt.kind === 'ocs';
    line(C.start, showStart ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.35)', [4, 3]);
    if (!C.finish.same) line(C.finish, tgt && tgt.kind === 'finish' ? '#7fb8ff' : 'rgba(127,184,255,0.45)', [2, 2]);
    else if (tgt && tgt.kind === 'finish') line(C.finish, '#7fb8ff', [2, 2]);
    for (const cb of C.boats) { const [x, y] = S(cb.pos); g.fillStyle = '#f3f5f2'; g.fillRect(x - 2.5, y - 2.5, 5, 5); }
    for (const L of [C.start].concat(C.finish.same ? [] : [C.finish])) { const [x, y] = S(L.pin); g.fillStyle = '#ffb21a'; g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill(); }

    // лейлайны к знаку или финишу, направление на цель
    if (tgt && tgt.pos && tgt.kind !== 'done') {
      const w = race.wind.sample(tgt.pos.x, tgt.pos.y, race.t, race.puffs);
      const rel = Math.abs(wrap180(GEO.bearing(b, tgt.pos) - w.twd));
      const beat = SIM.optimalBeatTWA(w.tws), run = SIM.optimalRunTWA(w.tws);
      let dirs = null;
      if (tgt.kind !== 'mark' && tgt.kind !== 'finish') dirs = null;
      else if (rel < beat + 6) dirs = [w.twd + 180 - beat, w.twd + 180 + beat];
      else if (rel > run - 6) dirs = [w.twd - (180 - run), w.twd + (180 - run)];
      if (dirs) {
        const [x0, y0] = S(tgt.pos);
        g.strokeStyle = 'rgba(255,214,102,0.75)'; g.lineWidth = 1.2; g.setLineDash([5, 4]);
        for (const d of dirs) {
          const e = GEO.add(tgt.pos, GEO.dirOf(d), 3000), [x1, y1] = S(e);
          g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        }
        g.setLineDash([]);
      }
      // направление на цель
      const [bx, by] = S(b), [tx, ty] = S(tgt.pos);
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; g.setLineDash([2, 4]);
      g.beginPath(); g.moveTo(bx, by); g.lineTo(tx, ty); g.stroke(); g.setLineDash([]);
    }

    // знаки
    const order = C.def.legs.map(l => l[0]);
    for (const id in C.marks) {
      const m = C.marks[id], [x, y] = S(m.pos), next = tgt && tgt.kind === 'mark' && tgt.mark.id === id;
      const nums = order.map((o, i) => (o === id ? i + 1 : 0)).filter(Boolean).join('·');
      g.fillStyle = '#ff7a1c'; g.beginPath(); g.arc(x, y, next ? 4.2 : 3, 0, Math.PI * 2); g.fill();
      g.font = `700 ${next ? 12 : 10}px ${KG.FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillStyle = next ? '#fff' : 'rgba(255,255,255,0.75)'; g.fillText(nums, x + 6, y - 6);
    }
    if (tgt && tgt.kind === 'mark') {
      const leg = tgt.leg, [x, y] = S(tgt.mark.pos), col = leg.side > 0 ? '#ff5a63' : '#3be08a';
      const pr = 7 + 3 * (0.5 + 0.5 * Math.sin(st.pulse * 4));
      g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.arc(x, y, pr, 0, Math.PI * 2); g.stroke();
      // дуга огибания: угол на карте α в осях трассы — это α + twd, на холсте ось y смотрит вниз
      const half = Math.min(75, leg.wreq / 2 - 8) * D2R, base = -(leg.beta + C.twd) * D2R, rr = 13;
      g.beginPath(); g.arc(x, y, rr, base - half, base + half); g.stroke();
      const endA = leg.side > 0 ? base - half : base + half, hx = x + Math.cos(endA) * rr, hy = y + Math.sin(endA) * rr;
      const tang = endA + (leg.side > 0 ? -Math.PI / 2 : Math.PI / 2);
      g.fillStyle = col; g.beginPath();
      g.moveTo(hx + Math.cos(tang) * 5, hy + Math.sin(tang) * 5);
      g.lineTo(hx + Math.cos(tang + 2.5) * 4, hy + Math.sin(tang + 2.5) * 4);
      g.lineTo(hx + Math.cos(tang - 2.5) * 4, hy + Math.sin(tang - 2.5) * 4); g.fill();
    }

    // соперники
    for (const o of race.boats) {
      if (!o.rival) continue;
      const [x, y] = S(o), a = (o.S.boat.hdg - C.twd) * D2R, s = Math.max(4, 11 * K);
      g.save(); g.translate(x, y); g.rotate(a);
      g.globalAlpha = o.finishT != null ? 0.45 : 1;
      g.fillStyle = '#' + o.color.toString(16).padStart(6, '0'); g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, -s * 0.75); g.lineTo(s * 0.33, s * 0.55); g.lineTo(-s * 0.33, s * 0.55); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
    // путь лодки и лодка
    if (b.trail.length > 1) {
      g.strokeStyle = 'rgba(255,111,192,0.5)'; g.lineWidth = 1.2; g.beginPath();
      b.trail.forEach((p, i) => { const [x, y] = S(p); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      const [x, y] = S(b); g.lineTo(x, y); g.stroke();
    }
    {
      const [x, y] = S(b), a = (b.S.boat.hdg - C.twd) * D2R, s = Math.max(5, 13 * K);
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = '#ff4fb0'; g.strokeStyle = '#fff'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(0, -s * 0.75); g.quadraticCurveTo(s * 0.42, -s * 0.1, s * 0.3, s * 0.55); g.lineTo(-s * 0.3, s * 0.55); g.quadraticCurveTo(-s * 0.42, -s * 0.1, 0, -s * 0.75);
      g.fill(); g.stroke(); g.restore();
    }

    // расстояние до цели
    if (tgt && tgt.kind !== 'done') {
      const name = tgt.kind === 'mark' ? String(tgt.n) : t(tgt.kind === 'finish' ? 'map_finish' : 'map_start');
      const txt = `${name} · ${t('dist', tgt.dist)}`;
      g.font = `700 11px ${KG.FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
      const tw = g.measureText(txt).width;
      g.fillStyle = 'rgba(7,20,30,0.62)'; g.fillRect(5, H - 21, tw + 12, 16);
      g.fillStyle = tgt.kind === 'mark' ? (tgt.side > 0 ? '#ff7a82' : '#4be596') : '#eaf3f6';
      g.fillText(txt, 11, H - 13);
    }
    // ветер и север
    const wb = race.wind.sample(b.x, b.y, race.t, race.puffs);
    {
      const x = 16, y = 18, a = (wb.twd - C.twd) * D2R;
      g.save(); g.translate(x, y); g.rotate(a);
      g.strokeStyle = '#7fd0ff'; g.fillStyle = '#7fd0ff'; g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(0, -9); g.lineTo(0, 6); g.stroke();
      g.beginPath(); g.moveTo(0, 10); g.lineTo(-4.5, 3); g.lineTo(4.5, 3); g.fill();
      g.restore();
      g.font = `700 11px ${KG.FONT}`; g.fillStyle = '#eaf3f6'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(`${wb.tws.toFixed(0)} ${t('kn')}`, x + 10, y);
    }
    {
      const x = W - 13, y = 15, a = -C.twd * D2R;
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = 'rgba(234,243,246,0.8)'; g.beginPath(); g.moveTo(0, -8); g.lineTo(3.4, 3); g.lineTo(-3.4, 3); g.fill();
      g.restore();
      g.font = `700 9px ${KG.FONT}`; g.fillStyle = 'rgba(234,243,246,0.8)'; g.textAlign = 'center';
      g.fillText(t('dial_n'), x, y + 13);
    }
  }
  function toggle() { st.mode = st.mode === 'leg' ? 'course' : 'leg'; return st.mode; }
  return { draw, toggle, get mode() { return st.mode; }, reset() { st.ready = false; } };
}

G.KMap = { createMap };
})(window);
