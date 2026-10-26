/* ============================================================
   Колдунчик / Telltale — ядро симуляции (без DOM, запускается и в Node)
   Оси лодки: x — нос, y — вверх, z — правый борт.
   Углы ветра: TWA/AWA > 0 — ветер с правого борта (правый галс).
   Все тексты — в словаре TXT на двух языках (ru, en).
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
const f1 = x => (Math.round(x * 10) / 10).toFixed(1);

/* ---------- Язык ---------- */
let LANG = 'ru';
const isLoc = v => !!v && typeof v === 'object' && !Array.isArray(v) && ('ru' in v || 'en' in v);
const loc = v => (isLoc(v) ? (v[LANG] != null ? v[LANG] : v.ru) : v);
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const ord = n => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

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

/* ---------- Снасти: параметры и тексты ---------- */
const LINE_BASE = {
  halyard: { bank: 'P', slot: 0, color: '#2F6FD6', pull: 1, min: 0, max: 1 + BOAT.TENS, rate: 0.1, ease: 0.12, run: 0.9 },
  reef1: { bank: 'P', slot: 1, color: '#2E9E5B', pull: 1, min: 0, max: 1, rate: 0.16, ease: 0.2, run: 0.9 },
  reef2: { bank: 'P', slot: 2, color: '#C99A0E', pull: 1, min: 0, max: 1, rate: 0.14, ease: 0.2, run: 0.9 },
  vang: { bank: 'P', slot: 3, color: '#59606E', pull: 1, min: 0, max: 1, rate: 0.22, ease: 0.3, run: 0.8 },
  main: { bank: 'S', slot: 0, color: '#C9372F', pull: -1, min: 0, max: 1, rate: 0.12, ease: 0.22, run: 0.8 },
  outhaul: { bank: 'S', slot: 1, color: '#E0822A', pull: 1, min: 0, max: 1, rate: 0.2, ease: 0.3, run: 0.6 },
  furl: { bank: 'S', slot: 2, color: '#1C9AA6', pull: 1, min: 0, max: 1, rate: 0.12, ease: 0.2, run: 0.5 },
  sheetP: { primary: 'P', color: '#253F8F', pull: -1, min: 0, max: 2.4, rate: 0.22, ease: 0.3, run: 1.4 },
  sheetS: { primary: 'S', color: '#253F8F', pull: -1, min: 0, max: 2.4, rate: 0.22, ease: 0.3, run: 1.4 }
};
const LINE_TXT = {
  halyard: {
    ru: { name: 'Фал грота', short: 'Фал грота', tag: 'Фал', about: 'Поднимает грот и натягивает переднюю шкаторину. Туже — пузо смещается вперёд, у мачты парус площе.' },
    en: { name: 'Main halyard', short: 'Main halyard', tag: 'Halyard', ref: 'the main halyard', about: 'Hoists the mainsail and tensions the luff. Tighter moves the draft forward and flattens the sail near the mast.' }
  },
  reef1: {
    ru: { name: 'Риф-шкентель 1', short: 'Риф 1', tag: 'Риф 1', about: 'Притягивает к гику кренгельсы первого рифа. Идёт, только когда фал потравлен до метки рифа.' },
    en: { name: 'Reefing line 1', short: 'Reef 1', tag: 'Reef 1', ref: 'reefing line 1', about: 'Pulls the first-reef cringles down to the boom. It only comes in once the halyard is eased to the reef mark.' }
  },
  reef2: {
    ru: { name: 'Риф-шкентель 2', short: 'Риф 2', tag: 'Риф 2', about: 'Второй риф: ещё ниже по передней и задней шкаторинам. Фал травят глубже, до второй метки.' },
    en: { name: 'Reefing line 2', short: 'Reef 2', tag: 'Reef 2', ref: 'reefing line 2', about: 'Second reef: lower still on the luff and leech. Ease the halyard further, to the second mark.' }
  },
  vang: {
    ru: { name: 'Оттяжка гика', short: 'Оттяжка гика', tag: 'Оттяжка', about: 'Тянет гик вниз и держит заднюю шкаторину, когда гика-шкот потравлен. Главный регулятор скрутки грота на полных курсах.' },
    en: { name: 'Boom vang', short: 'Vang', tag: 'Vang', ref: 'the vang', about: 'Pulls the boom down and holds the leech once the mainsheet is eased. The main twist control off the wind (UK: kicker).' }
  },
  main: {
    ru: { name: 'Гика-шкот', short: 'Гика-шкот', tag: 'Гика-шкот', about: 'Задаёт угол гика, а пока гик близко к диаметральной плоскости — ещё и натяжение задней шкаторины.' },
    en: { name: 'Mainsheet', short: 'Mainsheet', tag: 'Mainsheet', ref: 'the mainsheet', about: 'Sets the boom angle and, while the boom is near the centreline, the leech tension too.' }
  },
  outhaul: {
    ru: { name: 'Аутхол', short: 'Аутхол', tag: 'Аутхол', about: 'Натягивает нижнюю шкаторину грота вдоль гика. Туже — нижняя треть грота площе.' },
    en: { name: 'Outhaul', short: 'Outhaul', tag: 'Outhaul', ref: 'the outhaul', about: 'Tensions the foot of the main along the boom. Tighter flattens the lower third of the sail.' }
  },
  furl: {
    ru: { name: 'Закрутка стакселя', short: 'Закрутка', tag: 'Закрутка', about: 'Накручивает стаксель на штаг. Закручивают, потравив шкот. Раскрывают, открыв стопор и выбирая шкот.' },
    en: { name: 'Genoa furling line', short: 'Furler', tag: 'Furler', ref: 'the furling line', about: 'Rolls the genoa onto the forestay. To furl, ease the sheet; to unfurl, open the clutch and haul in the sheet.' }
  },
  sheetP: {
    ru: { name: 'Шкот стакселя, левый', short: 'Левый шкот', tag: 'Шкот Л', about: 'Левый шкот стакселя на основной лебёдке левого борта. Работает, когда стаксель стоит слева.' },
    en: { name: 'Port genoa sheet', short: 'Port sheet', tag: 'Sheet P', ref: 'the port sheet', about: 'The port genoa sheet on the port primary winch. It works when the genoa sets to port.' }
  },
  sheetS: {
    ru: { name: 'Шкот стакселя, правый', short: 'Правый шкот', tag: 'Шкот П', about: 'Правый шкот стакселя на основной лебёдке правого борта. Работает, когда стаксель стоит справа.' },
    en: { name: 'Starboard genoa sheet', short: 'Stbd sheet', tag: 'Sheet S', ref: 'the starboard sheet', about: 'The starboard genoa sheet on the starboard primary winch. It works when the genoa sets to starboard.' }
  }
};
const LINES = {};
for (const k in LINE_BASE) {
  const o = Object.assign({}, LINE_BASE[k]), tx = LINE_TXT[k];
  for (const f of ['name', 'short', 'tag', 'about', 'ref']) {
    Object.defineProperty(o, f, { enumerable: true, get: () => { const d = tx[LANG] || tx.ru; return f === 'ref' ? (d.ref || `«${d.short}»`) : d[f]; } });
  }
  LINES[k] = o;
}
const CLUTCH_LINES = ['halyard', 'reef1', 'reef2', 'vang', 'main', 'outhaul', 'furl'];
const WINCH_TXT = {
  ru: { RP: 'левая лебёдка на рубке', RS: 'правая лебёдка на рубке', PP: 'левая основная лебёдка', PS: 'правая основная лебёдка' },
  en: { RP: 'port coachroof winch', RS: 'starboard coachroof winch', PP: 'port primary winch', PS: 'starboard primary winch' }
};
const WINCH_ACC = { RP: 'левую лебёдку на рубке', RS: 'правую лебёдку на рубке', PP: 'левую основную лебёдку', PS: 'правую основную лебёдку' };
const winchName = w => (WINCH_TXT[LANG] || WINCH_TXT.ru)[w];
const winchFor = line => { const L = LINES[line]; return L.primary ? (L.primary === 'P' ? 'PP' : 'PS') : (L.bank === 'P' ? 'RP' : 'RS'); };
const onWinch = (d, line) => d.winch[winchFor(line)] === line;
const isHeld = (d, line) => (LINES[line].primary ? onWinch(d, line) : (d.clutch[line] === 1 || onWinch(d, line)));

/* ============================================================
   Словарь
   ============================================================ */
