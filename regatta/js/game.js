/* ============================================================
   Колдунчик · Регата — интерфейс и главный цикл
   Меню трасс, гонка с ускорением времени, руль с клавиатуры
   и ползунком, паруса по выбранному режиму, приборы, карта,
   метки над знаками, события гонки и экран результатов.
   ============================================================ */
(function (G) {
'use strict';
const SIM = G.SIM, I18N = G.I18N, GEO = G.GEO, KRACE = G.KRACE, KCOURSES = G.KCOURSES, KDeck = G.KDeck, KG = G.KGauges;
const { clamp, wrap180 } = SIM;
const { esc, setSt, fillHint, itemOf } = KDeck;
const t = (k, ...a) => I18N.t(k, ...a);
const L = v => SIM.loc(v);
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const r0 = Math.round;
const f1 = x => (Math.round(x * 10) / 10).toFixed(1);
const mmss = s => { const n = Math.max(0, Math.floor(s + 1e-6)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
const store = {
  get(k, d) { try { const v = G.localStorage.getItem('kold.regatta.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { G.localStorage.setItem('kold.regatta.' + k, JSON.stringify(v)); } catch (e) { /* хранилище недоступно */ } }
};
SIM.setLang(I18N.lang);

const Q_PHONE = '(max-width: 860px) and (orientation: portrait), (max-width: 620px), (orientation: landscape) and (max-height: 520px)';
const mqPhone = typeof G.matchMedia === 'function' ? G.matchMedia(Q_PHONE) : { matches: false };
const isPhone = () => !!mqPhone.matches;
const VIEWS = ['chase', 'all', 'high', 'helm'];
const WARPS = [1, 2, 4];
const MODES = KRACE.MODES;

const ui = {
  courseId: store.get('course', 'intro'), mode: store.get('mode', 'auto'), best: store.get('best', {}) || {}, rivals: store.get('rivals', 3),
  warp: 1, paused: true, view: 'chase', keyL: false, keyR: false, fine: false, slider: 0, sliderOn: false,
  finished: false, toastAt: {}, trimBadT: 0, trimToastT: -1e9, openHints: {}
};
if (!KCOURSES.byId(ui.courseId)) ui.courseId = KCOURSES.COURSES[0].id;
if (!MODES.includes(ui.mode)) ui.mode = 'auto';
if (![0, 3, 5].includes(ui.rivals)) ui.rivals = 3;

/* ---------- 3D ---------- */
let scene = null;
try { if (G.THREE && G.KScene) scene = G.KScene.createScene($('#gl'), { world: true }); } catch (e) { console.error(e); scene = null; }
if (!scene) { const l = $('#loading'), p = $('#loading p'); p.removeAttribute('data-t'); p.textContent = t('err_webgl'); l.classList.add('nogl'); }
const map = G.KMap.createMap($('#map'));
const tellBoard = KG.createTell();
let race = null, me = null, world = null, pilot = null, tgt = null, rivalPilots = [];
const nameOf = id => { const b = race && race.boats.find(x => x.id === id); return b ? (b.player ? t('r_you') : L(b.name)) : ''; };
const placeOf = b => KRACE.standings(race).indexOf(b) + 1;
const deck = KDeck.createDeck({
  getS: () => me.S, highlight: k => { if (scene) scene.highlight(k); }, focus: () => {}, effect: () => {}, targets: () => null
});

function resize() {
  measure();
  if (!scene) return;
  scene.resize(Math.max(1, box.viewW), Math.max(1, box.viewH));
}
const pos3 = b => ({ x: b.x, z: -b.y });

/* ---------- всплывающие сообщения ---------- */
function toast(text, kind, ms) {
  const host = $('#toasts'), el = document.createElement('div');
  el.className = `toast glass ${kind || 'info'}`; el.textContent = text; host.appendChild(el);
  const max = isPhone() ? 2 : 3;
  while (host.children.length > max) host.firstChild.remove();
  setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 450); }, ms || 4200);
}
function toastOnce(key, text, kind, ms, gap) {
  const now = G.performance.now();
  if (now - (ui.toastAt[key] || -1e9) < (gap || 3000)) return;
  ui.toastAt[key] = now; toast(text, kind, ms);
}

/* ---------- гонка ---------- */
function newRace() {
  const def = KCOURSES.byId(ui.courseId);
  if (world) { world.dispose(); world = null; }
  race = KRACE.createRace(def, { mode: ui.mode, rivals: ui.rivals });
  me = race.boats[0];
  pilot = ui.autopilot ? G.KPILOT.createPilot(race, me, { trim: true }) : null;
  rivalPilots = race.boats.filter(b => b.rival).map(b => G.KPILOT.createPilot(race, b, { tactics: b.tactics }));
  tgt = KRACE.target(race, me);
  ui.finished = false; ui.trimBadT = 0;
  if (scene) {
    world = G.KWorld.createWorld(scene, race);
    scene.update(me.S, me.S.D, 0.016, { showWind: false, rdt: 0.016, pos: pos3(me) });
    scene.setView(ui.view, { instant: true });
    world.update(0, me, tgt);
  }
  map.reset();
  $('#results').hidden = true;
  buildSails();
  hud(true);
}
function startRace() {
  store.set('course', ui.courseId); store.set('mode', ui.mode); store.set('rivals', ui.rivals);
  newRace();
  closeOverlays();
  ui.paused = false;
  toast(L(race.C.def.title) + ' · ' + t('sm_' + ui.mode), 'info', 3500);
}
function closeOverlays() { $('#menu').hidden = true; $('#pauseBox').hidden = true; $('#results').hidden = true; }
function pause(on) {
  if (!race) return;
  if (on && !$('#menu').hidden) return;
  ui.paused = on; $('#pauseBox').hidden = !on;
  if (on) $('#pResume').focus({ preventScroll: true });
}

/* ---------- руль ---------- */
const rud = $('#rudder'), thumb = $('#rudderThumb');
let rudDrag = null;
// размеры руля и 3D-окна читаем при изменении раскладки, а не в каждом кадре
const box = { rudW: 0, viewW: 1, viewH: 1 };
function measure() {
  box.rudW = rud.getBoundingClientRect().width;
  const v = $('#view').getBoundingClientRect(); box.viewW = v.width; box.viewH = v.height;
}
function sliderFrom(e) {
  const r = rud.getBoundingClientRect(), half = Math.max(20, (r.width - 76) / 2);
  ui.slider = clamp((e.clientX - (r.left + r.width / 2)) / half, -1, 1);
}
rud.addEventListener('pointerdown', e => {
  rudDrag = e.pointerId; ui.sliderOn = true; rud.classList.add('drag');
  try { rud.setPointerCapture(e.pointerId); } catch (_) { /* нет захвата */ }
  sliderFrom(e); e.preventDefault();
});
rud.addEventListener('pointermove', e => { if (rudDrag === e.pointerId) sliderFrom(e); });
const rudEnd = () => { if (rudDrag == null) return; rudDrag = null; ui.sliderOn = false; ui.slider = 0; rud.classList.remove('drag'); };
rud.addEventListener('pointerup', rudEnd); rud.addEventListener('pointercancel', rudEnd); rud.addEventListener('lostpointercapture', rudEnd);
rud.addEventListener('contextmenu', e => e.preventDefault());
function drawRudder() {
  const half = Math.max(20, (box.rudW - 76) / 2);
  const shown = ui.sliderOn ? ui.slider : (ui.keyR ? 1 : 0) - (ui.keyL ? 1 : 0);
  thumb.style.transform = `translateX(${(shown * half).toFixed(1)}px)`;
  const act = me ? me.rudder : 0, tr = box.rudW - 88;
  const bar = $('#rudderAct');
  bar.style.left = act >= 0 ? '50%' : `calc(50% - ${(-act * tr / 2).toFixed(1)}px)`;
  bar.style.width = `${(Math.abs(act) * tr / 2).toFixed(1)}px`;
  rud.setAttribute('aria-valuenow', String(r0(act * 100)));
}

function maneuver(kind) {
  if (!race || ui.paused) return;
  // после финиша обороты не считаются: невыполненные уже добавлены ко времени
  if (kind === 'penalty') {
    if (me.finishT == null && !KRACE.maneuver(race, me, 'penalty')) toast(t(me.pen.due > 0 ? 'pen_stuck' : 'pen_none'), 'info', 2200);
    return;
  }
  if (!KRACE.maneuver(race, me, kind)) { toast(t(kind === 'tack' ? 'tack_bad' : 'gybe_bad'), 'warn'); return; }
  if (kind === 'tack' && me.mode === 'deck') toast(t('tack_deck'), 'info', 5000);
  if (kind === 'gybe' && me.mode !== 'auto' && me.S.rig.main > 0.25) toast(t('gybe_eased'), 'warn', 5000);
}
$('#btnTack').addEventListener('click', () => maneuver('tack'));
$('#btnGybe').addEventListener('click', () => maneuver('gybe'));
$('#btnPen').addEventListener('click', () => maneuver('penalty'));

/* ---------- клавиатура ---------- */
const typing = el => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
document.addEventListener('keydown', e => {
  if (typing(e.target) && e.target.type !== 'range') return;
  const c = e.code;
  if (c === 'Escape') { e.preventDefault(); if (!$('#menu').hidden || !$('#results').hidden) return; pause($('#pauseBox').hidden); return; }
  if (!$('#menu').hidden || !$('#pauseBox').hidden) return;
  if (c === 'ArrowLeft' || c === 'KeyA') { ui.keyL = true; ui.fine = e.shiftKey; e.preventDefault(); }
  else if (c === 'ArrowRight' || c === 'KeyD') { ui.keyR = true; ui.fine = e.shiftKey; e.preventDefault(); }
  else if (e.repeat) return;
  else if (c === 'KeyT') maneuver('tack');
  else if (c === 'KeyG') maneuver('gybe');
  else if (c === 'KeyR') maneuver('penalty');
  else if (c === 'Digit1' || c === 'Numpad1') setWarp(1);
  else if (c === 'Digit2' || c === 'Numpad2') setWarp(2);
  else if (c === 'Digit4' || c === 'Numpad4') setWarp(4);
  else if (c === 'KeyC') setView(VIEWS[(VIEWS.indexOf(ui.view) + 1) % VIEWS.length]);
  else if (c === 'KeyM') toggleMap();
});
document.addEventListener('keyup', e => {
  const c = e.code;
  if (c === 'ArrowLeft' || c === 'KeyA') ui.keyL = false;
  if (c === 'ArrowRight' || c === 'KeyD') ui.keyR = false;
  if (c === 'ShiftLeft' || c === 'ShiftRight') ui.fine = false;
});
G.addEventListener('blur', () => { ui.keyL = ui.keyR = false; });

/* ---------- время, камера, карта, язык ---------- */
function setWarp(n) {
  ui.warp = n; $('#rWarp').textContent = `×${n}`;
  $('#rWarp').classList.toggle('on', n > 1);
}
$('#rWarp').addEventListener('click', () => { setWarp(WARPS[(WARPS.indexOf(ui.warp) + 1) % WARPS.length]); });
function setView(v) {
  ui.view = v;
  $$('#rCamBar [data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  if (scene) scene.setView(v, {});
}
function closeCam() { $('#rCamBar').classList.remove('open'); $('#rCam').setAttribute('aria-expanded', 'false'); }
$('#rCam').addEventListener('click', () => {
  const open = !$('#rCamBar').classList.contains('open');
  $('#rCamBar').classList.toggle('open', open); $('#rCam').setAttribute('aria-expanded', String(open));
});
$$('#rCamBar [data-view]').forEach(b => b.addEventListener('click', () => { setView(b.dataset.view); closeCam(); }));
document.addEventListener('pointerdown', e => { if ($('#rCamBar').classList.contains('open') && !e.target.closest('#rCamBar, #rCam')) closeCam(); });
$('#rMenu').addEventListener('click', () => pause(true));
function toggleMap() { map.toggle(); $('#mapMode').textContent = t(map.mode === 'leg' ? 'map_leg' : 'map_course'); }
$('#map').addEventListener('click', toggleMap);
$('#map').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMap(); } });
$('#tellCard').addEventListener('click', () => { if (isPhone()) $('#tellCard').classList.toggle('min'); });
$$('.langsw [data-lang]').forEach(b => b.addEventListener('click', () => I18N.set(b.dataset.lang)));
$('#rLang').addEventListener('click', () => I18N.set(I18N.lang === 'ru' ? 'en' : 'ru'));
function syncLang() {
  $$('.langsw [data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === I18N.lang)));
  $('#rLang').textContent = I18N.lang === 'ru' ? 'EN' : 'RU';
  $('#rLang').setAttribute('lang', I18N.lang === 'ru' ? 'en' : 'ru');
  $$('a.toTrainer').forEach(a => a.setAttribute('href', I18N.lang === 'en' ? '../#en' : '../'));
  $('#mapMode').textContent = t(map.mode === 'leg' ? 'map_leg' : 'map_course');
}

/* ---------- паруса ---------- */
const QS = [
  { key: 'jibSheet', lk: 'q_jibSheet', ek: 'e_inEased', item: 'jibAoA', min: 0, max: 1, step: 0.005, out: () => (me.S.D ? t('o_jib', r0(Math.abs(me.S.D.jib.delta))) : '') },
  { key: 'mainsheet', lk: 'q_mainsheet', ek: 'e_inEased', item: 'mainAoA', min: 0, max: 1, step: 0.005, out: () => t('o_boom', r0(Math.abs(me.S.boomAngle))) },
  { key: 'travLee', lk: 'q_trav', ek: 'e_trav', item: 'mainAoA', min: -1, max: 1, step: 0.02, out: v => (v > 0.02 ? t('o_trav_lee', `${r0(v * 100)}%`) : v < -0.02 ? t('o_trav_win', `${r0(-v * 100)}%`) : t('o_trav_c')) }
];
function buildSails() {
  if (!me) return;
  const m = me.mode;
  $('#sailsMode').textContent = t('sm_' + m);
  $('#sailsNote').textContent = t(m === 'auto' ? 'auto_note' : m === 'quick' ? 'quick_note' : 'deck_note_r');
  $('#quickBox').hidden = m !== 'quick';
  $('#deckBox').hidden = m !== 'deck';
  $('#dock').dataset.mode = m;
  if (m === 'quick') {
    $('#quickBox').innerHTML = QS.map(c => `<div class="ctl"><div class="ctl-top"><label for="q_${c.key}">${esc(t(c.lk))}</label>` +
      `<button type="button" class="st st-na" id="st_${c.key}" aria-expanded="false" aria-controls="ih_${c.key}" title="${esc(t('st_title', t(c.lk)))}">–</button><output id="o_${c.key}"></output></div>` +
      `<div class="range"><input type="range" id="q_${c.key}" min="${c.min}" max="${c.max}" step="${c.step}"></div>` +
      `<div class="ends">${t(c.ek).map(e => `<span>${esc(e)}</span>`).join('')}</div>` +
      `<div class="ihint" id="ih_${c.key}" hidden><div class="ih-h"><b></b><span></span></div><p class="diag"></p><p class="act"></p></div></div>`).join('');
    for (const c of QS) {
      const el = $('#q_' + c.key);
      el.value = me.S.quick[c.key];
      el.addEventListener('input', () => { me.S.quick[c.key] = parseFloat(el.value); if (scene) scene.highlight(c.key === 'jibSheet' ? (me.S.D && me.S.D.jib.fill > 0 ? 'sheetS' : 'sheetP') : c.key === 'travLee' ? 'trav' : 'main'); });
      el.addEventListener('change', () => { if (scene) scene.highlight(null); });
    }
    $$('#quickBox .st').forEach(b => b.addEventListener('click', () => { const k = b.id.slice(3); ui.openHints[k] = !ui.openHints[k]; syncSails(true); }));
  } else $('#quickBox').innerHTML = '';
  if (m === 'deck') { deck.build(); deck.select(null); }
  buildCourseCard();
  syncSails(true);
}
// дистанция по порядку: пройдено ✓, текущая цель ▸
function buildCourseCard() {
  const C = race.C, legs = C.def.legs;
  $('#ccName').textContent = L(C.def.title);
  const items = [t('cc_start')].concat(legs.map((l, i) => t('cc_mark', i + 1, t('mk_' + C.marks[l[0]].kind), t(l[1] === 'port' ? 'side_port' : 'side_stbd'))), [t('cc_finish')]);
  $('#ccLegs').innerHTML = items.map((x, i) => `<li data-i="${i}">${esc(x)}</li>`).join('');
  $('#ccWind').textContent = t('cc_wind', C.def.wind.tws, String(Math.round(((C.twd % 360) + 360) % 360)).padStart(3, '0'));
  ui.ccSig = '';
}
function syncCourseCard() {
  const cur = me.finishT != null ? race.C.legs.length : me.started ? me.leg : 0, sig = cur + (me.ocs ? 'o' : '');
  if (ui.ccSig === sig) return;
  ui.ccSig = sig;
  $$('#ccLegs li').forEach(li => { const i = +li.dataset.i; li.className = i < cur ? 'done' : i === cur ? 'cur' : ''; });
}
function syncSails(force) {
  if (!me) return;
  const D = me.S.D;
  if (me.mode === 'quick') {
    for (const c of QS) {
      const el = $('#q_' + c.key); if (!el) continue;
      if (force || document.activeElement !== el) el.value = me.S.quick[c.key];
      $('#o_' + c.key).textContent = c.out(me.S.quick[c.key]);
      const it = itemOf(D, c.item), b = $('#st_' + c.key), open = !!ui.openHints[c.key];
      setSt(b, it); b.setAttribute('aria-expanded', String(open));
      const box = $('#ih_' + c.key); box.hidden = !open; if (open) fillHint(box, it);
    }
  } else if (me.mode === 'deck' && D) { deck.update(); deck.updateSel(); deck.updateSide(); }
}

/* ---------- меню ---------- */
function bestOf(id, mode) { const b = ui.best[id]; return b && b[mode] != null ? b[mode] : null; }
function buildMenu() {
  $('#courseList').innerHTML = KCOURSES.COURSES.map(def => {
    const C = KCOURSES.buildCourse(def), best = bestOf(def.id, ui.mode);
    return `<button type="button" class="course" role="radio" aria-checked="${def.id === ui.courseId}" data-id="${def.id}">` +
      `<span class="ct"><h4>${esc(L(def.title))}</h4><span class="lvl">${esc(t('c_level', def.level))}</span></span>` +
      `<span class="meta">${esc(t('c_meta', C.length, Math.max(1, r0(C.estimate / 60)), def.wind.tws))}</span>` +
      `<p>${esc(L(def.brief))}</p>` +
      `<span class="best${best == null ? ' none' : ''}">${esc(best == null ? t('c_none') : t('c_best', mmss(best)))}</span></button>`;
  }).join('');
  $$('#courseList .course').forEach(b => b.addEventListener('click', () => {
    ui.courseId = b.dataset.id;
    $$('#courseList .course').forEach(x => x.setAttribute('aria-checked', String(x.dataset.id === ui.courseId)));
    newRace(); ui.paused = true;
  }));
  $$('#modeSeg [data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === ui.mode)));
  $$('#rivalSeg [data-rivals]').forEach(b => {
    const n = +b.dataset.rivals;
    b.setAttribute('aria-pressed', String(n === ui.rivals));
    b.textContent = n ? t('rv_n', n) : t('rv_none');
  });
}
$$('#modeSeg [data-mode]').forEach(b => b.addEventListener('click', () => { ui.mode = b.dataset.mode; buildMenu(); }));
$$('#rivalSeg [data-rivals]').forEach(b => b.addEventListener('click', () => { ui.rivals = +b.dataset.rivals; buildMenu(); newRace(); ui.paused = true; }));
$('#goBtn').addEventListener('click', startRace);
function showMenu() {
  ui.paused = true; buildMenu();
  $('#pauseBox').hidden = true; $('#results').hidden = true; $('#menu').hidden = false;
  if (race && (race.C.id !== ui.courseId || race.t > -race.C.countdown + 0.01)) newRace();
  const sel = $(`#courseList [data-id="${ui.courseId}"]`);
  if (sel) sel.focus({ preventScroll: true });
}
$('#pResume').addEventListener('click', () => pause(false));
$('#pRestart').addEventListener('click', () => { closeOverlays(); newRace(); ui.paused = false; });
$('#pMenu').addEventListener('click', showMenu);
$('#resAgain').addEventListener('click', () => { closeOverlays(); newRace(); ui.paused = false; });
$('#resMenu').addEventListener('click', showMenu);

/* ---------- результаты ---------- */
let lastResult = null;
function finish() {
  ui.finished = true;
  const r = KRACE.result(race, me);
  const prev = bestOf(r.course, r.mode), record = prev == null || r.total < prev - 1e-6;
  if (record) { ui.best[r.course] = Object.assign({}, ui.best[r.course], { [r.mode]: r.total }); store.set('best', ui.best); }
  lastResult = { r, prev, record };
  setTimeout(() => { if (ui.finished && me && me.finishT != null) { renderResults(); $('#results').hidden = false; $('#results .card').scrollTop = 0; $('#resAgain').focus({ preventScroll: true }); } }, 1600);
}
function renderResults() {
  if (!lastResult) return;
  const { r, prev, record } = lastResult;
  $('#resKicker').textContent = record ? t('r_record') : '';
  $('#resCourse').textContent = `${L(race.C.def.title)} · ${t('r_mode', t('sm_' + r.mode))}`;
  $('#resTime').textContent = mmss(r.total);
  $('#resTimeK').textContent = r.penalty ? t('r_total') : t('r_time');
  const best = record ? r.total : prev;
  $('#resBest').textContent = best == null ? '—' : mmss(best);
  $('#resPen').hidden = !r.penalty;
  if (r.penalty) $('#resPen').textContent = t('r_pen', r.turnsDue, r0(r.penalty));
  const legs = [r.startDelay].concat(r.legs).map((x, i, a) => (i ? mmss(x - a[i - 1]) : null)).slice(1).join(' · ');
  const rows = [
    [t('r_start'), t('sec_s', f1(Math.max(0, r.startDelay)))],
    [t('r_legs'), legs],
    [t('r_dist'), t('dist', r.dist)],
    [t('r_avg'), t('kn_v', f1(r.avg))],
    [t('r_trim'), `${r0(r.trim * 100)}%`],
    [t('r_turns'), `${r.tacks} / ${r.gybes}`],
    [t('r_touch'), String(r.touches)],
    [t('r_ground'), String(r.aground)],
    [t('r_ocs'), r.ocs ? t('r_yes') : t('r_no')]
  ];
  if (r.crashes) rows.push([t('r_crash'), String(r.crashes)]);
  $('#resStats').innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  renderTable();
}
// места в гонке: соперники, которые ещё не финишировали, — «на дистанции»
function renderTable() {
  const box = $('#resTableBox');
  box.hidden = race.boats.length < 2;
  if (box.hidden) return;
  const list = KRACE.standings(race), n = list.length;
  $('#resKicker').textContent = (lastResult && lastResult.record ? t('r_record') + ' · ' : '') + t('r_place', list.indexOf(me) + 1, n);
  $('#resTable').innerHTML = list.map(b => {
    const col = b.player ? '#ff4fb0' : '#' + b.color.toString(16).padStart(6, '0');
    const time = b.finishT != null ? mmss(b.finishT + b.pen.due * KRACE.PEN_LATE) : t('r_racing');
    return `<li class="${b.player ? 'me' : ''}"><i style="background:${col}"></i><span>${esc(b.player ? t('r_you') : L(b.name))}</span><span>${esc(time)}</span></li>`;
  }).join('');
}

/* ---------- события гонки ---------- */
function handleEvents() {
  for (const e of race.events) {
    if (e.boat && !e.player) {
      // соперники: столкновение с нами по их вине и финиш
      if (e.type === 'collision' && e.otherPlayer) toast(t('ev_hit_them', nameOf(e.boat)), 'warn', 5000);
      if (e.type === 'finish') { toast(t('ev_rival_fin', nameOf(e.boat), placeOf(race.boats.find(x => x.id === e.boat))), 'info', 3500); if (!$('#results').hidden) renderTable(); }
      continue;
    }
    switch (e.type) {
      case 'signal': toast(t('ev_signal', e.left), e.left <= 10 ? 'warn' : 'info', e.left <= 5 ? 900 : 2600); break;
      case 'gun': toast(t('ev_gun'), 'info', 2600); break;
      case 'ocs': toast(t('ev_ocs'), 'bad', 7000); break;
      case 'ocsClear': toast(t('ev_ocsClear'), 'info', 3500); break;
      case 'started': toast(t('ev_started', r0(e.late)), 'info', 3500); break;
      case 'missLine': toastOnce('miss', t('ev_missLine'), 'warn', 4500, 8000); break;
      case 'mark': toast(t('ev_mark', e.n, e.of), 'info', 3500); break;
      case 'wrongSide': toast(t('ev_wrong', t(e.side > 0 ? 'side_port' : 'side_stbd')), 'bad', 7000); break;
      case 'touch': toast(t('ev_touch'), 'bad', 6000); break;
      case 'penaltyDone': toast(t('ev_penDone', e.left), 'info', 3500); break;
      case 'aground': toastOnce('ground' + e.what, t('ev_aground_' + e.what), 'bad', 5000, 4000); break;
      case 'crash': toast(t('ev_crash'), 'bad', 5500); break;
      case 'collision': toast(t('ev_hit_me', e.why), 'bad', 6500); break;
      case 'giveWay': toastOnce('give' + e.other, t('ev_give', e.why, nameOf(e.other)), 'warn', 4000, 9000); break;
      case 'broach': toastOnce('broach', t('ev_broach'), 'bad', 5000, 8000); break;
      case 'irons': toastOnce('irons', t('ev_irons'), 'warn', 5000, 10000); break;
      case 'finish': toast(t('ev_finish'), 'info', 3000); break;
      default: break;
    }
  }
  race.events.length = 0;
}
// подсказка, если в «Быстрых настройках» паруса сильно не настроены
function trimWatch(dt) {
  const D = me.S.D;
  if (me.mode !== 'quick' || !D || (!me.started && race.t < -20)) { ui.trimBadT = 0; return; }
  const bad = D.eta < 0.6 && D.twaAbs > 35;
  ui.trimBadT = bad ? ui.trimBadT + dt : 0;
  if (ui.trimBadT > 5 && G.performance.now() - ui.trimToastT > 25000) {
    ui.trimToastT = G.performance.now(); ui.trimBadT = 0;
    const over = ['lee', 'stall'].includes(D.tell.jib[1]);
    toast(t(over ? 'trim_over' : 'trim_bad'), 'warn', 6000);
  }
}

/* ---------- приборы и полоса гонки ---------- */
const deg = a => `${r0(a)}°`;
function hud(force) {
  if (!race || !me || !me.S.D) return;
  const D = me.S.D, C = race.C, b = me;
  tgt = KRACE.target(race, b);
  // часы
  const pre = race.t < 0, fin = b.finishT != null;
  $('#clockK').textContent = t(fin ? 'rb_fin' : pre ? 'rb_pre' : 'rb_race');
  $('#clock').textContent = fin ? mmss(b.finishT) : pre ? mmss(Math.ceil(-race.t - 1e-6)) : mmss(race.t);
  const bar = $('#raceBar');
  bar.classList.toggle('alert', tgt.kind === 'ocs');
  bar.classList.toggle('go', !pre && !fin && race.t < 4);
  // цель
  let k = '', txt = '', side = 0;
  if (tgt.kind === 'start') { k = t('nx_line'); txt = race.t < 0 ? t('nx_line_info', tgt.dist) : `${t('nx_go')} · ${t('dist', tgt.dist)}`; }
  else if (tgt.kind === 'ocs') { k = t('nx_line'); txt = t('nx_ocs'); }
  else if (tgt.kind === 'mark') { k = `${t('nx_mark', tgt.n, tgt.of)} · ${t('mk_' + tgt.mark.kind)}`; txt = `${t(tgt.side > 0 ? 'side_port' : 'side_stbd')} · ${t('dist', tgt.dist)}`; side = tgt.side; }
  else if (tgt.kind === 'finish') { k = t('nx_finish'); txt = t('dist', tgt.dist); }
  else { k = t('nx_done'); txt = mmss(b.finishT); }
  $('#nextK').textContent = k; $('#nextText').textContent = txt;
  const sd = $('#nextSide'); sd.hidden = !side; sd.className = 'sidedot ' + (side > 0 ? 'port' : 'stbd');
  // после финиша обороты уже не считаются: невыполненные — добавка ко времени в итогах
  const pl = $('#penLine');
  pl.hidden = !(b.pen.due > 0) || fin;
  if (!pl.hidden) pl.textContent = t('pen_due', b.pen.due, Math.min(360, r0(Math.abs(b.pen.acc))));
  const many = race.boats.length > 1 && race.t >= 0;
  $('#placeBox').hidden = !many;
  if (many) $('#place').textContent = `${placeOf(b)}/${race.boats.length}`;
  // приборы
  const vmc = tgt.pos ? D.bsp * Math.cos((D.hdg - GEO.bearing(b, tgt.pos)) * SIM.D2R) : 0;
  const sc = r0(D.score * 100);
  $('#iSpeed').textContent = f1(D.bsp);
  $('#iSpeedD').textContent = D.polar > 0.5 ? t('i_of', f1(D.polar)) : '';
  $('#iVmc').textContent = f1(vmc);
  $('#iTwa').textContent = deg(D.twaAbs);
  $('#iTwaD').textContent = t('i_tack', D.tack);
  $('#iWind').textContent = f1(D.tws);
  const shift = wrap180(D.twd - C.twd), hdr = shift * D.tack < 0, sh = Math.abs(shift);
  const wd = $('#iWindD');
  wd.textContent = sh < 2 ? t('sh_mean') : t(hdr ? 'sh_header' : 'sh_lift', r0(sh));
  wd.className = 'd' + (sh >= 2 ? ' chg' : '');
  const it = $('#iTrim'); it.textContent = `${sc}%`; it.className = sc >= 85 ? 'ok' : sc >= 60 ? 'warn' : 'bad';
  $('#iTrimD').textContent = t(sc >= 85 ? 's_good' : sc >= 60 ? 's_fair' : 's_poor');
  // руль и кнопки
  const hb = $('#helmBox');
  hb.dataset.man = D.twaAbs <= 100 ? 'tack' : D.twaAbs >= 110 ? 'gybe' : 'none';
  const penOn = b.pen.due > 0 && b.finishT == null, auto = !!me.S.helm.auto;
  hb.classList.toggle('penOn', penOn);
  $('#btnPen').hidden = !penOn;
  // пока лодка в повороте или уже крутит оборот, кнопка не нужна
  $('#btnPen').disabled = auto;
  if (penOn) $('#btnPen').textContent = b.pen.due > 1 ? t('h_pen_n', b.pen.due) : t('h_pen');
  $('#btnTack').disabled = auto || D.twaAbs > 100; $('#btnGybe').disabled = auto || D.twaAbs < 110;
  $('#tellVerdict').textContent = me.S.rig.furl >= 0.97 ? t('tt_furled') : t('tv_' + D.tell.jib[1]);
  if (me.mode === 'auto' && !isPhone()) KG.drawWindDial($('#windDial'), D);
  syncCourseCard();
  syncSails(force);
}

/* ---------- метки над знаками ---------- */
const labelEls = {};
function label(id) {
  if (!labelEls[id]) { const el = document.createElement('div'); el.className = 'mlabel'; $('#labels').appendChild(el); labelEls[id] = el; }
  return labelEls[id];
}
const V3 = scene ? new G.THREE.Vector3() : null;
function placeLabel(el, p, h, html) {
  const cam = scene.camera, W = box.viewW, H = box.viewH;
  V3.set(p.x, h, -p.y).project(cam);
  let x = (V3.x * 0.5 + 0.5) * W, y = (-V3.y * 0.5 + 0.5) * H;
  const behind = V3.z > 1;
  if (behind) { x = W - x; y = H - y; }
  const m = 40, inside = !behind && x > m && x < W - m && y > m + 30 && y < H - m;
  let arrow = '';
  if (!inside) {
    // знак за краем — прижимаем метку к краю и показываем стрелку в его сторону
    const cx = W / 2, cy = H / 2;
    let dx = x - cx, dy = y - cy;
    if (behind) { dx = -dx; dy = Math.abs(dy) + H; }
    const k = Math.min((W / 2 - m) / Math.max(1e-6, Math.abs(dx)), (H / 2 - m - 20) / Math.max(1e-6, Math.abs(dy)));
    x = cx + dx * k; y = cy + dy * k + 20;
    arrow = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'][((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];
  }
  el.classList.toggle('edge', !inside);
  const key = html + arrow;
  if (el.dataset.k !== key) { el.dataset.k = key; el.innerHTML = html + (arrow ? `<em class="arr">${arrow}</em>` : ''); }
  el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
  el.hidden = false;
}
function labels() {
  if (!scene || !race) return;
  for (const id in labelEls) labelEls[id].hidden = true;
  if (!tgt) return;
  if (tgt.kind === 'mark') {
    const col = tgt.side > 0 ? '#ff4b55' : '#2fd37c';
    placeLabel(label('next'), tgt.mark.pos, 7, `<i style="background:${col}"></i>${tgt.n} · ${esc(t('dist', tgt.dist))}`);
  } else if (tgt.kind === 'finish' || tgt.kind === 'start' || tgt.kind === 'ocs') {
    const L0 = tgt.line, txt = tgt.kind === 'finish' ? t('map_finish') : t('map_start');
    placeLabel(label('next'), L0.mid, 5, `<i style="background:${tgt.kind === 'finish' ? '#7fb8ff' : '#ffffff'}"></i>${esc(txt)} · ${esc(t('dist', tgt.dist))}`);
  }
  // имена соперников поблизости — только когда они в кадре
  for (const o of race.boats) {
    if (!o.rival || Math.hypot(o.x - me.x, o.y - me.y) > 450) continue;
    V3.set(o.x, 21, -o.y).project(scene.camera);
    if (V3.z > 1 || Math.abs(V3.x) > 0.95 || Math.abs(V3.y) > 0.92) continue;
    const el = label('rv' + o.id), html = `<i style="background:#${o.color.toString(16).padStart(6, '0')}"></i>${esc(L(o.name))}`;
    if (el.dataset.k !== html) { el.dataset.k = html; el.innerHTML = html; }
    el.classList.add('rv');
    el.style.transform = `translate(${((V3.x * 0.5 + 0.5) * box.viewW).toFixed(1)}px, ${((-V3.y * 0.5 + 0.5) * box.viewH).toFixed(1)}px) translate(-50%, -100%)`;
    el.hidden = false;
  }
}

/* ---------- смена языка ---------- */
function relocalize() {
  SIM.setLang(I18N.lang);
  syncLang();
  buildMenu();
  buildSails();
  if (me && me.mode === 'deck') deck.render();
  if (!$('#results').hidden) renderResults();
  for (const id in labelEls) labelEls[id].dataset.k = '';
  hud(true);
}
I18N.onChange(relocalize);
function onLayout() { closeCam(); if (scene) scene.setFrameMargin(isPhone() ? 1.1 : 1.0); resize(); }
if (mqPhone.addEventListener) mqPhone.addEventListener('change', onLayout); else if (mqPhone.addListener) mqPhone.addListener(onLayout);

/* ---------- запуск и цикл ---------- */
syncLang();
setWarp(1);
newRace();
resize();
if (typeof G.ResizeObserver === 'function') { const ro = new G.ResizeObserver(resize); ro.observe($('#view')); ro.observe(rud); }
else G.addEventListener('resize', resize);
if (scene) {
  scene.setFrameMargin(isPhone() ? 1.1 : 1.0);
  setView(ui.view);
  scene.setView(ui.view, { instant: true });
  scene.render();
  $('#loading').hidden = true;
}
showMenu();

let last = G.performance.now(), accH = 0, accM = 0, accT = 0;
function frame(now) {
  // на медленном устройстве шаг кадра больше, но гонка внутри делит его на шаги по 0.05 с
  const rdt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
  let gdt = 0;
  if (race && !ui.paused) {
    gdt = rdt * ui.warp;
    me.helm = ui.sliderOn ? ui.slider : (ui.keyR ? 1 : 0) - (ui.keyL ? 1 : 0);
    me.fine = ui.fine && !ui.sliderOn;
    if (pilot) pilot.update(gdt);
    for (const p of rivalPilots) p.update(gdt);
    KRACE.step(race, gdt);
    handleEvents();
    trimWatch(gdt);
    if (me.finishT != null && !ui.finished) finish();
  }
  if (race && me.S.D) {
    tgt = KRACE.target(race, me);
    if (scene) {
      try {
        scene.update(me.S, me.S.D, ui.paused ? rdt * 0.6 : gdt, { showWind: false, rdt, pos: pos3(me) });
        world.update(ui.paused ? 0 : gdt, me, tgt);
        scene.render();
        labels();
      } catch (err) { console.error(err); }
    }
    drawRudder();
    accH += rdt; accM += rdt; accT += rdt;
    if (accH >= 0.1) { accH = 0; hud(false); }
    if (accM >= 1 / 20) { map.draw(race, me, tgt, accM); accM = 0; }
    if (accT >= 1 / 30) { tellBoard.draw($('#tellCanvas'), me.S.D, me.S.rig.furl, ui.paused ? 0 : accT * Math.min(ui.warp, 2)); accT = 0; }
  }
  G.requestAnimationFrame(frame);
}
G.requestAnimationFrame(frame);

// для проверок: автопилот и ускорение больше ×4 включаются только отсюда
G.REGATTA = {
  get race() { return race; }, get me() { return me; }, ui,
  autopilot(on) { ui.autopilot = !!on; pilot = on && race ? G.KPILOT.createPilot(race, me, { trim: true }) : null; },
  warp(n) { ui.warp = n; $('#rWarp').textContent = `×${n}`; },
  start: startRace, menu: showMenu
};
})(window);
