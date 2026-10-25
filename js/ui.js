/* ============================================================
   Колдунчик — интерфейс и главный цикл
   ============================================================ */
(function (G) {
'use strict';
const SIM = G.SIM;
const { clamp, lerp, wrap180, wrap360, sgn, D2R, LINES, BOAT } = SIM;
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

/* ---------- состояние ---------- */
const S = SIM.createState();
SIM.applySolution(S, SIM.solveTrim(S));
for (let i = 0; i < 160; i++) SIM.step(S, 0.05);
S.events.length = 0;
const ui = { view: 'free', showWind: true, selItem: null, autoHints: !!store.get('autoHints', false), showTargets: false, targets: null, tgtT: -9,
  anim: null, completed: store.get('done', {}) || {}, todoOpen: false, sel: null, selSig: '', hlKey: undefined, dialDrag: false };

/* ---------- 3D ---------- */
let scene = null;
try { if (G.THREE && G.KScene) scene = G.KScene.createScene($('#gl')); } catch (e) { console.error(e); scene = null; }
if (!scene) $('#loading p').textContent = '3D-вид не запустился: браузер не поддерживает WebGL или библиотека не загрузилась. Приборы, колдунчики, оценка и сценарии работают.';
function hl(key) { if (scene && ui.hlKey !== key) { ui.hlKey = key; scene.highlight(key); } }
function resize() { if (!scene) return; const r = $('#stage').getBoundingClientRect(); scene.resize(Math.max(1, r.width), Math.max(1, r.height)); }

/* ---------- всплывающие сообщения ---------- */
function toast(text, kind, ms) {
  const host = $('#toasts'), el = document.createElement('div');
  el.className = `toast glass ${kind || 'info'}`; el.textContent = text; host.appendChild(el);
  while (host.children.length > 3) host.firstChild.remove();
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

/* ---------- руль и камера ---------- */
holdable($('#hLeft'), () => { S.helm.auto = null; S.helm.cmd = -1; }, () => { S.helm.cmd = 0; });
holdable($('#hRight'), () => { S.helm.auto = null; S.helm.cmd = 1; }, () => { S.helm.cmd = 0; });
holdable($('#hUp'), () => { S.helm.auto = null; S.helm.cmd = S.D ? sgn(S.D.twa) : 1; }, () => { S.helm.cmd = 0; });
holdable($('#hDown'), () => { S.helm.auto = null; S.helm.cmd = S.D ? -sgn(S.D.twa) : -1; }, () => { S.helm.cmd = 0; });
$('#hTack').addEventListener('click', () => {
  if (!SIM.startManeuver(S, 'tack')) toast('Оверштаг делают с острых курсов: ветер должен быть впереди траверза.', 'warn');
  else if (S.mode === 'deck') toast('Поворот начат. Когда стаксель заполощет — отдайте рабочий шкот и выберите шкот другого борта.', 'info', 5500);
});
$('#hGybe').addEventListener('click', () => {
  if (!SIM.startManeuver(S, 'gybe')) { toast('Поворот фордевинд делают с полных курсов: ветер должен быть сзади.', 'warn'); return; }
  if (S.rig.main > 0.25) toast('Гика-шкот потравлен — гик перебросит резко. Перед поворотом выберите его почти до центра.', 'warn', 5500);
});
document.addEventListener('keydown', e => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || (t.getAttribute && t.getAttribute('role') === 'slider'))) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); S.helm.auto = null; S.helm.cmd = e.key === 'ArrowLeft' ? -1 : 1; S.helm.fine = e.shiftKey; }
});
document.addEventListener('keyup', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { S.helm.cmd = 0; S.helm.fine = false; } });
$$('#camBar [data-view]').forEach(b => b.addEventListener('click', () => {
  ui.view = b.dataset.view;
  $$('#camBar [data-view]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  if (scene) scene.setView(ui.view);
}));
$('#btnWindVis').addEventListener('click', e => { ui.showWind = !ui.showWind; e.currentTarget.setAttribute('aria-pressed', String(ui.showWind)); });
function togglePause() { S.paused = !S.paused; const b = $('#btnPause'); b.setAttribute('aria-pressed', String(S.paused)); b.textContent = S.paused ? 'Продолжить' : 'Пауза'; }
$('#btnPause').addEventListener('click', togglePause);

/* ---------- вкладки и режимы ---------- */
$$('.tabs button').forEach(b => b.addEventListener('click', () => {
  $$('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  $$('.pane').forEach(p => { p.hidden = p.dataset.pane !== b.dataset.tab; });
}));
function setMode(m) {
  SIM.setMode(S, m);
  $('#modeQuick').setAttribute('aria-pressed', String(m === 'quick'));
  $('#modeDeck').setAttribute('aria-pressed', String(m === 'deck'));
  $('#quickPane').hidden = m !== 'quick';
  $('#deckPane').hidden = m !== 'deck';
  ui.anim = null;
  select(null);
  if (m === 'quick') syncSliders(true);
  if (m === 'deck') toast('Режим «Палуба»: снасти держат стопора, лебёдки свободны. Чтобы что-то потравить — лебёдка, затем стопор.', 'info', 5500);
}
$('#modeQuick').addEventListener('click', () => setMode('quick'));
$('#modeDeck').addEventListener('click', () => setMode('deck'));

/* ---------- быстрые настройки ---------- */
const QS = [
  { title: 'Стаксель (генуя)', extra: 'goose', items: [
    { key: 'jibSheet', label: 'Шкот стакселя', min: 0, max: 1, step: 0.005, ends: ['выбран', 'потравлен'], hl: () => (S.D && S.D.jib.fill > 0 ? 'sheetS' : 'sheetP'), out: () => (S.D ? `стаксель ${r0(Math.abs(S.D.jib.delta))}° к ДП` : '') },
    { key: 'car', label: 'Каретка стакселя', min: 0, max: 1, step: 1 / 14, ends: ['вперёд', 'назад'], hl: () => (S.D && S.D.jib.fill > 0 ? 'carS' : 'carP'), out: v => `отверстие ${r0(v * 14) + 1} из 15` },
    { key: 'open', label: 'Раскрытие стакселя', min: 0, max: 1, step: 0.01, ends: ['закручен', 'раскрыт'], hl: () => 'furl', out: v => pct(v) }
  ] },
  { title: 'Грот', extra: 'reef', items: [
    { key: 'mainsheet', label: 'Гика-шкот', min: 0, max: 1, step: 0.005, ends: ['выбран', 'потравлен'], hl: () => 'main', out: () => `гик ${r0(Math.abs(S.boomAngle))}°` },
    { key: 'travLee', label: 'Погон гика-шкота', min: -1, max: 1, step: 0.02, ends: ['на ветер', 'центр', 'под ветер'], hl: () => 'trav', out: v => (v > 0.02 ? `${pct(v)} под ветер` : v < -0.02 ? `${pct(-v)} на ветер` : 'по центру') },
    { key: 'vang', label: 'Оттяжка гика', min: 0, max: 1, step: 0.01, ends: ['слабо', 'туго'], hl: () => 'vang', out: pct },
    { key: 'outhaul', label: 'Аутхол', min: 0, max: 1, step: 0.01, ends: ['пузатый низ', 'плоский низ'], hl: () => 'outhaul', out: pct },
    { key: 'luff', label: 'Фал грота — натяжение', min: 0, max: 1, step: 0.01, ends: ['слабо', 'туго'], hl: () => 'halyard', out: pct }
  ] },
  { title: 'Рангоут', items: [
    { key: 'backstay', label: 'Ахтерштаг', min: 0, max: 1, step: 0.01, ends: ['потравлен', 'туго'], hl: () => 'backstay', out: pct }
  ] }
];
const QKEYS = QS.flatMap(g => g.items.map(c => c.key));
function buildQuick() {
  let html = '';
  for (const g of QS) {
    html += `<div class="group"><h3>${g.title}</h3>`;
    for (const c of g.items) {
      html += `<div class="ctl"><div class="ctl-top"><label for="q_${c.key}">${c.label}</label><output id="o_${c.key}"></output></div>` +
        `<div class="range"><span class="tgt" id="t_${c.key}" hidden></span><input type="range" id="q_${c.key}" min="${c.min}" max="${c.max}" step="${c.step}"></div>` +
        `<div class="ends">${c.ends.map(e => `<span>${e}</span>`).join('')}</div></div>`;
    }
    if (g.extra === 'goose') html += '<div class="toggle-row" id="gooseRow" hidden><label class="check"><input type="checkbox" id="q_goose"> Бабочка: стаксель на выносном гике на другой борт</label></div>';
    if (g.extra === 'reef') html += '<div class="ctl"><div class="ctl-top"><span style="font-weight:500">Рифы</span><output id="o_reef"></output></div><div class="seg" id="reefSeg" role="group" aria-label="Рифы"><button type="button" data-reef="0">Полный грот</button><button type="button" data-reef="1">1-й риф</button><button type="button" data-reef="2">2-й риф</button></div></div>';
    html += '</div>';
  }
  $('#quickGroups').innerHTML = html;
  for (const g of QS) for (const c of g.items) {
    const el = $('#q_' + c.key);
    el.value = S.quick[c.key];
    el.addEventListener('input', () => { S.quick[c.key] = parseFloat(el.value); ui.anim = null; });
    el.addEventListener('pointerdown', () => hl(c.hl()));
    el.addEventListener('focus', () => hl(c.hl()));
  }
  $('#q_goose').addEventListener('change', e => { S.quick.goose = e.target.checked; });
  $$('#reefSeg button').forEach(b => b.addEventListener('click', () => { S.quick.reef = +b.dataset.reef; ui.anim = null; }));
  $('#showTargets').addEventListener('change', e => { ui.showTargets = e.target.checked; ui.tgtT = -9; });
}
function syncSliders(force) {
  for (const g of QS) for (const c of g.items) {
    const el = $('#q_' + c.key), v = S.quick[c.key];
    if (force || ui.anim || document.activeElement !== el) el.value = v;
    $('#o_' + c.key).textContent = c.out(v);
  }
  $$('#reefSeg button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.reef === S.quick.reef)));
  $('#o_reef').textContent = S.quick.reef ? `${S.quick.reef}-й риф` : 'полный грот';
  const D = S.D, showGoose = D && D.twaAbs > 140;
  $('#gooseRow').hidden = !showGoose && !S.quick.goose;
  $('#q_goose').checked = !!S.quick.goose;
}
function updateTargets() {
  if (!ui.showTargets) { if (ui.targets) { ui.targets = null; $$('.tgt').forEach(t => { t.hidden = true; }); } return; }
  if (S.t - ui.tgtT > 0.5) { ui.targets = SIM.solveTrim(S); ui.tgtT = S.t; }
  const T = ui.targets;
  for (const g of QS) for (const c of g.items) {
    const t = $('#t_' + c.key);
    t.hidden = false; t.style.left = `${clamp((T[c.key] - c.min) / (c.max - c.min), 0, 1) * 100}%`;
  }
}
$('#btnSolve').addEventListener('click', () => {
  const T = SIM.solveTrim(S);
  if (S.mode === 'quick') {
    ui.anim = { from: Object.assign({}, S.quick), to: T, t: 0, dur: 1.4 };
    S.quick.reef = T.reef; S.quick.goose = T.goose;
    toast('Паруса выставляются по ветру — посмотрите, что меняется на шкалах и в колдунчиках.', 'info');
  } else {
    ui.showTargets = true; $('#showTargets').checked = true; ui.tgtT = -9;
    toast('Зелёные метки на шкалах снастей — правильные значения. Выставьте их стопорами и лебёдками.', 'info', 5500);
  }
});
function stepAnim(dt) {
  const a = ui.anim; a.t += dt;
  const k = SIM.smooth(0, 1, a.t / a.dur);
  for (const key of QKEYS) S.quick[key] = lerp(a.from[key], a.to[key], k);
  if (a.t >= a.dur) ui.anim = null;
}

/* ---------- оценка ---------- */
const ST_TXT = { ok: 'хорошо', warn: 'можно лучше', bad: 'плохо', na: 'не оценивается' };
const ST_SYM = { ok: '✓', warn: '!', bad: '✕', na: '–' };
function buildItems() {
  $('#items').innerHTML = SIM.ITEM_DEFS.map(d => `<button type="button" class="item st-na" data-id="${d.id}" aria-pressed="false"><span class="dot">–</span><span class="nm">${d.name}<small>${d.sub}</small></span></button>`).join('');
  $$('#items .item').forEach(b => b.addEventListener('click', () => { ui.selItem = ui.selItem === b.dataset.id ? null : b.dataset.id; updateScore(S.D); }));
  $('#scoreBar').innerHTML = '<i></i>'.repeat(20);
  $('#hintClose').addEventListener('click', () => { ui.selItem = null; if (ui.autoHints) { ui.autoHints = false; $('#autoHints').checked = false; store.set('autoHints', false); } updateScore(S.D); });
  $('#autoHints').checked = ui.autoHints;
  $('#autoHints').addEventListener('change', e => { ui.autoHints = e.target.checked; store.set('autoHints', ui.autoHints); updateScore(S.D); });
  $('#btnTop').addEventListener('click', () => {
    const D = S.D;
    if (D && D.top) { ui.selItem = D.top.id; updateScore(D); }
    else { ui.selItem = null; toast('Исправлять нечего: все пункты в норме.', 'info'); updateScore(D); }
  });
}
function updateScore(D) {
  if (!D) return;
  const sc = r0(D.score * 100);
  $('#scoreNum').innerHTML = `${sc}<span>%</span>`;
  const bar = $('#scoreBar'), on = r0(sc / 5);
  bar.className = 'segbar' + (sc < 60 ? ' bad' : sc < 85 ? ' warn' : '');
  Array.from(bar.children).forEach((i, k) => i.classList.toggle('on', k < on));
  $('#scoreSub').textContent = `${D.pos} · ${D.tack > 0 ? 'правый' : 'левый'} галс · ${f1(D.bsp)} уз из ${f1(D.polar)} по поляре`;
  for (const b of $$('#items .item')) {
    const it = D.items.find(x => x.id === b.dataset.id);
    b.hidden = !it;
    if (!it) continue;
    b.className = `item st-${it.status}`;
    b.querySelector('.dot').textContent = ST_SYM[it.status];
    b.setAttribute('aria-pressed', String(ui.selItem === it.id));
    b.title = `${it.name}: ${ST_TXT[it.status]}`;
  }
  let id = ui.selItem;
  if (id && !D.items.find(x => x.id === id)) id = ui.selItem = null;
  if (!id && ui.autoHints && D.top) id = D.top.id;
  const box = $('#hintBox');
  if (!id) { box.hidden = true; return; }
  const it = D.items.find(x => x.id === id);
  box.hidden = false; box.className = `hint st-${it.status}`;
  $('#hintName').textContent = it.name;
  $('#hintSt').textContent = ST_TXT[it.status];
  $('#hintDiag').textContent = it.diag || '';
  $('#hintAct').textContent = it.status === 'ok' || it.status === 'na' ? '' : (it.act || '');
}

/* ---------- приборы ---------- */
function updateHud(D) {
  $('#hBsp').innerHTML = `${f1(D.bsp)}<small>уз</small>`;
  $('#hVmg').innerHTML = D.twaAbs < 90 ? `VMG к ветру <b>${f1(D.vmg)}</b>` : `VMG от ветра <b>${f1(-D.vmg)}</b>`;
  $('#hHdg').textContent = deg3(D.hdg); $('#hHdg2').textContent = deg3(D.hdg);
  $('#hPos').textContent = D.pos;
  $('#hTws').innerHTML = `${f1(D.tws)}<small>уз</small>`;
  $('#hTwa').innerHTML = `<b>${r0(D.twaAbs)}°</b> ${D.tack > 0 ? 'пр.' : 'лев.'} галс · с ${deg3(D.twd)}`;
  $('#hAws').innerHTML = `${f1(D.aws)}<small>уз</small>`;
  $('#hAwa').innerHTML = `<b>${r0(D.awaAbs)}°</b> ${D.awa >= 0 ? 'справа' : 'слева'}`;
  $('#hHeel').textContent = `${r0(Math.abs(D.heel))}°`;
  $('#hRud').innerHTML = D.rudder > 0.7 ? `руль <b>${r0(D.rudder)}°</b> к ветру` : D.rudder < -0.7 ? `руль <b>${r0(-D.rudder)}°</b> от ветра` : 'руль нейтрален';
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
  g.fillStyle = 'rgba(234,243,246,0.72)'; g.font = `600 ${R * 0.13}px ${FONT}`; g.fillText(`ист. ${r0(D.twaAbs)}°`, cx, cy + R * 0.2);
}
const TELL_TXT = { ok: 'ровно', wind: 'трепещут наветренные', luff: 'заполаскивает', lee: 'срыв подветренных', stall: 'срыв потока', limp: 'в тени грота', aback: 'на ветру', flog: 'полощет', pole: 'бабочка' };
const TELL_MODE = { ok: ['stream', 'stream'], wind: ['flutter', 'stream'], luff: ['whip', 'flutter'], lee: ['stream', 'lift'], stall: ['stream', 'curl'], limp: ['hang', 'hang'], aback: ['whip', 'whip'], flog: ['whip', 'whip'], pole: ['curl', 'curl'] };
const RIB = { stream: [0, 0.07, 7], flutter: [-0.95, 0.55, 17], whip: [-0.5, 1.2, 25], lift: [-1.05, 0.3, 5], curl: [-2.3, 0.35, 3], hang: [1.45, 0.1, 2] };
let tellT = 0;
const leechVis = [0, 0, 0, 0], leechSeed = [0.7, 2.3, 3.9, 5.1];
function ribbon(g, x, y, mode, color, len, seed) {
  const P = RIB[mode] || RIB.stream;
  g.strokeStyle = color; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(x, y);
  let px = x, py = y;
  for (let i = 1; i <= 7; i++) {
    const a = P[0] + P[1] * Math.sin(tellT * P[2] + i * 0.9 + seed) * (0.3 + i / 7);
    px += Math.cos(a) * len / 7; py += Math.sin(a) * len / 7; g.lineTo(px, py);
  }
  g.stroke();
}
function drawTell(D, dt) {
  const c = fitCanvas($('#tellCanvas')); if (!c || !D) return;
  const { g, w, h } = c;
  tellT += dt;
  g.save(); g.scale(w / 236, h / 150);
  g.textAlign = 'left'; g.textBaseline = 'middle';
  g.font = `700 10px ${FONT}`; g.fillStyle = '#93b2c0';
  g.fillText('СТАКСЕЛЬ', 4, 8); g.fillText('ГРОТ', 168, 8);
  g.font = `600 10px ${FONT}`; g.fillText('наветр.', 52, 23); g.fillText('подветр.', 98, 23);
  const fill = D.jib.fill;
  const winCol = fill < 0 ? '#2bbf6a' : '#ec4a50', leeCol = fill < 0 ? '#ec4a50' : '#2bbf6a';
  [['верх', 2], ['сред.', 1], ['низ', 0]].forEach(([name, i], r) => {
    const y = 44 + r * 33;
    g.fillStyle = 'rgba(234,243,246,0.86)'; g.font = `600 11px ${FONT}`; g.fillText(name, 4, y);
    if (S.rig.furl >= 0.97) { g.fillStyle = '#93b2c0'; g.fillText('закручен', 52, y); return; }
    const st = D.tell.jib[i], m = TELL_MODE[st] || TELL_MODE.ok;
    g.strokeStyle = 'rgba(234,243,246,0.3)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(50, y - 9); g.lineTo(50, y + 9); g.moveTo(96, y - 9); g.lineTo(96, y + 9); g.stroke();
    ribbon(g, 51, y, m[0], winCol, 34, i * 1.7);
    ribbon(g, 97, y, m[1], leeCol, 34, i * 2.3 + 1);
    g.fillStyle = st === 'ok' ? '#3cd18a' : (st === 'wind' || st === 'lee' || st === 'pole' || st === 'limp') ? '#f2be4b' : '#ff7b6e';
    g.beginPath(); g.arc(146, y, 3.6, 0, Math.PI * 2); g.fill();
  });
  const xl = y => 172 + 34 * (y - 18) / 124;
  g.strokeStyle = 'rgba(234,243,246,0.35)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(168, 18); g.lineTo(168, 142); g.lineTo(206, 142); g.moveTo(172, 18); g.lineTo(206, 142); g.stroke();
  const hp = D.hoist;
  [0.86, 0.64, 0.42, 0.2].forEach((vv, k) => {
    const idx = 3 - k, y = 142 - vv * 124, x = xl(y);
    if (hp.headH < 0.3 || vv < hp.sBottom + 0.03) return;
    const p = D.tell.main[idx];
    const wob = 0.5 + 0.5 * Math.sin(tellT * 0.9 + leechSeed[idx]) * Math.sin(tellT * 0.37 + leechSeed[idx] * 2);
    leechVis[idx] += ((p > wob ? 1 : 0) - leechVis[idx]) * 0.12;
    ribbon(g, x, y, leechVis[idx] > 0.5 ? 'curl' : 'stream', '#f2552c', 26, idx * 1.3);
  });
  g.restore();
}

/* ---------- ветер и курс ---------- */
const BFT = [[1, 'штиль'], [4, '1 балл, тихий'], [7, '2 балла, лёгкий'], [11, '3 балла, слабый'], [17, '4 балла, умеренный'], [22, '5 баллов, свежий'], [28, '6 баллов, сильный'], [34, '7 баллов, крепкий'], [99, '8 баллов, очень крепкий']];
const beaufort = kn => BFT.find(b => kn < b[0])[1];
function buildWind() {
  const svg = $('#dirDial');
  let ticks = '';
  for (let a = 0; a < 360; a += 10) {
    const big = a % 30 === 0, r1 = big ? 59 : 63, r2 = 67, s = Math.sin(a * D2R), c = Math.cos(a * D2R);
    ticks += `<line x1="${(75 + r1 * s).toFixed(1)}" y1="${(75 - r1 * c).toFixed(1)}" x2="${(75 + r2 * s).toFixed(1)}" y2="${(75 - r2 * c).toFixed(1)}" stroke="var(--ink-3)" stroke-width="${big ? 1.5 : 1}"/>`;
  }
  svg.innerHTML = `<circle cx="75" cy="75" r="69" fill="var(--surface-2)" stroke="var(--line)"/>${ticks}` +
    '<text x="75" y="26" text-anchor="middle">С</text><text x="126" y="79" text-anchor="middle">В</text><text x="75" y="133" text-anchor="middle">Ю</text><text x="24" y="79" text-anchor="middle">З</text>' +
    '<g id="ddBoat"><path d="M75 50 C 83 60 84 84 81 100 L 69 100 C 66 84 67 60 75 50 Z" fill="var(--ink)" opacity="0.8"/></g>' +
    '<g id="ddWind"><line x1="75" y1="12" x2="75" y2="42" stroke="#2f7fd6" stroke-width="4" stroke-linecap="round"/><path d="M75 52 L66 38 L84 38 Z" fill="#2f7fd6"/><circle cx="75" cy="12" r="8" fill="#2f7fd6"/></g>';
  const ang = e => { const r = svg.getBoundingClientRect(); const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2; return r0(wrap360(Math.atan2(x, -y) / D2R)); };
  svg.addEventListener('pointerdown', e => { try { svg.setPointerCapture(e.pointerId); } catch (_) { /* нет захвата */ } ui.dialDrag = true; SIM.setWind(S, { twd: ang(e) }); });
  svg.addEventListener('pointermove', e => { if (ui.dialDrag) SIM.setWind(S, { twd: ang(e) }); });
  const stop = () => { ui.dialDrag = false; };
  svg.addEventListener('pointerup', stop); svg.addEventListener('pointercancel', stop);
  svg.addEventListener('keydown', e => {
    const d = (e.key === 'ArrowRight' || e.key === 'ArrowUp') ? 5 : (e.key === 'ArrowLeft' || e.key === 'ArrowDown') ? -5 : 0;
    if (d) { e.preventDefault(); SIM.setWind(S, { twd: S.wind.baseTwd + d }); }
  });
  $('#twsR').value = S.wind.baseTws;
  $('#twsR').addEventListener('input', e => SIM.setWind(S, { tws: parseFloat(e.target.value) }));
  $('#gusts').addEventListener('change', e => SIM.setWind(S, { gusts: e.target.checked }));
  $('#hdgR').addEventListener('input', e => { S.helm.auto = null; S.boat.hdg = parseFloat(e.target.value); });
  $('#shiftBtns').innerHTML = [-20, -10, 10, 20].map(d => `<button type="button" class="btn" data-shift="${d}">${d > 0 ? '+' : '−'}${Math.abs(d)}°<small id="sh_${d}"></small></button>`).join('');
  $$('#shiftBtns [data-shift]').forEach(b => b.addEventListener('click', () => {
    const d = +b.dataset.shift, before = S.D ? S.D.twaAbs : 0;
    SIM.setWind(S, { shift: d, dur: 3 });
    const after = Math.abs(wrap180(S.wind.baseTwd + d - S.boat.hdg));
    toast(`Ветер ${after < before ? 'заходит' : 'отходит'} на ${Math.abs(d)}°`, 'info');
  }));
  const rnd = () => { SIM.randomEvent(S); };
  $('#btnRandom').addEventListener('click', rnd);
  $('#btnRandom2').addEventListener('click', rnd);
}
function updateWind(D) {
  const W = S.wind;
  if (document.activeElement !== $('#twsR')) $('#twsR').value = W.baseTws;
  $('#twsOut').textContent = `${f1(W.baseTws)} уз` + (W.gusts ? ` · сейчас ${f1(D.tws)}` : '');
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
    $('#sh_' + d).textContent = after < D.twaAbs ? 'заход' : 'отход';
  }
  $('#shiftNote').textContent = `Сейчас ${D.tack > 0 ? 'правый' : 'левый'} галс, ${r0(D.twaAbs)}° к ветру. Заход — ветер смещается к носу, отход — к корме.`;
}

/* ---------- палуба: схема ---------- */
const DK = {
  cx: { halyard: 116, reef1: 134, reef2: 152, vang: 170, main: 190, outhaul: 208, furl: 226 },
  winch: { RP: [122, 172], RS: [238, 172], PP: [72, 300], PS: [288, 300] },
  track: { P: 64, S: 296 }
};
function buildDeck() {
  let s = '<defs><pattern id="teakP" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="var(--teak)" opacity="0.28"/><line x1="0" y1="0" x2="0" y2="7" stroke="var(--teak)" stroke-width="1" opacity="0.55"/></pattern></defs>';
  s += '<path d="M46 0 C36 130 34 300 50 474 Q52 484 62 484 L298 484 Q308 484 310 474 C326 300 324 130 314 0 Z" fill="var(--deck)" stroke="var(--deck-line)" stroke-width="1.5"/>';
  s += '<path d="M96 0 L96 196 Q96 210 110 210 L250 210 Q264 210 264 196 L264 0" fill="var(--surface)" stroke="var(--deck-line)" stroke-width="1.5"/>';
  s += '<rect x="94" y="222" width="172" height="244" rx="12" fill="url(#teakP)" stroke="var(--deck-line)"/>';
  s += '<rect x="94" y="234" width="26" height="150" rx="5" fill="var(--teak)" opacity="0.45"/><rect x="240" y="234" width="26" height="150" rx="5" fill="var(--teak)" opacity="0.45"/>';
  s += '<rect x="164" y="268" width="32" height="78" rx="5" fill="var(--teak)" opacity="0.6"/>';
  s += '<rect x="164" y="186" width="32" height="24" rx="3" fill="var(--ink-3)" opacity="0.55"/><text x="180" y="201" font-size="9" text-anchor="middle" style="fill:var(--surface)">вход</text>';
  for (const [x, y] of [[142, 428], [218, 428]]) s += `<circle cx="${x}" cy="${y}" r="24" fill="none" stroke="var(--ink-2)" stroke-width="2.5"/><line x1="${x - 24}" y1="${y}" x2="${x + 24}" y2="${y}" stroke="var(--ink-3)"/><line x1="${x}" y1="${y - 24}" x2="${x}" y2="${y + 24}" stroke="var(--ink-3)"/>`;
  s += '<text x="180" y="462" font-size="10" text-anchor="middle">штурвалы</text>';
  s += '<path id="dkSheet_P" d="" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path id="dkSheet_S" d="" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
  s += '<circle cx="180" cy="20" r="9" fill="var(--surface-3)" stroke="var(--ink-2)" stroke-width="1.5"/><text x="194" y="16" font-size="10">мачта</text>';
  for (const k of SIM.CLUTCH_LINES) s += `<path d="M180 28 L${DK.cx[k]} 104" stroke="${LINES[k].color}" stroke-width="1.6" fill="none" opacity="0.7"/>`;
  s += '<g class="hit" data-kind="trav" role="button" tabindex="0" aria-label="Погон гика-шкота"><rect x="104" y="34" width="152" height="26" fill="transparent"/><line class="body" x1="112" y1="48" x2="248" y2="48" stroke="var(--ink-2)" stroke-width="4" stroke-linecap="round"/><rect id="dkTrav" x="171" y="42" width="18" height="12" rx="3" fill="var(--ink)"/><text x="104" y="40" font-size="10">погон</text></g>';
  for (const k of SIM.CLUTCH_LINES) {
    const x = DK.cx[k], L = LINES[k];
    s += `<g class="hit" data-kind="line" data-key="${k}" role="button" tabindex="0" aria-label="Стопор: ${L.name}"><rect x="${x - 9}" y="56" width="18" height="82" fill="transparent"/>` +
      `<text x="${x + 3.5}" y="99" font-size="10.5" transform="rotate(-90 ${x + 3.5} 99)" style="paint-order:stroke;stroke:var(--surface);stroke-width:3px">${L.tag}</text>` +
      `<rect class="body" id="dkCl_${k}" x="${x - 7.5}" y="104" width="15" height="30" rx="3" fill="var(--surface-3)" stroke="var(--ink-2)"/>` +
      `<rect x="${x - 5.5}" y="106" width="11" height="5" rx="1.5" fill="${L.color}"/><rect id="dkLev_${k}" x="${x - 5}" y="116" width="10" height="14" rx="2" fill="var(--ink)"/></g>`;
  }
  for (const k of SIM.CLUTCH_LINES) s += `<path id="dkTail_${k}" d="" stroke="${LINES[k].color}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  for (const w of ['RP', 'RS', 'PP', 'PS']) {
    const [x, y] = DK.winch[w], prim = w[0] === 'P';
    const kind = prim ? 'line' : 'winch', key = w === 'PP' ? 'sheetP' : w === 'PS' ? 'sheetS' : w;
    s += `<g class="hit" data-kind="${kind}" data-key="${key}" role="button" tabindex="0" aria-label="${SIM.WINCH_NAMES[w]}"><circle cx="${x}" cy="${y}" r="21" fill="transparent"/>` +
      `<circle id="dkRing_${w}" cx="${x}" cy="${y}" r="15.5" fill="none" stroke="transparent" stroke-width="4"/>` +
      `<circle class="body" cx="${x}" cy="${y}" r="12" fill="var(--surface-3)" stroke="var(--ink-2)" stroke-width="1.5"/><circle cx="${x}" cy="${y}" r="4.5" fill="var(--ink-2)"/>` +
      `<text id="dkWl_${w}" x="${x}" y="${y + 29}" font-size="10" text-anchor="middle"></text></g>`;
  }
  for (const sd of ['P', 'S']) {
    const x = DK.track[sd];
    s += `<g class="hit" data-kind="car" data-key="${sd}" role="button" tabindex="0" aria-label="Каретка стакселя, ${sd === 'P' ? 'левый' : 'правый'} борт"><rect x="${x - 13}" y="50" width="26" height="130" fill="transparent"/>` +
      `<line class="body" x1="${x}" y1="60" x2="${x}" y2="170" stroke="var(--ink-2)" stroke-width="3" stroke-linecap="round"/>` +
      `<rect id="dkCar_${sd}" x="${x - 6}" y="100" width="12" height="16" rx="2.5" fill="var(--ink)"/></g>`;
  }
  s += '<g class="hit" data-kind="bs" role="button" tabindex="0" aria-label="Ахтерштаг"><rect x="136" y="440" width="88" height="46" fill="transparent"/><line x1="180" y1="452" x2="180" y2="466" stroke="var(--ink-2)" stroke-width="1.5"/><line x1="180" y1="466" x2="150" y2="484" stroke="var(--ink-2)" stroke-width="1.5"/><line x1="180" y1="466" x2="210" y2="484" stroke="var(--ink-2)" stroke-width="1.5"/><circle class="body" cx="180" cy="466" r="5" fill="var(--surface-3)" stroke="var(--ink-2)"/><text x="188" y="478" font-size="10">ахтерштаг</text></g>';
  s += '<text x="20" y="250" font-size="11" text-anchor="middle" transform="rotate(-90 20 250)" style="fill:var(--port);font-weight:700;letter-spacing:.08em">ЛЕВЫЙ БОРТ</text>';
  s += '<text x="340" y="250" font-size="11" text-anchor="middle" transform="rotate(90 340 250)" style="fill:var(--stbd);font-weight:700;letter-spacing:.08em">ПРАВЫЙ БОРТ</text>';
  s += '<text x="8" y="14" font-size="10">↑ нос</text>';
  const svg = $('#deckSvg');
  svg.innerHTML = s;
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
    if (w[0] === 'R') lbl.textContent = k ? LINES[k].tag : 'свободна';
    else { const sk = w === 'PP' ? 'sheetP' : 'sheetS'; lbl.textContent = d.winch[w] ? (D && D.jib.bind && D.jib.ctrl === (w === 'PP' ? -1 : 1) ? 'рабочий шкот' : 'ленивый шкот') : 'шкот снят'; if (d.running[sk]) lbl.textContent = 'уходит!'; }
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
const loadTxt = v => (v < 0.12 ? 'низкая' : v < 0.45 ? 'средняя' : 'высокая');
function select(kind, key) {
  ui.sel = kind ? { kind, key } : null;
  $$('#deckSvg .hit').forEach(g => g.classList.toggle('sel', !!ui.sel && g.dataset.kind === kind && (g.dataset.key || '') === (key || '')));
  ui.selSig = '';
  renderSel();
  let h = null;
  if (ui.sel) {
    if (kind === 'line') h = key; else if (kind === 'car') h = 'car' + key; else if (kind === 'trav') h = 'trav'; else if (kind === 'bs') h = 'backstay'; else if (kind === 'winch') h = S.deck.winch[key];
  }
  hl(h);
}
function holdBtn(id, hold) { const el = $('#' + id); if (!el) return; holdable(el, () => { S.deck.hold = hold; }, () => { SIM.deckRelease(S); }); }
function renderSel() {
  const host = $('#selCard'), sel = ui.sel;
  if (!sel) { host.innerHTML = '<p class="note">Ничего не выбрано. Нажмите на стопор в пианино, лебёдку, каретку стакселя, погон или ахтерштаг.</p>'; return; }
  const gaugeHtml = '<div><div class="gval"><span id="sgLabel"></span><b id="sgVal"></b></div><div class="gauge" id="sgBar"><i></i></div></div><div class="chips" id="sgChips"></div><p class="warnline" id="sgWarn" hidden></p>';
  if (sel.kind === 'line') {
    const L = LINES[sel.key], prim = !!L.primary, side = prim ? (L.primary === 'P' ? -1 : 1) : 0;
    const where = prim ? `основная лебёдка ${L.primary === 'P' ? 'левого' : 'правого'} борта` : `${L.bank === 'P' ? 'левое' : 'правое'} пианино · ${SIM.WINCH_NAMES[SIM.winchFor(sel.key)]}`;
    host.innerHTML = `<div class="sh"><span class="sw" style="background:${L.color}"></span><h4>${L.name}</h4><span class="where">${where}</span></div><p class="about">${L.about}</p>${gaugeHtml}` +
      `<div class="acts">${prim ? '' : '<button type="button" class="btn" id="sbClutch"></button>'}<button type="button" class="btn" id="sbWinch"></button>${prim ? '<button type="button" class="btn" id="sbPole"></button>' : ''}</div>` +
      '<div class="acts"><button type="button" class="btn hold" id="sbPull">⟳ Выбирать</button><button type="button" class="btn hold" id="sbEase">⟲ Травить</button></div>';
    if (!prim) $('#sbClutch').addEventListener('click', () => SIM.deckToggleClutch(S, sel.key));
    $('#sbWinch').addEventListener('click', () => SIM.deckToggleWinch(S, sel.key));
    if (prim) $('#sbPole').addEventListener('click', () => SIM.deckSetPole(S, S.rig.pole === side ? 0 : side));
    holdBtn('sbPull', { kind: 'line', line: sel.key, dir: 1 });
    holdBtn('sbEase', { kind: 'line', line: sel.key, dir: -1 });
  } else if (sel.kind === 'car') {
    const nm = sel.key === 'P' ? 'левый' : 'правый';
    host.innerHTML = `<div class="sh"><span class="sw" style="background:var(--ink)"></span><h4>Каретка стакселя, ${nm} борт</h4><span class="where">погон на палубе</span></div>` +
      '<p class="about">Задаёт, куда тянет шкот. Вперёд — шкот тянет шкаторину вниз, верх стакселя закрывается. Назад — тянет вдоль нижней шкаторины, верх открывается. Под нагрузкой не двигается.</p>' + gaugeHtml +
      '<div class="acts"><button type="button" class="btn hold" id="sbA">▲ Вперёд</button><button type="button" class="btn hold" id="sbB">▼ Назад</button></div>';
    holdBtn('sbA', { kind: 'car', side: sel.key, dir: -1 }); holdBtn('sbB', { kind: 'car', side: sel.key, dir: 1 });
  } else if (sel.kind === 'trav') {
    host.innerHTML = '<div class="sh"><span class="sw" style="background:#7a5a3a"></span><h4>Погон гика-шкота</h4><span class="where">каретка на рубке</span></div>' +
      '<p class="about">Сдвигает гик к ветру или под ветер, почти не меняя натяжения задней шкаторины. Под ветер каретка уходит сама, на ветер под нагрузкой тянется тяжело.</p>' + gaugeHtml +
      '<div class="acts"><button type="button" class="btn hold" id="sbA">◀ К левому борту</button><button type="button" class="btn hold" id="sbB">К правому борту ▶</button></div>';
    holdBtn('sbA', { kind: 'trav', dir: -1 }); holdBtn('sbB', { kind: 'trav', dir: 1 });
  } else if (sel.kind === 'bs') {
    host.innerHTML = '<div class="sh"><span class="sw" style="background:var(--ink-3)"></span><h4>Ахтерштаг</h4><span class="where">таль на корме</span></div>' +
      '<p class="about">Туже — мачта прогибается, грот становится площе, штаг меньше провисает и стаксель тоже площе. Подтягивают в свежий ветер на острых курсах.</p>' + gaugeHtml +
      '<div class="acts"><button type="button" class="btn hold" id="sbA">Подтянуть</button><button type="button" class="btn hold" id="sbB">Потравить</button></div>';
    holdBtn('sbA', { kind: 'bs', dir: 1 }); holdBtn('sbB', { kind: 'bs', dir: -1 });
  } else if (sel.kind === 'winch') {
    const w = sel.key, occ = S.deck.winch[w], bank = w === 'RP' ? 'P' : 'S';
    const lines = SIM.CLUTCH_LINES.filter(k => LINES[k].bank === bank);
    ui.selSig = 'w' + occ;
    host.innerHTML = `<div class="sh"><span class="sw" style="background:var(--ink-2)"></span><h4>${SIM.WINCH_NAMES[w].replace(/^./, c => c.toUpperCase())}</h4><span class="where">для снастей ${bank === 'P' ? 'левого' : 'правого'} пианино</span></div>` +
      `<p class="about">${occ ? `На лебёдке «${LINES[occ].short}». Чтобы тянуть другую снасть, сначала снимите эту — её удержит закрытый стопор.` : 'Лебёдка свободна. Заведите на неё снасть, которую нужно выбрать или потравить.'}</p>` +
      `<div class="acts">${lines.map(k => `<button type="button" class="btn" data-wl="${k}">${occ === k ? 'Снять' : 'Завести'} «${LINES[k].short}»</button>`).join('')}</div>` +
      (occ ? `<button type="button" class="btn" id="sbGoLine">Открыть карточку «${LINES[occ].short}»</button>` : '');
    $$('#selCard [data-wl]').forEach(b => b.addEventListener('click', () => { SIM.deckToggleWinch(S, b.dataset.wl); }));
    if (occ) $('#sbGoLine').addEventListener('click', () => select('line', occ));
    return;
  }
  updateSel();
}
function setGauge(v, label, val, tg, marks) {
  const bar = $('#sgBar'); if (!bar) return;
  $('#sgLabel').textContent = label; $('#sgVal').textContent = val;
  bar.querySelector('i').style.width = `${clamp(v, 0, 1) * 100}%`;
  const sig = (marks || []).map(m => m.join(':')).join('|') + '/' + (tg == null ? '' : tg.toFixed(3));
  if (bar.dataset.sig !== sig) {
    bar.dataset.sig = sig;
    bar.querySelectorAll('.mk,.tg').forEach(n => n.remove());
    for (const [p, t] of marks || []) { const m = document.createElement('span'); m.className = 'mk'; m.style.left = `${p * 100}%`; m.innerHTML = `<span>${t}</span>`; bar.appendChild(m); }
    if (tg != null) { const t = document.createElement('span'); t.className = 'tg'; t.style.left = `calc(${clamp(tg, 0, 1) * 100}% - 1px)`; t.title = 'правильное значение'; bar.appendChild(t); }
  }
}
function updateSel() {
  const sel = ui.sel; if (!sel) return;
  const R = S.rig, D = S.D, d = S.deck, T = ui.showTargets ? (ui.targets || SIM.solveTrim(S)) : null;
  if (!D) return;
  if (sel.kind === 'winch') { if (ui.selSig !== 'w' + d.winch[sel.key]) renderSel(); return; }
  const chips = [], warn = { text: '', cls: '' };
  if (sel.kind === 'line') {
    const k = sel.key, L = LINES[k], prim = !!L.primary, on = SIM.onWinch(d, k), load = D.loads[k] || 0, hp = D.hoist;
    let g;
    switch (k) {
      case 'halyard': {
        const up = R.halyard < hp.hTaut - 0.005;
        g = [R.halyard / 1.04, up ? 'Грот поднят' : 'Натяжение шкаторины', up ? pct(R.halyard / hp.hTaut) : pct(hp.tension), T ? (1 - BOAT.reefH[T.reef] + BOAT.TENS * T.luff) / 1.04 : null,
          [[(1 - BOAT.reefH[2]) / 1.04, 'риф 2'], [(1 - BOAT.reefH[1]) / 1.04, 'риф 1'], [1 / 1.04, 'верх']]];
        break;
      }
      case 'reef1': case 'reef2': { const i = k === 'reef1' ? 1 : 2; g = [R[k], 'Риф-шкентель выбран', pct(R[k]), T ? (T.reef >= i ? 1 : 0) : null]; break; }
      case 'vang': g = [R.vang, 'Натяжение', pct(R.vang), T ? T.vang : null]; break;
      case 'outhaul': g = [R.outhaul, 'Натяжение', pct(R.outhaul), T ? T.outhaul : null]; break;
      case 'main': g = [R.main, 'Потравлен', `${pct(R.main)} · гик ${r0(Math.abs(S.boomAngle))}°`, T ? T.mainsheet : null]; break;
      case 'furl': g = [R.furl, 'Закручен', `${pct(R.furl)} · раскрыт ${pct(1 - R.furl)}`, T ? 1 - T.open : null]; break;
      default: {
        const s = k === 'sheetP' ? -1 : 1, e = R[k] - 0.8 * R.furl, working = D.jib.bind && D.jib.ctrl === s;
        g = [clamp(e / 1.3, 0, 1), working ? 'Рабочий шкот · потравлен' : 'Ленивый шкот', working ? `стаксель ${r0(Math.abs(D.jib.delta))}° к ДП` : (e > 1.3 ? 'свободен' : `потравлен на ${pct(clamp(e / 1.3, 0, 1))}`), (T && working) ? T.jibSheet : null];
      }
    }
    setGauge(...g);
    if (!prim) chips.push(`<span class="chip ${d.clutch[k] ? '' : 'on'}">Стопор: <b>${d.clutch[k] ? 'закрыт' : 'открыт'}</b></span>`);
    chips.push(`<span class="chip ${on ? 'on' : ''}">Лебёдка: <b>${on ? (prim ? 'в самостопоре' : 'да') : (prim ? 'снят' : 'нет')}</b></span>`);
    chips.push(`<span class="chip">Нагрузка: <b>${loadTxt(load)}</b></span>`);
    if (d.running[k]) { chips.push('<span class="chip danger"><b>уходит!</b></span>'); warn.text = 'Снасть свободна и уходит под нагрузкой. Закройте стопор или заведите её на лебёдку.'; }
    else if (!prim && d.clutch[k] === 1 && !on && load > 0.06) { warn.text = 'Снасть под нагрузкой и держится только стопором. Перед тем как открыть стопор, заведите её на лебёдку.'; warn.cls = 'soft'; }
    else if (!on) { warn.text = 'Выбирать и травить можно только на лебёдке.'; warn.cls = 'soft'; }
    if (!prim) $('#sbClutch').textContent = d.clutch[k] ? 'Открыть стопор' : 'Закрыть стопор';
    const w = SIM.winchFor(k), occ = d.winch[w];
    $('#sbWinch').textContent = on ? 'Снять с лебёдки' : (occ ? `Лебёдка занята: ${LINES[occ].short}` : 'Завести на лебёдку');
    if (prim) {
      const s = k === 'sheetP' ? -1 : 1, pb = $('#sbPole');
      pb.hidden = !(D.awaAbs > 120 || R.pole);
      pb.textContent = R.pole === s ? 'Убрать выносной гик' : 'Выносной гик на этот борт';
    }
  } else if (sel.kind === 'car') {
    const s = sel.key === 'P' ? -1 : 1, c = sel.key === 'P' ? R.carP : R.carS, sh = sel.key === 'P' ? 'sheetP' : 'sheetS';
    const working = D.jib.bind && D.jib.ctrl === s, load = D.loads[sh] || 0;
    setGauge(c, 'Положение', `отверстие ${r0(c * 14) + 1} из 15`, (T && working) ? T.car : null, [[0, 'нос'], [1, 'корма']]);
    chips.push(`<span class="chip">${working ? 'рабочий борт' : 'ленивый борт'}</span>`, `<span class="chip">Нагрузка на шкот: <b>${loadTxt(load)}</b></span>`);
    if (load > 0.22) { warn.text = 'Шкот этого борта нагружен — каретка не сдвинется. Потравите шкот, переставьте каретку, снова выберите шкот.'; warn.cls = 'soft'; }
  } else if (sel.kind === 'trav') {
    const t = R.trav, lee = S.boomSide;
    const rel = t * lee > 0.02 ? 'под ветер' : t * lee < -0.02 ? 'на ветер' : 'по центру';
    setGauge((t + 1) / 2, 'Положение', `${t > 0.02 ? pct(t) + ' к правому' : t < -0.02 ? pct(-t) + ' к левому' : 'центр'} · ${rel}`, T ? (T.travLee * lee + 1) / 2 : null, [[0, 'левый'], [0.5, 'центр'], [1, 'правый']]);
    chips.push(`<span class="chip">Подветренный борт: <b>${lee > 0 ? 'правый' : 'левый'}</b></span>`, `<span class="chip">Нагрузка: <b>${loadTxt(D.loads.main || 0)}</b></span>`);
  } else if (sel.kind === 'bs') {
    setGauge(R.backstay, 'Натяжение', pct(R.backstay), T ? T.backstay : null);
  }
  $('#sgChips').innerHTML = chips.join('');
  const wl = $('#sgWarn');
  wl.hidden = !warn.text; wl.textContent = warn.text; wl.style.color = warn.cls === 'soft' ? 'var(--ink-2)' : 'var(--bad)';
}
function updateDeckSide() {
  const d = S.deck, msg = $('#deckMsg');
  if (d.msg && S.t - d.msg.t < 3.5) { msg.hidden = false; msg.textContent = d.msg.text; } else msg.hidden = true;
  $('#deckLog').innerHTML = d.log.map(l => `<li class="${l.kind === 'bad' ? 'bad' : ''}">${esc(l.text)}</li>`).join('') || '<li>Пока пусто.</li>';
}

/* ---------- сценарии ---------- */
function buildScenarios() {
  const groups = {};
  for (const s of SIM.SCENARIOS) (groups[s.group] = groups[s.group] || []).push(s);
  let html = '';
  for (const g in groups) {
    html += `<div class="group scgroup"><h3>${g}</h3><div class="sclist">`;
    for (const s of groups[g]) html += `<div class="sc" data-id="${s.id}"><div><span class="lvl">${'●'.repeat(s.level)}${'○'.repeat(3 - s.level)} сложность</span><h4>${s.title}</h4></div><button type="button" class="btn" data-start="${s.id}">Начать</button><p>${s.brief}</p></div>`;
    html += '</div></div>';
  }
  $('#scList').innerHTML = html;
  $$('#scList [data-start]').forEach(b => b.addEventListener('click', () => startScn(b.dataset.start)));
  $('#btnExitScn').addEventListener('click', exitScn);
  $('#bExit').addEventListener('click', exitScn);
  $('#bAgain').addEventListener('click', () => { if (S.scn) startScn(S.scn.def.id); });
  $('#bNow').addEventListener('click', () => SIM.fireNow(S));
  $('#bHint').addEventListener('click', () => { ui.todoOpen = !ui.todoOpen; updateBanner(); });
  $('#dbClose').addEventListener('click', () => { $('#debrief').hidden = true; });
  $('#dbAgain').addEventListener('click', () => { if (S.scn) startScn(S.scn.def.id); });
  $('#dbNext').addEventListener('click', () => {
    const list = SIM.SCENARIOS, i = S.scn ? list.findIndex(s => s.id === S.scn.def.id) : -1;
    startScn(list[(i + 1) % list.length].id);
  });
  refreshScnMarks();
}
function refreshScnMarks() {
  $$('#scList .sc').forEach(el => {
    el.classList.toggle('active', !!S.scn && S.scn.def.id === el.dataset.id);
    el.classList.toggle('done', !!ui.completed[el.dataset.id]);
  });
  $('#btnExitScn').hidden = !S.scn;
  $('#freeTitle').textContent = S.scn ? `Сценарий: ${S.scn.def.title}` : 'Свободное плавание';
}
function startScn(id) {
  SIM.startScenario(S, id);
  ui.todoOpen = false; ui.selItem = null; ui.anim = null;
  $('#debrief').hidden = true;
  if (S.mode === 'quick') syncSliders(true);
  select(null);
  if (scene) scene.setView(ui.view);
  refreshScnMarks();
  toast(S.scn.def.brief, 'info', 6500);
}
function exitScn() { S.scn = null; $('#debrief').hidden = true; refreshScnMarks(); updateBanner(); }
const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function objText(o) {
  switch (o.type) {
    case 'beat': return 'Задача: лавировка — идти как можно острее к ветру и при этом быстро.';
    case 'heading': return `Задача: держать курс ${deg3(o.hdg)} на цель и подстроить паруса.`;
    case 'run': return 'Задача: безопасный фордевинд — ветер не должен дуть со стороны гика.';
    case 'tack': return 'Задача: повернуть оверштаг и настроиться на другом галсе.';
    case 'gybe': return 'Задача: контролируемый поворот фордевинд на другой галс.';
    default: return '';
  }
}
function updateBanner() {
  const sc = S.scn, b = $('#banner');
  if (!sc) { b.hidden = true; return; }
  b.hidden = false;
  $('#bTitle').textContent = sc.def.title;
  $('#bObj').textContent = objText(sc.def.objective);
  const next = sc.def.events[sc.evIdx];
  const at = next ? (sc.nextAt != null ? sc.nextAt : next.at) : 0;
  let ph = '';
  if (sc.phase === 'steady' && next) ph = `событие через ${Math.max(0, Math.ceil(at - sc.t))} с`;
  else if (sc.phase === 'respond') ph = `реакция ${mmss(sc.t - (sc.tEvent || 0))}` + (next ? ` · ещё событие через ${Math.max(0, Math.ceil(at - sc.t))} с` : '');
  else if (sc.phase === 'done') ph = `готово за ${r0(sc.doneT)} с`;
  $('#bPhase').textContent = ph;
  $('#bNow').hidden = !next || sc.phase === 'done';
  $('#bOk').hidden = sc.phase !== 'respond';
  $('#bOk i').style.width = `${clamp(sc.okT / 4, 0, 1) * 100}%`;
  const todo = $('#bTodo');
  todo.hidden = !ui.todoOpen;
  if (ui.todoOpen && todo.dataset.id !== sc.def.id) { todo.dataset.id = sc.def.id; todo.innerHTML = sc.def.todo.map(t => `<li>${esc(t)}</li>`).join(''); }
  $('#bHint').textContent = ui.todoOpen ? 'Скрыть подсказку' : 'Что делать?';
}
function showDebrief() {
  const sc = S.scn; if (!sc) return;
  const mist = [...new Set(sc.mistakes)];
  $('#debrief .kicker').textContent = mist.length ? 'Пройдено, но с ошибками' : 'Сценарий пройден';
  $('#debrief .kicker').style.color = mist.length ? 'var(--warn)' : 'var(--ok)';
  $('#dbTitle').textContent = sc.def.title;
  $('#dbTime').textContent = `${r0(sc.doneT)} с`;
  $('#dbScore').textContent = `${r0((sc.finalScore || 0) * 100)}%`;
  $('#dbMist').innerHTML = mist.length ? `<h3>Ошибки</h3><ul class="mist">${mist.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : '';
  $('#dbTodo').innerHTML = sc.def.todo.map(t => `<li>${esc(t)}</li>`).join('');
  $('#dbWhy').textContent = sc.def.why;
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
      case 'windEvent': toast(e.data, 'info', 4800); break;
      case 'run': toast(`«${LINES[e.data].short}» ушёл под нагрузкой!`, 'bad', 5000); break;
      case 'crash': toast('Гик перебросило: неконтролируемый поворот фордевинд!', 'bad', 5500); break;
      case 'gybe': toast('Поворот фордевинд: гик перешёл на другой борт', 'info'); break;
      case 'tack': toast('Поворот оверштаг', 'info', 2500); break;
      case 'broach': toast('Лодку развернуло к ветру: для такого ветра слишком много парусов', 'bad', 5500); break;
      case 'irons': toast('Лодка встала в левентик и потеряла ход. Увалитесь и дайте стакселю наполниться.', 'warn', 5500); break;
      case 'scenarioDone': showDebrief(); break;
      default: break;
    }
  }
}

/* ---------- сборка и цикл ---------- */
buildQuick(); buildItems(); buildWind(); buildDeck(); buildScenarios();
syncSliders(true);
if (scene) {
  resize();
  if (typeof G.ResizeObserver === 'function') new G.ResizeObserver(resize).observe($('#stage'));
  else G.addEventListener('resize', resize);
  scene.update(S, S.D, 0.016, { showWind: ui.showWind });
  scene.setView('free');
  scene.render();
  $('#loading').hidden = true;
}
let last = G.performance.now(), accP = 0, accC = 0;
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  if (ui.anim) stepAnim(dt);
  const D = SIM.step(S, dt);
  if (scene && D) {
    try { scene.update(S, D, S.paused ? 0 : dt, { showWind: ui.showWind }); scene.render(); }
    catch (err) { console.error(err); }
  }
  handleEvents();
  accC += dt; accP += dt;
  if (accC >= 1 / 30 && D) { drawWindDial(D); drawTell(D, S.paused ? 0 : accC); accC = 0; }
  if (accP >= 0.1 && D) {
    accP = 0;
    updateHud(D); updateScore(D); updateBanner();
    if (S.mode === 'quick') { syncSliders(false); updateTargets(); }
    else {
      if (ui.showTargets && S.t - ui.tgtT > 0.5) { ui.targets = SIM.solveTrim(S); ui.tgtT = S.t; }
      updateDeck(); updateSel(); updateDeckSide();
    }
    if (!$('[data-pane="wind"]').hidden) updateWind(D);
    const mid = D.tell.jib[1];
    $('#tellVerdict').textContent = S.rig.furl >= 0.97 ? 'стаксель закручен' : (TELL_TXT[mid] || '');
  }
  G.requestAnimationFrame(frame);
}
G.requestAnimationFrame(frame);
G.KOLD = { S, ui, scene };
})(window);