const TXT = {
  ru: {
    pos_irons: 'Левентик', pos_pinch: 'Слишком остро', pos_close: 'Крутой бейдевинд', pos_creach: 'Полный бейдевинд', pos_beam: 'Галфвинд',
    pos_broad: 'Крутой бакштаг', pos_deep: 'Полный бакштаг', pos_run: 'Фордевинд', pos_hove: 'В дрейфе',
    side_gen: s => (s > 0 ? 'правого' : 'левого'),
    tack_nom: s => (s > 0 ? 'правый' : 'левый'),
    turn_up: (n, s) => `Приведитесь на ${n}° (${s > 0 ? 'вправо' : 'влево'})`,
    turn_down: (n, s) => `Увалитесь на ${n}° (${s > 0 ? 'вправо' : 'влево'})`,

    msg_notOnWinch: l => `${l.ref} не на лебёдке. Сначала заведите снасть на лебёдку.`,
    msg_clutchClosed: l => `Стопор ${l.ref} закрыт и не даёт травить. Откройте стопор — снасть удержит лебёдка.`,
    msg_halyardMax: () => 'Фал выбран до упора: передняя шкаторина натянута до предела.',
    msg_halyardReef: () => 'Фал не идёт выше: взят риф, натяжение ограничено меткой рифа.',
    msg_reefBlocked: () => 'Риф-шкентель не идёт: сначала потравите фал грота до метки рифа.',
    msg_furlSheet: () => 'Закрутка не идёт: шкот стакселя держит шкотовый угол. Сначала потравите шкот.',
    msg_sheetFurl: () => 'Шкот не идёт: стаксель держит закрутка. Откройте стопор закрутки — стаксель раскроется, пока вы выбираете шкот.',
    msg_sheetOther: () => 'Шкот не идёт: второй шкот держит стаксель на другом борту. Отдайте его — снимите с лебёдки.',
    msg_carLoaded: () => 'Каретка под нагрузкой и не двигается. Потравите шкот этого борта, переставьте каретку и снова выберите шкот.',
    msg_winchBusy: (l, o) => `Лебёдка занята: на ней ${o.ref}. Сначала снимите её с лебёдки.`,
    msg_max: l => `${l.ref}: дальше выбирать некуда.`,
    msg_min: l => `${l.ref}: снасть уже потравлена полностью.`,
    msg_hoistLoaded: () => 'Грот наполнен ветром — фал идёт тяжело. Потравите гика-шкот или приведитесь.',
    msg_reefVang: () => 'Оттяжка гика туго — гик мешает притянуть шкотовый угол рифа. Потравите оттяжку.',
    msg_poleWind: () => 'Выносной гик ставят только на фордевинде и полном бакштаге.',

    log_run: l => `${l.ref} ушёл под нагрузкой!`,
    log_clutchClosed: l => `Стопор ${l.ref} закрыт`,
    log_clutchOpen: l => `Стопор ${l.ref} открыт`,
    log_offWinch: l => `${l.ref} снят с лебёдки`,
    log_onWinch: (l, w) => `${l.ref} заведён на ${WINCH_ACC[w]}`,
    log_poleOn: s => `Выносной гик поставлен на ${s > 0 ? 'правый' : 'левый'} борт`,
    log_poleOff: () => 'Выносной гик убран',

    mist_crash: () => 'Неконтролируемый поворот фордевинд: гик перебросило',
    mist_run: l => `${l.ref} ушёл под нагрузкой`,
    mist_broach: () => 'Лодку развернуло к ветру (брочинг) — слишком много парусов',
    mist_irons: () => 'Лодка встала в левентик и потеряла ход',

    ev_shift: (header, n) => `Ветер ${header ? 'зашёл' : 'отошёл'} на ${n}°.`,
    ev_speed: (up, n) => `Ветер ${up ? 'усиливается' : 'слабеет'} до ${n} уз.`,

    course_ok: 'Курс подходит для задачи',
    course_pinch: a => `Слишком остро: ${a}° к ветру — лодка теряет ход, наветренные колдунчики трепещут`,
    course_pinch_act: (turn, b) => `${turn}. Для этой лодки лучший бейдевинд — около ${b}–${b + 3}° к истинному ветру.`,
    course_wide: a => `Для лавировки слишком полно: ${a}° к ветру`,
    course_wide_act: turn => `${turn} и выберите шкоты, пока колдунчики снова не встанут ровно. Так лодка быстрее продвигается против ветра.`,
    course_beat_ok: a => `Хороший бейдевинд: ${a}° к ветру`,
    course_irons: a => `Левентик: нос почти в ветер (${a}°) — паруса не работают`,
    course_irons_act: (turn, b) => `${turn}. Если лодка остановилась — дайте стакселю наполниться и уваливайтесь до ${b}°.`,
    course_bylee: n => `Ветер дует со стороны гика («на рауле» ${n}°) — грозит самопроизвольный поворот фордевинд`,
    course_bylee_act: (n, s) => `Поверните на ${n}° ${s > 0 ? 'влево' : 'вправо'} — ветер должен снова дуть с борта, противоположного гику (для галса, на котором стоит гик, это приведение). Или сделайте контролируемый поворот: выберите гика-шкот к центру, переложите руль, после перехода гика — потравите.`,
    course_tack_wait: 'Вы ещё на исходном галсе',
    course_tack_act: 'Сделайте поворот оверштаг: кнопка «Оверштаг» или приводитесь, пока нос не пройдёт линию ветра, и ложитесь на 42–45° на другом галсе.',
    course_dead_ok: (h, a) => `Цель ${h}° теперь в мёртвом секторе — верно идёте крутым бейдевиндом (${a}°)`,
    course_dead_suffix: h => `. Цель ${h}° в мёртвом секторе — к ней только лавировкой`,
    course_off: (cur, h) => `Курс ${cur}°, а цель — ${h}°`,
    course_off_act: turn => `${turn}. На свободных курсах курс держат на цель, а под новый ветер подстраивают паруса.`,
    course_on: cur => `Курс на цель: ${cur}°`,
    course_gybe_wait: 'Поворот фордевинд ещё не сделан',
    course_gybe_act: 'Выберите гика-шкот почти к центру, затем уваливайтесь, пока корма не пройдёт линию ветра. После перехода гика потравите гика-шкот на новом борту.',
    course_run_high: a => `Курс острее фордевинда: ${a}° к ветру`,
    course_run_high_act: (turn, r) => `${turn} — до ${r}° к ветру.`,
    course_dead_run: 'Прямо по ветру — курс неустойчивый, легко уйти «на раул»',
    course_dead_run_act: turn => `${turn}: на 160–170° лодка устойчивее, гик не перебросит.`,
    course_run_ok: a => `Безопасный фордевинд/бакштаг: ${a}° к ветру`,
    course_free_pinch: a => `Слишком остро: ${a}° к ветру — лодка теряет ход`,
    course_free_pinch_act: (turn, b) => `${turn}. Оптимальный бейдевинд — около ${b}°.`,
    course_free: (pos, a, tack) => `${pos}, ${a}° к ветру, ${tack} галс`,

    jib_furled: 'Стаксель закручен',
    jib_where_q: 'Ползунок «Шкот стакселя».',
    jib_where_d: s => `Шкот ${s > 0 ? 'правого' : 'левого'} борта на основной лебёдке ${s > 0 ? 'правого' : 'левого'} борта.`,
    jib_pole_aback: 'Стаксель на выносном гике «на ветру» — курс стал слишком острым',
    jib_pole_aback_q: 'Снимите «бабочку» или увалитесь до фордевинда.',
    jib_pole_aback_d: 'Уберите выносной гик (карточка стакселя на схеме) или увалитесь до фордевинда.',
    jib_pole_ok: 'Бабочка: стаксель стоит на выносном гике',
    jib_pole_tight: 'Стаксель на выносном гике выбран слишком сильно',
    jib_pole_eased: 'Стаксель на выносном гике потравлен слишком сильно',
    jib_pole_act: 'На выносном гике шкот наветренного борта держит стаксель почти перпендикулярно ветру. ',
    jib_flog: 'Стаксель полощет: шкот отдан или слишком потравлен',
    jib_flog_act: s => `Выберите шкот ${s > 0 ? 'правого' : 'левого'} (подветренного) борта, пока наветренные колдунчики не перестанут трепетать. `,
    jib_flog_q: 'Ползунок «Шкот стакселя» — к «выбран».',
    jib_flog_d: s => `Шкот на основной лебёдке ${s > 0 ? 'правого' : 'левого'} борта → «Выбирать».`,
    jib_aback: 'Стаксель «на ветру»: его держит шкот наветренного борта',
    jib_aback_q: 'Стаксель заполаскивает с обратной стороны. Это бывает сразу после поворота — переложите шкот.',
    jib_aback_lock: 'Снимите отметку «Стаксель на ветру» — стаксель перейдёт на подветренный борт.',
    jib_aback_d: (s, o) => `Отдайте шкот ${s > 0 ? 'правого' : 'левого'} борта (снимите с лебёдки) и выберите шкот ${o > 0 ? 'правого' : 'левого'} борта.`,
    jib_aback_hove: ' Если вы ложитесь в дрейф — так и надо: закрепите руль на приведение.',
    jib_shadow: 'Стаксель в тени грота — колдунчики висят',
    jib_shadow_q: 'На фордевинде стаксель не получает ветра. Включите «Бабочку» (стаксель на выносном гике на другой борт), приведитесь до ~150° или закрутите стаксель.',
    jib_shadow_d: 'Поставьте выносной гик на наветренный борт и выберите наветренный шкот, или приведитесь до ~150°, или закрутите стаксель.',
    jib_pinch: 'Шкот выбран до упора, но наветренные колдунчики трепещут',
    jib_pinch_act: n => `Дело не в шкоте, а в курсе: вы идёте слишком остро. Увалитесь на ${n}°.`,
    jib_under: 'Наветренные колдунчики трепещут — стаксель потравлен',
    jib_under_act: w => `Выберите шкот, пока наветренные колдунчики не встанут ровно (или увалитесь, если курс не важен). ${w}`,
    jib_over: 'Подветренные колдунчики срываются — стаксель перетянут',
    jib_over_act: w => `Потравите шкот, пока подветренные колдунчики не потекут ровно (или приведитесь, если цель на ветре). ${w}`,
    jib_ok: 'Колдунчики стакселя текут ровно с обеих сторон',
    jib_luff: 'Стаксель заполаскивает у передней шкаторины',
    jib_luff_act: w => `Наветренные колдунчики трепещут: выберите шкот или увалитесь. ${w}`,

    car_na_pole: 'На выносном гике каретка не важна',
    na: 'Не оценивается',
    car_where_q: 'Ползунок «Каретка стакселя».',
    car_where_d: s => `Каретка на погоне ${s > 0 ? 'правого' : 'левого'} борта. Под нагрузкой она не двигается: потравите шкот, переставьте каретку, снова выберите.`,
    car_open: 'Верх стакселя открыт: верхние колдунчики заполаскивают раньше нижних',
    car_open_act: (n, furled, w) => `Каретку вперёд на ${n} отв. — шкот потянет шкаторину вниз и закроет верх. ${furled ? 'После закрутки шкотовый угол поднялся — каретку всегда двигают вперёд. ' : ''}${w}`,
    car_closed: 'Нижние колдунчики заполаскивают раньше, верх стакселя закрыт',
    car_closed_act: (n, w) => `Каретку назад на ${n} отв. — верх откроется, низ станет площе. ${w}`,
    car_ok: 'Колдунчики на всех высотах срываются одновременно — каретка на месте',
    car_ok_breeze: '; в сильный ветер верх чуть открыт — так меньше крен',

    furl_run: 'На фордевинде стаксель в тени — закрутить его разумно',
    furl_much: n => `Стакселя слишком много для ${n} уз вымпельного ветра — лодка перегружена`,
    furl_much_act: p => `Закрутите стаксель до ~${p}% раскрытия: потравите шкот немного, тяните закрутку, затем выберите шкот и сдвиньте каретку вперёд. `,
    furl_q: 'Ползунок «Раскрытие стакселя».',
    furl_much_d: 'Закрутка — в пианино правого борта, на правую лебёдку на рубке. Если там гика-шкот, снимите его: стопор гика-шкота закрыт и удержит шкот.',
    furl_little: 'Стаксель закручен, а ветра немного — не хватает мощности',
    furl_little_act: p => `Раскройте стаксель до ~${p}%. `,
    furl_little_d: 'Заведите закрутку на правую лебёдку на рубке, откройте её стопор и выбирайте шкот стакселя — стаксель раскрутится. Потом закройте стопор и сдвиньте каретку назад.',
    furl_ok: p => `Площадь стакселя по ветру: ${p}% раскрытия`,

    main_where_q: 'Ползунки «Гика-шкот» и «Погон».',
    main_where_d: 'Гика-шкот — в пианино правого борта, на правую лебёдку на рубке. Погон — каретка на рубке.',
    main_down: 'Грот не поднят',
    main_down_q: 'Поднимите грот — ползунок «Фал грота».',
    main_down_d: 'Заведите фал грота на левую лебёдку на рубке и выбирайте.',
    main_flog: 'Грот полощет: гика-шкот слишком потравлен',
    main_flog_act: 'Выберите гика-шкот, пока парус не перестанет полоскать у мачты. ',
    main_back: 'Грот заполаскивает с обратной стороны',
    main_back_act: 'Гик на наветренной стороне — переставьте каретку погона под ветер и потравите гика-шкот.',
    main_under: 'Грот заполаскивает у мачты — пузырь по передней шкаторине',
    main_under_up: 'Подтяните каретку погона на ветер или выберите гика-шкот, пока пузырь не исчезнет.',
    main_under_off: 'Выберите гика-шкот, пока пузырь у мачты не исчезнет.',
    main_run_tight: 'На полном курсе гик слишком выбран',
    main_run_tight_act: 'Вытравите гика-шкот, чтобы гик стоял почти перпендикулярно ветру (65–72°), но не лёг на краспицы. ',
    main_over: 'Грот перетянут: колдунчики на задней шкаторине заворачиваются за парус',
    main_over_up: 'Опустите каретку погона под ветер (гик отойдёт, а задняя шкаторина останется натянутой) или немного потравите гика-шкот.',
    main_over_off: 'Потравите гика-шкот, пока колдунчики задней шкаторины не начнут струиться.',
    main_feather: 'Грот слегка разгружен у мачты — в сильный ветер это нормально',
    main_ok: 'Угол грота верный: колдунчики задней шкаторины струятся',
    main_shrouds: 'Гик лёг на ванты — парус трётся о краспицы',
    main_shrouds_act: 'Подберите гика-шкот на 3–4°, чтобы грот не давил на краспицы. ',

    tw_open: 'Слишком большая скрутка: верх грота открыт и не тянет',
    tw_open_up: 'На бейдевинде скрутку регулирует гика-шкот: выберите его, а гик удержите кареткой погона (опустите её под ветер). ',
    tw_open_up_d: 'Гика-шкот — правая лебёдка на рубке.',
    tw_open_off: 'На полных курсах скрутку держит оттяжка гика: подтяните её, пока верхний колдунчик задней шкаторины не начнёт иногда заворачиваться. ',
    tw_vang_q: 'Ползунок «Оттяжка гика».',
    tw_open_off_d: 'Оттяжка — в пианино левого борта, на левую лебёдку на рубке.',
    tw_closed: 'Задняя шкаторина закрыта: верхний колдунчик всё время за парусом',
    tw_closed_vang: 'Потравите оттяжку гика — верх грота должен немного открыться. ',
    tw_closed_vang_d: 'Оттяжка: левая лебёдка на рубке, стопор открыть, травить.',
    tw_closed_sheet: 'Немного потравите гика-шкот, а гик верните кареткой погона на ветер. ',
    tw_closed_sheet_d: 'Гика-шкот: правая лебёдка, стопор открыть, травить.',
    tw_ok: 'Скрутка грота по ветру',

    dp_where_q: 'Ползунки «Аутхол» и «Ахтерштаг».',
    dp_where_d: 'Аутхол — правое пианино, правая лебёдка на рубке. Ахтерштаг — таль на корме.',
    dp_ok: 'Пузо парусов подходит для ветра',
    dp_deep_breeze: n => `Паруса слишком пузатые для ${n} уз`,
    dp_deep: 'Паруса глубже, чем нужно',
    dp_out_on: 'Подтяните аутхол (нижняя часть грота станет площе). ',
    dp_bs_on: 'Подтяните ахтерштаг: мачта прогнётся, грот станет площе, провис штага уменьшится. ',
    dp_flat_off: 'На полном курсе паруса слишком плоские',
    dp_flat: 'Паруса слишком плоские — не хватает мощности',
    dp_out_off: 'Потравите аутхол. ',
    dp_bs_off: 'Потравите ахтерштаг. ',

    lf_down: 'Грот упал: фал потравлен',
    lf_part: 'Грот поднят не полностью — передняя шкаторина провисла',
    lf_q: 'Ползунок «Фал грота».',
    lf_part_d: 'Заведите фал грота на левую лебёдку на рубке и выбирайте. Стопор можно не открывать: на выбирание он снасть пропускает.',
    lf_aft: 'Пузо грота уехало назад, у мачты горизонтальные складки',
    lf_aft_act: 'Подтяните фал — пузо сместится вперёд. ',
    lf_aft_d: 'Фал — левая лебёдка на рубке, выбирайте через закрытый стопор.',
    lf_tight: 'Вертикальная складка вдоль мачты — фал перетянут',
    lf_tight_act: 'Потравите фал на пару сантиметров. ',
    lf_tight_d: 'Фал на левую лебёдку на рубке → откройте стопор → «Травить» → закройте стопор → снимите с лебёдки.',
    lf_ok: 'Передняя шкаторина натянута по ветру',

    rf_part: 'Риф взят не до конца',
    rf_part_q: 'Выберите нужный риф переключателем «Рифы».',
    rf_part_d: 'Потравите фал до метки рифа и выберите риф-шкентель до конца, затем натяните фал.',
    rf_ok: lvl => (lvl ? `Взят ${lvl}-й риф — по ветру` : 'Полный грот — по ветру'),
    rf_border: 'На границе: подойдут оба варианта',
    rf_need: (t, ew) => `Пора брать ${t}-й риф: ${ew} уз вымпельного ветра`,
    rf_need_q: t => `Переключите «Рифы» на «${t}-й». На настоящей лодке: оттяжку и гика-шкот потравить, фал потравить до метки, выбрать риф-шкентель, снова натянуть фал.`,
    rf_need_d: t => `1) Потравите оттяжку гика и немного гика-шкот. 2) Фал на левую лебёдку на рубке, откройте стопор и травите до метки ${t}-го рифа. 3) Закройте стопор фала, снимите фал с лебёдки. 4) Риф-шкентель ${t} на ту же лебёдку — выбирайте до конца. 5) Снимите его, снова фал на лебёдку — натяните переднюю шкаторину. 6) Настройте гика-шкот и оттяжку.`,
    rf_extra: ew => `Риф лишний: ветра ${ew} уз, лодке не хватает мощности`,
    rf_extra_q: t => `Переключите «Рифы» на «${t ? t + '-й' : 'нет'}».`,
    rf_extra_d: 'Риф-шкентель на левую лебёдку на рубке → откройте его стопор → потравите. Затем фал на лебёдку и выбирайте до полного подъёма грота.',

    hl_heel: (h, r) => `Крен ${h}°: лодка перегружена, руль тянет к ветру (${r}°)`,
    hl_heel_act: 'Разгрузите грот: каретку погона под ветер, потравите гика-шкот, подтяните ахтерштаг. Если не помогает — риф и закрутка стакселя.',
    hl_weather: r => `Руль тянет к ветру (${r}°) — перегружен грот`,
    hl_weather_act: 'Опустите каретку погона под ветер, подтяните фал и оттяжку, проверьте скрутку грота. Если стаксель сильно закручен, а грот полный — возьмите риф.',
    hl_lee: 'Лодка уваливается сама: стаксель перевешивает грот',
    hl_lee_act: 'Выберите грот (гика-шкот или каретку погона на ветер) или немного закрутите стаксель.',
    hl_ok: (h, r) => `Крен ${h}°, руль ${r}° — лодка сбалансирована`,
    hl_hove_heel: h => `Крен ${h}° — для дрейфа многовато`,
    hl_hove_heel_act: 'Потравите грот сильнее или возьмите риф.',
    hl_hove_ok: h => `Крен ${h}° — лодка лежит спокойно`,

    dk_ok: 'Все нагруженные снасти держат стопора или лебёдки',
    dk_run: l => `${l.ref} свободен и уходит под нагрузкой`,
    dk_run_act: 'Закройте стопор или заведите снасть на лебёдку.',

    hv_jib_ok: 'Стаксель заложен на ветер и уваливает нос',
    hv_jib_bad: 'Стаксель не на ветру — лодка не ляжет в дрейф',
    hv_jib_q: 'Отметьте «Стаксель на ветру» или сделайте поворот оверштаг, не отдавая шкот.',
    hv_jib_d: 'Сделайте поворот оверштаг, не отдавая рабочий шкот, — стаксель останется на прежнем борту и встанет на ветер.',
    hv_helm_ok: 'Руль закреплён на приведение и спорит со стакселем',
    hv_helm_bad: 'Руль не закреплён — лодка будет уваливаться',
    hv_helm_act: 'Нажмите замок у руля: штурвал повёрнут к ветру и закреплён.',
    hv_main_fast: v => `Лодка идёт вперёд (${v} уз) — грот тянет`,
    hv_main_fast_act: 'Потравите гика-шкот, пока ход не упадёт до 1–2 узлов. ',
    hv_main_ok: v => `Грот почти не тянет: ход ${v} уз`,
    hv_main_noMain: 'Грот убран: в дрейфе под одним стакселем лодку сильнее валит',
    hv_angle_wait: 'Угол оценим, когда стаксель будет на ветру, а руль закреплён',
    hv_angle_close: a => `Слишком остро (${a}°) — лодку может развернуть через ветер`,
    hv_angle_close_act: 'Потравите грот сильнее: он приводит лодку к ветру.',
    hv_angle_wide: a => `Лодку уваливает (${a}°), и она набирает ход`,
    hv_angle_wide_act: 'Подберите гика-шкот немного: грот поможет держать нос к ветру.',
    hv_angle_ok: a => `Лодка лежит в дрейфе: ${a}° к ветру`
  },

  en: {
    pos_irons: 'Head to wind', pos_pinch: 'Pinching', pos_close: 'Close-hauled', pos_creach: 'Close reach', pos_beam: 'Beam reach',
    pos_broad: 'Broad reach', pos_deep: 'Deep broad reach', pos_run: 'Run', pos_hove: 'Hove-to',
    side_gen: s => (s > 0 ? 'starboard' : 'port'),
    tack_nom: s => (s > 0 ? 'starboard' : 'port'),
    turn_up: (n, s) => `Head up ${n}° (turn to ${s > 0 ? 'starboard' : 'port'})`,
    turn_down: (n, s) => `Bear away ${n}° (turn to ${s > 0 ? 'starboard' : 'port'})`,

    msg_notOnWinch: l => `${cap(l.ref)} isn't on a winch. Put the line on a winch first.`,
    msg_clutchClosed: l => `The clutch on ${l.ref} is closed, so it can't be eased. Open the clutch — the winch will hold the line.`,
    msg_halyardMax: () => 'The halyard is fully tensioned: the luff is as tight as it goes.',
    msg_halyardReef: () => "The halyard won't go higher: a reef is in, so luff tension stops at the reef mark.",
    msg_reefBlocked: () => "The reefing line won't come in: ease the main halyard to the reef mark first.",
    msg_furlSheet: () => "The furler won't turn: the genoa sheet is holding the clew. Ease the sheet first.",
    msg_sheetFurl: () => "The sheet won't come in: the furler is holding the genoa. Open the furler clutch — the genoa unrolls as you haul the sheet.",
    msg_sheetOther: () => "The sheet won't come in: the other sheet holds the genoa on the other side. Release it — take it off its winch.",
    msg_carLoaded: () => "The car is under load and won't move. Ease that sheet, move the car, then trim again.",
    msg_winchBusy: (l, o) => `That winch is busy with ${o.ref}. Take it off the winch first.`,
    msg_max: l => `${cap(l.ref)}: can't haul in any further.`,
    msg_min: l => `${cap(l.ref)}: already fully eased.`,
    msg_hoistLoaded: () => 'The main is full of wind, so the halyard is heavy. Ease the mainsheet or head up.',
    msg_reefVang: () => 'The vang is tight, so the boom fights the reef clew. Ease the vang.',
    msg_poleWind: () => 'The whisker pole only goes up on a run or a deep broad reach.',

    log_run: l => `${cap(l.ref)} ran out under load!`,
    log_clutchClosed: l => `${l.short} clutch closed`,
    log_clutchOpen: l => `${l.short} clutch opened`,
    log_offWinch: l => `${l.short} taken off the winch`,
    log_onWinch: (l, w) => `${l.short} put on the ${WINCH_TXT.en[w]}`,
    log_poleOn: s => `Whisker pole set to ${s > 0 ? 'starboard' : 'port'}`,
    log_poleOff: () => 'Whisker pole stowed',

    mist_crash: () => 'Accidental gybe: the boom slammed across',
    mist_run: l => `${cap(l.ref)} ran out under load`,
    mist_broach: () => 'The boat broached — too much sail up',
    mist_irons: () => 'The boat stalled head to wind (in irons)',

    ev_shift: (header, n) => (header ? `A ${n}° header: the wind has moved towards the bow.` : `A ${n}° lift: the wind has moved towards the stern.`),
    ev_speed: (up, n) => `The wind ${up ? 'builds' : 'eases'} to ${n} kn.`,

    course_ok: 'The course suits the task',
    course_pinch: a => `Pinching: ${a}° to the wind — the boat is slowing and the windward telltales are lifting`,
    course_pinch_act: (turn, b) => `${turn}. This boat's best close-hauled angle is about ${b}–${b + 3}° to the true wind.`,
    course_wide: a => `Too wide for beating: ${a}° to the wind`,
    course_wide_act: turn => `${turn} and trim the sheets until the telltales stream again. That makes better progress upwind.`,
    course_beat_ok: a => `Good close-hauled angle: ${a}° to the wind`,
    course_irons: a => `Head to wind (${a}°): the sails can't work`,
    course_irons_act: (turn, b) => `${turn}. If the boat has stopped, let the genoa fill and bear away to ${b}°.`,
    course_bylee: n => `The wind is on the boom side — sailing ${n}° by the lee, an accidental gybe is close`,
    course_bylee_act: (n, s) => `Turn ${n}° to ${s > 0 ? 'port' : 'starboard'} so the wind comes from the side opposite the boom again (on the boom's tack that means heading up). Or gybe under control: sheet the main to the centre, turn, then ease once the boom has crossed.`,
    course_tack_wait: 'Still on the original tack',
    course_tack_act: 'Tack: press “Tack”, or head up until the bow passes through the wind, then settle at 42–45° on the new tack.',
    course_dead_ok: (h, a) => `The target (${h}°) is now in the no-go zone — sailing close-hauled (${a}°) is right`,
    course_dead_suffix: h => `. The target (${h}°) is in the no-go zone — you can only beat towards it`,
    course_off: (cur, h) => `Heading ${cur}°, target ${h}°`,
    course_off_act: turn => `${turn}. Off the wind you hold the course to the target and trim the sails to the new wind.`,
    course_on: cur => `On course for the target: ${cur}°`,
    course_gybe_wait: "You haven't gybed yet",
    course_gybe_act: 'Sheet the main almost to the centre, then bear away until the stern passes through the wind. Once the boom crosses, ease the mainsheet on the new side.',
    course_run_high: a => `Higher than a run: ${a}° to the wind`,
    course_run_high_act: (turn, r) => `${turn} — to ${r}° to the wind.`,
    course_dead_run: 'Dead downwind — unstable, easy to slip by the lee',
    course_dead_run_act: turn => `${turn}: at 160–170° the boat is steadier and the boom won't gybe.`,
    course_run_ok: a => `Safe run or broad reach: ${a}° to the wind`,
    course_free_pinch: a => `Pinching: ${a}° to the wind — the boat is slowing`,
    course_free_pinch_act: (turn, b) => `${turn}. The best close-hauled angle is about ${b}°.`,
    course_free: (pos, a, tack) => `${pos}, ${a}° to the wind, ${tack} tack`,

    jib_furled: 'Genoa furled',
    jib_where_q: 'Use the “Genoa sheet” slider.',
    jib_where_d: s => `The ${s > 0 ? 'starboard' : 'port'} sheet, on the ${s > 0 ? 'starboard' : 'port'} primary winch.`,
    jib_pole_aback: 'The poled-out genoa is aback — the course is now too high',
    jib_pole_aback_q: 'Turn off wing-on-wing or bear away to a run.',
    jib_pole_aback_d: 'Stow the whisker pole (genoa sheet card on the deck plan) or bear away to a run.',
    jib_pole_ok: 'Wing-on-wing: the genoa is set on the whisker pole',
    jib_pole_tight: 'The poled-out genoa is over-trimmed',
    jib_pole_eased: 'The poled-out genoa is eased too far',
    jib_pole_act: 'On the pole, the windward sheet holds the genoa nearly square to the wind. ',
    jib_flog: 'The genoa is flogging: the sheet is released or eased too far',
    jib_flog_act: s => `Trim the ${s > 0 ? 'starboard' : 'port'} (leeward) sheet until the windward telltales stop lifting. `,
    jib_flog_q: 'Move the “Genoa sheet” slider towards “in”.',
    jib_flog_d: s => `${s > 0 ? 'Starboard' : 'Port'} primary winch → “Haul in”.`,
    jib_aback: 'The genoa is aback: the windward sheet is holding it',
    jib_aback_q: 'The genoa is filling from the wrong side. This happens right after a tack — switch sheets.',
    jib_aback_lock: 'Untick “Genoa backed” — the genoa will cross to the leeward side.',
    jib_aback_d: (s, o) => `Release the ${s > 0 ? 'starboard' : 'port'} sheet (take it off its winch) and trim the ${o > 0 ? 'starboard' : 'port'} sheet.`,
    jib_aback_hove: " If you're heaving to, that's right: lash the helm to head up.",
    jib_shadow: 'The genoa is blanketed by the main — the telltales hang limp',
    jib_shadow_q: 'On a run the genoa gets no wind. Turn on wing-on-wing (genoa poled out to the other side), head up to ~150°, or furl the genoa.',
    jib_shadow_d: 'Set the whisker pole to windward and trim the windward sheet, head up to ~150°, or furl the genoa.',
    jib_pinch: 'The sheet is fully in, yet the windward telltales are lifting',
    jib_pinch_act: n => `It's the course, not the sheet: you're pinching. Bear away ${n}°.`,
    jib_under: 'The windward telltales are lifting — the genoa is eased too far',
    jib_under_act: w => `Trim the sheet until the windward telltales stream (or bear away if the course doesn't matter). ${w}`,
    jib_over: 'The leeward telltales are stalling — the genoa is over-trimmed',
    jib_over_act: w => `Ease the sheet until the leeward telltales stream (or head up if your target is upwind). ${w}`,
    jib_ok: 'Genoa telltales streaming on both sides',
    jib_luff: 'The genoa is luffing at the luff',
    jib_luff_act: w => `The windward telltales are lifting: trim the sheet or bear away. ${w}`,

    car_na_pole: "Car position doesn't matter on the pole",
    na: 'Not assessed',
    car_where_q: 'Use the “Genoa car” slider.',
    car_where_d: s => `The car on the ${s > 0 ? 'starboard' : 'port'} track. It won't move under load: ease the sheet, move the car, trim again.`,
    car_open: 'The top of the genoa is too open: the upper telltales break first',
    car_open_act: (n, furled, w) => `Move the car ${n} hole${n > 1 ? 's' : ''} forward — the sheet pulls the leech down and closes the top. ${furled ? 'With the genoa part-furled the clew is higher, so the car always goes forward. ' : ''}${w}`,
    car_closed: 'The lower telltales break first — the top of the genoa is too closed',
    car_closed_act: (n, w) => `Move the car ${n} hole${n > 1 ? 's' : ''} aft — the top opens and the foot flattens. ${w}`,
    car_ok: 'Telltales at every height break together — the car is right',
    car_ok_breeze: '; in a breeze a slightly open top cuts heel',

    furl_run: 'On a run the genoa is blanketed — furling it makes sense',
    furl_much: n => `Too much genoa for ${n} kn apparent — the boat is overpowered`,
    furl_much_act: p => `Furl the genoa to about ${p}% out: ease the sheet a little, pull the furling line, then trim the sheet and move the car forward. `,
    furl_q: 'Use the “Genoa furl” slider.',
    furl_much_d: "The furling line is in the starboard clutch bank, on the starboard coachroof winch. If the mainsheet is on that winch, take it off — its closed clutch holds it.",
    furl_little: 'The genoa is furled but the wind is light — not enough power',
    furl_little_act: p => `Unfurl the genoa to about ${p}%. `,
    furl_little_d: 'Put the furling line on the starboard coachroof winch, open its clutch and haul the genoa sheet — the sail unrolls. Then close the clutch and move the car aft.',
    furl_ok: p => `Genoa area suits the wind: ${p}% out`,

    main_where_q: 'Use the “Mainsheet” and “Traveller” sliders.',
    main_where_d: 'The mainsheet is in the starboard clutch bank, on the starboard coachroof winch. The traveller is the car on the coachroof.',
    main_down: "The main isn't hoisted",
    main_down_q: 'Hoist the main — the “Main halyard” slider.',
    main_down_d: 'Put the main halyard on the port coachroof winch and haul.',
    main_flog: 'The main is flogging: the mainsheet is eased too far',
    main_flog_act: 'Trim the mainsheet until the sail stops luffing at the mast. ',
    main_back: 'The main is backwinded',
    main_back_act: 'The boom is to windward — drop the traveller to leeward and ease the mainsheet.',
    main_under: 'The main is luffing at the mast — a bubble along the luff',
    main_under_up: 'Pull the traveller up to windward or trim the mainsheet until the bubble goes.',
    main_under_off: 'Trim the mainsheet until the bubble at the mast goes.',
    main_run_tight: 'Off the wind the boom is sheeted in too far',
    main_run_tight_act: 'Ease the mainsheet until the boom is nearly square to the wind (65–72°), but not pressing on the spreaders. ',
    main_over: 'The main is over-trimmed: the leech telltales curl behind the sail',
    main_over_up: 'Drop the traveller to leeward (the boom moves out, the leech stays firm) or ease the mainsheet a little.',
    main_over_off: 'Ease the mainsheet until the leech telltales stream.',
    main_feather: 'The main is slightly depowered at the mast — fine in a breeze',
    main_ok: 'The main angle is right: the leech telltales are streaming',
    main_shrouds: 'The boom is on the shrouds — the sail is chafing on the spreaders',
    main_shrouds_act: 'Trim the mainsheet 3–4° so the main stops pressing on the spreaders. ',

    tw_open: 'Too much twist: the top of the main is open and not driving',
    tw_open_up: 'Upwind the mainsheet controls twist: trim it and hold the boom position with the traveller (drop it to leeward). ',
    tw_open_up_d: 'The mainsheet is on the starboard coachroof winch.',
    tw_open_off: 'Off the wind the vang controls twist: tighten it until the top leech telltale curls behind the sail now and then. ',
    tw_vang_q: 'Use the “Vang” slider.',
    tw_open_off_d: 'The vang is in the port clutch bank, on the port coachroof winch.',
    tw_closed: 'The leech is closed: the top telltale stays behind the sail',
    tw_closed_vang: 'Ease the vang — the top of the main should open a little. ',
    tw_closed_vang_d: 'Vang: port coachroof winch, open the clutch, ease.',
    tw_closed_sheet: 'Ease the mainsheet slightly and bring the boom back up with the traveller. ',
    tw_closed_sheet_d: 'Mainsheet: starboard coachroof winch, open the clutch, ease.',
    tw_ok: 'Main twist suits the wind',

    dp_where_q: 'Use the “Outhaul” and “Backstay” sliders.',
    dp_where_d: 'The outhaul is in the starboard clutch bank, on the starboard coachroof winch. The backstay is the tackle at the stern.',
    dp_ok: 'Sail depth suits the wind',
    dp_deep_breeze: n => `The sails are too full for ${n} kn`,
    dp_deep: 'The sails are deeper than needed',
    dp_out_on: 'Tighten the outhaul (the lower main flattens). ',
    dp_bs_on: 'Tighten the backstay: the mast bends, the main flattens and the forestay sags less. ',
    dp_flat_off: 'Off the wind the sails are too flat',
    dp_flat: 'The sails are too flat — not enough power',
    dp_out_off: 'Ease the outhaul. ',
    dp_bs_off: 'Ease the backstay. ',

    lf_down: 'The main has dropped: the halyard is eased',
    lf_part: "The main isn't fully hoisted — the luff is sagging",
    lf_q: 'Use the “Main halyard” slider.',
    lf_part_d: "Put the main halyard on the port coachroof winch and haul. No need to open the clutch: it lets the line in when you haul.",
    lf_aft: "The main's draft has moved aft; horizontal creases at the mast",
    lf_aft_act: 'Tension the halyard — the draft moves forward. ',
    lf_aft_d: 'Halyard: port coachroof winch, haul through the closed clutch.',
    lf_tight: 'A vertical crease along the mast — the halyard is too tight',
    lf_tight_act: 'Ease the halyard a couple of centimetres. ',
    lf_tight_d: 'Halyard on the port coachroof winch → open the clutch → “Ease” → close the clutch → take it off the winch.',
    lf_ok: 'Luff tension suits the wind',

    rf_part: "The reef isn't fully in",
    rf_part_q: 'Pick the reef with the “Reefs” switch.',
    rf_part_d: 'Ease the halyard to the reef mark, haul the reefing line all the way, then tension the halyard.',
    rf_ok: lvl => (lvl ? `${ord(lvl)} reef in — right for the wind` : 'Full main — right for the wind'),
    rf_border: 'Borderline: either choice works',
    rf_need: (t, ew) => `Time for the ${ord(t)} reef: ${ew} kn apparent`,
    rf_need_q: t => `Set “Reefs” to “${ord(t)} reef”. On a real boat: ease the vang and mainsheet, ease the halyard to the mark, haul in the reefing line, re-tension the halyard.`,
    rf_need_d: t => `1) Ease the vang and a little mainsheet. 2) Halyard on the port coachroof winch, open the clutch and ease to the ${ord(t)}-reef mark. 3) Close the halyard clutch and take the halyard off the winch. 4) Reefing line ${t} on the same winch — haul it all the way. 5) Take it off, put the halyard back on and tension the luff. 6) Re-trim the mainsheet and vang.`,
    rf_extra: ew => `Too much reef: ${ew} kn and the boat is underpowered`,
    rf_extra_q: t => `Set “Reefs” to “${t ? ord(t) + ' reef' : 'Full main'}”.`,
    rf_extra_d: 'Reefing line on the port coachroof winch → open its clutch → ease. Then halyard on the winch and hoist the main fully.',

    hl_heel: (h, r) => `Heeling ${h}°: overpowered, with ${r}° of weather helm`,
    hl_heel_act: 'Depower the main: traveller down, ease the mainsheet, tighten the backstay. If that is not enough, reef and furl some genoa.',
    hl_weather: r => `Weather helm (${r}°) — the main is overpowered`,
    hl_weather_act: 'Drop the traveller, tension the halyard and vang, check the main twist. If the genoa is well furled but the main is full, reef.',
    hl_lee: 'Lee helm: the genoa overpowers the main',
    hl_lee_act: 'Trim the main (mainsheet or traveller up) or furl a little genoa.',
    hl_ok: (h, r) => `Heel ${h}°, helm ${r}° — the boat is balanced`,
    hl_hove_heel: h => `Heel ${h}° — a lot for heaving to`,
    hl_hove_heel_act: 'Ease the main further or reef.',
    hl_hove_ok: h => `Heel ${h}° — the boat lies quietly`,

    dk_ok: 'Every loaded line is held by a clutch or a winch',
    dk_run: l => `${cap(l.ref)} is free and running out under load`,
    dk_run_act: 'Close the clutch or put the line on a winch.',

    hv_jib_ok: 'The genoa is backed and pushes the bow off',
    hv_jib_bad: "The genoa isn't backed — the boat won't heave to",
    hv_jib_q: 'Tick “Genoa backed”, or tack without releasing the sheet.',
    hv_jib_d: 'Tack without releasing the working sheet — the genoa stays on the old side and goes aback.',
    hv_helm_ok: 'The helm is lashed to head up, against the genoa',
    hv_helm_bad: "The helm isn't lashed — the boat will keep bearing away",
    hv_helm_act: 'Tap the lock on the helm bar: wheel turned to windward and lashed (tiller to leeward).',
    hv_main_fast: v => `The boat is still sailing (${v} kn) — the main is driving`,
    hv_main_fast_act: 'Ease the mainsheet until boat speed drops to 1–2 knots. ',
    hv_main_ok: v => `The main is barely driving: ${v} kn`,
    hv_main_noMain: 'Main down: hove-to under genoa alone she lies less steadily',
    hv_angle_wait: 'The angle is assessed once the genoa is backed and the helm lashed',
    hv_angle_close: a => `Too close to the wind (${a}°) — she may tack herself`,
    hv_angle_close_act: 'Ease the main further: it is turning the boat into the wind.',
    hv_angle_wide: a => `Falling off (${a}°) and picking up speed`,
    hv_angle_wide_act: 'Trim the mainsheet a little: the main helps hold the bow up.',
    hv_angle_ok: a => `Hove-to at ${a}° to the wind`
  }
};
function T(k, ...a) {
  let v = TXT[LANG] ? TXT[LANG][k] : undefined;
  if (v == null) v = TXT.ru[k];
  if (v == null) return k;
  return typeof v === 'function' ? v(...a) : v;
}
function setLang(l) { if (TXT[l]) LANG = l; }

