/* ============================================================
   Колдунчик / Telltale — интерфейс и главный цикл
   Тексты — через I18N.t (интерфейс) и SIM.T / SIM.loc (модель).
   ============================================================ */
(function (G) {
'use strict';
const SIM = G.SIM, I18N = G.I18N;
const { clamp, lerp, wrap180, wrap360, sgn, D2R } = SIM;
const t = (k, ...a) => I18N.t(k, ...a);
const L = v => SIM.loc(v);
// статистика: js/analytics.js может отрезать блокировщик рекламы
const track = (name, params) => { if (G.KAnalytics) G.KAnalytics.track(name, params); };
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const r0 = Math.round;
const f1 = x => (Math.round(x * 10) / 10).toFixed(1);
const deg3 = a => String(r0(wrap360(a)) % 360).padStart(3, '0') + '°';
const { pct, esc } = G.KDeck;
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

/* ---------- удержание кнопки (js/deck.js) ---------- */
const { holdable } = G.KDeck;

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
  $$('a[href^="regatta/"]').forEach(a => a.setAttribute('href', I18N.lang === 'en' ? 'regatta/#en' : 'regatta/'));
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
  if (m !== S.mode) track('sail_mode', { mode: m });
  SIM.setMode(S, m);
  $('#modeQuick').setAttribute('aria-pressed', String(m === 'quick'));
  $('#modeDeck').setAttribute('aria-pressed', String(m === 'deck'));
  $('#quickPane').hidden = m !== 'quick';
  $('#deckPane').hidden = m !== 'deck';
  ui.anim = null;
  deck.select(null);
  if (m === 'quick') syncSliders(true);
  if (m === 'deck') toast(t('deck_toast'), 'info', 5500);
}
$('#modeQuick').addEventListener('click', () => setMode('quick'));
$('#modeDeck').addEventListener('click', () => setMode('deck'));

/* ---------- оценка: общие помощники ---------- */
const { ST_SYM, stTxt, itemOf, setSt, fillHint } = G.KDeck;
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
/* ---------- приборы на холсте (js/gauges.js) ---------- */
const tellBoard = G.KGauges.createTell();
const drawWindDial = D => G.KGauges.drawWindDial($('#windDial'), D);
const drawTell = (D, dt) => tellBoard.draw($('#tellCanvas'), D, S.rig.furl, dt);
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

/* ---------- палуба: схема, карточка снасти, журнал (js/deck.js) ---------- */
const deck = G.KDeck.createDeck({
  getS: () => S, highlight: hl, focus: camFocus, effect: name => effectTouch(name, null),
  targets: () => (ui.showTargets ? (ui.targets || SIM.solveTrim(S)) : null)
});

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
  track('scenario_start', { scenario: id });
  ui.todoOpen = false; ui.bannerOpen = false; ui.selItem = null; ui.anim = null;
  eff.name = null;
  $('#debrief').hidden = true;
  if (S.mode === 'quick') syncSliders(true);
  deck.select(null);
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
  buildItems(); buildWindDial(); buildShift(); deck.build(); buildScenarios();
  deck.render(); syncPause(); syncLangUI();
  ui.todoKey = '';
  if (!$('#debrief').hidden) renderDebrief();
  const D = S.D;
  if (D) {
    if (isPhone()) updateStrip(D); else updateHud(D);
    updateScore(D); updateBanner(); updateCtlStatus(D);
    if (S.mode === 'deck') { deck.update(); deck.updateSel(); deck.updateSide(); }
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
buildQuick(); initScore(); buildItems(); buildWindDial(); buildShift(); initWind(); deck.build(); deck.render(); initScenarios(); buildScenarios();
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
      deck.update(); deck.updateSel(); deck.updateSide();
    }
    if (!$('[data-pane="wind"]').hidden) updateWind(D);
    $('#tellVerdict').textContent = S.rig.furl >= 0.97 ? t('tt_furled') : t('tv_' + D.tell.jib[1]);
  }
  G.requestAnimationFrame(frame);
}
G.requestAnimationFrame(frame);
G.KOLD = { S, ui, eff, scene, setView, setTab, effectTouch, I18N };
})(window);
