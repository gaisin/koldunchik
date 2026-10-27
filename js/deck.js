/* ============================================================
   Колдунчик — режим «Палуба»: схема кокпита со стопорами, лебёдками,
   каретками и погоном, карточка выбранной снасти и журнал.
   Общий для тренажёра и регаты. Здесь же мелкие помощники элементов
   управления: удержание кнопки и кружок оценки с подсказкой.
   ============================================================ */
(function (G) {
'use strict';
const SIM = G.SIM, I18N = G.I18N;
const { clamp, LINES, BOAT } = SIM;
const t = (k, ...a) => I18N.t(k, ...a);
const r0 = Math.round;
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const pct = v => `${r0(v * 100)}%`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- удержание кнопки ---------- */
function holdable(el, start, end) {
  let active = false;
  const on = e => { if (active) return; active = true; el.classList.add('on'); start(); if (e && e.pointerId != null) { try { el.setPointerCapture(e.pointerId); } catch (_) { /* нет захвата */ } } if (e) e.preventDefault(); };
  const off = () => { if (!active) return; active = false; el.classList.remove('on'); end(); };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
  el.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) on(e); });
  el.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') off(); });
  el.addEventListener('blur', off);
  el.addEventListener('contextmenu', e => e.preventDefault());
}

/* ---------- оценка рядом с настройкой ---------- */
const ST_SYM = { ok: '✓', warn: '!', bad: '✕', na: '–' };
const stTxt = s => t('st_' + s);
const itemOf = (D, id) => (D && id ? D.items.find(x => x.id === id) : null);
function setSt(btn, it) { const st = it ? it.status : 'na'; btn.className = `st st-${st}`; btn.textContent = ST_SYM[st]; }
function fillHint(box, it) {
  const st = it ? it.status : 'na';
  box.className = `ihint st-${st}`;
  box.querySelector('b').textContent = it ? it.name : '';
  box.querySelector('span').textContent = stTxt(st);
  box.querySelector('.diag').textContent = it ? (it.diag || '') : '';
  box.querySelector('.act').textContent = it && st !== 'ok' && st !== 'na' ? (it.act || '') : '';
}

/* ---------- палуба: схема ---------- */
const DK = {
  cx: { halyard: 116, reef1: 134, reef2: 152, vang: 170, main: 190, outhaul: 208, furl: 226 },
  winch: { RP: [122, 172], RS: [238, 172], PP: [70, 250], PS: [290, 250] },
  track: { P: 64, S: 296 }
};
const DECK_ITEM = { halyard: 'luff', reef1: 'reef', reef2: 'reef', vang: 'mainTwist', main: 'mainAoA', outhaul: 'depth', furl: 'furl', sheetP: 'jibAoA', sheetS: 'jibAoA', car: 'jibTwist', trav: 'mainAoA', bs: 'depth' };
const DECK_HOVE = { sheetP: 'hvJib', sheetS: 'hvJib', main: 'hvMain', trav: 'hvMain' };
const DECK_FOCUS = { halyard: 'shape', reef1: 'area', reef2: 'area', vang: 'twist', main: 'trim', outhaul: 'shape', furl: 'area', sheetP: 'trim', sheetS: 'trim', car: 'jibTwist', trav: 'trim', bs: 'shape' };
const selKey = sel => (sel.kind === 'line' ? sel.key : sel.kind);