function pointOfSail(a) {
  if (a < 30) return T('pos_irons');
  if (a < 38) return T('pos_pinch');
  if (a < 55) return T('pos_close');
  if (a < 80) return T('pos_creach');
  if (a < 100) return T('pos_beam');
  if (a < 135) return T('pos_broad');
  if (a < 160) return T('pos_deep');
  return T('pos_run');
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

/* ---------- Палуба: стопора, лебёдки ---------- */
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
  return {
    t: 0, mode: 'quick', paused: false,
    wind: { tws: 12, twd: 0, baseTws: 12, baseTwd: 0, gusts: false, ramps: [] },
    boat: { hdg: 318, bsp: 6.2, heel: 15, dist: 0 },
    helm: { cmd: 0, auto: null, lash: false },
    rig: { sheetP: 0.1, sheetS: 2.4, carP: 0.5, carS: 0.5, furl: 0, pole: 0, main: 0.03, trav: 0, vang: 0.15, outhaul: 0.4, halyard: 1.02, reef1: 0, reef2: 0, backstay: 0.35 },
    quick: { jibSheet: 0.05, car: 0.55, open: 1, mainsheet: 0.03, travLee: 0, vang: 0.15, outhaul: 0.4, luff: 0.6, reef: 0, backstay: 0.35, goose: false, jibLock: 0 },
    boomSide: -1, boomAngle: -2,
    deck: createDeck(),
    events: [], scn: null, bestCache: null, D: null, heave: null,
    broachT: 0, broaching: 0, ironsT: 0, crashT: 0
  };
}
function emit(S, type, data) { S.events.push({ type, data, t: S.t }); if (S.events.length > 60) S.events.shift(); }
function log(S, k, a, kind) {
  S.deck.log.unshift({ k, a: a || [], kind: kind || 'info', t: S.t });
  if (S.deck.log.length > 7) S.deck.log.pop();
}
const lineArgs = a => a.map(x => (typeof x === 'string' && LINES[x] ? LINES[x] : x));
const logText = e => T('log_' + e.k, ...lineArgs(e.a));
const msgText = m => (m ? T('msg_' + m.reason, LINES[m.line], m.other ? LINES[m.other] : null) : '');
const mistakeText = m => T('mist_' + m.k, ...lineArgs(m.a || []));
function block(S, reason, line, other) {
  const d = S.deck;
  const same = d.msg && d.msg.reason === reason && d.msg.line === line;
  if (!same || S.t - d.msg.t > 2.5) {
    d.msg = { reason, line, other, t: S.t };
    emit(S, 'block', msgText(d.msg));
  } else d.msg.t = S.t;
}

