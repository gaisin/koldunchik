/* ============================================================
   Колдунчик / Telltale — интерфейс и главный цикл
   Тексты — через I18N.t (интерфейс) и SIM.T / SIM.loc (модель).
   ============================================================ */
(function (G) {
'use strict';
const SIM = G.SIM, I18N = G.I18N;
const { clamp, lerp, wrap180, wrap360, sgn, D2R, LINES, BOAT } = SIM;
const t = (k, ...a) => I18N.t(k, ...a);
const L = v => SIM.loc(v);
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const r0 = Math.round;
const f1 = x => (Math.round(x * 10) / 10).toFixed(1);
const deg3 = a => String(r0(wrap360(a)) % 360).padStart(3, '0') + '°';
const pct = v => `${r0(v * 100)}%`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = G.localStorage.getItem('kold.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { G.localStorage.setItem('kold.' + k, JSON.stringify(v)); } catch (e) { /* хранилище недоступно */ } }
};
SIM.setLang(I18N.lang);

/* ---------- раскладка: телефон или компьютер ---------- */
const Q_PHONE = '(max-width: 860px) and (orientation: portrait), (max-width: 620px), (orientation: landscape) and (max-height: 520px)';
const Q_STACK = '(max-width: 860px) and (orientation: portrait), (max-width: 620px)';
const mq = q => (typeof G.matchMedia === 'function' ? G.matchMedia(q) : { matches: false });
const mqPhone = mq(Q_PHONE), mqStack = mq(Q_STACK);
const onMq = (m, fn) => { if (m.addEventListener) m.addEventListener('change', fn); else if (m.addListener) m.addListener(fn); };
const isPhone = () => !!mqPhone.matches;

/* ---------- состояние ---------- */
const S = SIM.createState();
SIM.applySolution(S, SIM.solveTrim(S));
for (let i = 0; i < 160; i++) SIM.step(S, 0.05);
S.events.length = 0;
const ui = {
  view: isPhone() ? 'auto' : 'free', lastFocus: 'all', showWind: true, tab: 'ctl',
  selItem: null, autoHints: !!store.get('autoHints', false), showTargets: false, targets: null, tgtT: -9,
  anim: null, completed: store.get('done', {}) || {}, todoOpen: false, todoKey: '', bannerOpen: false,
  sel: null, selSig: '', selHint: false, hlKey: undefined, dialDrag: false, openHints: {},
  stageFrac: clamp(+store.get('stageFrac', 0.44) || 0.44, 0.22, 0.72), stripDrag: null, stripMoved: false
};
// «Эффект»: что изменили последним и какими были приборы до изменения
const eff = { name: null, snap: null, last: -1e9 };
const EFF_HOLD = 12;

/* ---------- 3D ---------- */
let scene = null;
try { if (G.THREE && G.KScene) scene = G.KScene.createScene($('#gl')); } catch (e) { console.error(e); scene = null; }
if (!scene) { const p = $('#loading p'); p.removeAttribute('data-t'); p.textContent = t('err_webgl'); }
function hl(key) { if (scene && ui.hlKey !== key) { ui.hlKey = key; scene.highlight(key); } }
function resize() { if (!scene) return; const r = $('#stage').getBoundingClientRect(); scene.resize(Math.max(1, r.width), Math.max(1, r.height)); }
function camFocus(key) { if (scene && key && ui.view === 'auto') { scene.focus(key); ui.lastFocus = key; } }
function effectTouch(name, focusKey) {
  const D = S.D; if (!D) return;
  if (eff.name !== name || S.t - eff.last > EFF_HOLD) {
    eff.name = name;
    eff.snap = { bsp: D.bsp, heel: Math.abs(D.heel), twa: D.twaAbs, awa: D.awaAbs, score: D.score };
    camFocus(focusKey);
  }
  eff.last = S.t;
}
const effActive = () => !!eff.name && S.t - eff.last < EFF_HOLD;

/* ---------- всплывающие сообщения ---------- */
function toast(text, kind, ms) {
  const host = $('#toasts'), el = document.createElement('div');
  el.className = `toast glass ${kind || 'info'}`; el.textContent = text; host.appendChild(el);
  const max = isPhone() ? 2 : 3;
  while (host.children.length > max) host.firstChild.remove();
  setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 450); }, ms || 4200);
}

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

/* ---------- руль ---------- */
const helmOn = cmd => () => { SIM.setLash(S, false); S.heave = null; S.helm.cmd = typeof cmd === 'function' ? cmd() : cmd; effectTouch(t('eff_helm'), null); };
const helmOff = () => { S.helm.cmd = 0; };
holdable($('#hLeft'), helmOn(-1), helmOff);
holdable($('#hRight'), helmOn(1), helmOff);
holdable($('#hUp'), helmOn(() => (S.D ? sgn(S.D.twa) : 1)), helmOff);
holdable($('#hDown'), helmOn(() => (S.D ? -sgn(S.D.twa) : -1)), helmOff);
$('#hTack').addEventListener('click', () => {
  S.heave = null;
  if (!SIM.startManeuver(S, 'tack')) { toast(t('tack_bad'), 'warn'); return; }
  effectTouch(t('eff_tack'), null);
  if (S.mode === 'deck') toast(t('tack_deck'), 'info', 5500);
});
$('#hGybe').addEventListener('click', () => {
  S.heave = null;
  if (!SIM.startManeuver(S, 'gybe')) { toast(t('gybe_bad'), 'warn'); return; }
  effectTouch(t('eff_gybe'), null);
  if (S.rig.main > 0.25) toast(t('gybe_eased'), 'warn', 5500);
});
function toggleLash(on) {
  const v = on == null ? !S.helm.lash : !!on;
  SIM.setLash(S, v); S.heave = null;
  toast(t(v ? 'lash_on' : 'lash_off'), 'info', 2600);
  effectTouch(t('eff_lash'), null);
  syncHelm();
}
$('#hLash').addEventListener('click', () => toggleLash());
function syncHelm() {
  $('#hLash').setAttribute('aria-pressed', String(!!S.helm.lash));
  const q = $('#q_lash'); if (q) q.checked = !!S.helm.lash;
}
document.addEventListener('keydown', e => {
  const tg = e.target;
  if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || (tg.getAttribute && tg.getAttribute('role') === 'slider'))) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault(); SIM.setLash(S, false); S.heave = null; S.helm.cmd = e.key === 'ArrowLeft' ? -1 : 1; S.helm.fine = e.shiftKey;
    if (!e.repeat) effectTouch(t('eff_helm'), null);
  }
});
document.addEventListener('keyup', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { S.helm.cmd = 0; S.helm.fine = false; } });

