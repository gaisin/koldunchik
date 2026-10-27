/* ============================================================
   Колдунчик / Telltale — языки интерфейса (ru, en)
   Подключается сразу после разметки, до 3D-библиотеки,
   чтобы страница сразу была на нужном языке.
   ============================================================ */
(function (G) {
'use strict';
const KEY = 'kold.lang';

const HELP_RU = `
<div class="phone-only">
  <h3>На телефоне</h3>
  <ul>
    <li>3D-вид закреплён сверху, настройки прокручиваются под ним.</li>
    <li>Полоса приборов под 3D после каждого изменения показывает, что изменилось: скорость, крен, углы к ветру, оценка. Потяните её вверх или вниз, чтобы изменить размер 3D.</li>
    <li>Камера в режиме «Авто» сама поворачивается к той части яхты, которую вы настраиваете. Выбрать другой вид — кнопка с камерой в углу 3D.</li>
    <li>Кружок рядом с настройкой показывает её оценку. Нажмите на него — откроется подсказка.</li>
    <li>Карточку колдунчиков в углу 3D можно свернуть нажатием.</li>
  </ul>
</div>
<div>
  <h3>Как читать колдунчики</h3>
  <p>На стакселе по три пары ленточек у передней шкаторины: красная — на левой стороне паруса, зелёная — на правой. Наветренная сторона обращена к ветру, подветренная — от него.</p>
  <ul>
    <li><b>Наветренные трепещут или поднимаются</b> — парус потравлен или курс слишком острый. Выберите шкот или увалитесь.</li>
    <li><b>Подветренные срываются и крутятся</b> — парус перетянут. Потравите шкот или приведитесь.</li>
    <li><b>Верхние заполаскивают раньше нижних</b> — верх слишком открыт, каретку стакселя вперёд.</li>
    <li><b>Нижние заполаскивают раньше верхних</b> — каретку назад.</li>
    <li><b>Колдунчики на задней шкаторине грота</b>: верхний должен струиться примерно половину времени. Всё время за парусом — грот перетянут или скрутка мала.</li>
  </ul>
</div>
<div>
  <h3>Курсы относительно ветра</h3>
  <table class="pos-table"><tbody>
    <tr><td>0–30°</td><td>Левентик — мёртвый сектор, паруса не работают</td></tr>
    <tr><td>38–55°</td><td>Крутой бейдевинд — лавировка, шкоты выбраны</td></tr>
    <tr><td>55–80°</td><td>Полный бейдевинд</td></tr>
    <tr><td>80–100°</td><td>Галфвинд — ветер в борт</td></tr>
    <tr><td>100–160°</td><td>Бакштаг — ветер сзади-сбоку</td></tr>
    <tr><td>160–180°</td><td>Фордевинд — ветер в корму</td></tr>
  </tbody></table>
  <p>Ветер <b>заходит</b>, когда смещается к носу, — паруса начинают заполаскивать, приходится выбирать шкоты или уваливаться. Ветер <b>отходит</b>, когда смещается к корме, — паруса перетянуты: травите шкоты или приводитесь.</p>
</div>
<div>
  <h3>Как лечь в дрейф</h3>
  <p>В дрейфе лодка почти останавливается: стоит под 45–60° к ветру, идёт вперёд на 1–2 узлах и медленно сносится под ветер. Так берут риф без спешки, отдыхают, чинят поломку, подбирают человека из воды.</p>
  <ul>
    <li>Сделайте поворот оверштаг, не отдавая шкот стакселя: стаксель останется на старом борту и встанет на ветер. В быстрых настройках можно просто отметить «Стаксель на ветру».</li>
    <li>Потравите гика-шкот, чтобы грот почти не тянул.</li>
    <li>Закрепите руль на приведение — кнопка с замком у руля (штурвал повёрнут к ветру, румпель — под ветер).</li>
    <li>Заложенный стаксель уваливает нос, руль приводит обратно — лодка находит равновесие между ними.</li>
  </ul>
</div>
<div>
  <h3>Пианино и лебёдки</h3>
  <ul>
    <li>Стопор пропускает снасть на выбирание даже закрытым. Травить через закрытый стопор нельзя.</li>
    <li>Чтобы потравить: заведите снасть на лебёдку → откройте стопор → травите → закройте стопор → снимите с лебёдки.</li>
    <li>На лебёдке одна снасть. Чтобы тянуть другую, снимите первую — её удержит закрытый стопор.</li>
    <li>Никогда не открывайте стопор нагруженной снасти без лебёдки: фал уронит грот, гика-шкот выбросит гик.</li>
    <li>Каретку стакселя под нагрузкой не сдвинуть: потравите шкот, переставьте, снова выберите.</li>
  </ul>
</div>
<div>
  <h3>Словарь</h3>
  <dl>
    <dt>Шкот</dt><dd>Снасть, которой управляют углом паруса.</dd>
    <dt>Каретка стакселя</dt><dd>Блок шкота на погоне у борта. Вперёд — верх паруса закрывается, назад — открывается.</dd>
    <dt>Погон гика-шкота</dt><dd>Рельс с кареткой: двигает гик к ветру или под ветер, не меняя натяжение задней шкаторины.</dd>
    <dt>Оттяжка гика</dt><dd>Тянет гик вниз и держит скрутку грота на полных курсах.</dd>
    <dt>Аутхол</dt><dd>Натягивает нижнюю шкаторину грота вдоль гика.</dd>
    <dt>Ахтерштаг</dt><dd>Задний штаг. Туже — мачта гнётся, грот площе, штаг меньше провисает.</dd>
    <dt>Фал</dt><dd>Поднимает парус и натягивает переднюю шкаторину.</dd>
    <dt>Риф</dt><dd>Уменьшение площади грота: часть паруса прибирают к гику.</dd>
    <dt>Скрутка</dt><dd>Разница углов паруса внизу и вверху. Больше скрутка — верх разгружен.</dd>
    <dt>Привестись / увалиться</dt><dd>Повернуть к ветру / от ветра.</dd>
    <dt>На рауле</dt><dd>Фордевинд, при котором ветер дует со стороны гика. Грозит перебросом гика.</dd>
    <dt>Лечь в дрейф</dt><dd>Остановить лодку: стаксель заложен на ветер, грот потравлен, руль закреплён на приведение.</dd>
  </dl>
</div>
<p class="note">Модель упрощённая и учебная: поляра и силы подобраны под круизную яхту 13 м. Цифры подсказок ориентировочные — на настоящей лодке ориентируйтесь на колдунчики и ощущение руля.</p>`;

const HELP_EN = `
<div class="phone-only">
  <h3>On a phone</h3>
  <ul>
    <li>The 3D view stays at the top; the settings scroll underneath.</li>
    <li>After every change, the instrument strip under the 3D view shows what changed: speed, heel, wind angles and score. Drag it up or down to resize the 3D view.</li>
    <li>In “Auto” the camera turns to the part of the boat you are trimming. Pick another view with the camera button in the corner.</li>
    <li>The dot next to each control shows its score. Tap it for a hint.</li>
    <li>Tap the telltale card in the corner of the 3D view to collapse it.</li>
  </ul>
</div>
<div>
  <h3>Reading the telltales</h3>
  <p>The genoa has three pairs of telltales near the luff: red on the port side of the sail, green on the starboard side. The windward side faces the wind, the leeward side faces away from it.</p>
  <ul>
    <li><b>Windward telltales lifting or fluttering</b> — the sail is eased too far or you are pinching. Trim the sheet or bear away.</li>
    <li><b>Leeward telltales stalling and spinning</b> — the sail is over-trimmed. Ease the sheet or head up.</li>
    <li><b>Top telltales break before the lower ones</b> — the top is too open: move the genoa car forward.</li>
    <li><b>Lower telltales break first</b> — move the car aft.</li>
    <li><b>Leech telltales on the main</b>: the top one should stream about half the time. If it is always behind the sail, the main is over-trimmed or has too little twist.</li>
  </ul>
</div>
<div>
  <h3>Points of sail</h3>
  <table class="pos-table"><tbody>
    <tr><td>0–30°</td><td>Head to wind — the no-go zone, the sails can't work</td></tr>
    <tr><td>38–55°</td><td>Close-hauled — beating, sheets in</td></tr>
    <tr><td>55–80°</td><td>Close reach</td></tr>
    <tr><td>80–100°</td><td>Beam reach — wind on the beam</td></tr>
    <tr><td>100–160°</td><td>Broad reach — wind on the quarter</td></tr>
    <tr><td>160–180°</td><td>Run — wind from astern</td></tr>
  </tbody></table>
  <p>A <b>header</b> swings the wind towards the bow — the sails start to luff, so trim the sheets or bear away. A <b>lift</b> swings it towards the stern — the sails are over-trimmed, so ease the sheets or head up.</p>
</div>
<div>
  <h3>Heaving to</h3>
  <p>Heaving to parks the boat: she lies 45–60° off the wind, moves ahead at 1–2 knots and drifts slowly to leeward. Use it to reef without rushing, rest, fix something or recover a person from the water.</p>
  <ul>
    <li>Tack without releasing the genoa sheet: the genoa stays on the old side and goes aback. In Quick trim you can simply tick “Genoa backed”.</li>
    <li>Ease the mainsheet until the main barely drives.</li>
    <li>Lash the helm to head up — the lock button on the helm bar (wheel turned to windward, tiller to leeward).</li>
    <li>The backed genoa pushes the bow off, the rudder brings it back up — the boat settles in balance between them.</li>
  </ul>
</div>
<div>
  <h3>Clutches and winches</h3>
  <ul>
    <li>A closed clutch still lets a line in when you haul. You can't ease through a closed clutch.</li>
    <li>To ease: put the line on a winch → open the clutch → ease → close the clutch → take it off the winch.</li>
    <li>One line per winch. To work another line, take the first off — its closed clutch holds it.</li>
    <li>Never open the clutch of a loaded line that isn't on a winch: the halyard drops the main, the mainsheet throws the boom out.</li>
    <li>A loaded genoa car won't move: ease the sheet, move the car, trim again.</li>
  </ul>
</div>
<div>
  <h3>Glossary</h3>
  <dl>
    <dt>Sheet</dt><dd>The line that sets a sail's angle.</dd>
    <dt>Genoa car</dt><dd>The sheet block on the track by the rail. Forward closes the top of the sail, aft opens it.</dd>
    <dt>Traveller</dt><dd>A track with a car that moves the boom to windward or leeward without changing leech tension.</dd>
    <dt>Vang (kicker)</dt><dd>Pulls the boom down and controls main twist off the wind.</dd>
    <dt>Outhaul</dt><dd>Tensions the foot of the main along the boom.</dd>
    <dt>Backstay</dt><dd>The aft stay. Tighter bends the mast, flattens the main and reduces forestay sag.</dd>
    <dt>Halyard</dt><dd>Hoists a sail and tensions its luff.</dd>
    <dt>Reef</dt><dd>Reducing mainsail area by pulling part of the sail down to the boom.</dd>
    <dt>Twist</dt><dd>The difference between the sail's angle at the bottom and at the top. More twist depowers the top.</dd>
    <dt>Head up / bear away</dt><dd>Turn towards / away from the wind.</dd>
    <dt>By the lee</dt><dd>Running with the wind coming from the boom side. Risk of an accidental gybe.</dd>
    <dt>Heave to</dt><dd>Stop the boat with the genoa backed, the main eased and the helm lashed.</dd>
  </dl>
</div>
<p class="note">A simplified training model: the polar and forces are tuned for a 13 m cruising yacht. The numbers in the hints are approximate — on a real boat, go by the telltales and the feel of the helm.</p>`;

const UI = {
  ru: {
    doc_title: 'Колдунчик — тренажёр настройки парусов',
    loading: 'Загружаю 3D-сцену…',
    err_webgl: '3D-вид не запустился: браузер не поддерживает WebGL или библиотека не загрузилась. Приборы, колдунчики, оценка и сценарии работают.',
    aria_stage: '3D-вид яхты', aria_panel: 'Панель управления', aria_score: 'Оценка настройки', aria_mode: 'Режим управления', aria_helm: 'Руль',
    aria_cam: 'Вид камеры', aria_strip: 'Приборы. После каждого изменения показывают, что изменилось', aria_scoreCell: 'Оценка настройки: открыть подробности',
    aria_deckSvg: 'Схема кокпита и рубки: пианино, лебёдки, погоны', aria_dirDial: 'Направление истинного ветра', aria_bTog: 'Показать задачу и кнопки сценария',
    aria_hintClose: 'Скрыть подсказку', aria_lang: 'Язык', lang_btn_aria: 'Switch to English', aria_reefSeg: 'Рифы',
    hud_speed: 'Скорость', hud_hdg: 'Курс', hud_tws: 'Истинный ветер', hud_aws: 'Вымпельный', hud_heel: 'Крен', kn: 'уз',
    b_hint: 'Что делать?', b_hint_hide: 'Скрыть подсказку', b_now: 'Событие сейчас', b_again: 'Заново', b_exit: 'Выйти',
    eff_k: 'Эффект',
    helm_left_aria: 'Руль влево', helm_left: ' Лево', helm_right_aria: 'Руль вправо', helm_right: 'Право ',
    helm_up: 'Привестись', helm_down: 'Увалиться', helm_tack: 'Оверштаг', helm_gybe: 'Фордевинд', helm_lash: 'Закрепить руль на приведение (для дрейфа)',
    cam_auto: 'Авто', cam_auto_sub: ' — к настройке', cam_auto_title: 'Камера сама показывает ту часть яхты, которую вы настраиваете',
    cam_free: 'Свободно', cam_cockpit: 'С кокпита', cam_stern: 'Сзади', cam_top: 'Сверху', cam_side: 'Сбоку',
    airflow: 'Струйки', airflow_title: 'Струйки вымпельного ветра вокруг лодки', pause: 'Пауза', resume: 'Продолжить',
    g_wind: 'Ветер', g_wind_mode: 'вымп. / ист.', g_tell: 'Колдунчики',
    s_speed: 'Скорость', s_heel: 'Крен', s_twa: 'К ветру', s_awa: 'Вымп.', s_score: 'Настройка',
    brand: 'Колдунчик', brand_sub: 'Тренажёр настройки парусов · яхта 13 м, шлюп (тип Dufour 430)',
    to_regatta: 'Регата →', to_regatta_title: 'Регата: гонка по дистанции',
    regatta_card: 'Регата', regatta_card_sub: 'Гонка по дистанции на этой же яхте: старт, знаки, порывы и заходы ветра, камни и мели.',
    score_label: 'Настройка парусов', btn_top: 'Что исправить первым?', btn_solve: 'Показать правильно', auto_hints: 'Подсказки сразу',
    tab_ctl: 'Управление', tab_ctl_s: 'Паруса', tab_score: 'Оценка', tab_wind: 'Ветер и курс', tab_wind_s: 'Ветер', tab_scn: 'Сценарии', tab_help: 'Справка',
    mode_quick: 'Быстрые настройки', mode_quick_s: 'ползунки', mode_deck: 'Палуба', mode_deck_s: 'пианино и лебёдки',
    show_targets: 'Показывать цели на шкалах',
    deck_note: 'Нажмите на стопор, лебёдку, каретку или погон. Стопор пропускает снасть на выбирание, но не даёт травить: чтобы потравить, заведите снасть на лебёдку и откройте стопор.',
    deck_log: 'Журнал', log_empty: 'Пока пусто.',
    w_true: 'Истинный ветер', w_speed: 'Сила ветра', w_calm: 'штиль', w_30: '30 уз', w_dir: 'Направление (откуда дует)', w_drag: 'Перетащите синюю стрелку по кругу.',
    w_gusts: 'Порывы и колебания', w_shift: 'Сдвиг ветра', w_random: 'Случайное изменение ветра', w_course: 'Курс', w_hdg: 'Компасный курс',
    w_n: 'С 0°', w_e: 'В 90°', w_s: 'Ю 180°', w_w: 'З 270°',
    w_note: 'Руль — кнопки внизу 3D-окна или стрелки ← → (с Shift — медленнее). «Привестись» поворачивает к ветру, «Увалиться» — от ветра.',
    free_note: 'Меняйте ветер и курс сами. Сценарий ставит задачу, меняет ветер и проверяет реакцию: оценка должна держаться выше 85% четыре секунды.',
    scn_random: 'Случайная смена ветра', scn_exit: 'Выйти из сценария',
    db_time: 'на реакцию', db_score: 'итоговая настройка', db_todo: 'Что нужно было сделать', db_why: 'Почему так',
    db_stay: 'Остаться в ситуации', db_retry: 'Повторить', db_next: 'Следующий сценарий',
    help_html: HELP_RU,

    tack_bad: 'Оверштаг делают с острых курсов: ветер должен быть впереди траверза.',
    tack_deck: 'Поворот начат. Когда стаксель заполощет — отдайте рабочий шкот и выберите шкот другого борта.',
    gybe_bad: 'Поворот фордевинд делают с полных курсов: ветер должен быть сзади.',
    gybe_eased: 'Гика-шкот потравлен — гик перебросит резко. Перед поворотом выберите его почти до центра.',
    deck_toast: 'Режим «Палуба»: снасти держат стопора, лебёдки свободны. Чтобы что-то потравить — лебёдка, затем стопор.',
    solve_q: 'Паруса выставляются по ветру — посмотрите, что меняется в 3D, колдунчиках и на шкалах.',
    solve_d: 'Зелёные метки на шкалах снастей — правильные значения. Выставьте их стопорами и лебёдками.',
    nothing: 'Исправлять нечего: все пункты в норме.',
    phone_tip: 'Меняйте настройки внизу — 3D и полоса приборов сразу покажут результат. Полосу можно тянуть.',
    lash_on: 'Руль закреплён на приведение.', lash_off: 'Руль освобождён.',
    heave_bad: 'Лечь в дрейф проще с бейдевинда: сначала приведитесь.',
    heave_start: 'Ложимся в дрейф: нос проходит линию ветра, шкот стакселя не отдаём.',
    heave_done: 'Руль закреплён, грот потравлен. Подождите, пока лодка успокоится.',
    ev_crash: 'Гик перебросило: неконтролируемый поворот фордевинд!', ev_gybe: 'Поворот фордевинд: гик перешёл на другой борт', ev_tack: 'Поворот оверштаг',
    ev_broach: 'Лодку развернуло к ветру: для такого ветра слишком много парусов', ev_irons: 'Лодка встала в левентик и потеряла ход. Увалитесь и дайте стакселю наполниться.',
    shift_toast: (header, n) => `Ветер ${header ? 'заходит' : 'отходит'} на ${n}°`,

    eff_helm: 'Руль', eff_tack: 'Поворот оверштаг', eff_gybe: 'Поворот фордевинд', eff_goose: 'Бабочка', eff_reef: 'Рифы', eff_solve: 'Правильная настройка',
    eff_dir: 'Направление ветра', eff_speed: 'Сила ветра', eff_pole: 'Выносной гик', eff_car: 'Каретка стакселя', eff_trav: 'Погон гика-шкота', eff_bs: 'Ахтерштаг',
    eff_backed: 'Стаксель на ветру', eff_lash: 'Руль закреплён', eff_heave: 'Лечь в дрейф',

    st_ok: 'хорошо', st_warn: 'можно лучше', st_bad: 'плохо', st_na: 'не оценивается',
    st_title: l => `Оценка: ${l}. Нажмите — подсказка`,
    sg_title: (n, s) => `Оценка: ${n} — ${s}. Нажмите — подсказка`,

    g_genoa: 'Стаксель (генуя)', g_main: 'Грот', g_rig: 'Рангоут', g_hove: 'Дрейф',
    q_jibSheet: 'Шкот стакселя', q_car: 'Каретка стакселя', q_open: 'Раскрытие стакселя', q_mainsheet: 'Гика-шкот', q_trav: 'Погон гика-шкота',
    q_vang: 'Оттяжка гика', q_outhaul: 'Аутхол', q_luff: 'Фал грота — натяжение', q_luff_name: 'Фал грота', q_backstay: 'Ахтерштаг',
    e_inEased: ['выбран', 'потравлен'], e_fwdAft: ['вперёд', 'назад'], e_furl: ['закручен', 'раскрыт'], e_trav: ['на ветер', 'центр', 'под ветер'],
    e_looseTight: ['слабо', 'туго'], e_outhaul: ['пузатый низ', 'плоский низ'], e_bs: ['потравлен', 'туго'],
    o_jib: n => `стаксель ${n}° к ДП`, o_hole: n => `отверстие ${n} из 15`, o_open: p => p, o_boom: n => `гик ${n}°`,
    o_trav_lee: p => `${p} под ветер`, o_trav_win: p => `${p} на ветер`, o_trav_c: 'по центру',
    goose: 'Бабочка: стаксель на выносном гике на другой борт',
    reefs: 'Рифы', reef0: 'Полный грот', reef1: '1-й риф', reef2: '2-й риф', o_reef0: 'полный грот', o_reef: n => `${n}-й риф`,
    hove_note: 'Классический способ: поворот оверштаг, не отдавая шкот стакселя, затем потравить грот и закрепить руль на приведение. Кнопка ниже сделает это за вас.',
    q_backed: 'Стаксель на ветру (шкот наветренного борта)', q_lash: 'Руль закреплён на приведение', q_heave: 'Лечь в дрейф',

    score_sub: (pos, tack, b, p) => `${pos} · ${tack} галс · ${b} уз из ${p} по поляре`,
    tack_nom: s => (s > 0 ? 'правый' : 'левый'),
    vmg_up: v => `VMG к ветру <b>${v}</b>`, vmg_down: v => `VMG от ветра <b>${v}</b>`,
    twa_sub: (a, tk, d) => `<b>${a}°</b> ${tk > 0 ? 'пр.' : 'лев.'} галс · с ${d}`,
    awa_sub: (a, s) => `<b>${a}°</b> ${s > 0 ? 'справа' : 'слева'}`,
    rud_weather: r => `руль <b>${r}°</b> к ветру`, rud_lee: r => `руль <b>${r}°</b> от ветра`, rud_neutral: 'руль нейтрален', rud_lashed: 'руль закреплён',
    s_of: p => `из ${p}`, s_helm: r => `руль ${r}°`, s_lashed: 'руль закр.', s_kn: v => `${v} уз`, s_same: 'без изм.', s_good: 'хорошо', s_fair: 'средне', s_poor: 'плохо',
    trend_up: 'скорость растёт…', trend_down: 'скорость падает…', trend_flat: 'скорость установилась',
    dial_true: a => `ист. ${a}°`,
    tt_genoa: 'СТАКСЕЛЬ', tt_main: 'ГРОТ', tt_main_s: 'грот', tt_win: 'наветр.', tt_lee: 'подветр.', tt_win_s: 'наветр.', tt_lee_s: 'подветр.', tt_top: 'верх', tt_mid: 'сред.', tt_low: 'низ', tt_furled: 'закручен', tt_furled_long: 'стаксель закручен',
    tv_ok: 'ровно', tv_wind: 'трепещут наветренные', tv_luff: 'заполаскивает', tv_lee: 'срыв подветренных', tv_stall: 'срыв потока', tv_limp: 'в тени грота', tv_aback: 'на ветру', tv_flog: 'полощет', tv_pole: 'бабочка',
    bft: ['штиль', '1 балл, тихий', '2 балла, лёгкий', '3 балла, слабый', '4 балла, умеренный', '5 баллов, свежий', '6 баллов, сильный', '7 баллов, крепкий', '8 баллов, очень крепкий'],
    tws_out: v => `${v} уз`, tws_now: v => ` · сейчас ${v}`,
    shift_header: 'заход', shift_lift: 'отход',
    shift_note: (tk, a) => `Сейчас ${tk} галс, ${a}° к ветру. Заход — ветер смещается к носу, отход — к корме.`,
    dial_n: 'С', dial_e: 'В', dial_s: 'Ю', dial_w: 'З',

    dk_hatch: 'вход', dk_mast: 'мачта', dk_trav: 'погон', dk_bs: 'ахтерштаг', dk_port: 'ЛЕВЫЙ БОРТ', dk_stbd: 'ПРАВЫЙ БОРТ', dk_bow: '↑ нос',
    dk_clutch_aria: n => `Стопор: ${n}`, dk_trav_aria: 'Погон гика-шкота', dk_car_aria: s => `Каретка стакселя, ${s < 0 ? 'левый' : 'правый'} борт`, dk_bs_aria: 'Ахтерштаг',
    w_free: 'свободна', w_working: 'рабочий шкот', w_lazy: 'ленивый шкот', w_off: 'шкот снят', w_running: 'уходит!',
    sel_none: 'Ничего не выбрано. Нажмите на стопор в пианино, лебёдку, каретку стакселя, погон или ахтерштаг.',
    where_prim: s => `основная лебёдка ${s < 0 ? 'левого' : 'правого'} борта`,
    where_clutch: (bank, w) => `${bank === 'P' ? 'левое' : 'правое'} пианино · ${w}`,
    b_clutch_open: 'Открыть стопор', b_clutch_close: 'Закрыть стопор', b_winch_off: 'Снять с лебёдки', b_winch_busy: s => `Лебёдка занята: ${s}`, b_winch_on: 'Завести на лебёдку',
    b_pole_off: 'Убрать выносной гик', b_pole_on: 'Выносной гик на этот борт', b_pull: '⟳ Выбирать', b_ease: '⟲ Травить',
    car_title: s => `Каретка стакселя, ${s < 0 ? 'левый' : 'правый'} борт`, car_where: 'погон на палубе',
    car_about: 'Задаёт, куда тянет шкот. Вперёд — шкот тянет шкаторину вниз, верх стакселя закрывается. Назад — тянет вдоль нижней шкаторины, верх открывается. Под нагрузкой не двигается.',
    b_fwd: '▲ Вперёд', b_aft: '▼ Назад',
    trav_title: 'Погон гика-шкота', trav_where: 'каретка на рубке',
    trav_about: 'Сдвигает гик к ветру или под ветер, почти не меняя натяжения задней шкаторины. Под ветер каретка уходит сама, на ветер под нагрузкой тянется тяжело.',
    b_to_port: '◀ К левому борту', b_to_stbd: 'К правому борту ▶',
    bs_title: 'Ахтерштаг', bs_where: 'таль на корме',
    bs_about: 'Туже — мачта прогибается, грот становится площе, штаг меньше провисает и стаксель тоже площе. Подтягивают в свежий ветер на острых курсах.',
    b_tighten: 'Подтянуть', b_bs_ease: 'Потравить',
    winch_where: bank => `для снастей ${bank === 'P' ? 'левого' : 'правого'} пианино`,
    winch_busy_about: r => `На лебёдке ${r}. Чтобы тянуть другую снасть, сначала снимите эту — её удержит закрытый стопор.`,
    winch_free_about: 'Лебёдка свободна. Заведите на неё снасть, которую нужно выбрать или потравить.',
    winch_line_btn: (on, s) => `${on ? 'Снять' : 'Завести'} «${s}»`, winch_card_btn: s => `Открыть карточку «${s}»`,
    gl_hoisted: 'Грот поднят', gl_luff: 'Натяжение шкаторины', gm_reef2: 'риф 2', gm_reef1: 'риф 1', gm_top: 'верх',
    gl_reef: 'Риф-шкентель выбран', gl_tension: 'Натяжение', gl_eased: 'Потравлен', gv_main: (p, n) => `${p} · гик ${n}°`,
    gl_furled: 'Закручен', gv_furl: (p, q) => `${p} · раскрыт ${q}`, gl_working: 'Рабочий шкот · потравлен', gl_lazy: 'Ленивый шкот',
    gv_jib: n => `стаксель ${n}° к ДП`, gv_slack: 'свободен', gv_eased: p => `потравлен на ${p}`,
    gl_pos: 'Положение', gv_hole: n => `отверстие ${n} из 15`, gm_bow: 'нос', gm_stern: 'корма',
    gv_trav: (t, rel) => `${t > 0.02 ? Math.round(t * 100) + '% к правому' : t < -0.02 ? Math.round(-t * 100) + '% к левому' : 'центр'} · ${rel}`,
    rel_lee: 'под ветер', rel_win: 'на ветер', rel_c: 'по центру', gm_port: 'левый', gm_c: 'центр', gm_stbd: 'правый',
    ch_clutch: c => `Стопор: <b>${c ? 'закрыт' : 'открыт'}</b>`,
    ch_winch: (on, prim) => `Лебёдка: <b>${on ? (prim ? 'в самостопоре' : 'да') : (prim ? 'снят' : 'нет')}</b>`,
    ch_load: l => `Нагрузка: <b>${l}</b>`, ch_running: '<b>уходит!</b>', load_low: 'низкая', load_mid: 'средняя', load_high: 'высокая',
    ch_side: w => (w ? 'рабочий борт' : 'ленивый борт'), ch_sheetload: l => `Нагрузка на шкот: <b>${l}</b>`, ch_leeside: s => `Подветренный борт: <b>${s > 0 ? 'правый' : 'левый'}</b>`,
    wn_running: 'Снасть свободна и уходит под нагрузкой. Закройте стопор или заведите её на лебёдку.',
    wn_clutchOnly: 'Снасть под нагрузкой и держится только стопором. Перед тем как открыть стопор, заведите её на лебёдку.',
    wn_noWinch: 'Выбирать и травить можно только на лебёдке.',
    wn_carLoaded: 'Шкот этого борта нагружен — каретка не сдвинется. Потравите шкот, переставьте каретку, снова выберите шкот.',

    difficulty: d => `${d} сложность`, start: 'Начать', free_title: 'Свободное плавание', scn_title: s => `Сценарий: ${s}`,
    obj_beat: 'Задача: лавировка — идти как можно острее к ветру и при этом быстро.',
    obj_heading: h => `Задача: держать курс ${h} на цель и подстроить паруса.`,
    obj_run: 'Задача: безопасный фордевинд — ветер не должен дуть со стороны гика.',
    obj_tack: 'Задача: повернуть оверштаг и настроиться на другом галсе.',
    obj_gybe: 'Задача: контролируемый поворот фордевинд на другой галс.',
    obj_heaveto: 'Задача: лечь в дрейф — остановить лодку, заложив стаксель на ветер.',
    ph_wait: n => `событие через ${n} с`, ph_resp: tm => `реакция ${tm}`, ph_next: n => ` · ещё событие через ${n} с`, ph_done: n => `готово за ${n} с`,
    db_ok: 'Сценарий пройден', db_mist: 'Пройдено, но с ошибками', db_mistakes: 'Ошибки', sec: n => `${n} с`
  },

  en: {
    doc_title: 'Telltale — sail trim trainer',
    loading: 'Loading the 3D scene…',
    err_webgl: "The 3D view didn't start: the browser has no WebGL or the library failed to load. Instruments, telltales, score and scenarios still work.",
    aria_stage: '3D view of the yacht', aria_panel: 'Control panel', aria_score: 'Trim score', aria_mode: 'Control mode', aria_helm: 'Helm',
    aria_cam: 'Camera view', aria_strip: 'Instruments. After each change they show what changed', aria_scoreCell: 'Trim score: open details',
    aria_deckSvg: 'Deck plan: clutches, winches, tracks', aria_dirDial: 'True wind direction', aria_bTog: 'Show the task and scenario buttons',
    aria_hintClose: 'Hide hint', aria_lang: 'Language', lang_btn_aria: 'Переключить на русский', aria_reefSeg: 'Reefs',
    hud_speed: 'Boat speed', hud_hdg: 'Heading', hud_tws: 'True wind', hud_aws: 'Apparent wind', hud_heel: 'Heel', kn: 'kn',
    b_hint: 'What to do?', b_hint_hide: 'Hide hint', b_now: 'Event now', b_again: 'Restart', b_exit: 'Leave',
    eff_k: 'Effect',
    helm_left_aria: 'Steer to port', helm_left: ' Port', helm_right_aria: 'Steer to starboard', helm_right: 'Stbd ',
    helm_up: 'Head up', helm_down: 'Bear away', helm_tack: 'Tack', helm_gybe: 'Gybe', helm_lash: 'Lash the helm to head up (for heaving to)',
    cam_auto: 'Auto', cam_auto_sub: ' — follows trim', cam_auto_title: 'The camera turns to the part of the boat you are trimming',
    cam_free: 'Free', cam_cockpit: 'Cockpit', cam_stern: 'Astern', cam_top: 'Above', cam_side: 'Abeam',
    airflow: 'Airflow', airflow_title: 'Apparent wind streaks around the boat', pause: 'Pause', resume: 'Resume',
    g_wind: 'Wind', g_wind_mode: 'app. / true', g_tell: 'Telltales',
    s_speed: 'Speed', s_heel: 'Heel', s_twa: 'TWA', s_awa: 'AWA', s_score: 'Trim',
    brand: 'Telltale', brand_sub: 'Sail trim trainer · 13 m sloop (Dufour 430 type)',
    to_regatta: 'Regatta →', to_regatta_title: 'Regatta: race round a course',
    regatta_card: 'Regatta', regatta_card_sub: 'Race round a course in the same yacht: the start, marks, puffs and shifts, rocks and shoals.',
    score_label: 'Sail trim', btn_top: 'What to fix first?', btn_solve: 'Show correct trim', auto_hints: 'Show hints automatically',
    tab_ctl: 'Controls', tab_ctl_s: 'Sails', tab_score: 'Score', tab_wind: 'Wind & course', tab_wind_s: 'Wind', tab_scn: 'Scenarios', tab_help: 'Help',
    mode_quick: 'Quick trim', mode_quick_s: 'sliders', mode_deck: 'Deck', mode_deck_s: 'clutches & winches',
    show_targets: 'Show targets on the sliders',
    deck_note: "Tap a clutch, winch, car or the traveller. A closed clutch lets a line in but won't let it out: to ease, put the line on a winch and open the clutch.",
    deck_log: 'Log', log_empty: 'Nothing yet.',
    w_true: 'True wind', w_speed: 'Wind speed', w_calm: 'calm', w_30: '30 kn', w_dir: 'Direction (blowing from)', w_drag: 'Drag the blue arrow around the dial.',
    w_gusts: 'Gusts and oscillations', w_shift: 'Wind shift', w_random: 'Random wind change', w_course: 'Course', w_hdg: 'Compass heading',
    w_n: 'N 0°', w_e: 'E 90°', w_s: 'S 180°', w_w: 'W 270°',
    w_note: 'Steer with the buttons under the 3D view or the ← → keys (Shift for fine steering). “Head up” turns towards the wind, “Bear away” away from it.',
    free_note: 'Change the wind and course yourself. A scenario sets a task, changes the wind and checks your response: the score has to stay above 85% for four seconds.',
    scn_random: 'Random wind change', scn_exit: 'Leave scenario',
    db_time: 'to respond', db_score: 'final trim', db_todo: 'What to do', db_why: 'Why',
    db_stay: 'Stay here', db_retry: 'Retry', db_next: 'Next scenario',
    help_html: HELP_EN,

    tack_bad: 'You tack from upwind courses: the wind must be forward of the beam.',
    tack_deck: 'Tack started. When the genoa luffs, release the working sheet and trim the other one.',
    gybe_bad: 'You gybe from downwind courses: the wind must be aft.',
    gybe_eased: 'The mainsheet is eased — the boom will slam across. Sheet it in almost to the centre before gybing.',
    deck_toast: 'Deck mode: the clutches hold the lines and the winches are free. To ease a line: winch first, then the clutch.',
    solve_q: 'Trimming the sails to the wind — watch what changes in 3D, in the telltales and on the sliders.',
    solve_d: 'The green marks on the line gauges are the right values. Set them with the clutches and winches.',
    nothing: 'Nothing to fix: everything is in order.',
    phone_tip: 'Adjust the settings below — the 3D view and the instrument strip show the result at once. Drag the strip to resize.',
    lash_on: 'Helm lashed to head up.', lash_off: 'Helm released.',
    heave_bad: 'Heaving to is easiest from close-hauled: head up first.',
    heave_start: 'Heaving to: the bow goes through the wind and the genoa sheet stays made fast.',
    heave_done: 'Helm lashed and main eased. Give her a moment to settle.',
    ev_crash: 'The boom slammed across: accidental gybe!', ev_gybe: 'Gybe: the boom has crossed to the other side', ev_tack: 'Tacked',
    ev_broach: 'Broach: too much sail up for this wind', ev_irons: 'In irons: the boat has stalled head to wind. Bear away and let the genoa fill.',
    shift_toast: (header, n) => (header ? `A ${n}° header` : `A ${n}° lift`),

    eff_helm: 'Helm', eff_tack: 'Tack', eff_gybe: 'Gybe', eff_goose: 'Wing-on-wing', eff_reef: 'Reefs', eff_solve: 'Correct trim',
    eff_dir: 'Wind direction', eff_speed: 'Wind speed', eff_pole: 'Whisker pole', eff_car: 'Genoa car', eff_trav: 'Traveller', eff_bs: 'Backstay',
    eff_backed: 'Genoa backed', eff_lash: 'Helm lashed', eff_heave: 'Heave to',

    st_ok: 'good', st_warn: 'could be better', st_bad: 'poor', st_na: 'not assessed',
    st_title: l => `Score: ${l}. Tap for a hint`,
    sg_title: (n, s) => `Score: ${n} — ${s}. Tap for a hint`,

    g_genoa: 'Genoa', g_main: 'Mainsail', g_rig: 'Rig', g_hove: 'Heaving to',
    q_jibSheet: 'Genoa sheet', q_car: 'Genoa car', q_open: 'Genoa furl', q_mainsheet: 'Mainsheet', q_trav: 'Traveller',
    q_vang: 'Vang', q_outhaul: 'Outhaul', q_luff: 'Main halyard tension', q_luff_name: 'Main halyard', q_backstay: 'Backstay',
    e_inEased: ['in', 'eased'], e_fwdAft: ['forward', 'aft'], e_furl: ['furled', 'fully out'], e_trav: ['to windward', 'centre', 'to leeward'],
    e_looseTight: ['loose', 'tight'], e_outhaul: ['full foot', 'flat foot'], e_bs: ['eased', 'tight'],
    o_jib: n => `genoa ${n}° off centreline`, o_hole: n => `hole ${n} of 15`, o_open: p => `${p} out`, o_boom: n => `boom ${n}°`,
    o_trav_lee: p => `${p} to leeward`, o_trav_win: p => `${p} to windward`, o_trav_c: 'centred',
    goose: 'Wing-on-wing: genoa poled out to the other side',
    reefs: 'Reefs', reef0: 'Full main', reef1: '1st reef', reef2: '2nd reef', o_reef0: 'full main', o_reef: n => (n === 1 ? '1st reef' : '2nd reef'),
    hove_note: 'The classic way: tack without releasing the genoa sheet, then ease the main and lash the helm to head up. The button below does it for you.',
    q_backed: 'Genoa backed (windward sheet)', q_lash: 'Helm lashed to head up', q_heave: 'Heave to',

    score_sub: (pos, tack, b, p) => `${pos} · ${tack} tack · ${b} kn of ${p} on the polar`,
    tack_nom: s => (s > 0 ? 'starboard' : 'port'),
    vmg_up: v => `VMG upwind <b>${v}</b>`, vmg_down: v => `VMG downwind <b>${v}</b>`,
    twa_sub: (a, tk, d) => `<b>${a}°</b> ${tk > 0 ? 'stbd' : 'port'} · from ${d}`,
    awa_sub: (a, s) => `<b>${a}°</b> ${s > 0 ? 'starboard' : 'port'}`,
    rud_weather: r => `<b>${r}°</b> weather helm`, rud_lee: r => `<b>${r}°</b> lee helm`, rud_neutral: 'neutral helm', rud_lashed: 'helm lashed',
    s_of: p => `of ${p}`, s_helm: r => `helm ${r}°`, s_lashed: 'lashed', s_kn: v => `${v} kn`, s_same: 'no change', s_good: 'good', s_fair: 'fair', s_poor: 'poor',
    trend_up: 'speed rising…', trend_down: 'speed falling…', trend_flat: 'speed settled',
    dial_true: a => `true ${a}°`,
    tt_genoa: 'GENOA', tt_main: 'MAIN', tt_main_s: 'main', tt_win: 'windward', tt_lee: 'leeward', tt_win_s: 'weather', tt_lee_s: 'lee', tt_top: 'top', tt_mid: 'mid', tt_low: 'low', tt_furled: 'furled', tt_furled_long: 'genoa furled',
    tv_ok: 'streaming', tv_wind: 'windward lifting', tv_luff: 'luffing', tv_lee: 'leeward stalling', tv_stall: 'stalled', tv_limp: 'blanketed', tv_aback: 'aback', tv_flog: 'flogging', tv_pole: 'poled out',
    bft: ['calm', 'Force 1, light air', 'Force 2, light breeze', 'Force 3, gentle breeze', 'Force 4, moderate breeze', 'Force 5, fresh breeze', 'Force 6, strong breeze', 'Force 7, near gale', 'Force 8, gale'],
    tws_out: v => `${v} kn`, tws_now: v => ` · now ${v}`,
    shift_header: 'header', shift_lift: 'lift',
    shift_note: (tk, a) => `Now on ${tk} tack, ${a}° to the wind. A header swings the wind towards the bow, a lift towards the stern.`,
    dial_n: 'N', dial_e: 'E', dial_s: 'S', dial_w: 'W',

    dk_hatch: 'hatch', dk_mast: 'mast', dk_trav: 'traveller', dk_bs: 'backstay', dk_port: 'PORT', dk_stbd: 'STARBOARD', dk_bow: '↑ bow',
    dk_clutch_aria: n => `Clutch: ${n}`, dk_trav_aria: 'Mainsheet traveller', dk_car_aria: s => `${s < 0 ? 'Port' : 'Starboard'} genoa car`, dk_bs_aria: 'Backstay',
    w_free: 'free', w_working: 'working', w_lazy: 'lazy', w_off: 'off', w_running: 'running!',
    sel_none: 'Nothing selected. Tap a clutch in the clutch bank, a winch, a genoa car, the traveller or the backstay.',
    where_prim: s => `${s < 0 ? 'port' : 'starboard'} primary winch`,
    where_clutch: (bank, w) => `${bank === 'P' ? 'port' : 'starboard'} clutch bank · ${w}`,
    b_clutch_open: 'Open clutch', b_clutch_close: 'Close clutch', b_winch_off: 'Take off winch', b_winch_busy: s => `Winch busy: ${s}`, b_winch_on: 'Put on winch',
    b_pole_off: 'Stow whisker pole', b_pole_on: 'Pole out this side', b_pull: '⟳ Haul in', b_ease: '⟲ Ease',
    car_title: s => `${s < 0 ? 'Port' : 'Starboard'} genoa car`, car_where: 'deck track',
    car_about: "Sets where the sheet pulls from. Forward, the sheet pulls the leech down and closes the top of the genoa. Aft, it pulls along the foot and opens the top. It won't move under load.",
    b_fwd: '▲ Forward', b_aft: '▼ Aft',
    trav_title: 'Mainsheet traveller', trav_where: 'car on the coachroof',
    trav_about: 'Moves the boom to windward or leeward while barely changing leech tension. The car runs to leeward on its own; pulling it to windward under load is hard work.',
    b_to_port: '◀ To port', b_to_stbd: 'To starboard ▶',
    bs_title: 'Backstay', bs_where: 'tackle at the stern',
    bs_about: 'Tighter bends the mast, flattens the main and cuts forestay sag, so the genoa flattens too. Pull it on in a breeze when sailing upwind.',
    b_tighten: 'Tighten', b_bs_ease: 'Ease',
    winch_where: bank => `for the ${bank === 'P' ? 'port' : 'starboard'} clutch bank`,
    winch_busy_about: r => `${r.charAt(0).toUpperCase() + r.slice(1)} is on this winch. To work another line, take this one off first — its closed clutch will hold it.`,
    winch_free_about: 'The winch is free. Put the line you want to haul or ease on it.',
    winch_line_btn: (on, s) => `${on ? 'Take off' : 'Put on'} ${s}`, winch_card_btn: s => `Open ${s} card`,
    gl_hoisted: 'Main hoisted', gl_luff: 'Luff tension', gm_reef2: 'reef 2', gm_reef1: 'reef 1', gm_top: 'top',
    gl_reef: 'Reefing line in', gl_tension: 'Tension', gl_eased: 'Eased', gv_main: (p, n) => `${p} · boom ${n}°`,
    gl_furled: 'Furled', gv_furl: (p, q) => `${p} · ${q} out`, gl_working: 'Working sheet · eased', gl_lazy: 'Lazy sheet',
    gv_jib: n => `genoa ${n}° off centreline`, gv_slack: 'slack', gv_eased: p => `eased ${p}`,
    gl_pos: 'Position', gv_hole: n => `hole ${n} of 15`, gm_bow: 'bow', gm_stern: 'stern',
    gv_trav: (t, rel) => `${t > 0.02 ? Math.round(t * 100) + '% to starboard' : t < -0.02 ? Math.round(-t * 100) + '% to port' : 'centre'} · ${rel}`,
    rel_lee: 'to leeward', rel_win: 'to windward', rel_c: 'centred', gm_port: 'port', gm_c: 'centre', gm_stbd: 'starboard',
    ch_clutch: c => `Clutch: <b>${c ? 'closed' : 'open'}</b>`,
    ch_winch: (on, prim) => `Winch: <b>${on ? (prim ? 'self-tailer' : 'on') : 'off'}</b>`,
    ch_load: l => `Load: <b>${l}</b>`, ch_running: '<b>running!</b>', load_low: 'low', load_mid: 'medium', load_high: 'high',
    ch_side: w => (w ? 'working side' : 'lazy side'), ch_sheetload: l => `Sheet load: <b>${l}</b>`, ch_leeside: s => `Leeward side: <b>${s > 0 ? 'starboard' : 'port'}</b>`,
    wn_running: 'The line is free and running out under load. Close the clutch or put it on a winch.',
    wn_clutchOnly: 'The line is loaded and held only by its clutch. Put it on a winch before you open the clutch.',
    wn_noWinch: 'You can only haul or ease on a winch.',
    wn_carLoaded: "This sheet is loaded — the car won't move. Ease the sheet, move the car, then trim again.",

    difficulty: d => `${d} difficulty`, start: 'Start', free_title: 'Free sailing', scn_title: s => `Scenario: ${s}`,
    obj_beat: 'Task: beat — sail as close to the wind as you can while keeping speed.',
    obj_heading: h => `Task: hold ${h} for the target and retrim the sails.`,
    obj_run: 'Task: a safe run — the wind must not come from the boom side.',
    obj_tack: 'Task: tack and trim on the new tack.',
    obj_gybe: 'Task: a controlled gybe onto the other tack.',
    obj_heaveto: 'Task: heave to — stop the boat with the genoa backed.',
    ph_wait: n => `event in ${n} s`, ph_resp: tm => `response ${tm}`, ph_next: n => ` · next event in ${n} s`, ph_done: n => `done in ${n} s`,
    db_ok: 'Scenario complete', db_mist: 'Complete, with mistakes', db_mistakes: 'Mistakes', sec: n => `${n} s`
  }
};

function detect() {
  try { const h = String((G.location && G.location.hash) || '').toLowerCase(); if (h === '#en' || h === '#ru') return h.slice(1); } catch (e) { /* нет адреса */ }
  try { const v = G.localStorage.getItem(KEY); if (v) { const l = JSON.parse(v); if (UI[l]) return l; } } catch (e) { /* хранилище недоступно */ }
  const nav = G.navigator || {};
  const first = (nav.languages && nav.languages[0]) || nav.language || 'ru';
  return /^ru/i.test(first) ? 'ru' : 'en';
}
const listeners = [];
const I18N = {
  lang: detect(),
  t(k, ...a) {
    let v = UI[I18N.lang][k];
    if (v == null) v = UI.ru[k];
    if (v == null) return k;
    return typeof v === 'function' ? v(...a) : v;
  },
  has: k => UI[I18N.lang][k] != null || UI.ru[k] != null,
  // Неизвестные ключи разметки не трогаем: их словарь (например, регаты) подключится следом.
  apply(root) {
    const r = root || G.document;
    r.querySelectorAll('[data-t]').forEach(el => { if (I18N.has(el.dataset.t)) el.textContent = I18N.t(el.dataset.t); });
    r.querySelectorAll('[data-th]').forEach(el => { if (I18N.has(el.dataset.th)) el.innerHTML = I18N.t(el.dataset.th); });
    r.querySelectorAll('[data-ta]').forEach(el => {
      for (const pair of el.dataset.ta.split(';')) {
        const i = pair.indexOf(':'); if (i < 0) continue;
        const k = pair.slice(i + 1).trim();
        if (I18N.has(k)) el.setAttribute(pair.slice(0, i).trim(), I18N.t(k));
      }
    });
    G.document.documentElement.lang = I18N.lang;
    G.document.title = I18N.t('doc_title');
  },
  set(l) {
    if (!UI[l] || l === I18N.lang) return;
    I18N.lang = l;
    try { G.localStorage.setItem(KEY, JSON.stringify(l)); } catch (e) { /* хранилище недоступно */ }
    try { const h = String(G.location.hash || '').toLowerCase(); if ((h === '#en' || h === '#ru') && G.history && G.history.replaceState) G.history.replaceState(null, '', '#' + l); } catch (e) { /* адрес не меняем */ }
    I18N.apply();
    for (const fn of listeners) fn(l);
  },
  onChange(fn) { listeners.push(fn); },
  // Словарь другой страницы дополняет общий; совпадающие ключи берутся из него.
  add(dict) {
    for (const l in dict) if (UI[l]) Object.assign(UI[l], dict[l]);
    I18N.apply();
  }
};
I18N.apply();
G.I18N = I18N;
})(window);