/* ---------- Быстрый режим: ползунки -> физические настройки ---------- */
function applyQuick(S, awaS) {
  const Q = S.quick, R = S.rig;
  const windLee = -sgn(awaS);
  R.furl = clamp(1 - Q.open, 0, 1);
  let jibSide = windLee;
  if (Q.goose && Math.abs(awaS) > 110) { jibSide = -windLee; R.pole = jibSide; Q.jibLock = 0; }
  else {
    R.pole = 0; if (Q.goose) Q.goose = false;
    if (Q.jibLock) jibSide = Q.jibLock;
  }
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
  Q.jibLock = D && D.jibBacked ? jg.fill : 0;
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
          log(S, 'run', [line], 'bad');
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
  log(S, d.clutch[line] ? 'clutchClosed' : 'clutchOpen', [line]);
}
function deckToggleWinch(S, line) {
  const d = S.deck, w = winchFor(line);
  if (d.winch[w] === line) {
    d.winch[w] = null;
    log(S, 'offWinch', [line]);
    return true;
  }
  if (d.winch[w]) { block(S, 'winchBusy', line, d.winch[w]); return false; }
  d.winch[w] = line;
  log(S, 'onWinch', [line, w]);
  return true;
}
function deckSetPole(S, side) {
  const D = S.D;
  if (side && D && D.awaAbs < 110) { block(S, 'poleWind', 'sheetP'); return false; }
  S.rig.pole = side;
  if (side) log(S, 'poleOn', [side]); else log(S, 'poleOff', []);
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
  const B = S.boat, H = S.helm, D = S.D;
  const eff = clamp(Math.abs(B.bsp) / 3, 0.22, 1);
  if (H.auto) {
    const d = Math.min(H.auto.left, H.auto.rate * Math.max(eff, 0.5) * dt);
    B.hdg = wrap360(B.hdg + H.auto.dir * d);
    H.auto.left -= d;
    if (H.auto.left <= 1e-6) H.auto = null;
  } else if (H.cmd) {
    B.hdg = wrap360(B.hdg + H.cmd * (H.fine ? 2 : 6) * eff * dt);
  } else if (H.lash && D) {
    // Руль закреплён на приведение. Дрейф — равновесие трёх моментов:
    // руль приводит (тем сильнее, чем больше ход), грот приводит, заложенный стаксель уваливает.
    const s = sgn(D.twa);
    let rate = 2.4 * clamp(0.3 + B.bsp / 2.5, 0.3, 1.4);
    rate += 2.2 * hoveMainDrive(S, D) * smooth(100, 40, D.twaAbs);
    if (D.jibBacked) rate -= 4.0 * smooth(75, 30, D.twaAbs) * clamp(D.aws / 10, 0.5, 1.5) * (D.jibVis / BOAT.jibArea);
    B.hdg = wrap360(B.hdg + s * rate * dt);
  }
  if (S.broaching > 0) {
    const twa = wrap180(S.wind.twd - B.hdg);
    B.hdg = wrap360(B.hdg + sgn(twa) * 7 * dt);
    S.broaching -= dt;
  }
  // стаксель «на ветру» у линии ветра уваливает нос (если руль не закреплён)
  if (D && !H.lash && D.jib.bind && !S.rig.pole && D.twaAbs < 60 && D.tell && D.tell.jib[1] === 'aback' && !H.auto) {
    B.hdg = wrap360(B.hdg - sgn(D.twa) * 3 * clamp(D.aws / 12, 0.3, 1) * dt);
  }
}
function startManeuver(S, kind) {
  const D = S.D; if (!D) return false;
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
  S.helm.lash = false;
  return true;
}
// Лечь в дрейф классическим способом: поворот оверштаг, не отдавая шкот стакселя,
// затем потравить грот и закрепить руль на приведение.
function heaveTo(S) {
  const D = S.D; if (!D || D.twaAbs > 100) return false;
  if (S.mode === 'quick') S.quick.jibLock = D.jib.bind && !S.rig.pole ? D.jib.fill : -sgn(D.awa);
  // нос проводим через ветер и чуть дальше — дальше лодку уваливает заложенный стаксель
  S.helm.auto = { dir: sgn(D.twa), left: D.twaAbs + 12, rate: 7 };
  S.helm.lash = false;
  S.heave = { phase: 'tack' };
  return true;
}
// Тяга грота в дрейфе: чем сильнее выбран гика-шкот, тем больше лодка идёт вперёд и приводится
const hoveMainDrive = (S, D) => clamp(1 - S.rig.main / 0.8, 0, 1) * (D.mainVis / BOAT.mainArea) * (D.main.bound ? 1 : 0.3);
function setLash(S, on) { S.helm.lash = !!on; if (on) { S.helm.auto = null; S.helm.cmd = 0; } }

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
  // стаксель заложен на ветер: его держит шкот наветренного борта
  D.jibBacked = jg.bind && !R.pole && jg.fill === sgn(awaS) && D.twaAbs < 110 && jibVis > 2;
  D.hove = !!S.helm.lash && D.jibBacked && D.twaAbs > 20;
  if (D.hove) D.pos = T('pos_hove');

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
    const T0 = computeTargets(D.tws, D.twaAbs, D.awaAbs, D.aws);
    const shiftBest = 6 * (jibVis / BOAT.jibArea) * (R.pole ? 0.3 : 1) * upF;
    bc = S.bestCache = {
      t: S.t, awa: awaS, pole: R.pole, T: T0, lee, jFill, shiftBest,
      jAll: bestSail(jFill, awaS, gamma, W_JIB, 0, jr[0], jr[1], null),
      jTau: bestSail(jFill, awaS, gamma, W_JIB, 0, jr[0], jr[1], T0.tauJ),
      mAll: bestSail(lee, awaS, gamma, W_MAIN, shiftBest, -6, BOAT.boomRec, null),
      mTau: bestSail(lee, awaS, gamma, W_MAIN, shiftBest, -6, BOAT.boomRec, T0.tauM)
    };
  }
  const TG = bc.T; D.T = TG; D.best = bc;

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
  const etaDepth = clamp(1 - 1.4 * clamp(Math.abs(D.depthM - TG.depthM) - 0.006, 0, 0.1) - 0.3 * clamp(Math.abs(R.backstay - TG.backstay) - 0.15, 0, 1) * Math.min(1, D.tws / 20), 0.6, 1);
  const etaDraft = clamp(1 - 0.7 * clamp(Math.abs(D.draftPos - TG.pos) - 0.015, 0, 0.2), 0.6, 1);

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
  if (D.hove) {
    // в дрейфе лодка почти стоит: немного вперёд, сколько даёт грот
    D.bspTarget = clamp(0.3 + 0.22 * pol * hoveMainDrive(S, D), 0.2, 2.8);
  }

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
  { id: 'course', name: { ru: 'Курс к ветру', en: 'Course to wind' }, sub: { ru: 'руль', en: 'helm' }, w: 15 },
  { id: 'jibAoA', name: { ru: 'Шкот стакселя', en: 'Genoa sheet' }, sub: { ru: 'угол стакселя', en: 'genoa angle' }, w: 14 },
  { id: 'jibTwist', name: { ru: 'Каретка стакселя', en: 'Genoa car' }, sub: { ru: 'скрутка стакселя', en: 'genoa twist' }, w: 7 },
  { id: 'furl', name: { ru: 'Раскрытие стакселя', en: 'Genoa furl' }, sub: { ru: 'площадь', en: 'sail area' }, w: 8 },
  { id: 'mainAoA', name: { ru: 'Гика-шкот и погон', en: 'Mainsheet & traveller' }, sub: { ru: 'угол грота', en: 'main angle' }, w: 14 },
  { id: 'mainTwist', name: { ru: 'Оттяжка гика', en: 'Vang' }, sub: { ru: 'скрутка грота', en: 'main twist' }, w: 8 },
  { id: 'depth', name: { ru: 'Аутхол и ахтерштаг', en: 'Outhaul & backstay' }, sub: { ru: 'пузо парусов', en: 'sail depth' }, w: 7 },
  { id: 'luff', name: { ru: 'Фал грота', en: 'Main halyard' }, sub: { ru: 'передняя шкаторина', en: 'luff tension' }, w: 6 },
  { id: 'reef', name: { ru: 'Рифы', en: 'Reefs' }, sub: { ru: 'площадь грота', en: 'mainsail area' }, w: 8 },
  { id: 'hvJib', name: { ru: 'Стаксель на ветру', en: 'Genoa backed' }, sub: { ru: 'заложен на ветер', en: 'aback to windward' }, w: 20, hove: true },
  { id: 'hvHelm', name: { ru: 'Руль закреплён', en: 'Helm lashed' }, sub: { ru: 'на приведение', en: 'to head up' }, w: 20, hove: true },
  { id: 'hvMain', name: { ru: 'Грот потравлен', en: 'Main eased' }, sub: { ru: 'ход 1–2 узла', en: '1–2 knots' }, w: 25, hove: true },
  { id: 'hvAngle', name: { ru: 'Угол к ветру', en: 'Angle to wind' }, sub: { ru: '40–75° в дрейфе', en: '40–75° hove-to' }, w: 25, hove: true },
  { id: 'heel', name: { ru: 'Крен и руль', en: 'Heel & helm' }, sub: { ru: 'баланс', en: 'balance' }, w: 9 },
  { id: 'deck', name: { ru: 'Снасти закреплены', en: 'Lines made fast' }, sub: { ru: 'стопора и лебёдки', en: 'clutches & winches' }, w: 4, deckOnly: true }
];
const sfe = (err, tol, span) => clamp(1 - Math.max(0, Math.abs(err) - tol) / span, 0, 1);
const hint = (mode, quick, deck) => (mode === 'deck' ? deck : quick);

