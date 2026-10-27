/* ============================================================
   Колдунчик · Регата — тексты интерфейса (ru, en)
   Дополняют общий словарь тренажёра (js/i18n.js): подписи шкотов,
   колдунчиков и палубы берутся оттуда.
   ============================================================ */
(function (G) {
'use strict';
const km = (d, u) => (d < 1000 ? `${Math.round(d)} ${u[0]}` : `${(d / 1000).toFixed(d < 10000 ? 2 : 1)} ${u[1]}`);

const HOW_RU = `
<h3>Цель</h3>
<p>Пройти дистанцию быстрее всех: стартовать по сигналу, обогнуть знаки нужным бортом и пересечь финишную линию.</p>
<h3>Управление</h3>
<ul>
  <li><b>Руль</b> — стрелки ← → или A D (с Shift — точнее). На телефоне — ползунок «Руль» внизу: тяните влево или вправо, отпустите — руль встанет прямо.</li>
  <li><b>Повороты</b> — кнопки «Оверштаг» и «Фордевинд» (клавиши T и G). Повернуть можно и рулём.</li>
  <li><b>Время</b> — ×1, ×2, ×4 (клавиши 1, 2, 4). Пауза — Esc или кнопка с паузой.</li>
  <li><b>Камера</b> — кнопка с камерой (клавиша C). Покрутить вид — потяните 3D пальцем или мышью.</li>
  <li><b>Карта</b> — нажмите на неё, чтобы показать всю трассу или только ближайший отрезок (клавиша M).</li>
</ul>
<h3>Паруса</h3>
<ul>
  <li><b>Авто</b> — паруса настраивает экипаж, вы только рулите.</li>
  <li><b>Быстрые настройки</b> — шкот стакселя, гика-шкот и погон ваши, остальное делает экипаж. Скорость зависит от точности настройки: следите за колдунчиками и за подсказками у ползунков.</li>
  <li><b>Палуба</b> — всё как в тренажёре: стопора, лебёдки и шкоты. После поворота шкоты стакселя перекладываете сами.</li>
</ul>
<h3>Правила</h3>
<ul>
  <li><b>Старт.</b> До сигнала держитесь за стартовой линией — между судейским судном и буем. Если в момент сигнала нос за линией, это фальстарт: вернитесь за линию и стартуйте заново.</li>
  <li><b>Знаки</b> огибают тем бортом, который указан: «левым бортом» — знак остаётся слева от лодки. Следующий знак подсвечен столбом света и на карте.</li>
  <li><b>Касание знака</b> или судейского судна — штрафной оборот: 360° в одну сторону (кнопка «Штрафной оборот», клавиша R). Если не сделать его до финиша, к времени добавятся 2 минуты.</li>
  <li><b>Камни, мели и берег</b> останавливают лодку. Светлая бирюзовая вода — мелко.</li>
  <li><b>Соперники</b> (если выбраны) расходятся по упрощённым правилам: левый галс уступает правому, на одном галсе наветренная лодка уступает подветренной, а догоняющая — идущей впереди. У знака лодка, которая ближе к нему, получает место: остальные обходят её снаружи (кроме встречи левого и правого галсов в лавировку). Лодка в повороте оверштаг или фордевинд уступает тем, кто не поворачивает, а лодка на штрафном обороте — всем. Столкновение — штраф в два оборота той лодке, которая должна была уступить.</li>
</ul>
<h3>Советы</h3>
<ul>
  <li>Против ветра идите острым бейдевиндом, 42–45° к ветру, и поворачивайте на лейлайне — линии на карте, с которой знак берётся одним галсом.</li>
  <li>Тёмная рябь на воде — порыв: в нём лодка идёт быстрее. Светлая гладкая вода — затишье.</li>
  <li>Ветер колеблется. Если на лавировке ветер зашёл (приходится уваливаться), часто выгоднее повернуть на другой галс.</li>
</ul>
<p class="note">Сайт собирает обезличенную статистику посещений через GoatCounter, без cookie.</p>`;

const HOW_EN = `
<h3>Goal</h3>
<p>Sail the course faster than anyone: start on the gun, round the marks on the required side and cross the finish line.</p>
<h3>Controls</h3>
<ul>
  <li><b>Helm</b> — arrow keys ← → or A D (hold Shift for finer steering). On a phone, use the “Helm” slider at the bottom: drag left or right and let go to centre the rudder.</li>
  <li><b>Turns</b> — the “Tack” and “Gybe” buttons (keys T and G). You can also turn with the helm.</li>
  <li><b>Time</b> — ×1, ×2, ×4 (keys 1, 2, 4). Pause with Esc or the pause button.</li>
  <li><b>Camera</b> — the camera button (key C). Drag the 3D view with a finger or the mouse to look around.</li>
  <li><b>Map</b> — tap it to switch between the whole course and the current leg (key M).</li>
</ul>
<h3>Sails</h3>
<ul>
  <li><b>Auto</b> — the crew trims the sails; you just steer.</li>
  <li><b>Quick trim</b> — you trim the genoa sheet, mainsheet and traveller; the crew does the rest. Speed depends on how well you trim: watch the telltales and the hints next to the sliders.</li>
  <li><b>Deck</b> — everything as in the trainer: clutches, winches and sheets. After a tack you swap the genoa sheets yourself.</li>
</ul>
<h3>Rules</h3>
<ul>
  <li><b>Start.</b> Stay behind the start line — between the committee boat and the pin — until the gun. If your bow is over the line at the gun you are over early: return behind the line and start again.</li>
  <li><b>Marks</b> are rounded on the side shown: “to port” means the mark stays on your left. The next mark is lit by a beam of light and highlighted on the map.</li>
  <li><b>Touching a mark</b> or the committee boat costs a penalty turn: 360° in one direction (the “Penalty turn” button, key R). If you finish without it, 2 minutes are added to your time.</li>
  <li><b>Rocks, shoals and the shore</b> stop the boat. Pale turquoise water is shallow.</li>
  <li><b>Rivals</b> (if you pick them) follow simplified right-of-way rules: port tack keeps clear of starboard, on the same tack the windward boat keeps clear of the leeward one and a boat clear astern keeps clear of the boat ahead. At a mark the boat nearer to it gets room and the others go round outside (except port and starboard boats meeting on a beat). A boat that is tacking or gybing keeps clear of boats that are not, and a boat taking a penalty turn keeps clear of everyone. A collision costs a two-turn penalty for the boat that should have kept clear.</li>
</ul>
<h3>Tips</h3>
<ul>
  <li>Upwind, sail close-hauled at 42–45° to the wind and tack on the layline — the line on the map from which you can fetch the mark in one tack.</li>
  <li>Dark ripples on the water are a puff: the boat goes faster in it. Pale, glassy water is a lull.</li>
  <li>The wind oscillates. When a header forces you to bear away on a beat, tacking onto the lifted tack usually pays.</li>
</ul>
<p class="note">The site collects anonymous visit statistics with GoatCounter, without cookies.</p>`;

const DICT = {
  ru: {
    doc_title: 'Колдунчик · Регата — гонка под парусом',
    err_webgl: '3D-вид не запустился: браузер не поддерживает WebGL. Гоняться можно по карте и приборам.',
    aria_view: '3D-вид гонки', aria_dock: 'Управление яхтой', aria_map: 'Карта дистанции. Нажмите, чтобы сменить масштаб',
    brand: 'Регата', brand_sub: 'Гонка под парусом · яхта 13 м, шлюп (тип Dufour 430)',
    to_trainer: '← Тренажёр', to_trainer_title: 'Тренажёр настройки парусов «Колдунчик»',

    rb_pre: 'До старта', rb_race: 'Гонка', rb_fin: 'Финиш', rb_menu: 'Меню и пауза', rb_warp: 'Скорость времени', rb_cam: 'Вид камеры',
    nx_line: 'Стартовая линия', nx_line_info: d => `до линии ${km(d, ['м', 'км'])}`,
    nx_go: 'Пересеките стартовую линию', nx_ocs: 'Фальстарт: вернитесь за линию',
    nx_mark: (n, of) => `Знак ${n} из ${of}`,
    mk_windward: 'наветренный', mk_leeward: 'подветренный', mk_wing: 'боковой', mk_turn: 'поворотный',
    side_port: 'левым бортом', side_stbd: 'правым бортом',
    nx_finish: 'Финиш', nx_done: 'Дистанция пройдена',
    dist: d => km(d, ['м', 'км']),
    pen_due: (n, a) => `Штраф: оборот ${a}° из 360°${n > 1 ? ` (ещё ${n - 1})` : ''}`,

    i_speed: 'Скорость', i_of: p => `из ${p}`, i_vmc: 'К цели', i_vmc_s: 'VMC, уз', i_twa: 'К ветру', i_wind: 'Ветер',
    i_trim: 'Настройка', i_tack: s => (s > 0 ? 'пр. галс' : 'лев. галс'),
    sh_header: n => `заход ${n}°`, sh_lift: n => `отход ${n}°`, sh_mean: 'средний',

    h_rudder: 'Руль', h_rudder_aria: 'Руль: тяните влево или вправо', h_pen: 'Штрафной оборот', h_turning: 'поворот…',
    h_keys: '← → или A D — руль · T — оверштаг · G — фордевинд · R — штрафной оборот · 1 2 4 — время · Esc — пауза',

    sm_auto: 'Авто', sm_auto_s: 'паруса настраивает экипаж',
    sm_quick: 'Быстрые настройки', sm_quick_s: 'шкоты и погон — ваши',
    sm_deck: 'Палуба', sm_deck_s: 'все снасти, как в тренажёре',
    sails_title: 'Паруса',
    cc_title: 'Дистанция', cc_start: 'Старт', cc_finish: 'Финиш', cc_mark: (n, kind, side) => `Знак ${n}: ${kind}, ${side}`,
    cc_wind: (kn, d) => `Ветер ${kn} уз с ${d}°. Сдвиги и порывы по ходу гонки.`,
    auto_note: 'Экипаж сам выбирает и травит шкоты. Ваша задача — курс: в бейдевинд держите 42–45° к ветру, ловите порывы и заходы.',
    quick_note: 'Шкоты и погон — ваши, каретку, оттяжку, аутхол и рифы ставит экипаж. Кружок у ползунка — оценка, нажмите на него — подсказка.',
    deck_note_r: 'Все снасти ваши. После поворота оверштаг отдайте рабочий шкот и выберите шкот другого борта.',
    trim_bad: 'Паруса полощут и лодка теряет ход: выберите шкоты, пока колдунчики не потекут ровно.',
    trim_over: 'Паруса перетянуты: потравите шкоты, пока подветренные колдунчики не потекут ровно.',

    cam_chase: 'За лодкой', cam_sails: 'Паруса', cam_high: 'Сверху', cam_helm: 'У штурвала',
    map_course: 'Вся трасса', map_leg: 'Отрезок', map_start: 'Старт', map_finish: 'Финиш', map_wind: 'ветер',

    menu_sub: 'Гонка под парусом на яхте 13 м — та же модель, что в тренажёре: скорость зависит от курса к ветру и настройки парусов.',
    menu_course: 'Трасса', menu_sails: 'Паруса', menu_go: 'На старт', menu_how: 'Как играть',
    menu_rivals: 'Соперники', rv_none: 'Без соперников', rv_n: n => `${n} яхт${n === 1 ? 'а' : n < 5 ? 'ы' : ''}`,
    rb_place: 'Место', place_of: (p, n) => `${p} из ${n}`,
    ev_hit_me: why => `Столкновение! ${{ penalty: 'Вы крутили штрафной оборот', room: 'Вы были дальше от знака', turning: 'Вы поворачивали', port: 'Вы были на левом галсе', astern: 'Вы догоняли', windward: 'Вы были на ветре' }[why]} и должны были уступить: штраф — два оборота.`,
    ev_hit_them: name => `Столкновение по вине яхты «${name}»: штраф — ей.`,
    ev_give: (why, name) => ({
      penalty: `Вы на штрафном обороте — уступите дорогу яхте «${name}».`,
      room: `«${name}» ближе к знаку — дайте ей место, обходите снаружи.`,
      turning: `Вы поворачиваете — уступите дорогу яхте «${name}».`,
      port: `Вы на левом галсе — уступите дорогу яхте «${name}».`,
      astern: `Вы догоняете «${name}» — обходите в стороне.`,
      windward: `Вы на ветре у «${name}» — держитесь в стороне.`
    })[why],
    ev_rival_fin: (name, p) => `«${name}» на финише: ${p}-е место.`,
    h_pen_n: n => `Штрафной оборот · ${n}`,
    r_place: (p, n) => `${p}-е место из ${n}`, r_table: 'Результаты гонки', r_racing: 'на дистанции', r_you: 'Вы',
    c_meta: (len, min, kn) => `${km(len, ['м', 'км'])} · ≈ ${min} мин · ветер ${kn} уз`,
    c_best: tm => `ваш рекорд: ${tm}`, c_none: 'ещё не пройдена', c_level: n => `${'●'.repeat(n)}${'○'.repeat(3 - n)} сложность`,
    how_html: HOW_RU,

    p_title: 'Пауза', p_resume: 'Продолжить', p_restart: 'Начать заново', p_menu: 'Другая трасса',

    r_title: 'Финиш!', r_time: 'Время', r_total: 'С учётом штрафа', r_best: 'Ваш рекорд', r_record: 'Новый личный рекорд!', r_mode: m => `Паруса: ${m}`,
    r_pen: (n, s) => `Не выполнено штрафных оборотов: ${n} — плюс ${s} с.`,
    r_dist: 'Пройдено', r_avg: 'Средняя скорость', r_trim: 'Средняя настройка', r_turns: 'Повороты: оверштаг / фордевинд',
    r_touch: 'Касания знаков', r_ground: 'Камни и мели', r_ocs: 'Фальстарт', r_start: 'Старт после сигнала', r_legs: 'Отрезки',
    r_leg: n => `${n}`, r_crash: 'Неконтролируемые повороты фордевинд', r_yes: 'да', r_no: 'нет',
    r_again: 'Ещё раз', r_menu: 'Другая трасса',
    sec_s: n => `${n} с`, kn_v: v => `${v} уз`,

    ev_signal: n => (n >= 60 ? 'Минута до старта' : `${n} с до старта`),
    ev_gun: 'Старт!',
    ev_ocs: 'Фальстарт! Нос был за линией в момент сигнала. Вернитесь за стартовую линию и стартуйте заново.',
    ev_ocsClear: 'Вы за линией — теперь стартуйте.',
    ev_started: s => (s < 1 ? 'Отличный старт — точно по сигналу!' : `Старт: линия пересечена через ${s} с после сигнала.`),
    ev_missLine: 'Линию пересекают между буем и судейским судном.',
    ev_mark: (n, of) => (n < of ? `Знак ${n} обогнут. Следующий — знак ${n + 1}.` : `Знак ${n} обогнут. Теперь — на финиш!`),
    ev_wrong: side => `Знак пройден не тем бортом. Вернитесь и обогните его ${side}.`,
    ev_touch: 'Касание знака! Сделайте штрафной оборот: 360° в одну сторону.',
    ev_penDone: n => (n ? `Штрафной оборот выполнен, осталось ${n}.` : 'Штрафной оборот выполнен.'),
    ev_aground_rock: 'Удар о камень! Лодка остановилась — отверните и наберите ход.',
    ev_aground_shoal: 'Сели на мель! Отверните на глубокую воду.',
    ev_aground_shore: 'Лодка уткнулась в берег! Отверните от острова.',
    ev_aground_buoy: 'Столкновение с буем!',
    ev_crash: 'Гик перебросило: неконтролируемый поворот фордевинд! Перед поворотом выбирайте гика-шкот.',
    ev_finish: 'Финиш!',
    pen_none: 'Штрафных оборотов нет.',
    pen_stuck: 'Лодка стоит — штрафной оборот можно начать, когда она снова пойдёт.',
    warp_toast: n => `Время ×${n}`
  },
  en: {
    doc_title: 'Telltale · Regatta — a sailing race',
    err_webgl: "The 3D view didn't start: the browser has no WebGL. You can still race by the map and the instruments.",
    aria_view: '3D race view', aria_dock: 'Boat controls', aria_map: 'Course map. Tap to change the zoom',
    brand: 'Regatta', brand_sub: 'A sailing race · 13 m sloop (Dufour 430 type)',
    to_trainer: '← Trainer', to_trainer_title: 'Telltale sail trim trainer',

    rb_pre: 'To start', rb_race: 'Race', rb_fin: 'Finished', rb_menu: 'Menu and pause', rb_warp: 'Time speed', rb_cam: 'Camera view',
    nx_line: 'Start line', nx_line_info: d => `${km(d, ['m', 'km'])} to the line`,
    nx_go: 'Cross the start line', nx_ocs: 'Over early: return behind the line',
    nx_mark: (n, of) => `Mark ${n} of ${of}`,
    mk_windward: 'windward', mk_leeward: 'leeward', mk_wing: 'wing', mk_turn: 'turning',
    side_port: 'to port', side_stbd: 'to starboard',
    nx_finish: 'Finish', nx_done: 'Course complete',
    dist: d => km(d, ['m', 'km']),
    pen_due: (n, a) => `Penalty: turned ${a}° of 360°${n > 1 ? ` (${n - 1} more)` : ''}`,

    i_speed: 'Speed', i_of: p => `of ${p}`, i_vmc: 'To target', i_vmc_s: 'VMC, kn', i_twa: 'TWA', i_wind: 'Wind',
    i_trim: 'Trim', i_tack: s => (s > 0 ? 'stbd tack' : 'port tack'),
    sh_header: n => `header ${n}°`, sh_lift: n => `lift ${n}°`, sh_mean: 'mean',

    h_rudder: 'Helm', h_rudder_aria: 'Helm: drag left or right', h_pen: 'Penalty turn', h_turning: 'turning…',
    h_keys: '← → or A D — helm · T — tack · G — gybe · R — penalty turn · 1 2 4 — time · Esc — pause',

    sm_auto: 'Auto', sm_auto_s: 'the crew trims the sails',
    sm_quick: 'Quick trim', sm_quick_s: 'you trim the sheets',
    sm_deck: 'Deck', sm_deck_s: 'every line, as in the trainer',
    sails_title: 'Sails',
    cc_title: 'Course', cc_start: 'Start', cc_finish: 'Finish', cc_mark: (n, kind, side) => `Mark ${n}: ${kind}, ${side}`,
    cc_wind: (kn, d) => `Wind ${kn} kn from ${d}°, with shifts and puffs as the race goes on.`,
    auto_note: 'The crew trims and eases the sheets. Your job is the course: close-hauled, keep 42–45° to the wind and play the puffs and shifts.',
    quick_note: 'The sheets and traveller are yours; the crew sets the car, vang, outhaul and reefs. The dot by each slider is its score — tap it for a hint.',
    deck_note_r: 'Every line is yours. After a tack, release the working sheet and trim the other one.',
    trim_bad: 'The sails are luffing and the boat is slowing: trim the sheets until the telltales stream.',
    trim_over: 'The sails are over-trimmed: ease the sheets until the leeward telltales stream.',

    cam_chase: 'Behind', cam_sails: 'Sails', cam_high: 'Overhead', cam_helm: 'At the helm',
    map_course: 'Whole course', map_leg: 'Leg', map_start: 'Start', map_finish: 'Finish', map_wind: 'wind',

    menu_sub: 'A sailing race on a 13 m yacht, using the same model as the trainer: speed depends on your angle to the wind and your sail trim.',
    menu_course: 'Course', menu_sails: 'Sails', menu_go: 'To the start', menu_how: 'How to play',
    menu_rivals: 'Rivals', rv_none: 'Sail alone', rv_n: n => `${n} yacht${n === 1 ? '' : 's'}`,
    rb_place: 'Place', place_of: (p, n) => `${p} of ${n}`,
    ev_hit_me: why => `Collision! ${{ penalty: 'You were taking a penalty turn', room: 'You were outside at the mark', turning: 'You were tacking or gybing', port: 'You were on port tack', astern: 'You were overtaking', windward: 'You were to windward' }[why]} and had to keep clear: two-turn penalty.`,
    ev_hit_them: name => `Collision: ${name} should have kept clear and takes the penalty.`,
    ev_give: (why, name) => ({
      penalty: `You're taking a penalty turn — keep clear of ${name}.`,
      room: `${name} is inside at the mark — give room and go round outside.`,
      turning: `You're tacking or gybing — keep clear of ${name}.`,
      port: `You're on port tack — keep clear of ${name}.`,
      astern: `You're overtaking ${name} — keep clear.`,
      windward: `You're to windward of ${name} — keep clear.`
    })[why],
    ev_rival_fin: (name, p) => `${name} finishes in place ${p}.`,
    h_pen_n: n => `Penalty turn · ${n}`,
    r_place: (p, n) => `Place ${p} of ${n}`, r_table: 'Race results', r_racing: 'still racing', r_you: 'You',
    c_meta: (len, min, kn) => `${km(len, ['m', 'km'])} · ≈ ${min} min · wind ${kn} kn`,
    c_best: tm => `your best: ${tm}`, c_none: 'not sailed yet', c_level: n => `${'●'.repeat(n)}${'○'.repeat(3 - n)} difficulty`,
    how_html: HOW_EN,

    p_title: 'Paused', p_resume: 'Resume', p_restart: 'Restart', p_menu: 'Another course',

    r_title: 'Finished!', r_time: 'Time', r_total: 'With penalty', r_best: 'Your best', r_record: 'New personal best!', r_mode: m => `Sails: ${m}`,
    r_pen: (n, s) => `Penalty turns not taken: ${n} — plus ${s} s.`,
    r_dist: 'Distance sailed', r_avg: 'Average speed', r_trim: 'Average trim', r_turns: 'Tacks / gybes',
    r_touch: 'Mark touches', r_ground: 'Rocks and shoals', r_ocs: 'Over early', r_start: 'Start after the gun', r_legs: 'Legs',
    r_leg: n => `${n}`, r_crash: 'Accidental gybes', r_yes: 'yes', r_no: 'no',
    r_again: 'Race again', r_menu: 'Another course',
    sec_s: n => `${n} s`, kn_v: v => `${v} kn`,

    ev_signal: n => (n >= 60 ? 'One minute to the start' : `${n} s to the start`),
    ev_gun: 'Start!',
    ev_ocs: 'Over early! Your bow was over the line at the gun. Return behind the start line and start again.',
    ev_ocsClear: "You're back behind the line — now start.",
    ev_started: s => (s < 1 ? 'Great start — right on the gun!' : `Started: you crossed the line ${s} s after the gun.`),
    ev_missLine: 'Cross the line between the pin and the committee boat.',
    ev_mark: (n, of) => (n < of ? `Mark ${n} rounded. Next: mark ${n + 1}.` : `Mark ${n} rounded. Now for the finish!`),
    ev_wrong: side => `You passed the mark on the wrong side. Go back and round it ${side}.`,
    ev_touch: 'You touched a mark! Take a penalty turn: 360° in one direction.',
    ev_penDone: n => (n ? `Penalty turn done, ${n} more to go.` : 'Penalty turn done.'),
    ev_aground_rock: 'You hit a rock! The boat has stopped — turn away and build speed.',
    ev_aground_shoal: 'Aground! Turn away into deep water.',
    ev_aground_shore: 'The bow is on the shore! Turn away from the island.',
    ev_aground_buoy: 'You hit a buoy!',
    ev_crash: 'Accidental gybe: the boom slammed across! Sheet the main in before you gybe.',
    ev_finish: 'Finished!',
    pen_none: 'No penalty turns to take.',
    pen_stuck: 'The boat is stopped — start the penalty turn once she is moving again.',
    warp_toast: n => `Time ×${n}`
  }
};

G.I18N.add(DICT);
})(window);