// o: getS() — состояние лодки, highlight(key) — подсветка снасти в 3D,
// focus(key) — ракурс камеры, effect(name) — что изменили, targets() — цели настройки или null
function createDeck(o) {
  const st = { sel: null, selHint: false, selSig: '' };
  function buildDeck() {
    let s = '<defs><pattern id="teakP" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="var(--teak)" opacity="0.28"/><line x1="0" y1="0" x2="0" y2="7" stroke="var(--teak)" stroke-width="1" opacity="0.55"/></pattern></defs>';
    s += '<path d="M46 0 C37 112 36 254 50 340 Q52 350 62 350 L298 350 Q308 350 310 340 C324 254 323 112 314 0 Z" fill="var(--deck)" stroke="var(--deck-line)" stroke-width="1.5"/>';
    s += '<path d="M96 0 L96 196 Q96 210 110 210 L250 210 Q264 210 264 196 L264 0" fill="var(--surface)" stroke="var(--deck-line)" stroke-width="1.5"/>';
    s += '<rect x="94" y="220" width="172" height="122" rx="12" fill="url(#teakP)" stroke="var(--deck-line)"/>';
    s += '<rect x="94" y="228" width="24" height="66" rx="5" fill="var(--teak)" opacity="0.45"/><rect x="242" y="228" width="24" height="66" rx="5" fill="var(--teak)" opacity="0.45"/>';
    s += '<rect x="166" y="232" width="28" height="44" rx="5" fill="var(--teak)" opacity="0.6"/>';
    s += `<rect x="164" y="186" width="32" height="24" rx="3" fill="var(--ink-3)" opacity="0.55"/><text x="180" y="201" font-size="9" text-anchor="middle" style="fill:var(--surface)">${t('dk_hatch')}</text>`;
    for (const [x, y] of [[142, 304], [218, 304]]) s += `<circle cx="${x}" cy="${y}" r="18" fill="none" stroke="var(--ink-2)" stroke-width="2.5"/><line x1="${x - 18}" y1="${y}" x2="${x + 18}" y2="${y}" stroke="var(--ink-3)"/><line x1="${x}" y1="${y - 18}" x2="${x}" y2="${y + 18}" stroke="var(--ink-3)"/>`;
    s += '<path id="dkSheet_P" d="" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path id="dkSheet_S" d="" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    s += `<circle cx="180" cy="20" r="9" fill="var(--surface-3)" stroke="var(--ink-2)" stroke-width="1.5"/><text x="194" y="16" font-size="10">${t('dk_mast')}</text>`;
    for (const k of SIM.CLUTCH_LINES) s += `<path d="M180 28 L${DK.cx[k]} 104" stroke="${LINES[k].color}" stroke-width="1.6" fill="none" opacity="0.7"/>`;
    s += `<g class="hit" data-kind="trav" role="button" tabindex="0" aria-label="${esc(t('dk_trav_aria'))}"><rect x="104" y="34" width="152" height="26" fill="transparent"/><line class="body" x1="112" y1="48" x2="248" y2="48" stroke="var(--ink-2)" stroke-width="4" stroke-linecap="round"/><rect id="dkTrav" x="171" y="42" width="18" height="12" rx="3" fill="var(--ink)"/><text x="104" y="40" font-size="10">${t('dk_trav')}</text></g>`;
    for (const k of SIM.CLUTCH_LINES) {
      const x = DK.cx[k], Ln = LINES[k];
      s += `<g class="hit" data-kind="line" data-key="${k}" role="button" tabindex="0" aria-label="${esc(t('dk_clutch_aria', Ln.name))}"><rect x="${x - 9}" y="56" width="18" height="82" fill="transparent"/>` +
        `<text x="${x + 3.5}" y="99" font-size="10.5" transform="rotate(-90 ${x + 3.5} 99)" style="paint-order:stroke;stroke:var(--surface);stroke-width:3px">${esc(Ln.tag)}</text>` +
        `<rect class="body" id="dkCl_${k}" x="${x - 7.5}" y="104" width="15" height="30" rx="3" fill="var(--surface-3)" stroke="var(--ink-2)"/>` +
        `<rect x="${x - 5.5}" y="106" width="11" height="5" rx="1.5" fill="${Ln.color}"/><rect id="dkLev_${k}" x="${x - 5}" y="116" width="10" height="14" rx="2" fill="var(--ink)"/></g>`;
    }
    for (const k of SIM.CLUTCH_LINES) s += `<path id="dkTail_${k}" d="" stroke="${LINES[k].color}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    for (const w of ['RP', 'RS', 'PP', 'PS']) {
      const [x, y] = DK.winch[w], prim = w[0] === 'P';
      const kind = prim ? 'line' : 'winch', key = w === 'PP' ? 'sheetP' : w === 'PS' ? 'sheetS' : w;
      s += `<g class="hit" data-kind="${kind}" data-key="${key}" role="button" tabindex="0" aria-label="${esc(SIM.winchName(w))}"><circle cx="${x}" cy="${y}" r="21" fill="transparent"/>` +
        `<circle id="dkRing_${w}" cx="${x}" cy="${y}" r="15.5" fill="none" stroke="transparent" stroke-width="4"/>` +
        `<circle class="body" cx="${x}" cy="${y}" r="12" fill="var(--surface-3)" stroke="var(--ink-2)" stroke-width="1.5"/><circle cx="${x}" cy="${y}" r="4.5" fill="var(--ink-2)"/>` +
        `<text id="dkWl_${w}" x="${x}" y="${y + 29}" font-size="10" text-anchor="middle"></text></g>`;
    }
    for (const sd of ['P', 'S']) {
      const x = DK.track[sd];
      s += `<g class="hit" data-kind="car" data-key="${sd}" role="button" tabindex="0" aria-label="${esc(t('dk_car_aria', sd === 'P' ? -1 : 1))}"><rect x="${x - 13}" y="50" width="26" height="130" fill="transparent"/>` +
        `<line class="body" x1="${x}" y1="60" x2="${x}" y2="170" stroke="var(--ink-2)" stroke-width="3" stroke-linecap="round"/>` +
        `<rect id="dkCar_${sd}" x="${x - 6}" y="100" width="12" height="16" rx="2.5" fill="var(--ink)"/></g>`;
    }
    s += `<g class="hit" data-kind="bs" role="button" tabindex="0" aria-label="${esc(t('dk_bs_aria'))}"><rect x="150" y="322" width="110" height="30" fill="transparent"/><line x1="180" y1="324" x2="180" y2="334" stroke="var(--ink-2)" stroke-width="1.5"/><line x1="180" y1="334" x2="162" y2="349" stroke="var(--ink-2)" stroke-width="1.5"/><line x1="180" y1="334" x2="198" y2="349" stroke="var(--ink-2)" stroke-width="1.5"/><circle class="body" cx="180" cy="334" r="5" fill="var(--surface-3)" stroke="var(--ink-2)"/><text x="204" y="345" font-size="10">${t('dk_bs')}</text></g>`;
    s += `<text x="20" y="176" font-size="11" text-anchor="middle" transform="rotate(-90 20 176)" style="fill:var(--port);font-weight:700;letter-spacing:.08em">${t('dk_port')}</text>`;
    s += `<text x="340" y="176" font-size="11" text-anchor="middle" transform="rotate(90 340 176)" style="fill:var(--stbd);font-weight:700;letter-spacing:.08em">${t('dk_stbd')}</text>`;
    s += `<text x="8" y="14" font-size="10">${t('dk_bow')}</text>`;
    $('#deckSvg').innerHTML = s;
    markSel();
  }
  function initDeck() {
    const svg = $('#deckSvg');
    svg.addEventListener('click', e => { const g = e.target.closest('.hit'); if (g) select(g.dataset.kind, g.dataset.key || ''); });
    svg.addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; const g = e.target.closest('.hit'); if (g) { e.preventDefault(); select(g.dataset.kind, g.dataset.key || ''); } });
  }
  function updateDeck() {
    const S = o.getS();
    const d = S.deck, R = S.rig, D = S.D;
    for (const k of SIM.CLUTCH_LINES) {
      const lev = $('#dkLev_' + k), open = d.clutch[k] === 0;
      lev.setAttribute('y', open ? 109 : 116); lev.setAttribute('height', open ? 9 : 14);
      lev.setAttribute('fill', open ? 'var(--accent)' : 'var(--ink)');
      $('#dkCl_' + k).setAttribute('stroke', d.running[k] ? 'var(--bad)' : 'var(--ink-2)');
      const w = SIM.onWinch(d, k) ? SIM.winchFor(k) : null, tail = $('#dkTail_' + k);
      if (w) { const [wx, wy] = DK.winch[w], x = DK.cx[k]; tail.setAttribute('d', `M${x} 134 Q${x} 156 ${wx + (x < wx ? -12 : 12)} ${wy - 6}`); }
      else tail.setAttribute('d', '');
    }
    for (const w of ['RP', 'RS', 'PP', 'PS']) {
      const k = d.winch[w], ring = $('#dkRing_' + w), lbl = $('#dkWl_' + w);
      ring.setAttribute('stroke', k ? LINES[k].color : 'transparent');
      if (w[0] === 'R') lbl.textContent = k ? LINES[k].tag : t('w_free');
      else { const sk = w === 'PP' ? 'sheetP' : 'sheetS'; lbl.textContent = d.winch[w] ? (D && D.jib.bind && D.jib.ctrl === (w === 'PP' ? -1 : 1) ? t('w_working') : t('w_lazy')) : t('w_off'); if (d.running[sk]) lbl.textContent = t('w_running'); }
    }
    for (const sd of ['P', 'S']) {
      const c = sd === 'P' ? R.carP : R.carS;
      $('#dkCar_' + sd).setAttribute('y', (60 + 110 * c - 8).toFixed(1));
    }
    $('#dkTrav').setAttribute('x', (180 + 64 * R.trav - 9).toFixed(1));
    for (const sd of ['P', 'S']) {
      const s = sd === 'P' ? -1 : 1, x = DK.track[sd], c = sd === 'P' ? R.carP : R.carS, cy = 60 + 110 * c;
      const [wx, wy] = DK.winch[sd === 'P' ? 'PP' : 'PS'];
      const working = D && D.jib.bind && D.jib.ctrl === s, path = $('#dkSheet_' + sd);
      const top = x + (s < 0 ? -10 : 10);
      path.setAttribute('d', `M${top} 0 L${x} ${cy.toFixed(1)} L${wx} ${wy - 12}`);
      path.setAttribute('stroke', LINES['sheet' + sd].color);
      path.setAttribute('stroke-width', working ? 3.2 : 1.6);
      path.setAttribute('stroke-dasharray', working ? '' : '4 4');
      path.setAttribute('opacity', d.winch[sd === 'P' ? 'PP' : 'PS'] ? 1 : 0.45);
    }
  }
  const loadTxt = v => (v < 0.12 ? t('load_low') : v < 0.45 ? t('load_mid') : t('load_high'));
  function markSel() {
    $$('#deckSvg .hit').forEach(g => g.classList.toggle('sel', !!st.sel && g.dataset.kind === st.sel.kind && (g.dataset.key || '') === (st.sel.key || '')));
  }
  function select(kind, key) {
    const S = o.getS();
    st.sel = kind ? { kind, key } : null;
    st.selHint = false;
    markSel();
    st.selSig = '';
    renderSel();
    let h = null;
    if (st.sel) {
      if (kind === 'line') h = key; else if (kind === 'car') h = 'car' + key; else if (kind === 'trav') h = 'trav'; else if (kind === 'bs') h = 'backstay'; else if (kind === 'winch') h = S.deck.winch[key];
      o.focus(DECK_FOCUS[selKey(st.sel)]);
    }
    o.highlight(h);
  }
  function holdBtn(id, hold, name) { const el = $('#' + id); if (!el) return; holdable(el, () => { o.getS().deck.hold = hold; o.effect(name); }, () => { SIM.deckRelease(o.getS()); }); }
  const SG_DOT = () => `<button type="button" class="st st-na" id="sgSt" aria-expanded="false" aria-controls="sgHint">–</button>`;
  const SG_HINT = '<div class="ihint" id="sgHint" hidden><div class="ih-h"><b></b><span></span></div><p class="diag"></p><p class="act"></p></div>';
  function renderSel() {
    const S = o.getS();
    const host = $('#selCard'), sel = st.sel;
    if (!sel) { host.innerHTML = `<p class="note">${t('sel_none')}</p>`; return; }
    const gaugeHtml = '<div><div class="gval"><span id="sgLabel"></span><b id="sgVal"></b></div><div class="gauge" id="sgBar"><i></i></div></div><div class="chips" id="sgChips"></div><p class="warnline" id="sgWarn" hidden></p>';
    if (sel.kind === 'line') {
      const Ln = LINES[sel.key], prim = !!Ln.primary, side = prim ? (Ln.primary === 'P' ? -1 : 1) : 0;
      const where = prim ? t('where_prim', side) : t('where_clutch', Ln.bank, SIM.winchName(SIM.winchFor(sel.key)));
      host.innerHTML = `<div class="sh"><span class="sw" style="background:${Ln.color}"></span><h4>${esc(Ln.name)}</h4>${SG_DOT()}<span class="where">${esc(where)}</span></div><p class="about">${esc(Ln.about)}</p>${gaugeHtml}${SG_HINT}` +
        `<div class="actrow"><div class="acts">${prim ? '' : '<button type="button" class="btn" id="sbClutch"></button>'}<button type="button" class="btn" id="sbWinch"></button>${prim ? '<button type="button" class="btn" id="sbPole"></button>' : ''}</div>` +
        `<div class="acts"><button type="button" class="btn hold" id="sbPull">${t('b_pull')}</button><button type="button" class="btn hold" id="sbEase">${t('b_ease')}</button></div></div>`;
      if (!prim) $('#sbClutch').addEventListener('click', () => SIM.deckToggleClutch(S, sel.key));
      $('#sbWinch').addEventListener('click', () => SIM.deckToggleWinch(S, sel.key));
      if (prim) $('#sbPole').addEventListener('click', () => { if (SIM.deckSetPole(S, S.rig.pole === side ? 0 : side)) o.effect(t('eff_pole')); });
      holdBtn('sbPull', { kind: 'line', line: sel.key, dir: 1 }, Ln.short);
      holdBtn('sbEase', { kind: 'line', line: sel.key, dir: -1 }, Ln.short);
    } else if (sel.kind === 'car') {
      const sd = sel.key === 'P' ? -1 : 1;
      host.innerHTML = `<div class="sh"><span class="sw" style="background:var(--ink)"></span><h4>${t('car_title', sd)}</h4>${SG_DOT()}<span class="where">${t('car_where')}</span></div>` +
        `<p class="about">${t('car_about')}</p>${gaugeHtml}${SG_HINT}` +
        `<div class="acts"><button type="button" class="btn hold" id="sbA">${t('b_fwd')}</button><button type="button" class="btn hold" id="sbB">${t('b_aft')}</button></div>`;
      holdBtn('sbA', { kind: 'car', side: sel.key, dir: -1 }, t('eff_car')); holdBtn('sbB', { kind: 'car', side: sel.key, dir: 1 }, t('eff_car'));
    } else if (sel.kind === 'trav') {
      host.innerHTML = `<div class="sh"><span class="sw" style="background:#7a5a3a"></span><h4>${t('trav_title')}</h4>${SG_DOT()}<span class="where">${t('trav_where')}</span></div>` +
        `<p class="about">${t('trav_about')}</p>${gaugeHtml}${SG_HINT}` +
        `<div class="acts"><button type="button" class="btn hold" id="sbA">${t('b_to_port')}</button><button type="button" class="btn hold" id="sbB">${t('b_to_stbd')}</button></div>`;
      holdBtn('sbA', { kind: 'trav', dir: -1 }, t('eff_trav')); holdBtn('sbB', { kind: 'trav', dir: 1 }, t('eff_trav'));
    } else if (sel.kind === 'bs') {
      host.innerHTML = `<div class="sh"><span class="sw" style="background:var(--ink-3)"></span><h4>${t('bs_title')}</h4>${SG_DOT()}<span class="where">${t('bs_where')}</span></div>` +
        `<p class="about">${t('bs_about')}</p>${gaugeHtml}${SG_HINT}` +
        `<div class="acts"><button type="button" class="btn hold" id="sbA">${t('b_tighten')}</button><button type="button" class="btn hold" id="sbB">${t('b_bs_ease')}</button></div>`;
      holdBtn('sbA', { kind: 'bs', dir: 1 }, t('eff_bs')); holdBtn('sbB', { kind: 'bs', dir: -1 }, t('eff_bs'));
    } else if (sel.kind === 'winch') {
      const w = sel.key, occ = S.deck.winch[w], bank = w === 'RP' ? 'P' : 'S';
      const lines = SIM.CLUTCH_LINES.filter(k => LINES[k].bank === bank);
      st.selSig = 'w' + occ;
      const nm = SIM.winchName(w);
      host.innerHTML = `<div class="sh"><span class="sw" style="background:var(--ink-2)"></span><h4>${esc(nm.charAt(0).toUpperCase() + nm.slice(1))}</h4><span class="where">${t('winch_where', bank)}</span></div>` +
        `<p class="about keep">${esc(occ ? t('winch_busy_about', LINES[occ].ref) : t('winch_free_about'))}</p>` +
        `<div class="acts">${lines.map(k => `<button type="button" class="btn" data-wl="${k}">${esc(t('winch_line_btn', occ === k, LINES[k].short))}</button>`).join('')}</div>` +
        (occ ? `<button type="button" class="btn" id="sbGoLine">${esc(t('winch_card_btn', LINES[occ].short))}</button>` : '');
      $$('#selCard [data-wl]').forEach(b => b.addEventListener('click', () => { SIM.deckToggleWinch(S, b.dataset.wl); }));
      if (occ) $('#sbGoLine').addEventListener('click', () => select('line', occ));
      return;
    }
    const sb = $('#sgSt');
    if (sb) sb.addEventListener('click', () => { st.selHint = !st.selHint; updateSel(); });
    updateSel();
  }
  function setGauge(v, label, val, tg, marks) {
    const bar = $('#sgBar'); if (!bar) return;
    $('#sgLabel').textContent = label; $('#sgVal').textContent = val;
    bar.querySelector('i').style.width = `${clamp(v, 0, 1) * 100}%`;
    const sig = I18N.lang + (marks || []).map(m => m.join(':')).join('|') + '/' + (tg == null ? '' : tg.toFixed(3));
    if (bar.dataset.sig !== sig) {
      bar.dataset.sig = sig;
      bar.querySelectorAll('.mk,.tg').forEach(n => n.remove());
      for (const [p, txt] of marks || []) { const m = document.createElement('span'); m.className = 'mk'; m.style.left = `${p * 100}%`; m.innerHTML = `<span>${esc(txt)}</span>`; bar.appendChild(m); }
      if (tg != null) { const x = document.createElement('span'); x.className = 'tg'; x.style.left = `calc(${clamp(tg, 0, 1) * 100}% - 1px)`; bar.appendChild(x); }
    }
  }
  function updateSel() {
    const S = o.getS();
    const sel = st.sel; if (!sel) return;
    const R = S.rig, D = S.D, d = S.deck, T = o.targets();
    if (!D) return;
    if (sel.kind === 'winch') { if (st.selSig !== 'w' + d.winch[sel.key]) renderSel(); return; }
    const chips = [], warn = { text: '', cls: '' };
    if (sel.kind === 'line') {
      const k = sel.key, Ln = LINES[k], prim = !!Ln.primary, on = SIM.onWinch(d, k), load = D.loads[k] || 0, hp = D.hoist;
      let g;
      switch (k) {
        case 'halyard': {
          const up = R.halyard < hp.hTaut - 0.005;
          g = [R.halyard / 1.04, up ? t('gl_hoisted') : t('gl_luff'), up ? pct(R.halyard / hp.hTaut) : pct(hp.tension), T ? (1 - BOAT.reefH[T.reef] + BOAT.TENS * T.luff) / 1.04 : null,
            [[(1 - BOAT.reefH[2]) / 1.04, t('gm_reef2')], [(1 - BOAT.reefH[1]) / 1.04, t('gm_reef1')], [1 / 1.04, t('gm_top')]]];
          break;
        }
        case 'reef1': case 'reef2': { const i = k === 'reef1' ? 1 : 2; g = [R[k], t('gl_reef'), pct(R[k]), T ? (T.reef >= i ? 1 : 0) : null]; break; }
        case 'vang': g = [R.vang, t('gl_tension'), pct(R.vang), T ? T.vang : null]; break;
        case 'outhaul': g = [R.outhaul, t('gl_tension'), pct(R.outhaul), T ? T.outhaul : null]; break;
        case 'main': g = [R.main, t('gl_eased'), t('gv_main', pct(R.main), r0(Math.abs(S.boomAngle))), T ? T.mainsheet : null]; break;
        case 'furl': g = [R.furl, t('gl_furled'), t('gv_furl', pct(R.furl), pct(1 - R.furl)), T ? 1 - T.open : null]; break;
        default: {
          const s = k === 'sheetP' ? -1 : 1, e = R[k] - 0.8 * R.furl, working = D.jib.bind && D.jib.ctrl === s;
          g = [clamp(e / 1.3, 0, 1), working ? t('gl_working') : t('gl_lazy'), working ? t('gv_jib', r0(Math.abs(D.jib.delta))) : (e > 1.3 ? t('gv_slack') : t('gv_eased', pct(clamp(e / 1.3, 0, 1)))), (T && working) ? T.jibSheet : null];
        }
      }
      setGauge(...g);
      if (!prim) chips.push(`<span class="chip ${d.clutch[k] ? '' : 'on'}">${t('ch_clutch', d.clutch[k])}</span>`);
      chips.push(`<span class="chip ${on ? 'on' : ''}">${t('ch_winch', on, prim)}</span>`);
      chips.push(`<span class="chip">${t('ch_load', loadTxt(load))}</span>`);
      if (d.running[k]) { chips.push(`<span class="chip danger">${t('ch_running')}</span>`); warn.text = t('wn_running'); }
      else if (!prim && d.clutch[k] === 1 && !on && load > 0.06) { warn.text = t('wn_clutchOnly'); warn.cls = 'soft'; }
      else if (!on) { warn.text = t('wn_noWinch'); warn.cls = 'soft'; }
      if (!prim) $('#sbClutch').textContent = d.clutch[k] ? t('b_clutch_open') : t('b_clutch_close');
      const w = SIM.winchFor(k), occ = d.winch[w];
      $('#sbWinch').textContent = on ? t('b_winch_off') : (occ ? t('b_winch_busy', LINES[occ].short) : t('b_winch_on'));
      if (prim) {
        const s = k === 'sheetP' ? -1 : 1, pb = $('#sbPole');
        pb.hidden = !(D.awaAbs > 120 || R.pole);
        pb.textContent = R.pole === s ? t('b_pole_off') : t('b_pole_on');
      }
    } else if (sel.kind === 'car') {
      const s = sel.key === 'P' ? -1 : 1, c = sel.key === 'P' ? R.carP : R.carS, sh = sel.key === 'P' ? 'sheetP' : 'sheetS';
      const working = D.jib.bind && D.jib.ctrl === s, load = D.loads[sh] || 0;
      setGauge(c, t('gl_pos'), t('gv_hole', r0(c * 14) + 1), (T && working) ? T.car : null, [[0, t('gm_bow')], [1, t('gm_stern')]]);
      chips.push(`<span class="chip">${t('ch_side', working)}</span>`, `<span class="chip">${t('ch_sheetload', loadTxt(load))}</span>`);
      if (load > 0.22) { warn.text = t('wn_carLoaded'); warn.cls = 'soft'; }
    } else if (sel.kind === 'trav') {
      const tr = R.trav, lee = S.boomSide;
      const rel = tr * lee > 0.02 ? t('rel_lee') : tr * lee < -0.02 ? t('rel_win') : t('rel_c');
      setGauge((tr + 1) / 2, t('gl_pos'), t('gv_trav', tr, rel), T ? (T.travLee * lee + 1) / 2 : null, [[0, t('gm_port')], [0.5, t('gm_c')], [1, t('gm_stbd')]]);
      chips.push(`<span class="chip">${t('ch_leeside', lee)}</span>`, `<span class="chip">${t('ch_load', loadTxt(D.loads.main || 0))}</span>`);
    } else if (sel.kind === 'bs') {
      setGauge(R.backstay, t('gl_tension'), pct(R.backstay), T ? T.backstay : null);
    }
    $('#sgChips').innerHTML = chips.join('');
    const wl = $('#sgWarn');
    wl.hidden = !warn.text; wl.textContent = warn.text; wl.className = 'warnline' + (warn.cls === 'soft' ? ' soft' : '');
    const sk = selKey(sel), ik = D.hoveList ? DECK_HOVE[sk] : DECK_ITEM[sk], sb = $('#sgSt');
    if (sb) {
      const it = itemOf(D, ik);
      setSt(sb, it); sb.setAttribute('aria-expanded', String(st.selHint));
      sb.title = t('sg_title', it ? it.name : '—', stTxt(it ? it.status : 'na'));
      const box = $('#sgHint'); box.hidden = !st.selHint;
      if (st.selHint) fillHint(box, it);
    }
  }
  function updateDeckSide() {
    const S = o.getS();
    const d = S.deck, msg = $('#deckMsg');
    if (d.msg && S.t - d.msg.t < 3.5) { msg.hidden = false; msg.textContent = SIM.msgText(d.msg); } else msg.hidden = true;
    $('#deckLog').innerHTML = d.log.map(l => `<li class="${l.kind === 'bad' ? 'bad' : ''}">${esc(SIM.logText(l))}</li>`).join('') || `<li>${t('log_empty')}</li>`;
  }
  initDeck();
  return { build: buildDeck, update: updateDeck, select, render: renderSel, updateSel, updateSide: updateDeckSide, get sel() { return st.sel; } };
}

G.KDeck = { createDeck, holdable, setSt, fillHint, itemOf, stTxt, ST_SYM, esc, pct };
})(window);