function turnAdvice(S, D, dirSign, deg) {
  // dirSign > 0 — повернуть вправо (курс растёт)
  const up = dirSign === sgn(D.twa);
  return T(up ? 'turn_up' : 'turn_down', r0(deg), dirSign);
}
function courseItem(S, D) {
  const it = { score: 1, diag: T('course_ok'), act: '' };
  const obj = (S.scn && S.scn.def.objective) || { type: 'free' };
  const a = D.twaAbs, beat = optimalBeatTWA(D.tws), run = optimalRunTWA(D.tws);
  const byLee = (S.boomSide !== -sgn(D.awa) && D.awaAbs > 90) ? 180 - D.awaAbs : 0;
  const beatAdvice = () => {
    if (a < beat - 4) { it.score = sfe(beat - 4 - a, 0, 8); it.diag = T('course_pinch', r0(a)); it.act = T('course_pinch_act', turnAdvice(S, D, -sgn(D.twa), beat - a), r0(beat)); }
    else if (a > beat + 6) { it.score = sfe(a - beat - 6, 0, 14); it.diag = T('course_wide', r0(a)); it.act = T('course_wide_act', turnAdvice(S, D, sgn(D.twa), a - beat)); }
    else it.diag = T('course_beat_ok', r0(a));
  };
  if (a < 30) {
    it.score = 0; it.diag = T('course_irons', r0(a));
    it.act = T('course_irons_act', turnAdvice(S, D, -sgn(D.twa), beat - a), r0(beat));
    return it;
  }
  if (byLee > 3) {
    it.score = byLee > 8 ? 0.15 : 0.5;
    it.diag = T('course_bylee', r0(byLee));
    it.act = T('course_bylee_act', r0(byLee + 12), S.boomSide);
    return it;
  }
  switch (obj.type) {
    case 'beat': beatAdvice(); break;
    case 'tack':
      if (S.scn && D.tack === S.scn.startTack) { it.score = 0.3; it.diag = T('course_tack_wait'); it.act = T('course_tack_act'); }
      else beatAdvice();
      break;
    case 'heading': {
      const twaT = wrap180(D.twd - obj.hdg);
      if (Math.abs(twaT) < 38) {
        beatAdvice();
        if (it.score >= 0.85) it.diag = T('course_dead_ok', obj.hdg, r0(a));
        else it.diag += T('course_dead_suffix', obj.hdg);
      } else {
        const err = wrap180(D.hdg - obj.hdg);
        it.score = sfe(err, obj.tol, 15);
        if (it.score < 0.999) { it.diag = T('course_off', r0(wrap360(D.hdg)), obj.hdg); it.act = T('course_off_act', turnAdvice(S, D, -sgn(err), Math.abs(err))); }
        else it.diag = T('course_on', r0(wrap360(D.hdg)));
      }
      break;
    }
    case 'gybe':
      if (S.scn && D.tack === S.scn.startTack) { it.score = 0.3; it.diag = T('course_gybe_wait'); it.act = T('course_gybe_act'); break; }
      // fallthrough
    case 'run':
      if (a < 145) { it.score = sfe(145 - a, 0, 20); it.diag = T('course_run_high', r0(a)); it.act = T('course_run_high_act', turnAdvice(S, D, -sgn(D.twa), run - a), r0(run)); }
      else if (a > 175) { it.score = 0.75; it.diag = T('course_dead_run'); it.act = T('course_dead_run_act', turnAdvice(S, D, sgn(D.twa), a - 165)); }
      else it.diag = T('course_run_ok', r0(a));
      break;
    default:
      if (a < 38) { it.score = sfe(38 - a, 0, 8); it.diag = T('course_free_pinch', r0(a)); it.act = T('course_free_pinch_act', turnAdvice(S, D, -sgn(D.twa), beat - a), r0(beat)); }
      else it.diag = T('course_free', D.pos, r0(a), T('tack_nom', D.tack));
  }
  return it;
}

function makeAdder(items) {
  return (id, it) => {
    const def = ITEM_DEFS.find(x => x.id === id);
    it.id = id; it.name = loc(def.name); it.sub = loc(def.sub); it.w = def.w;
    it.status = it.na ? 'na' : it.score >= 0.85 ? 'ok' : it.score >= 0.5 ? 'warn' : 'bad';
    items.push(it);
  };
}
function totalScore(items) {
  let sw = 0, ss = 0;
  for (const it of items) if (!it.na) { sw += it.w; ss += it.w * it.score; }
  return sw ? ss / sw : 0;
}

// Чек-лист дрейфа
function scoreHoveTo(S, D) {
  const items = [], add = makeAdder(items), mode = S.mode, bsp = S.boat.bsp, a = D.twaAbs;
  const lash = !!S.helm.lash, jibB = D.jibBacked;
  add('hvJib', jibB ? { score: 1, diag: T('hv_jib_ok'), act: '' } : { score: 0, diag: T('hv_jib_bad'), act: hint(mode, T('hv_jib_q'), T('hv_jib_d')) });
  add('hvHelm', lash ? { score: 1, diag: T('hv_helm_ok'), act: '' } : { score: 0, diag: T('hv_helm_bad'), act: T('hv_helm_act') });
  {
    const it = { score: 1, diag: '', act: '' };
    if (D.hoist.headH < 0.3) { it.score = 0.7; it.diag = T('hv_main_noMain'); }
    else if (bsp > 1.8) { it.score = sfe(bsp - 1.8, 0, 2.5); it.diag = T('hv_main_fast', f1(bsp)); it.act = T('hv_main_fast_act') + hint(mode, T('main_where_q'), T('main_where_d')); }
    else it.diag = T('hv_main_ok', f1(Math.max(0, bsp)));
    add('hvMain', it);
  }
  {
    const it = { score: 1, diag: '', act: '' };
    if (!jibB || !lash) { it.na = true; it.diag = T('hv_angle_wait'); }
    else if (a < 40) { it.score = sfe(40 - a, 0, 12); it.diag = T('hv_angle_close', r0(a)); it.act = T('hv_angle_close_act'); }
    else if (a > 75) { it.score = sfe(a - 75, 0, 20); it.diag = T('hv_angle_wide', r0(a)); it.act = T('hv_angle_wide_act'); }
    else it.diag = T('hv_angle_ok', r0(a));
    add('hvAngle', it);
  }
  {
    const h = Math.abs(S.boat.heel);
    const it = h > 20 ? { score: clamp(1 - (h - 20) / 8, 0, 1), diag: T('hl_hove_heel', r0(h)), act: T('hl_hove_heel_act') } : { score: 1, diag: T('hl_hove_ok', r0(h)), act: '' };
    add('heel', it);
  }
  return { items, score: totalScore(items), hove: true };
}