/* ---------- камера ---------- */
function setView(v, instant) {
  ui.view = v;
  $$('#camBar [data-view]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.view === v)));
  if (v === 'auto') ui.lastFocus = 'all';
  if (scene) scene.setView(v, { instant: !!instant, focus: 'all' });
}
function closeCamMenu() { $('#camBar').classList.remove('open'); $('#camBtn').setAttribute('aria-expanded', 'false'); }
$$('#camBar [data-view]').forEach(b => b.addEventListener('click', () => { setView(b.dataset.view); closeCamMenu(); }));
$('#camBtn').addEventListener('click', () => {
  const open = !$('#camBar').classList.contains('open');
  $('#camBar').classList.toggle('open', open);
  $('#camBtn').setAttribute('aria-expanded', String(open));
});
document.addEventListener('pointerdown', e => {
  if (!$('#camBar').classList.contains('open') || e.target.closest('#camBar, #camBtn')) return;
  closeCamMenu();
});
$('#btnWindVis').addEventListener('click', e => { ui.showWind = !ui.showWind; e.currentTarget.setAttribute('aria-pressed', String(ui.showWind)); });
function syncPause() { const b = $('#btnPause'); b.setAttribute('aria-pressed', String(S.paused)); b.textContent = t(S.paused ? 'resume' : 'pause'); }
$('#btnPause').addEventListener('click', () => { S.paused = !S.paused; syncPause(); });

/* ---------- язык ---------- */
function syncLangUI() {
  $$('.langsw [data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === I18N.lang)));
  $('#langBtn').textContent = I18N.lang === 'ru' ? 'EN' : 'RU';
  $('#langBtn').setAttribute('lang', I18N.lang === 'ru' ? 'en' : 'ru');
}
$$('.langsw [data-lang]').forEach(b => b.addEventListener('click', () => I18N.set(b.dataset.lang)));
$('#langBtn').addEventListener('click', () => I18N.set(I18N.lang === 'ru' ? 'en' : 'ru'));

/* ---------- вкладки и режимы ---------- */
function setTab(tab) {
  if (tab === 'score' && !isPhone()) tab = 'ctl';
  ui.tab = tab;
  $$('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x.dataset.tab === tab)));
  $$('.pane').forEach(p => { p.hidden = p.dataset.pane !== tab; });
  $('#scoreCard').hidden = isPhone() && tab !== 'score';
}
$$('.tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
function setMode(m) {
  SIM.setMode(S, m);
  $('#modeQuick').setAttribute('aria-pressed', String(m === 'quick'));
  $('#modeDeck').setAttribute('aria-pressed', String(m === 'deck'));
  $('#quickPane').hidden = m !== 'quick';
  $('#deckPane').hidden = m !== 'deck';
  ui.anim = null;
  select(null);
  if (m === 'quick') syncSliders(true);
  if (m === 'deck') toast(t('deck_toast'), 'info', 5500);
}
$('#modeQuick').addEventListener('click', () => setMode('quick'));
$('#modeDeck').addEventListener('click', () => setMode('deck'));

/* ---------- оценка: общие помощники ---------- */
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
const stBtn = (id, label) => `<button type="button" class="st st-na" id="st_${id}" aria-expanded="false" aria-controls="ih_${id}" title="${esc(t('st_title', label))}">–</button>`;
const ihintHtml = id => `<div class="ihint" id="ih_${id}" hidden><div class="ih-h"><b></b><span></span></div><p class="diag"></p><p class="act"></p></div>`;

/* ---------- быстрые настройки ---------- */
const QS = [
  { tk: 'g_genoa', extra: 'goose', items: [
    { key: 'jibSheet', lk: 'q_jibSheet', ek: 'e_inEased', item: 'jibAoA', hove: 'hvJib', focus: 'trim', min: 0, max: 1, step: 0.005, hl: () => (S.D && S.D.jib.fill > 0 ? 'sheetS' : 'sheetP'), out: () => (S.D ? t('o_jib', r0(Math.abs(S.D.jib.delta))) : '') },
    { key: 'car', lk: 'q_car', ek: 'e_fwdAft', item: 'jibTwist', focus: 'jibTwist', min: 0, max: 1, step: 1 / 14, hl: () => (S.D && S.D.jib.fill > 0 ? 'carS' : 'carP'), out: v => t('o_hole', r0(v * 14) + 1) },
    { key: 'open', lk: 'q_open', ek: 'e_furl', item: 'furl', focus: 'area', min: 0, max: 1, step: 0.01, hl: () => 'furl', out: v => t('o_open', pct(v)) }
  ] },
  { tk: 'g_main', extra: 'reef', items: [
    { key: 'mainsheet', lk: 'q_mainsheet', ek: 'e_inEased', item: 'mainAoA', hove: 'hvMain', focus: 'trim', min: 0, max: 1, step: 0.005, hl: () => 'main', out: () => t('o_boom', r0(Math.abs(S.boomAngle))) },
    { key: 'travLee', lk: 'q_trav', ek: 'e_trav', item: 'mainAoA', hove: 'hvMain', focus: 'trim', min: -1, max: 1, step: 0.02, hl: () => 'trav', out: v => (v > 0.02 ? t('o_trav_lee', pct(v)) : v < -0.02 ? t('o_trav_win', pct(-v)) : t('o_trav_c')) },
    { key: 'vang', lk: 'q_vang', ek: 'e_looseTight', item: 'mainTwist', focus: 'twist', min: 0, max: 1, step: 0.01, hl: () => 'vang', out: pct },
    { key: 'outhaul', lk: 'q_outhaul', ek: 'e_outhaul', item: 'depth', focus: 'shape', min: 0, max: 1, step: 0.01, hl: () => 'outhaul', out: pct },
    { key: 'luff', lk: 'q_luff', nk: 'q_luff_name', ek: 'e_looseTight', item: 'luff', focus: 'shape', min: 0, max: 1, step: 0.01, hl: () => 'halyard', out: pct }
  ] },
  { tk: 'g_rig', items: [
    { key: 'backstay', lk: 'q_backstay', ek: 'e_bs', item: 'depth', focus: 'shape', min: 0, max: 1, step: 0.01, hl: () => 'backstay', out: pct }
  ] }
];
const QCTL = QS.flatMap(g => g.items);
const QKEYS = QCTL.map(c => c.key);
const ctlName = c => t(c.nk || c.lk);
const CTL_ITEM = Object.assign({ reef: { item: 'reef' } }, Object.fromEntries(QCTL.map(c => [c.key, c])));
function buildQuick() {
  let html = '';
  for (const g of QS) {
    html += `<div class="group"><h3>${t(g.tk)}</h3>`;
    for (const c of g.items) {
      html += `<div class="ctl"><div class="ctl-top"><label for="q_${c.key}">${t(c.lk)}</label>${stBtn(c.key, ctlName(c))}<output id="o_${c.key}"></output></div>` +
        `<div class="range"><span class="tgt" id="t_${c.key}" hidden></span><input type="range" id="q_${c.key}" min="${c.min}" max="${c.max}" step="${c.step}"></div>` +
        `<div class="ends">${t(c.ek).map(e => `<span>${e}</span>`).join('')}</div>${ihintHtml(c.key)}</div>`;
    }
    if (g.extra === 'goose') html += `<div class="toggle-row" id="gooseRow" hidden><label class="check"><input type="checkbox" id="q_goose"> ${t('goose')}</label></div>`;
    if (g.extra === 'reef') html += `<div class="ctl"><div class="ctl-top"><span class="lbl-b">${t('reefs')}</span>${stBtn('reef', t('reefs'))}<output id="o_reef"></output></div><div class="seg" id="reefSeg" role="group" aria-label="${esc(t('aria_reefSeg'))}"><button type="button" data-reef="0">${t('reef0')}</button><button type="button" data-reef="1">${t('reef1')}</button><button type="button" data-reef="2">${t('reef2')}</button></div>${ihintHtml('reef')}</div>`;
    html += '</div>';
  }
  html += `<div class="group"><h3>${t('g_hove')}</h3><div class="hove"><p class="note">${t('hove_note')}</p>` +
    `<label class="check"><input type="checkbox" id="q_backed"> ${t('q_backed')}</label>` +
    `<label class="check"><input type="checkbox" id="q_lash"> ${t('q_lash')}</label>` +
    `<div class="row"><button type="button" class="btn" id="q_heave">${t('q_heave')}</button></div></div></div>`;
  $('#quickGroups').innerHTML = html;
  for (const c of QCTL) {
    const el = $('#q_' + c.key);
    el.value = S.quick[c.key];
    el.addEventListener('input', () => { S.quick[c.key] = parseFloat(el.value); ui.anim = null; hl(c.hl()); effectTouch(ctlName(c), c.focus); });
    el.addEventListener('pointerdown', () => hl(c.hl()));
    el.addEventListener('focus', () => hl(c.hl()));
  }
  $('#q_goose').addEventListener('change', e => { S.quick.goose = e.target.checked; effectTouch(t('eff_goose'), 'trim'); });
  $$('#reefSeg button').forEach(b => b.addEventListener('click', () => { S.quick.reef = +b.dataset.reef; ui.anim = null; hl('reef1'); effectTouch(t('eff_reef'), 'area'); }));
  $$('#quickGroups .st').forEach(b => b.addEventListener('click', () => { const k = b.id.slice(3); ui.openHints[k] = !ui.openHints[k]; updateCtlStatus(S.D); }));
  $('#q_backed').addEventListener('change', e => {
    const D = S.D;
    S.quick.jibLock = e.target.checked && D ? sgn(D.awa) : 0;
    S.quick.goose = false;
    effectTouch(t('eff_backed'), 'trim');
  });
  $('#q_lash').addEventListener('change', e => toggleLash(e.target.checked));
  $('#q_heave').addEventListener('click', () => {
    if (!SIM.heaveTo(S)) { toast(t('heave_bad'), 'warn'); return; }
    toast(t('heave_start'), 'info', 5000);
    effectTouch(t('eff_heave'), 'all');
  });
}
function syncSliders(force) {
  for (const c of QCTL) {
    const el = $('#q_' + c.key), v = S.quick[c.key];
    if (force || ui.anim || document.activeElement !== el) el.value = v;
    $('#o_' + c.key).textContent = c.out(v);
  }
  $$('#reefSeg button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.reef === S.quick.reef)));
  $('#o_reef').textContent = S.quick.reef ? t('o_reef', S.quick.reef) : t('o_reef0');
  const D = S.D, showGoose = D && D.twaAbs > 140;
  $('#gooseRow').hidden = !showGoose && !S.quick.goose;
  $('#q_goose').checked = !!S.quick.goose;
  $('#q_backed').checked = !!(D && S.quick.jibLock && S.quick.jibLock === sgn(D.awa));
  syncHelm();
}
function updateCtlStatus(D) {
  if (!D) return;
  for (const k in CTL_ITEM) {
    const b = $('#st_' + k); if (!b) continue;
    const c = CTL_ITEM[k], id = D.hoveList ? (c.hove || null) : c.item;
    const it = itemOf(D, id), open = !!ui.openHints[k];
    setSt(b, it); b.setAttribute('aria-expanded', String(open));
    const box = $('#ih_' + k);
    box.hidden = !open;
    if (open) fillHint(box, it);
  }
}
function updateTargets() {
  if (!ui.showTargets) { if (ui.targets) { ui.targets = null; $$('.tgt').forEach(x => { x.hidden = true; }); } return; }
  if (S.t - ui.tgtT > 0.5) { ui.targets = SIM.solveTrim(S); ui.tgtT = S.t; }
  const T = ui.targets;
  for (const c of QCTL) {
    const x = $('#t_' + c.key);
    x.hidden = false; x.style.left = `${clamp((T[c.key] - c.min) / (c.max - c.min), 0, 1) * 100}%`;
  }
}
$('#showTargets').addEventListener('change', e => { ui.showTargets = e.target.checked; ui.tgtT = -9; });
$('#btnSolve').addEventListener('click', () => {
  const T = SIM.solveTrim(S);
  effectTouch(t('eff_solve'), null);
  SIM.setLash(S, false); S.heave = null;
  if (S.mode === 'quick') {
    ui.anim = { from: Object.assign({}, S.quick), to: T, t: 0, dur: 1.4 };
    S.quick.reef = T.reef; S.quick.goose = T.goose; S.quick.jibLock = 0;
    toast(t('solve_q'), 'info');
  } else {
    ui.showTargets = true; $('#showTargets').checked = true; ui.tgtT = -9;
    toast(t('solve_d'), 'info', 5500);
  }
});
function stepAnim(dt) {
  const a = ui.anim; a.t += dt;
  const k = SIM.smooth(0, 1, a.t / a.dur);
  for (const key of QKEYS) S.quick[key] = lerp(a.from[key], a.to[key], k);
  if (a.t >= a.dur) ui.anim = null;
}

/* ---------- оценка ---------- */
function buildItems() {
  $('#items').innerHTML = SIM.ITEM_DEFS.map(d => `<button type="button" class="item st-na" data-id="${d.id}" aria-pressed="false"><span class="dot">–</span><span class="nm">${esc(L(d.name))}<small>${esc(L(d.sub))}</small></span></button>`).join('');
  $$('#items .item').forEach(b => b.addEventListener('click', () => { ui.selItem = ui.selItem === b.dataset.id ? null : b.dataset.id; updateScore(S.D); }));
}
function initScore() {
  $('#scoreBar').innerHTML = '<i></i>'.repeat(20);
  $('#hintClose').addEventListener('click', () => { ui.selItem = null; if (ui.autoHints) { ui.autoHints = false; $('#autoHints').checked = false; store.set('autoHints', false); } updateScore(S.D); });
  $('#autoHints').checked = ui.autoHints;
  $('#autoHints').addEventListener('change', e => { ui.autoHints = e.target.checked; store.set('autoHints', ui.autoHints); updateScore(S.D); });
  $('#btnTop').addEventListener('click', () => {
    const D = S.D;
    if (D && D.top) { ui.selItem = D.top.id; updateScore(D); }
    else { ui.selItem = null; toast(t('nothing'), 'info'); updateScore(D); }
  });
}
function updateScore(D) {
  if (!D) return;
  const sc = r0(D.score * 100);
  $('#scoreNum').innerHTML = `${sc}<span>%</span>`;
  const bar = $('#scoreBar'), on = r0(sc / 5);
  bar.className = 'segbar' + (sc < 60 ? ' bad' : sc < 85 ? ' warn' : '');
  Array.from(bar.children).forEach((i, k) => i.classList.toggle('on', k < on));
  $('#scoreSub').textContent = t('score_sub', D.pos, t('tack_nom', D.tack), f1(D.bsp), f1(D.polar));
  for (const b of $$('#items .item')) {
    const it = itemOf(D, b.dataset.id);
    b.hidden = !it;
    if (!it) continue;
    b.className = `item st-${it.status}`;
    b.querySelector('.dot').textContent = ST_SYM[it.status];
    b.setAttribute('aria-pressed', String(ui.selItem === it.id));
    b.title = `${it.name}: ${stTxt(it.status)}`;
  }
  let id = ui.selItem;
  if (id && !itemOf(D, id)) id = ui.selItem = null;
  if (!id && ui.autoHints && D.top) id = D.top.id;
  const box = $('#hintBox');
  if (!id) { box.hidden = true; return; }
  const it = itemOf(D, id);
  box.hidden = false; box.className = `hint st-${it.status}`;
  $('#hintName').textContent = it.name;
  $('#hintSt').textContent = stTxt(it.status);
  $('#hintDiag').textContent = it.diag || '';
  $('#hintAct').textContent = it.status === 'ok' || it.status === 'na' ? '' : (it.act || '');
}

/* ---------- приборы ---------- */
function updateHud(D) {
  const kn = `<small>${t('kn')}</small>`;
  $('#hBsp').innerHTML = `${f1(D.bsp)}${kn}`;
  $('#hVmg').innerHTML = D.twaAbs < 90 ? t('vmg_up', f1(D.vmg)) : t('vmg_down', f1(-D.vmg));
  $('#hHdg').textContent = deg3(D.hdg);
  $('#hPos').textContent = D.pos;
  $('#hTws').innerHTML = `${f1(D.tws)}${kn}`;
  $('#hTwa').innerHTML = t('twa_sub', r0(D.twaAbs), D.tack, deg3(D.twd));
  $('#hAws').innerHTML = `${f1(D.aws)}${kn}`;
  $('#hAwa').innerHTML = t('awa_sub', r0(D.awaAbs), D.awa >= 0 ? 1 : -1);
  $('#hHeel').textContent = `${r0(Math.abs(D.heel))}°`;
  $('#hRud').innerHTML = S.helm.lash ? t('rud_lashed') : D.rudder > 0.7 ? t('rud_weather', r0(D.rudder)) : D.rudder < -0.7 ? t('rud_lee', r0(-D.rudder)) : t('rud_neutral');
}
const sgnTxt = (v, d, u) => `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}${u || ''}`;
function stripCell(id, txt, cls, hot) {
  const d = $('#d' + id); d.textContent = txt; d.className = 'd' + (cls ? ' ' + cls : '');
  $('#c' + id).classList.toggle('hot', !!hot);
}
function updateStrip(D) {
  $('#sBsp').textContent = f1(D.bsp);
  $('#sHeel').textContent = `${r0(Math.abs(D.heel))}°`;
  $('#sTwa').textContent = `${r0(D.twaAbs)}°`;
  $('#sAwa').textContent = `${r0(D.awaAbs)}°`;
  const sc = r0(D.score * 100), sEl = $('#sScore');
  sEl.textContent = `${sc}%`; sEl.className = sc >= 85 ? 'ok' : sc >= 60 ? 'warn' : 'bad';
  const on = effActive();
  if (on) {
    const s = eff.snap, same = t('s_same');
    const dB = D.bsp - s.bsp, dH = Math.abs(D.heel) - s.heel, dT = D.twaAbs - s.twa, dA = D.awaAbs - s.awa, dS = (D.score - s.score) * 100;
    const b = Math.abs(dB) >= 0.05, h = Math.abs(dH) >= 0.5, tw = Math.abs(dT) >= 0.5, a = Math.abs(dA) >= 0.5, q = Math.abs(dS) >= 0.5;
    stripCell('Bsp', b ? sgnTxt(dB, 1) : same, b ? (dB > 0 ? 'good' : 'bad') : '', b);
    stripCell('Heel', h ? sgnTxt(dH, 0, '°') : same, h ? (dH > 0 && Math.abs(D.heel) > 20 ? 'bad' : 'chg') : '', h);
    stripCell('Twa', tw ? sgnTxt(dT, 0, '°') : same, tw ? 'chg' : '', tw);
    stripCell('Awa', a ? sgnTxt(dA, 0, '°') : same, a ? 'chg' : '', a);
    stripCell('Score', q ? sgnTxt(dS, 0, '%') : same, q ? (dS > 0 ? 'good' : 'bad') : '', q);
  } else {
    stripCell('Bsp', t('s_of', f1(D.polar)), '', false);
    stripCell('Heel', S.helm.lash ? t('s_lashed') : t('s_helm', r0(Math.max(0, D.rudder))), '', false);
    stripCell('Twa', t('s_kn', f1(D.tws)), '', false);
    stripCell('Awa', t('s_kn', f1(D.aws)), '', false);
    stripCell('Score', sc >= 85 ? t('s_good') : sc >= 60 ? t('s_fair') : t('s_poor'), '', false);
  }
  $('#effChip').hidden = !on;
  if (on) {
    $('#effName').textContent = eff.name;
    const tr = D.bspTarget - D.bsp;
    $('#effTrend').textContent = Math.abs(tr) > 0.15 ? (tr > 0 ? t('trend_up') : t('trend_down')) : t('trend_flat');
  }
}
function fitCanvas(cv) {
  const dpr = Math.min(G.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return null;
  if (cv.width !== r0(w * dpr) || cv.height !== r0(h * dpr)) { cv.width = r0(w * dpr); cv.height = r0(h * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  return { g, w, h };
}
const FONT = '"Sofia Sans Condensed", "Arial Narrow", sans-serif';
function drawWindDial(D) {
  const c = fitCanvas($('#windDial')); if (!c || !D) return;
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
let tellT = 0;
const leechVis = [0, 0, 0, 0], leechSeed = [0.7, 2.3, 3.9, 5.1];
const tellDot = st => (st === 'ok' ? '#3cd18a' : (st === 'wind' || st === 'lee' || st === 'pole' || st === 'limp') ? '#f2be4b' : '#ff7b6e');
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
const jibCols = D => (D.jib.fill < 0 ? ['#2bbf6a', '#ec4a50'] : ['#ec4a50', '#2bbf6a']);
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
    if (S.rig.furl >= 0.97) { g.fillStyle = '#93b2c0'; g.fillText(t('tt_furled'), 52, y); return; }
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
  if (S.rig.furl >= 0.97) { g.fillStyle = '#93b2c0'; g.font = `600 10px ${FONT}`; g.fillText(t('tt_furled_long'), 6, 36); }
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
function drawTell(D, dt) {
  const c = fitCanvas($('#tellCanvas')); if (!c || !D) return;
  tellT += dt; updateLeech(D);
  if (c.w < 200) drawTellCompact(c.g, c.w, c.h, D); else drawTellFull(c.g, c.w, c.h, D);
}
$('#tellCard').addEventListener('click', () => { if (isPhone()) $('#tellCard').classList.toggle('min'); });

/* ---------- полоса приборов: перетаскивание меняет высоту 3D ---------- */
function applyStageFrac(f) {
  ui.stageFrac = clamp(f, 0.22, 0.72);
  document.documentElement.style.setProperty('--stage-h', `${(ui.stageFrac * 100).toFixed(1)}%`);
}
{
  const strip = $('#strip');
  strip.addEventListener('pointerdown', e => {
    ui.stripMoved = false;
    if (!mqStack.matches) return;
    const app = $('#app').getBoundingClientRect();
    ui.stripDrag = { id: e.pointerId, y0: e.clientY, h0: $('#stageWrap').getBoundingClientRect().height, appH: app.height, stripH: strip.getBoundingClientRect().height, moved: false };
  });
  strip.addEventListener('pointermove', e => {
    const d = ui.stripDrag; if (!d || e.pointerId !== d.id) return;
    const dy = e.clientY - d.y0;
    if (!d.moved) { if (Math.abs(dy) < 6) return; d.moved = true; ui.stripMoved = true; try { strip.setPointerCapture(e.pointerId); } catch (_) { /* нет захвата */ } }
    const h = clamp(d.h0 + dy, d.appH * 0.22, Math.max(d.appH * 0.22, d.appH - d.stripH - 110));
    applyStageFrac(h / d.appH);
    e.preventDefault();
  });
  const end = () => { const d = ui.stripDrag; ui.stripDrag = null; if (d && d.moved) store.set('stageFrac', ui.stageFrac); };
  strip.addEventListener('pointerup', end); strip.addEventListener('pointercancel', end);
  $('#cScore').addEventListener('click', () => {
    if (ui.stripMoved) { ui.stripMoved = false; return; }
    setTab('score'); $('#panel').scrollTop = 0;
  });
}

/* ---------- ветер и курс ---------- */
const BFT_LIM = [1, 4, 7, 11, 17, 22, 28, 34, 99];
const beaufort = kn => t('bft')[BFT_LIM.findIndex(x => kn < x)];
function buildWindDial() {
  const svg = $('#dirDial');
  let ticks = '';
  for (let a = 0; a < 360; a += 10) {
    const big = a % 30 === 0, r1 = big ? 59 : 63, r2 = 67, s = Math.sin(a * D2R), c = Math.cos(a * D2R);
    ticks += `<line x1="${(75 + r1 * s).toFixed(1)}" y1="${(75 - r1 * c).toFixed(1)}" x2="${(75 + r2 * s).toFixed(1)}" y2="${(75 - r2 * c).toFixed(1)}" stroke="var(--ink-3)" stroke-width="${big ? 1.5 : 1}"/>`;
  }
  svg.innerHTML = `<circle cx="75" cy="75" r="69" fill="var(--surface-2)" stroke="var(--line)"/>${ticks}` +
    `<text x="75" y="26" text-anchor="middle">${t('dial_n')}</text><text x="126" y="79" text-anchor="middle">${t('dial_e')}</text><text x="75" y="133" text-anchor="middle">${t('dial_s')}</text><text x="24" y="79" text-anchor="middle">${t('dial_w')}</text>` +
    '<g id="ddBoat"><path d="M75 50 C 83 60 84 84 81 100 L 69 100 C 66 84 67 60 75 50 Z" fill="var(--ink)" opacity="0.8"/></g>' +
    '<g id="ddWind"><line x1="75" y1="12" x2="75" y2="42" stroke="#2f7fd6" stroke-width="4" stroke-linecap="round"/><path d="M75 52 L66 38 L84 38 Z" fill="#2f7fd6"/><circle cx="75" cy="12" r="8" fill="#2f7fd6"/></g>';
}
function buildShift() {
  $('#shiftBtns').innerHTML = [-20, -10, 10, 20].map(d => `<button type="button" class="btn" data-shift="${d}">${d > 0 ? '+' : '−'}${Math.abs(d)}°<small id="sh_${d}"></small></button>`).join('');
  $$('#shiftBtns [data-shift]').forEach(b => b.addEventListener('click', () => {
    const d = +b.dataset.shift, before = S.D ? S.D.twaAbs : 0;
    SIM.setWind(S, { shift: d, dur: 3 });
    const after = Math.abs(wrap180(S.wind.baseTwd + d - S.boat.hdg));
    const text = t('shift_toast', after < before, Math.abs(d));
    toast(text, 'info'); effectTouch(text, null);
  }));
}
function initWind() {
  const svg = $('#dirDial');
  const ang = e => { const r = svg.getBoundingClientRect(); const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2; return r0(wrap360(Math.atan2(x, -y) / D2R)); };
  const setDir = e => { SIM.setWind(S, { twd: ang(e) }); effectTouch(t('eff_dir'), null); };
  svg.addEventListener('pointerdown', e => { try { svg.setPointerCapture(e.pointerId); } catch (_) { /* нет захвата */ } ui.dialDrag = true; setDir(e); });
  svg.addEventListener('pointermove', e => { if (ui.dialDrag) setDir(e); });
  const stop = () => { ui.dialDrag = false; };
  svg.addEventListener('pointerup', stop); svg.addEventListener('pointercancel', stop);
  svg.addEventListener('keydown', e => {
    const d = (e.key === 'ArrowRight' || e.key === 'ArrowUp') ? 5 : (e.key === 'ArrowLeft' || e.key === 'ArrowDown') ? -5 : 0;
    if (d) { e.preventDefault(); SIM.setWind(S, { twd: S.wind.baseTwd + d }); effectTouch(t('eff_dir'), null); }
  });
  $('#twsR').value = S.wind.baseTws;
  $('#twsR').addEventListener('input', e => { SIM.setWind(S, { tws: parseFloat(e.target.value) }); effectTouch(t('eff_speed'), null); });
  $('#gusts').addEventListener('change', e => SIM.setWind(S, { gusts: e.target.checked }));
  $('#hdgR').addEventListener('input', e => { SIM.setLash(S, false); S.helm.auto = null; S.heave = null; S.boat.hdg = parseFloat(e.target.value); effectTouch(t('eff_helm'), null); });
  const rnd = () => { SIM.randomEvent(S); };
  $('#btnRandom').addEventListener('click', rnd);
  $('#btnRandom2').addEventListener('click', rnd);
}
function updateWind(D) {
  const W = S.wind;
  if (document.activeElement !== $('#twsR')) $('#twsR').value = W.baseTws;
  $('#twsOut').textContent = t('tws_out', f1(W.baseTws)) + (W.gusts ? t('tws_now', f1(D.tws)) : '');
  $('#bft').textContent = beaufort(W.baseTws);
  $('#twdOut').textContent = deg3(W.baseTwd);
  $('#dirDial').setAttribute('aria-valuenow', String(r0(W.baseTwd)));
  if (document.activeElement !== $('#hdgR')) $('#hdgR').value = r0(wrap360(S.boat.hdg)) % 360;
  $('#hdgOut').textContent = deg3(S.boat.hdg);
  $('#gusts').checked = W.gusts;
  $('#ddWind').setAttribute('transform', `rotate(${W.twd.toFixed(1)} 75 75)`);
  $('#ddBoat').setAttribute('transform', `rotate(${S.boat.hdg.toFixed(1)} 75 75)`);
  for (const d of [-20, -10, 10, 20]) {
    const after = Math.abs(wrap180(W.baseTwd + d - S.boat.hdg));
    $('#sh_' + d).textContent = after < D.twaAbs ? t('shift_header') : t('shift_lift');
  }
  $('#shiftNote').textContent = t('shift_note', t('tack_nom', D.tack), r0(D.twaAbs));
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
  $$('#deckSvg .hit').forEach(g => g.classList.toggle('sel', !!ui.sel && g.dataset.kind === ui.sel.kind && (g.dataset.key || '') === (ui.sel.key || '')));
}
function select(kind, key) {
  ui.sel = kind ? { kind, key } : null;
  ui.selHint = false;
  markSel();
  ui.selSig = '';
  renderSel();
  let h = null;
  if (ui.sel) {
    if (kind === 'line') h = key; else if (kind === 'car') h = 'car' + key; else if (kind === 'trav') h = 'trav'; else if (kind === 'bs') h = 'backstay'; else if (kind === 'winch') h = S.deck.winch[key];
    camFocus(DECK_FOCUS[selKey(ui.sel)]);
  }
  hl(h);
}
function holdBtn(id, hold, name) { const el = $('#' + id); if (!el) return; holdable(el, () => { S.deck.hold = hold; effectTouch(name, null); }, () => { SIM.deckRelease(S); }); }
const SG_DOT = () => `<button type="button" class="st st-na" id="sgSt" aria-expanded="false" aria-controls="sgHint">–</button>`;
const SG_HINT = '<div class="ihint" id="sgHint" hidden><div class="ih-h"><b></b><span></span></div><p class="diag"></p><p class="act"></p></div>';
function renderSel() {
  const host = $('#selCard'), sel = ui.sel;
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
    if (prim) $('#sbPole').addEventListener('click', () => { if (SIM.deckSetPole(S, S.rig.pole === side ? 0 : side)) effectTouch(t('eff_pole'), null); });
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
    ui.selSig = 'w' + occ;
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
  if (sb) sb.addEventListener('click', () => { ui.selHint = !ui.selHint; updateSel(); });
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
  const sel = ui.sel; if (!sel) return;
  const R = S.rig, D = S.D, d = S.deck, T = ui.showTargets ? (ui.targets || SIM.solveTrim(S)) : null;
  if (!D) return;
  if (sel.kind === 'winch') { if (ui.selSig !== 'w' + d.winch[sel.key]) renderSel(); return; }
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
    setSt(sb, it); sb.setAttribute('aria-expanded', String(ui.selHint));
    sb.title = t('sg_title', it ? it.name : '—', stTxt(it ? it.status : 'na'));
    const box = $('#sgHint'); box.hidden = !ui.selHint;
    if (ui.selHint) fillHint(box, it);
  }
}
function updateDeckSide() {
  const d = S.deck, msg = $('#deckMsg');
  if (d.msg && S.t - d.msg.t < 3.5) { msg.hidden = false; msg.textContent = SIM.msgText(d.msg); } else msg.hidden = true;
  $('#deckLog').innerHTML = d.log.map(l => `<li class="${l.kind === 'bad' ? 'bad' : ''}">${esc(SIM.logText(l))}</li>`).join('') || `<li>${t('log_empty')}</li>`;
}

/* ---------- сценарии ---------- */
function buildScenarios() {
  const groups = [];
  for (const s of SIM.SCENARIOS) {
    let g = groups.find(x => x.def === s.group);
    if (!g) { g = { def: s.group, list: [] }; groups.push(g); }
    g.list.push(s);
  }
  let html = '';
  for (const g of groups) {
    html += `<div class="group scgroup"><h3>${esc(L(g.def))}</h3><div class="sclist">`;
    for (const s of g.list) html += `<div class="sc-item" data-id="${s.id}"><div><span class="lvl">${esc(t('difficulty', '●'.repeat(s.level) + '○'.repeat(3 - s.level)))}</span><h4>${esc(L(s.title))}</h4></div><button type="button" class="btn" data-start="${s.id}">${t('start')}</button><p>${esc(L(s.brief))}</p></div>`;
    html += '</div></div>';
  }
  $('#scList').innerHTML = html;
  $$('#scList [data-start]').forEach(b => b.addEventListener('click', () => startScn(b.dataset.start)));
  refreshScnMarks();
}
function initScenarios() {
  $('#btnExitScn').addEventListener('click', exitScn);
  $('#bExit').addEventListener('click', exitScn);
  $('#bAgain').addEventListener('click', () => { if (S.scn) startScn(S.scn.def.id); });
  $('#bNow').addEventListener('click', () => SIM.fireNow(S));
  $('#bHint').addEventListener('click', () => { ui.todoOpen = !ui.todoOpen; updateBanner(); });
  $('#bTog').addEventListener('click', () => { ui.bannerOpen = !ui.bannerOpen; updateBanner(); });
  $('#bTop').addEventListener('click', e => { if (!isPhone() || e.target.closest('#bTog')) return; ui.bannerOpen = !ui.bannerOpen; updateBanner(); });
  $('#dbClose').addEventListener('click', () => { $('#debrief').hidden = true; });
  $('#dbAgain').addEventListener('click', () => { if (S.scn) startScn(S.scn.def.id); });
  $('#dbNext').addEventListener('click', () => {
    const list = SIM.SCENARIOS, i = S.scn ? list.findIndex(s => s.id === S.scn.def.id) : -1;
    startScn(list[(i + 1) % list.length].id);
  });
}
function refreshScnMarks() {
  $$('#scList .sc-item').forEach(el => {
    el.classList.toggle('active', !!S.scn && S.scn.def.id === el.dataset.id);
    el.classList.toggle('done', !!ui.completed[el.dataset.id]);
  });
  $('#btnExitScn').hidden = !S.scn;
  $('#freeTitle').textContent = S.scn ? t('scn_title', L(S.scn.def.title)) : t('free_title');
}
function startScn(id) {
  SIM.startScenario(S, id);
  ui.todoOpen = false; ui.bannerOpen = false; ui.selItem = null; ui.anim = null;
  eff.name = null;
  $('#debrief').hidden = true;
  if (S.mode === 'quick') syncSliders(true);
  select(null);
  if (scene) scene.setView(ui.view, { focus: 'all' });
  if (ui.view === 'auto') ui.lastFocus = 'all';
  if (isPhone()) { setTab('ctl'); $('#panel').scrollTop = 0; }
  refreshScnMarks();
  toast(L(S.scn.def.brief), 'info', 6500);
}
function exitScn() { S.scn = null; $('#debrief').hidden = true; refreshScnMarks(); updateBanner(); }
const mmss = x => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
function objText(o) { return o.type === 'heading' ? t('obj_heading', deg3(o.hdg)) : t('obj_' + o.type); }
function updateBanner() {
  const sc = S.scn, b = $('#banner');
  if (!sc) { b.hidden = true; return; }
  b.hidden = false;
  b.classList.toggle('open', ui.bannerOpen);
  $('#bTog').setAttribute('aria-expanded', String(ui.bannerOpen));
  $('#bTog').textContent = ui.bannerOpen ? '▴' : '▾';
  $('#bTitle').textContent = L(sc.def.title);
  $('#bObj').textContent = objText(sc.def.objective);
  const next = sc.def.events[sc.evIdx];
  const at = next ? (sc.nextAt != null ? sc.nextAt : next.at) : 0;
  let ph = '';
  if (sc.phase === 'steady' && next) ph = t('ph_wait', Math.max(0, Math.ceil(at - sc.t)));
  else if (sc.phase === 'respond') ph = t('ph_resp', mmss(sc.t - (sc.tEvent || 0))) + (next ? t('ph_next', Math.max(0, Math.ceil(at - sc.t))) : '');
  else if (sc.phase === 'done') ph = t('ph_done', r0(sc.doneT));
  $('#bPhase').textContent = ph;
  $('#bNow').hidden = !next || sc.phase === 'done';
  $('#bOk').hidden = sc.phase !== 'respond';
  $('#bOk i').style.width = `${clamp(sc.okT / 4, 0, 1) * 100}%`;
  const todo = $('#bTodo'), key = sc.def.id + I18N.lang;
  todo.hidden = !ui.todoOpen;
  if (ui.todoOpen && ui.todoKey !== key) { ui.todoKey = key; todo.innerHTML = L(sc.def.todo).map(x => `<li>${esc(x)}</li>`).join(''); }
  $('#bHint').textContent = ui.todoOpen ? t('b_hint_hide') : t('b_hint');
}
function renderDebrief() {
  const sc = S.scn; if (!sc) return;
  const mist = [...new Set(sc.mistakes.map(SIM.mistakeText))];
  const k = $('#dbKicker');
  k.textContent = mist.length ? t('db_mist') : t('db_ok');
  k.style.color = mist.length ? 'var(--warn)' : 'var(--ok)';
  $('#dbTitle').textContent = L(sc.def.title);
  $('#dbTime').textContent = t('sec', r0(sc.doneT));
  $('#dbScore').textContent = `${r0((sc.finalScore || 0) * 100)}%`;
  $('#dbMist').innerHTML = mist.length ? `<h3>${t('db_mistakes')}</h3><ul class="mist">${mist.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : '';
  $('#dbTodo').innerHTML = L(sc.def.todo).map(x => `<li>${esc(x)}</li>`).join('');
  $('#dbWhy').textContent = L(sc.def.why);
}
function showDebrief() {
  const sc = S.scn; if (!sc) return;
  renderDebrief();
  $('#debrief').hidden = false;
  ui.completed[sc.def.id] = true; store.set('done', ui.completed);
  refreshScnMarks();
  $('#dbNext').focus();
}

/* ---------- события ---------- */
function handleEvents() {
  while (S.events.length) {
    const e = S.events.shift();
    switch (e.type) {
      case 'windEvent': toast(e.data, 'info', 4800); effectTouch(e.data, null); break;
      case 'run': toast(SIM.logText({ k: 'run', a: [e.data] }), 'bad', 5000); break;
      case 'crash': toast(t('ev_crash'), 'bad', 5500); break;
      case 'gybe': toast(t('ev_gybe'), 'info'); break;
      case 'tack': toast(t('ev_tack'), 'info', 2500); break;
      case 'broach': toast(t('ev_broach'), 'bad', 5500); break;
      case 'irons': if (!S.helm.lash) toast(t('ev_irons'), 'warn', 5500); break;
      case 'hoveTo': toast(t('heave_done'), 'info', 5000); syncHelm(); break;
      case 'block': if (isPhone() && S.mode === 'deck') toast(e.data, 'warn', 4500); break;
      case 'scenarioDone': showDebrief(); break;
      default: break;
    }
  }
}

/* ---------- смена языка ---------- */
function relocalize() {
  SIM.setLang(I18N.lang);
  buildQuick(); syncSliders(true);
  buildItems(); buildWindDial(); buildShift(); buildDeck(); buildScenarios();
  renderSel(); syncPause(); syncLangUI();
  ui.todoKey = '';
  if (!$('#debrief').hidden) renderDebrief();
  const D = S.D;
  if (D) {
    if (isPhone()) updateStrip(D); else updateHud(D);
    updateScore(D); updateBanner(); updateCtlStatus(D);
    if (S.mode === 'deck') { updateDeck(); updateSel(); updateDeckSide(); }
    updateWind(D);
  }
}
I18N.onChange(relocalize);

/* ---------- смена раскладки ---------- */
function onLayout() {
  closeCamMenu();
  setTab(ui.tab);
  if (scene) scene.setFrameMargin(isPhone() ? 1.14 : 1.03);
  resize();
}

/* ---------- сборка и цикл ---------- */
buildQuick(); initScore(); buildItems(); buildWindDial(); buildShift(); initWind(); buildDeck(); initDeck(); renderSel(); initScenarios(); buildScenarios();
syncSliders(true); syncPause(); syncLangUI();
applyStageFrac(ui.stageFrac);
setTab('ctl');
onMq(mqPhone, onLayout); onMq(mqStack, onLayout);
if (scene) {
  scene.setFrameMargin(isPhone() ? 1.14 : 1.03);
  resize();
  if (typeof G.ResizeObserver === 'function') new G.ResizeObserver(resize).observe($('#stage'));
  else G.addEventListener('resize', resize);
  scene.update(S, S.D, 0.016, { showWind: ui.showWind, rdt: 0.016 });
}
setView(ui.view, true);
if (scene) { scene.render(); $('#loading').hidden = true; }
if (isPhone() && !store.get('phoneTip', false)) {
  store.set('phoneTip', true);
  setTimeout(() => toast(t('phone_tip'), 'info', 7000), 700);
}
let last = G.performance.now(), accP = 0, accC = 0;
function frame(now) {
  const rdt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  if (ui.anim) stepAnim(rdt);
  const D = SIM.step(S, rdt);
  if (scene && D) {
    try { scene.update(S, D, S.paused ? 0 : rdt, { showWind: ui.showWind, rdt }); scene.render(); }
    catch (err) { console.error(err); }
  }
  handleEvents();
  accC += rdt; accP += rdt;
  if (accC >= 1 / 30 && D) { if (!isPhone()) drawWindDial(D); drawTell(D, S.paused ? 0 : accC); accC = 0; }
  if (accP >= 0.1 && D) {
    accP = 0;
    if (isPhone()) updateStrip(D); else { updateHud(D); $('#effChip').hidden = true; }
    $('#hHdg2').textContent = deg3(D.hdg);
    $('#helmBar').dataset.man = D.twaAbs <= 100 ? 'tack' : D.twaAbs >= 110 ? 'gybe' : 'none';
    syncHelm();
    updateScore(D); updateBanner();
    if (S.mode === 'quick') { syncSliders(false); updateTargets(); updateCtlStatus(D); }
    else {
      if (ui.showTargets && S.t - ui.tgtT > 0.5) { ui.targets = SIM.solveTrim(S); ui.tgtT = S.t; }
      updateDeck(); updateSel(); updateDeckSide();
    }
    if (!$('[data-pane="wind"]').hidden) updateWind(D);
    $('#tellVerdict').textContent = S.rig.furl >= 0.97 ? t('tt_furled') : t('tv_' + D.tell.jib[1]);
  }
  G.requestAnimationFrame(frame);
}
G.requestAnimationFrame(frame);
G.KOLD = { S, ui, eff, scene, setView, setTab, effectTouch, I18N };
})(window);