function scoreItems(S, D) {
  const objHove = S.scn && S.scn.def.objective.type === 'heaveto';
  if (D.hove || objHove || S.helm.lash) return scoreHoveTo(S, D);
  const R = S.rig, TG = D.T, bc = D.best, mg = D.main, jg = D.jib, hp = D.hoist, mode = S.mode;
  const awaS = D.awa, gamma = D.gamma;
  const items = [], add = makeAdder(items);
  const jibCtrl = jg.ctrl || jg.fill;
  const jibSheetWhere = hint(mode, T('jib_where_q'), T('jib_where_d', jibCtrl));

  add('course', courseItem(S, D));

  /* --- шкот стакселя --- */
  {
    const it = { score: 1, diag: '', act: '' };
    if (D.jibVis < 0.05 * BOAT.jibArea) { it.na = true; it.diag = T('jib_furled'); }
    else if (R.pole) {
      const aAct = Math.abs(jg.delta), aBest = bc.jAll.d;
      if (D.awaAbs < 120) { it.score = 0.1; it.diag = T('jib_pole_aback'); it.act = hint(mode, T('jib_pole_aback_q'), T('jib_pole_aback_d')); }
      else { it.score = sfe(aAct - aBest, 12, 25); it.diag = it.score >= 0.85 ? T('jib_pole_ok') : (aAct < aBest ? T('jib_pole_tight') : T('jib_pole_eased')); it.act = T('jib_pole_act') + jibSheetWhere; }
    } else if (!jg.bind) {
      const lee = -sgn(awaS);
      it.score = 0.05; it.diag = T('jib_flog');
      it.act = T('jib_flog_act', lee) + hint(mode, T('jib_flog_q'), T('jib_flog_d', lee));
    } else {
      const aAct = alphaAt(jg.fill, jg.delta, jg.tau, awaS, gamma, 0.5, 0);
      const aBest = alphaAt(bc.jFill, bc.jFill * bc.jTau.d, TG.tauJ, awaS, gamma, 0.5, 0);
      const err = aAct - aBest;
      if (aAct < -3) {
        it.score = 0; it.diag = T('jib_aback');
        it.act = hint(mode, S.quick.jibLock ? T('jib_aback_lock') : T('jib_aback_q'), T('jib_aback_d', jg.ctrl, -jg.ctrl)) + (D.jibBacked && D.twaAbs < 100 ? T('jib_aback_hove') : '');
      } else if (D.shadow > 0.55) { it.score = 0.45; it.diag = T('jib_shadow'); it.act = hint(mode, T('jib_shadow_q'), T('jib_shadow_d')); }
      else {
        it.score = sfe(err, 3.5, 8);
        if (err < -3.5) {
          if (jg.e < 0.03 && D.awaAbs < 26) { it.score = Math.min(it.score, 0.6); it.diag = T('jib_pinch'); it.act = T('jib_pinch_act', r0(Math.max(3, -err))); }
          else { it.diag = T('jib_under'); it.act = T('jib_under_act', jibSheetWhere); }
        } else if (err > 3.5) { it.diag = T('jib_over'); it.act = T('jib_over_act', jibSheetWhere); }
        else it.diag = T('jib_ok');
        if (aAct < 8 && it.score > 0.6) { it.score = 0.6; it.diag = T('jib_luff'); it.act = T('jib_luff_act', jibSheetWhere); }
      }
    }
    add('jibAoA', it);
  }

  /* --- каретка стакселя (скрутка) --- */
  {
    const it = { score: 1, diag: '', act: '' };
    if (D.jibVis < 0.05 * BOAT.jibArea || !jg.bind || R.pole || D.shadow > 0.55) { it.na = true; it.diag = R.pole ? T('car_na_pole') : T('na'); }
    else {
      const err = jg.tau - TG.tauJ;
      it.score = sfe(err, 3, 7);
      const carWhere = hint(mode, T('car_where_q'), T('car_where_d', jg.ctrl));
      if (err > 3) { it.diag = T('car_open'); it.act = T('car_open_act', Math.max(1, r0(err / 30 * 14)), R.furl > 0.1, carWhere); }
      else if (err < -3) { it.diag = T('car_closed'); it.act = T('car_closed_act', Math.max(1, r0(-err / 30 * 14)), carWhere); }
      else it.diag = T('car_ok');
      if (TG.ws > 0.4 && Math.abs(err) <= 3) it.diag += T('car_ok_breeze');
    }
    add('jibTwist', it);
  }

  /* --- раскрытие стакселя --- */
  {
    const it = { score: 1, diag: '', act: '' };
    const err = R.furl - TG.furl;
    const runBlank = D.twaAbs > 150 && !R.pole;
    const pctOut = v => r0((1 - v) * 100);
    if (runBlank && R.furl > 0.5) { it.score = 1; it.diag = T('furl_run'); }
    else {
      it.score = sfe(err, 0.1, 0.25);
      if (err < -0.1) { it.diag = T('furl_much', r0(TG.effWind)); it.act = T('furl_much_act', pctOut(TG.furl)) + hint(mode, T('furl_q'), T('furl_much_d')); }
      else if (err > 0.1) { it.diag = T('furl_little'); it.act = T('furl_little_act', pctOut(TG.furl)) + hint(mode, T('furl_q'), T('furl_little_d')); }
      else it.diag = T('furl_ok', pctOut(R.furl));
    }
    add('furl', it);
  }

  /* --- угол грота --- */
  {
    const it = { score: 1, diag: '', act: '' };
    const mWhere = hint(mode, T('main_where_q'), T('main_where_d'));
    if (hp.headH < 0.3) { it.score = 0; it.diag = T('main_down'); it.act = hint(mode, T('main_down_q'), T('main_down_d')); }
    else if (!mg.bound) { it.score = 0.05; it.diag = T('main_flog'); it.act = T('main_flog_act') + mWhere; }
    else {
      const aAct = alphaAt(mg.side, mg.theta, mg.tau, awaS, gamma, 0.5, D.mainShift);
      const aBest = alphaAt(bc.lee, bc.lee * bc.mTau.d, TG.tauM, awaS, gamma, 0.5, bc.shiftBest);
      const err = aAct - aBest;
      const feather = 3.5 + 6 * TG.ws * TG.up;
      it.score = err < 0 ? sfe(err, feather, 8) : sfe(err, 3.5, 8);
      if (aAct < -3) { it.score = 0; it.diag = T('main_back'); it.act = T('main_back_act'); }
      else if (err < -feather) { it.diag = T('main_under'); it.act = (D.awaAbs < 45 ? T('main_under_up') : T('main_under_off')) + ' ' + mWhere; }
      else if (err > 3.5) {
        if (D.awaAbs > 110 && Math.abs(mg.theta) < 60) { it.diag = T('main_run_tight'); it.act = T('main_run_tight_act') + mWhere; }
        else { it.diag = T('main_over'); it.act = (D.awaAbs < 45 ? T('main_over_up') : T('main_over_off')) + ' ' + mWhere; }
      } else if (err < -3.5) it.diag = T('main_feather');
      else it.diag = T('main_ok');
      if (mg.onShrouds) { it.score = Math.min(it.score, 0.7); it.diag = T('main_shrouds'); it.act = T('main_shrouds_act') + mWhere; }
    }
    add('mainAoA', it);
  }

  /* --- скрутка грота --- */
  {
    const it = { score: 1, diag: '', act: '' };
    if (!mg.bound || hp.headH < 0.3) { it.na = true; it.diag = T('na'); }
    else {
      const err = mg.tau - TG.tauM;
      it.score = sfe(err, 3, 8);
      const upwind = D.awaAbs < 45 && mg.sheetBind && R.main < 0.3;
      if (err > 3) {
        it.diag = T('tw_open');
        it.act = upwind ? T('tw_open_up') + hint(mode, T('main_where_q'), T('tw_open_up_d'))
          : T('tw_open_off') + hint(mode, T('tw_vang_q'), T('tw_open_off_d'));
      } else if (err < -3) {
        it.diag = T('tw_closed');
        it.act = R.vang > 0.5 && mg.vangLeech >= mg.sheetLeech ? T('tw_closed_vang') + hint(mode, T('tw_vang_q'), T('tw_closed_vang_d'))
          : T('tw_closed_sheet') + hint(mode, T('main_where_q'), T('tw_closed_sheet_d'));
      } else it.diag = T('tw_ok');
    }
    add('mainTwist', it);
  }

  /* --- пузо: аутхол и ахтерштаг --- */
  {
    const it = { score: 1, diag: '', act: '' };
    const e1 = (D.depthM - TG.depthM) / 0.012, e2 = (R.backstay - TG.backstay) / 0.3;
    const err = Math.max(Math.abs(e1), Math.abs(e2));
    it.score = clamp(1 - Math.max(0, err - 1) / 2, 0, 1);
    const w = hint(mode, T('dp_where_q'), T('dp_where_d'));
    if (err <= 1) it.diag = T('dp_ok');
    else if (e1 > 1 || e2 < -1) { it.diag = TG.ws > 0.3 ? T('dp_deep_breeze', r0(D.tws)) : T('dp_deep'); it.act = (e1 > 1 ? T('dp_out_on') : '') + (e2 < -1 ? T('dp_bs_on') : '') + w; }
    else { it.diag = TG.up < 0.5 ? T('dp_flat_off') : T('dp_flat'); it.act = (e1 < -1 ? T('dp_out_off') : '') + (e2 > 1 ? T('dp_bs_off') : '') + w; }
    add('depth', it);
  }

  /* --- фал грота --- */
  {
    const it = { score: 1, diag: '', act: '' };
    if (hp.slack > 0.02) { it.score = clamp(0.45 - hp.slack * 3, 0, 0.45); it.diag = hp.headH < 0.5 ? T('lf_down') : T('lf_part'); it.act = hint(mode, T('lf_q'), T('lf_part_d')); }
    else {
      const err = D.draftPos - TG.pos;
      it.score = sfe(err, 0.02, 0.05);
      if (err > 0.02) { it.diag = T('lf_aft'); it.act = T('lf_aft_act') + hint(mode, T('lf_q'), T('lf_aft_d')); }
      else if (err < -0.02) { it.diag = T('lf_tight'); it.act = T('lf_tight_act') + hint(mode, T('lf_q'), T('lf_tight_d')); }
      else it.diag = T('lf_ok');
    }
    add('luff', it);
  }

  /* --- рифы --- */
  {
    const it = { score: 1, diag: '', act: '' };
    const lvl = hp.reefLevel, tgt = TG.reef, ew = TG.effWind;
    const near = th => Math.abs(ew - th) < 1.5;
    if (hp.reefPartial) { it.score = 0.4; it.diag = T('rf_part'); it.act = hint(mode, T('rf_part_q'), T('rf_part_d')); }
    else if (lvl === tgt) it.diag = T('rf_ok', lvl);
    else if (Math.abs(lvl - tgt) === 1 && near(Math.max(lvl, tgt) === 2 ? 27 : 21)) { it.score = 0.9; it.diag = T('rf_border'); }
    else if (lvl < tgt) {
      it.score = tgt - lvl === 1 ? 0.45 : 0.1;
      it.diag = T('rf_need', tgt, r0(ew));
      it.act = hint(mode, T('rf_need_q', tgt), T('rf_need_d', tgt));
    } else {
      it.score = lvl - tgt === 1 ? 0.5 : 0.15;
      it.diag = T('rf_extra', r0(ew));
      it.act = hint(mode, T('rf_extra_q', tgt), T('rf_extra_d'));
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
    if (h > 21) { it.diag = T('hl_heel', r0(h), r0(Math.max(0, r))); it.act = T('hl_heel_act'); }
    else if (r > 6) { it.diag = T('hl_weather', r0(r)); it.act = T('hl_weather_act'); }
    else if (r < -1) { it.diag = T('hl_lee'); it.act = T('hl_lee_act'); }
    else it.diag = T('hl_ok', r0(h), r0(Math.max(0, r)));
    add('heel', it);
  }

  /* --- палуба --- */
  if (mode === 'deck') {
    const it = { score: 1, diag: T('dk_ok'), act: '' };
    const run = Object.keys(S.deck.running).filter(k => S.deck.running[k]);
    if (run.length) { it.score = 0; it.diag = T('dk_run', LINES[run[0]]); it.act = T('dk_run_act'); }
    add('deck', it);
  }

  return { items, score: totalScore(items), hove: false };
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
  const TG = computeTargets(W.tws, twaAbs, awaAbs, aw.aws);
  const Q = {};
  Q.reef = TG.reef;
  const goose = twaAbs >= 155 && awaAbs > 120;
  const f = TG.furl;
  Q.open = 1 - f; Q.goose = goose; Q.jibLock = 0;
  const gamma = gammaOf(awaAbs), lee = -sgn(awaS);
  const jFill = goose ? -lee : lee;
  const jb = bestSail(jFill, awaS, gamma, W_JIB, 0, goose ? 30 : BOAT.jibMin, goose ? 88 : 62, TG.tauJ);
  const e = Math.pow(Math.max(0, jb.d - BOAT.jibMin) / 51, 1 / 1.1);
  Q.jibSheet = clamp(e / 1.3, 0, 1);
  Q.car = clamp(0.5 - 0.45 * f + (TG.tauJ - 4 - 14 * clamp(e, 0, 1.3)) / 30, 0, 1);
  Q.car = Math.round(Q.car * (BOAT.holes - 1)) / (BOAT.holes - 1);
  const upF = clamp((90 - awaAbs) / 50, 0, 1);
  const shift = 6 * (1 - f) * (goose ? 0.3 : 1) * upF;
  const mb = bestSail(lee, awaS, gamma, W_MAIN, shift, -6, BOAT.boomRec, TG.tauM);
  const th = mb.d;
  const L = clamp(1 - (TG.tauM - 4) / 26, 0, 1);
  let m = 0.3 * (1 - Math.pow(L, 1 / 0.8));
  let dTh = 80 * Math.pow(m, 1.3);
  let tl = (th - dTh) / BOAT.travRange;
  if (tl > 1) { tl = 1; dTh = th - BOAT.travRange; m = Math.pow(Math.max(0, dTh) / 80, 1 / 1.3); }
  if (tl < -0.7) { tl = -0.7; dTh = th + 0.7 * BOAT.travRange; m = Math.pow(Math.max(0, dTh) / 80, 1 / 1.3); }
  const sheetLeech = Math.pow(clamp(1 - m / 0.3, 0, 1), 0.8);
  const vNeed = L >= 0.95 ? 1 : Math.pow(L / 0.95, 1 / 0.9);
  let v = TG.vangBase;
  if (sheetLeech < L - 0.01) v = vNeed; else v = Math.min(v, Math.max(0, vNeed - 0.02));
  Q.mainsheet = clamp(m, 0, 1); Q.travLee = clamp(tl, -1, 1); Q.vang = clamp(v, 0, 1);
  Q.backstay = clamp(TG.backstay, 0, 1);
  const stretch = 0.004 * clamp((aw.aws - 10) / 10, -1, 1.5);
  Q.outhaul = clamp((0.165 - 0.03 * Q.backstay + stretch - TG.depthM) / 0.035, 0, 1);
  Q.luff = clamp(0.5 + (0.47 + 0.035 * (aw.aws - 14) / 10 - TG.pos) / 0.12, 0, 1);
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
const G_BEAT = { ru: 'Лавировка', en: 'Beating' };
const G_REACH = { ru: 'Галфвинд и полные курсы', en: 'Reaching' };
const G_RUN = { ru: 'Бакштаг и фордевинд', en: 'Broad reach and run' };
const G_WIND = { ru: 'Сила ветра', en: 'Wind strength' };
const G_HOVE = { ru: 'Дрейф', en: 'Heaving to' };
const SCENARIOS = [
  { id: 'beat-header', group: G_BEAT, level: 1,
    title: { ru: 'Ветер зашёл на 20°', en: 'A 20° header' },
    brief: { ru: 'Крутой бейдевинд правым галсом, 12 узлов. Вы лавируете к знаку на ветре, паруса настроены. Скоро ветер зайдёт — сместится к носу на 20°.',
      en: 'Close-hauled on starboard tack in 12 knots, beating to a windward mark with the sails trimmed. Soon the wind will head you — swing 20° towards the bow.' },
    setup: { tws: 12, twd: 0, hdg: 318 },
    events: [{ at: 7, kind: 'twd', delta: -20, dur: 3, text: { ru: 'Ветер зашёл на 20°: теперь он дует ближе к носу.', en: 'A 20° header: the wind now comes from further ahead.' } }],
    objective: { type: 'beat' },
    todo: { ru: ['Паруса заполоскали, а шкоты уже выбраны до упора — выбирать дальше некуда.', 'Увалитесь примерно на 20° — снова до 42–45° к ветру (курс около 298°).', 'Если сдвиг устойчивый — сделайте поворот оверштаг: на левом галсе этот заход станет отходом и курс пойдёт прямо на знак.'],
      en: ['The sails are luffing, yet the sheets are already fully in — there is nothing left to trim.', 'Bear away about 20° to get back to 42–45° to the wind (heading about 298°).', 'If the shift persists, tack: on port tack this header becomes a lift and points you at the mark.'] },
    why: { ru: 'На бейдевинде шкоты уже выбраны до предела, поэтому на заход ветра отвечают рулём: уваливаются, чтобы вернуть рабочий угол к ветру. Колдунчики подсказывают сразу: наветренные трепещут на всех высотах. На лавировке устойчивый заход — сигнал поворачивать на другой галс.',
      en: 'Close-hauled, the sheets are already in as far as they go, so you answer a header with the helm: bear away to get a working angle to the wind back. The telltales tell you at once — the windward ones lift at every height. When beating, a persistent header is the signal to tack.' } },
  { id: 'beat-lift', group: G_BEAT, level: 1,
    title: { ru: 'Ветер отошёл на 20°', en: 'A 20° lift' },
    brief: { ru: 'Тот же бейдевинд правым галсом к знаку на ветре. Скоро ветер отойдёт — сместится к корме на 20°.',
      en: 'The same beat on starboard tack towards a windward mark. Soon the wind will lift you — swing 20° towards the stern.' },
    setup: { tws: 12, twd: 0, hdg: 318 },
    events: [{ at: 7, kind: 'twd', delta: 20, dur: 3, text: { ru: 'Ветер отошёл на 20°: теперь он дует больше сбоку.', en: 'A 20° lift: the wind now comes more from the side.' } }],
    objective: { type: 'beat' },
    todo: { ru: ['Подветренные колдунчики срываются: для нового угла паруса перетянуты.', 'Цель на ветре — поэтому не травите шкоты, а приводитесь примерно на 20° (курс около 338°), пока колдунчики снова не встанут ровно.'],
      en: ['The leeward telltales are stalling: for the new angle the sails are over-trimmed.', "Your target is upwind, so don't ease the sheets — head up about 20° (heading about 338°) until the telltales stream again."] },
    why: { ru: 'Отход ветра на лавировке — подарок: можно идти острее, прямо к цели. Если вместо этого потравить шкоты, лодка ускорится, но пойдёт полнее и к знаку на ветре не приблизится. Приведитесь, сохранив настройку парусов.',
      en: 'A lift on a beat is a gift: you can point higher, straight at the target. Easing the sheets instead would make the boat faster but sail lower, getting no closer to the windward mark. Head up and keep the trim.' } },
  { id: 'tack', group: G_BEAT, level: 2,
    title: { ru: 'Поворот оверштаг', en: 'Tacking' },
    brief: { ru: 'Крутой бейдевинд правым галсом, 12 узлов. Сделайте поворот оверштаг и настройтесь на левом галсе. В режиме «Палуба» шкоты перекладываете вы сами.',
      en: 'Close-hauled on starboard tack in 12 knots. Tack and trim for port tack. In Deck mode you swap the sheets yourself.' },
    setup: { tws: 12, twd: 0, hdg: 318 },
    events: [],
    objective: { type: 'tack' },
    todo: { ru: ['Проверьте, что ленивый (наветренный) шкот лежит на своей лебёдке.', 'Приводитесь (или кнопка «Оверштаг»). Когда стаксель заполощет — отдайте рабочий шкот: снимите его с лебёдки.', 'Выберите новый подветренный шкот, пока колдунчики не встанут ровно.', 'Ложитесь на 42–45° к ветру. Каретку погона переставьте на новый подветренный борт.'],
      en: ['Check that the lazy (windward) sheet is on its winch.', 'Head up (or press “Tack”). When the genoa luffs, release the working sheet — take it off its winch.', 'Trim the new leeward sheet until the telltales stream.', 'Settle at 42–45° to the wind. Move the traveller car to the new leeward side.'] },
    why: { ru: 'При повороте оверштаг нос проходит линию ветра. Старый шкот надо отдать вовремя: если держать его, стаксель встанет «на ветру» и затормозит лодку. Новый шкот выбирают быстро, пока стаксель не наполнился, — потом это тяжело. Каретку погона гика-шкота тоже переставляют: её положение считается от подветренного борта.',
      en: 'In a tack the bow passes through the wind. Release the old sheet on time: if you hold it, the genoa goes aback and stops the boat. Trim the new sheet quickly, before the sail fills — after that it gets heavy. Move the traveller too: its position is measured from the leeward side.' } },
  { id: 'reach-header', group: G_REACH, level: 1,
    title: { ru: 'Галфвинд: ветер зашёл', en: 'Beam reach: header' },
    brief: { ru: 'Галфвинд левым галсом, курс 90° на остров, 12 узлов. Курс менять нельзя. Скоро ветер зайдёт на 20°.',
      en: 'Beam reach on port tack, heading 090° for an island, 12 knots. You must hold the course. Soon the wind will head you by 20°.' },
    setup: { tws: 12, twd: 0, hdg: 90 },
    events: [{ at: 7, kind: 'twd', delta: 20, dur: 3, text: { ru: 'Ветер зашёл на 20°: теперь это полный бейдевинд.', en: 'A 20° header: you are now on a close reach.' } }],
    objective: { type: 'heading', hdg: 90, tol: 6 },
    todo: { ru: ['Курс держим на цель — 90°.', 'Наветренные колдунчики трепещут: выберите шкот стакселя и гика-шкот.', 'Погон поднимите ближе к центру; оттяжку гика можно ослабить — заднюю шкаторину теперь держит гика-шкот.', 'Шкот стакселя выбран сильнее — проверьте каретку: верх и низ должны заполаскивать одновременно.'],
      en: ['Hold the course to the target — 090°.', 'The windward telltales are lifting: trim the genoa sheet and the mainsheet.', 'Bring the traveller up towards the centre; you can ease the vang — the mainsheet now holds the leech.', 'With the sheet trimmed harder, check the car: top and bottom should break together.'] },
    why: { ru: 'На свободных курсах при заходе ветра курс сохраняют, а паруса подбирают: угол атаки возвращается к норме, когда шкоты выбраны примерно на те же 20°. Главный индикатор — колдунчики стакселя: выбирайте, пока наветренные не перестанут трепетать.',
      en: 'Off the wind, when you are headed you keep the course and trim the sails: the angle of attack is restored when the sheets come in by roughly the same 20°. The genoa telltales are the main guide — trim until the windward ones stop lifting.' } },
  { id: 'reach-lift', group: G_REACH, level: 1,
    title: { ru: 'Галфвинд: ветер отошёл', en: 'Beam reach: lift' },
    brief: { ru: 'Галфвинд левым галсом, курс 90° на остров, 12 узлов. Курс менять нельзя. Скоро ветер отойдёт на 20°.',
      en: 'Beam reach on port tack, heading 090° for an island, 12 knots. You must hold the course. Soon the wind will lift you by 20°.' },
    setup: { tws: 12, twd: 0, hdg: 90 },
    events: [{ at: 7, kind: 'twd', delta: -20, dur: 3, text: { ru: 'Ветер отошёл на 20°: теперь это крутой бакштаг.', en: 'A 20° lift: you are now on a broad reach.' } }],
    objective: { type: 'heading', hdg: 90, tol: 6 },
    todo: { ru: ['Курс держим — 90°.', 'Подветренные колдунчики срываются: потравите шкот стакселя и гика-шкот.', 'Гика-шкот потравлен — заднюю шкаторину теперь держит оттяжка гика: подтяните её.', 'Каретку стакселя чуть вперёд: при потравленном шкоте верх открывается слишком сильно.'],
      en: ['Hold the course — 090°.', 'The leeward telltales are stalling: ease the genoa sheet and the mainsheet.', 'With the mainsheet eased, the vang now holds the leech: tighten it.', 'Move the genoa car forward a little: with the sheet eased the top opens too much.'] },
    why: { ru: 'Когда ветер отходит, паруса перетянуты: поток срывается с подветренной стороны. Шкоты травят, пока подветренные колдунчики не потекут ровно. Чем дальше потравлен гика-шкот, тем меньше он тянет гик вниз — эту работу берёт на себя оттяжка гика.',
      en: 'When the wind frees you the sails are over-trimmed and the flow breaks away on the leeward side. Ease until the leeward telltales stream. The further the mainsheet is eased, the less it pulls the boom down — the vang takes over that job.' } },
  { id: 'close-reach', group: G_REACH, level: 2,
    title: { ru: 'Полный бейдевинд → крутой', en: 'Close reach → close-hauled' },
    brief: { ru: 'Полный бейдевинд левым галсом, курс 65° к марине, 14 узлов. Скоро ветер зайдёт на 20°, но до цели ещё можно дойти без лавировки.',
      en: 'Close reach on port tack, heading 065° for a marina, 14 knots. Soon the wind will head you by 20°, but you can still lay the marina without tacking.' },
    setup: { tws: 14, twd: 0, hdg: 65 },
    events: [{ at: 7, kind: 'twd', delta: 20, dur: 3, text: { ru: 'Ветер зашёл на 20°: курс стал крутым бейдевиндом.', en: 'A 20° header: you are now close-hauled.' } }],
    objective: { type: 'heading', hdg: 65, tol: 6 },
    todo: { ru: ['Курс 65° сохраняем: угол к ветру 45° ещё рабочий.', 'Выберите шкоты стакселя и грота почти до упора — как на лавировке.', 'Каретку стакселя назад, в положение для бейдевинда.', 'Погон к центру, оттяжку ослабить, ахтерштаг подтянуть — как на крутом бейдевинде.'],
      en: ['Keep the 065° course: 45° to the wind still works.', 'Trim the genoa sheet and mainsheet nearly all the way, as for a beat.', 'Move the genoa car aft to its upwind position.', 'Traveller up to the centre, vang off, backstay on — the upwind settings.'] },
    why: { ru: 'Пока цель вне мёртвого сектора, курс сохраняют, а паруса переводят в настройку для бейдевинда. Это не только шкоты: каретка стакселя, погон и оттяжка гика тоже меняют роль.',
      en: "While the target is outside the no-go zone you keep the course and switch the sails to their upwind trim. It's not only the sheets: the car, the traveller and the vang change roles too." } },
  { id: 'broad-run', group: G_RUN, level: 2,
    title: { ru: 'Бакштаг → фордевинд', en: 'Broad reach → run' },
    brief: { ru: 'Полный бакштаг левым галсом, курс 140°, 14 узлов. Скоро ветер отойдёт ещё на 25°, и вы окажетесь почти на фордевинде.',
      en: 'Deep broad reach on port tack, heading 140°, 14 knots. Soon the wind will free you another 25°, putting you almost dead downwind.' },
    setup: { tws: 14, twd: 0, hdg: 140 },
    events: [{ at: 7, kind: 'twd', delta: -25, dur: 3, text: { ru: 'Ветер отошёл на 25°: теперь он дует почти с кормы.', en: 'A 25° lift: the wind is now almost astern.' } }],
    objective: { type: 'heading', hdg: 140, tol: 8 },
    todo: { ru: ['Курс сохраняем.', 'Гик вытравите почти перпендикулярно ветру, но не до краспиц.', 'Стаксель в тени грота: поставьте «бабочку» на выносном гике на другой борт или закрутите стаксель.', 'Оттяжку гика держите натянутой: она не даёт гику задираться и раскачивать лодку.'],
      en: ['Hold the course.', 'Ease the boom nearly square to the wind, but not onto the spreaders.', 'The genoa is blanketed by the main: set it wing-on-wing on the whisker pole to the other side, or furl it.', 'Keep the vang on: it stops the boom lifting and the boat rolling.'] },
    why: { ru: 'На фордевинде паруса работают как «парашют», колдунчики почти бесполезны. Грот закрывает стаксель от ветра, поэтому его ставят бабочкой на другой борт или убирают. Гик не должен лечь на ванты: парус трётся о краспицы.',
      en: 'On a run the sails work like a parachute, so the telltales tell you little. The main blankets the genoa, so you either pole it out on the other side or furl it. Keep the boom off the shrouds: the sail chafes on the spreaders.' } },
  { id: 'run-bylee', group: G_RUN, level: 2,
    title: { ru: 'Фордевинд: ветер «на раул»', en: 'Run: sailing by the lee' },
    brief: { ru: 'Фордевинд, гик справа, 16 узлов, стаксель закручен. Скоро ветер сместится и задует со стороны гика — это опасно, реагировать нужно быстро.',
      en: 'Dead run with the boom to starboard, 16 knots, genoa furled. Soon the wind will swing round to the boom side — dangerous, so react quickly.' },
    setup: { tws: 16, twd: 0, hdg: 170, quick: { open: 0, goose: false } },
    events: [{ at: 7, kind: 'twd', delta: -14, dur: 3, text: { ru: 'Ветер сместился: дует со стороны гика — лодка идёт «на рауле».', en: 'The wind has moved onto the boom side: you are sailing by the lee.' } },
      { at: 15, kind: 'twd', delta: -8, dur: 3, text: { ru: 'Ветер продолжает заходить со стороны гика.', en: 'The wind keeps moving towards the boom side.' } }],
    objective: { type: 'run' },
    todo: { ru: ['Это «раул»: ветер дует с той же стороны, что и гик. Ещё 5° — и гик перебросит через кокпит.', 'Срочно приведитесь на 15–20° (влево), чтобы ветер снова дул с левой раковины.', 'Если нужно идти этим курсом — сделайте контролируемый поворот фордевинд: гика-шкот к центру, руль, потом потравить на новом борту.'],
      en: ['This is sailing by the lee: the wind comes from the same side as the boom. Another 5° and the boom will slam across the cockpit.', 'Head up 15–20° straight away (turn to port) so the wind comes over the port quarter again.', 'If you need this course, gybe under control: mainsheet to the centre, turn, then ease on the new side.'] },
    why: { ru: 'Самопроизвольный поворот фордевинд — одна из самых опасных ситуаций на яхте: гик с силой проходит над кокпитом. Если ветер зашёл со стороны гика, сначала уходят из опасного сектора рулём, а потом спокойно решают, менять ли галс.',
      en: 'An accidental gybe is one of the most dangerous moments on a yacht: the boom sweeps the cockpit with real force. If the wind has gone onto the boom side, first get out of the danger zone with the helm, then calmly decide whether to change tack.' } },
  { id: 'gybe', group: G_RUN, level: 3,
    title: { ru: 'Поворот фордевинд', en: 'Gybing' },
    brief: { ru: 'Полный бакштаг левым галсом, 14 узлов. Сделайте контролируемый поворот фордевинд на правый галс.',
      en: 'Deep broad reach on port tack, 14 knots. Make a controlled gybe onto starboard tack.' },
    setup: { tws: 14, twd: 0, hdg: 155, quick: { open: 0, goose: false } },
    events: [],
    objective: { type: 'gybe' },
    todo: { ru: ['Выберите гика-шкот почти до центра (до 10–15°).', 'Уваливайтесь, пока корма не пройдёт линию ветра, — гик перейдёт спокойно.', 'Сразу потравите гика-шкот на новом борту и переставьте погон.', 'Если стаксель раскрыт — переложите шкоты.'],
      en: ['Sheet the main in almost to the centre (10–15°).', 'Bear away until the stern passes through the wind — the boom crosses gently.', 'Ease the mainsheet straight away on the new side and move the traveller.', 'If the genoa is out, swap the sheets.'] },
    why: { ru: 'Неконтролируемый поворот фордевинд опасен для людей и такелажа: гик пролетает через кокпит. Поэтому гик сначала подтягивают к диаметральной плоскости — тогда ему некуда разгоняться — и только потом проводят корму через ветер.',
      en: 'An uncontrolled gybe endangers both crew and rig: the boom flies across the cockpit. So you first pull the boom to the centreline — it has no room to build speed — and only then take the stern through the wind.' } },
  { id: 'build', group: G_WIND, level: 2,
    title: { ru: 'Ветер усилился до 22 узлов', en: 'Wind builds to 22 knots' },
    brief: { ru: 'Крутой бейдевинд правым галсом, 12 узлов, полные паруса. Скоро ветер усилится до 22 узлов.',
      en: 'Close-hauled on starboard tack, 12 knots, full sail. Soon the wind will build to 22 knots.' },
    setup: { tws: 12, twd: 0, hdg: 318 },
    events: [{ at: 7, kind: 'tws', to: 22, dur: 8, text: { ru: 'Ветер усиливается до 22 узлов.', en: 'The wind is building to 22 knots.' } }],
    objective: { type: 'beat' },
    todo: { ru: ['Сначала быстрые средства: каретку погона под ветер, ахтерштаг туго, аутхол и фал туже.', 'Каретку стакселя чуть назад — верх стакселя откроется, крен уменьшится.', 'Возьмите 1-й риф и закрутите стаксель на четверть-треть, каретку стакселя вперёд.', 'Цель — крен до 20° и руль, который почти не тянет к ветру.'],
      en: ['Start with the quick fixes: traveller down, backstay on, outhaul and halyard tighter.', 'Move the genoa car aft a little — the top opens and heel drops.', 'Take the first reef and furl a quarter to a third of the genoa; move the car forward.', 'Aim for under 20° of heel and a helm that barely pulls.'] },
    why: { ru: 'Перегруженная лодка кренится, уваливается под рулём и медленнее идёт против ветра. Разгружать начинают с настроек: плоские паруса и открытая скрутка уменьшают кренящую силу. Если этого мало — уменьшают площадь: риф и закрутка стакселя.',
      en: "An overpowered boat heels, rounds up against the rudder and goes slower upwind. Start depowering with trim: flat sails and an open twist reduce the heeling force. If that isn't enough, reduce sail area: reef and furl." } },
  { id: 'drop', group: G_WIND, level: 2,
    title: { ru: 'Ветер стих до 7 узлов', en: 'Wind drops to 7 knots' },
    brief: { ru: 'Крутой бейдевинд, 20 узлов: взят риф, стаксель частично закручен. Скоро ветер стихнет до 7 узлов.',
      en: 'Close-hauled in 20 knots with a reef in and the genoa partly furled. Soon the wind will drop to 7 knots.' },
    setup: { tws: 20, twd: 0, hdg: 318 },
    events: [{ at: 7, kind: 'tws', to: 7, dur: 8, text: { ru: 'Ветер стихает до 7 узлов.', en: 'The wind is dropping to 7 knots.' } }],
    objective: { type: 'beat' },
    todo: { ru: ['Отдайте риф и раскройте стаксель полностью.', 'Каретку стакселя назад: стаксель снова полный.', 'Потравите ахтерштаг, аутхол и фал — паруса глубже и мощнее.', 'Погон к центру или чуть на ветер, гика-шкот немного потравить — больше скрутки в слабый ветер.'],
      en: ['Shake out the reef and unfurl the genoa fully.', 'Move the genoa car aft: the genoa is full size again.', 'Ease the backstay, outhaul and halyard — deeper, more powerful sails.', 'Traveller to the centre or slightly to windward, ease the mainsheet a little — more twist in light air.'] },
    why: { ru: 'В слабый ветер лодке нужна мощность: вся площадь и более глубокие паруса. Немного больше скрутки помогает потоку не срываться с верха паруса.',
      en: 'In light air the boat needs power: all the sail area and deeper sails. A little more twist helps the flow stay attached at the top of the sail.' } },
  { id: 'squall', group: G_WIND, level: 3,
    title: { ru: 'Шквал на полном курсе', en: 'Squall on a reach' },
    brief: { ru: 'Галфвинд правым галсом, курс 270°, 11 узлов. Приближается шквал: ветер усилится до 24 узлов и зайдёт на 15°.',
      en: 'Beam reach on starboard tack, heading 270°, 11 knots. A squall is coming: the wind will build to 24 knots and head you 15°.' },
    setup: { tws: 11, twd: 0, hdg: 270 },
    events: [{ at: 6, kind: 'tws', to: 24, dur: 5, text: { ru: 'Шквал: ветер резко усиливается.', en: 'Squall: the wind is building fast.' } },
      { at: 8, kind: 'twd', delta: -15, dur: 4, text: { ru: 'В шквале ветер заходит на 15°.', en: 'In the squall the wind heads you by 15°.' } }],
    objective: { type: 'heading', hdg: 270, tol: 8 },
    todo: { ru: ['Курс держим 270°.', 'Крен растёт: потравите гика-шкот и опустите погон, грот можно немного разгрузить.', 'Возьмите 1-й риф, закрутите стаксель примерно на треть.', 'Ветер зашёл — подберите шкоты под новый угол, но паруса держите плоскими: аутхол, фал и ахтерштаг туго.'],
      en: ['Hold 270°.', 'Heel is building: ease the mainsheet and drop the traveller — let the main depower a little.', 'Take the first reef and furl about a third of the genoa.', 'The wind has headed you — trim the sheets for the new angle, but keep the sails flat: outhaul, halyard and backstay on.'] },
    why: { ru: 'В шквале сила ветра и его направление меняются одновременно. Первым делом снимают перегрузку (гика-шкот, погон), затем уменьшают площадь, и только потом точно подстраивают углы по колдунчикам.',
      en: 'In a squall the wind strength and direction change together. First take off the overload (mainsheet, traveller), then reduce sail, and only then fine-tune the angles by the telltales.' } },
  { id: 'heaveto', group: G_HOVE, level: 2,
    title: { ru: 'Лечь в дрейф', en: 'Heave to' },
    brief: { ru: 'Крутой бейдевинд правым галсом, 18 узлов. Нужно остановиться, чтобы без спешки взять риф, — лягте в дрейф.',
      en: 'Close-hauled on starboard tack in 18 knots. You need to stop and take a reef without rushing — heave to.' },
    setup: { tws: 18, twd: 0, hdg: 318 },
    events: [],
    objective: { type: 'heaveto' },
    todo: { ru: ['Заложите стаксель на ветер: сделайте поворот оверштаг, не отдавая рабочий шкот. В быстрых настройках — отметьте «Стаксель на ветру» или нажмите «Лечь в дрейф».', 'Потравите гика-шкот примерно наполовину: грот должен почти не тянуть.', 'Закрепите руль на приведение — кнопка с замком у руля (штурвал к ветру).', 'Лодка встанет под 45–60° к ветру и будет медленно дрейфовать: ход 1–2 узла, крен небольшой.'],
      en: ['Back the genoa: tack without releasing the working sheet. In Quick trim, tick “Genoa backed” or press “Heave to”.', 'Ease the mainsheet about halfway: the main should barely drive.', 'Lash the helm to head up — the lock button on the helm bar (wheel to windward).', 'The boat settles 45–60° off the wind and drifts slowly: 1–2 knots ahead, little heel.'] },
    why: { ru: 'В дрейфе стаксель и руль работают друг против друга: заложенный стаксель уваливает нос, а закреплённый руль приводит лодку. Грот потравлен так, чтобы лодка почти не шла вперёд. Яхта спокойно лежит под углом к волне и медленно сносится под ветер — можно взять риф, поесть, разобраться с поломкой или подобрать человека.',
      en: 'Hove-to, the genoa and the rudder work against each other: the backed genoa pushes the bow off, the lashed helm brings it back up. The main is eased so the boat barely moves ahead. She lies quietly at an angle to the waves and drifts slowly to leeward — time to reef, eat, fix something or recover a person.' } }
];
function startScenario(S, id) {
  const def = SCENARIOS.find(s => s.id === id);
  if (!def) return;
  const W = S.wind;
  W.ramps = []; W.gusts = !!def.setup.gusts;
  W.baseTws = W.tws = def.setup.tws; W.baseTwd = W.twd = def.setup.twd;
  S.boat.hdg = def.setup.hdg; S.helm.auto = null; S.helm.cmd = 0; S.helm.lash = false; S.heave = null;
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
  emit(S, 'windEvent', loc(ev.text));
  sc.evIdx++;
  sc.lockUntil = Math.max(sc.lockUntil, S.t + (ev.dur || 3) + 1);
  if (sc.phase !== 'respond') { sc.phase = 'respond'; sc.tEvent = sc.t; }
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
    const wantHove = sc.def.objective.type === 'heaveto';
    const key = wantHove ? 'hvAngle' : 'course';
    const course = sc0.items.find(i => i.id === key);
    const good = (wantHove ? D.hove : !D.hove) && course && course.status === 'ok' && sc0.score >= 0.85 && !sc0.items.some(i => i.status === 'bad');
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
    text = T('ev_shift', after < Math.abs(twa), mag);
  } else {
    const to = Math.round(clamp(S.wind.baseTws + (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 7), 5, 26));
    setWind(S, { toTws: to, dur: 6 });
    text = T('ev_speed', to > S.wind.baseTws, to);
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
  // дрейф по кнопке: после поворота закрепить руль и потравить грот
  if (S.heave && !S.helm.auto) {
    S.helm.lash = true;
    if (S.mode === 'quick') S.quick.mainsheet = Math.max(S.quick.mainsheet, 0.5);
    S.heave = null;
    emit(S, 'hoveTo');
  }
  // брочинг и левентик
  if (Math.abs(B.heel) > 30 && D.rudder > 10) S.broachT += dt; else S.broachT = Math.max(0, S.broachT - 2 * dt);
  if (S.broachT > 1.2 && S.broaching <= 0) { S.broaching = 2; S.broachT = 0; emit(S, 'broach'); }
  if (D.twaAbs < 30 && Math.abs(B.bsp) < 0.6) { S.ironsT += dt; if (S.ironsT > 4 && !S.ironsFlag) { S.ironsFlag = true; emit(S, 'irons'); } }
  else { S.ironsT = 0; S.ironsFlag = false; }
  if (S.crashT > 0) S.crashT -= dt;
  const sc = scoreItems(S, D);
  D.items = sc.items; D.score = sc.score; D.top = topFix(sc.items); D.hoveList = sc.hove;
  S.D = D;
  if (S.scn) {
    for (const e of S.events) {
      if (e.t !== S.t) continue;
      if (e.type === 'crash') S.scn.mistakes.push({ k: 'crash' });
      if (e.type === 'run') S.scn.mistakes.push({ k: 'run', a: [e.data] });
      if (e.type === 'broach') S.scn.mistakes.push({ k: 'broach' });
      if (e.type === 'irons' && S.scn.def.objective.type !== 'heaveto') S.scn.mistakes.push({ k: 'irons' });
    }
    scenarioTick(S, dt, D, sc);
  }
  return D;
}

G.SIM = {
  BOAT, LINES, CLUTCH_LINES, SCENARIOS, ITEM_DEFS,
  clamp, lerp, smooth, wrap180, wrap360, sgn, D2R, R2D,
  setLang, getLang: () => LANG, loc, T, logText, msgText, mistakeText, winchName,
  polarSpeed, optimalBeatTWA, optimalRunTWA, apparent, pointOfSail, mainHoist, computeTargets,
  createState, step, derive, setMode, applyQuick, rigToQuick, solveTrim, applySolution,
  setWind, startManeuver, heaveTo, setLash, startScenario, fireNow, randomEvent,
  winchFor, onWinch, isHeld, deckToggleClutch, deckToggleWinch, deckRelease, deckSetPole, normalizeDeck
};
})(typeof window !== 'undefined' ? window : globalThis);
