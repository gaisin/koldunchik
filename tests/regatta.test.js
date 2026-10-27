// Проверки регаты без браузера: node --test tests/
// Модули сайта — обычные скрипты для браузера; здесь им подставлен минимальный window.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
globalThis.window = globalThis;
globalThis.document = { querySelectorAll: () => [], documentElement: {}, title: '' };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.location = { hash: '' };
for (const f of ['js/i18n.js', 'regatta/js/texts.js', 'js/sim.js', 'regatta/js/geo.js', 'regatta/js/wind.js', 'regatta/js/courses.js', 'regatta/js/race.js', 'regatta/js/pilot.js']) require(path.join(ROOT, f));
const { SIM, GEO, KWIND, KCOURSES, KRACE, KPILOT, I18N } = globalThis;

// гонка от старта до финиша на автопилоте
function sail(id, mode, opts) {
  const race = KRACE.createRace(KCOURSES.byId(id), { mode });
  const b = race.boats[0], pilot = KPILOT.createPilot(race, b, opts || {}), events = [];
  while (race.t < 3600 && b.finishT == null) {
    pilot.update(0.1);
    KRACE.step(race, 0.1);
    events.push(...race.events); race.events.length = 0;
  }
  return { race, b, events };
}
// лодка без хода, которую переставляем по точкам: так проверяются правила по положению
function walk(race, b, pts, opts) {
  opts = opts || {};
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], c = pts[i + 1], n = Math.max(1, Math.ceil(GEO.dist(a, c) / 4));
    const hdg = GEO.bearing(a, c);
    for (let k = 1; k <= n; k++) {
      b.x = a.x + (c.x - a.x) * k / n; b.y = a.y + (c.y - a.y) * k / n;
      b.S.boat.hdg = opts.hdg != null ? opts.hdg : hdg; b.S.boat.bsp = 0; b.stuck = 1;
      KRACE.step(race, 0.05);
    }
  }
}
const types = race => { const e = race.events.map(x => x.type); race.events.length = 0; return e; };

test('трассы собираются: ноги, линии, биссектрисы знаков', () => {
  for (const def of KCOURSES.COURSES) {
    const C = KCOURSES.buildCourse(def);
    assert.equal(C.legs.length, def.legs.length + 2, def.id);
    const first = C.legs[1].mark.pos, last = C.legs[C.legs.length - 2].mark.pos;
    assert.ok(GEO.dot(C.start.n, GEO.sub(first, C.start.mid)) > 0, `${def.id}: старт смотрит на первый знак`);
    assert.ok(GEO.dot(C.finish.n, GEO.sub(C.finish.mid, last)) > 0, `${def.id}: финиш — по ходу от последнего знака`);
    assert.ok(C.length > 500 && C.estimate > 120, def.id);
    // места после финиша: за линией, вдали от препятствий и друг от друга
    assert.equal(C.park.length, 8, `${def.id}: мест после финиша`);
    C.park.forEach((p, i) => {
      assert.ok(GEO.sideOf(C.finish, p) > 50, `${def.id}: место ${i} за финишной линией`);
      assert.ok(C.solids.every(o => GEO.dist(p, o) > o.r + 30), `${def.id}: место ${i} далеко от камней и берега`);
      for (const q of C.park.slice(i + 1)) assert.ok(GEO.dist(p, q) >= 30, `${def.id}: места ${i} и соседнее не тесно`);
    });
  }
  // у наветренного знака при развороте вниз биссектриса смотрит на ветер, у подветренного — под ветер
  const wl = KCOURSES.buildCourse(KCOURSES.byId('wl'));
  assert.ok(GEO.dot(GEO.mathDir(wl.legs[1].beta), wl.U) > 0.95);
  assert.ok(GEO.dot(GEO.mathDir(wl.legs[2].beta), wl.U) < -0.95);
});

test('автопилот проходит каждую трассу чисто и вовремя', () => {
  for (const def of KCOURSES.COURSES) {
    const { race, b, events } = sail(def.id, 'auto');
    assert.ok(b.finishT != null, `${def.id}: финиш`);
    const r = KRACE.result(race, b);
    assert.equal(r.legs.length, def.legs.length + 1, `${def.id}: все знаки и финиш`);
    assert.equal(r.aground, 0, `${def.id}: без камней и мелей`);
    assert.equal(r.touches, 0, `${def.id}: без касаний знаков`);
    assert.equal(r.ocs, 0, `${def.id}: без фальстарта`);
    assert.ok(r.startDelay >= 0 && r.startDelay < 20, `${def.id}: старт вскоре после сигнала`);
    assert.ok(r.time < race.C.estimate * 1.4, `${def.id}: ${r.time.toFixed(0)} с при оценке ${race.C.estimate.toFixed(0)} с`);
    assert.ok(!events.some(e => e.type === 'wrongSide'), `${def.id}: знаки нужным бортом`);
  }
});

test('«Быстрые настройки»: с подобранными шкотами трасса проходится, без них лодка стоит', () => {
  const ok = sail('intro', 'quick', { trim: true });
  assert.ok(ok.b.finishT != null && ok.b.finishT < ok.race.C.estimate * 1.4);
  // шкоты так и остались потравленными, как на галфвинде: в бейдевинд паруса не тянут
  const race = KRACE.createRace(KCOURSES.byId('intro'), { mode: 'quick' }), b = race.boats[0];
  b.S.boat.hdg = (race.C.twd - 44 + 360) % 360;
  for (let i = 0; i < 400; i++) KRACE.step(race, 0.1);
  assert.ok(b.S.boat.bsp < 1.5, `ход ${b.S.boat.bsp.toFixed(2)} уз`);
});

test('знак, пройденный не тем бортом, не засчитывается; правильный обход засчитывается', () => {
  const race = KRACE.createRace(KCOURSES.byId('intro'), { mode: 'auto' }), b = race.boats[0], C = race.C;
  race.t = 60; b.started = true; b.leg = 1;
  const P = (u, v) => C.toMap([u, v]);
  // знак (0, 450) нужно оставить слева, а лодка оставляет его справа: по левой стороне вверх, через верх вправо
  walk(race, b, [P(-40, 380), P(-40, 470), P(40, 470), P(40, 400)]);
  assert.equal(b.leg, 1);
  assert.ok(types(race).includes('wrongSide'));
  // назад тем же путём — и правильный обход: справа вверх, через верх влево, вниз
  walk(race, b, [P(40, 400), P(40, 470), P(-40, 470), P(-40, 380), P(40, 380), P(40, 470), P(-40, 470), P(-40, 400)]);
  assert.equal(b.leg, 2, 'знак обогнут');
  assert.ok(types(race).includes('mark'));
});

test('фальстарт: нос за линией в момент сигнала, возврат и новый старт', () => {
  const race = KRACE.createRace(KCOURSES.byId('intro'), { mode: 'auto' }), b = race.boats[0], C = race.C;
  const P = (u, v) => C.toMap([u, v]);
  race.t = -0.02;
  walk(race, b, [P(0, 4), P(0, 6)]);
  assert.ok(b.ocs && !b.started, 'фальстарт');
  assert.ok(types(race).includes('ocs'));
  walk(race, b, [P(0, 6), P(0, -15)]);
  assert.ok(!b.ocs && types(race).includes('ocsClear'));
  walk(race, b, [P(0, -15), P(0, 20)]);
  assert.ok(b.started && b.leg === 1, 'стартовал после возврата');
  // мимо линии (за буем) старт не засчитывается
  const r2 = KRACE.createRace(KCOURSES.byId('intro'), { mode: 'auto' }), b2 = r2.boats[0];
  r2.t = 1; walk(r2, b2, [P(-130, -20), P(-130, 20)]);
  assert.ok(!b2.started);
});

test('касание знака — штраф, оборот на 360° его снимает', () => {
  const race = KRACE.createRace(KCOURSES.byId('intro'), { mode: 'auto' }), b = race.boats[0], C = race.C;
  race.t = 60; b.started = true; b.leg = 1;
  const m = C.marks.W.pos;
  walk(race, b, [GEO.add(m, GEO.vec(-12, 0)), GEO.add(m, GEO.vec(-2.2, 0))], { hdg: 90 });
  assert.equal(b.pen.due, 1);
  assert.ok(types(race).includes('touch'));
  walk(race, b, [GEO.add(m, GEO.vec(-2.2, 0)), GEO.add(m, GEO.vec(-60, -40))]);
  b.stuck = 0; b.S.boat.bsp = 5; b.S.boat.hdg = (C.twd + 90) % 360;
  // обычное руление (галсы туда-сюда) штраф не снимает, сколько бы ни поворачивали
  for (let i = 0; i < 600; i++) { b.helm = Math.floor(i / 60) % 2 ? 1 : -1; KRACE.step(race, 0.1); }
  b.helm = 0;
  assert.equal(b.pen.due, 1, 'зигзаг — не штрафной оборот');
  assert.ok(KRACE.maneuver(race, b, 'penalty'));
  for (let i = 0; i < 1200 && b.pen.due > 0; i++) KRACE.step(race, 0.1);
  assert.equal(b.pen.due, 0);
  assert.ok(types(race).includes('penaltyDone'));
  // штраф, не выполненный до финиша, добавляет время
  b.pen.due = 1; b.finishT = 500;
  const r = KRACE.result(race, b);
  assert.equal(r.total, 500 + KRACE.PEN_LATE);
});

test('камень и мель останавливают лодку, сквозь камень не пройти', () => {
  const race = KRACE.createRace(KCOURSES.byId('wl'), { mode: 'auto' }), b = race.boats[0], C = race.C;
  race.t = 60; b.started = true; b.leg = 1;
  const rock = C.rocks[0];
  const from = GEO.add(rock.pos, GEO.dirOf(200), 45);
  b.x = from.x; b.y = from.y; b.S.boat.hdg = 20; b.S.boat.bsp = 6;
  let hit = false;
  for (let i = 0; i < 300; i++) {
    b.S.boat.hdg = 20; KRACE.step(race, 0.05);
    if (race.events.some(e => e.type === 'aground')) { hit = true; break; }
  }
  assert.ok(hit, 'удар о камень');
  assert.ok(b.S.boat.bsp <= 0 && b.stuck > 0);
  for (let i = 0; i < 100; i++) { b.S.boat.hdg = 20; KRACE.step(race, 0.05); }
  const q = GEO.closestOnSeg(rock.pos, KRACE.bowOf(b), GEO.add(b, GEO.dirOf(200), 6.3));
  assert.ok(q.d > rock.r + 1.5, `лодка не внутри камня: ${q.d.toFixed(2)} м`);
  // мель: киль на отмели
  const sh = C.shoals[0].blobs[0];
  const r2 = KRACE.createRace(KCOURSES.byId('wl'), { mode: 'auto' }), b2 = r2.boats[0];
  b2.x = sh.pos.x; b2.y = sh.pos.y + sh.r + 25; b2.S.boat.hdg = 180; b2.S.boat.bsp = 6;
  let ag = false;
  for (let i = 0; i < 400 && !ag; i++) { b2.S.boat.hdg = 180; KRACE.step(r2, 0.05); ag = r2.events.some(e => e.type === 'aground' && e.what === 'shoal'); }
  assert.ok(ag, 'сели на мель');
  assert.ok(GEO.dist(b2, sh.pos) >= sh.r - 1);
});

test('соперники проходят каждую трассу вместе с игроком, места по времени', () => {
  for (const def of KCOURSES.COURSES) {
    const race = KRACE.createRace(def, { mode: 'auto', rivals: 5 });
    const pilots = race.boats.map(b => KPILOT.createPilot(race, b, { tactics: b.rival ? b.tactics : false }));
    let hits = 0;
    const run = () => {
      for (const p of pilots) p.update(0.1);
      const spin = new Set(race.boats.filter(b => b.maneuver === 'penalty').map(b => b.id));
      KRACE.step(race, 0.1);
      for (const e of race.events) {
        if (e.type !== 'collision') continue;
        hits++;
        assert.ok(!spin.has(e.other) || spin.has(e.boat), `${def.id}: ${e.other} на штрафном обороте, а штраф получила ${e.boat}`);
      }
      race.events.length = 0;
    };
    while (race.t < 3600 && race.boats.some(b => b.finishT == null)) run();
    // финишировавшие отходят от линии на свои места и встают там, не наезжая друг на друга
    for (const t1 = race.t + 240; race.t < t1;) run();
    assert.equal(race.boats.length, 6);
    // соперники стартуют без фальстарта вскоре после сигнала и почти не сталкиваются
    assert.ok(hits <= 8, `${def.id}: столкновений за гонку ${hits}`);
    for (const b of race.boats.filter(o => o.rival)) {
      assert.equal(b.st.ocs, 0, `${def.id}: ${b.id} без фальстарта`);
      assert.ok(b.startT < 15, `${def.id}: ${b.id} стартовала через ${b.startT.toFixed(1)} с`);
    }
    const L = race.C.finish, hull = b => ({ a: GEO.add(b, GEO.dirOf(b.S.boat.hdg), KRACE.HULL.stern), b: KRACE.bowOf(b) });
    for (const b of race.boats) {
      assert.ok(b.finishT != null, `${def.id}: ${b.id} финишировала`);
      assert.equal(b.st.aground, 0, `${def.id}: ${b.id} без камней и мелей`);
      assert.ok(b.st.hits <= 8, `${def.id}: ${b.id} столкновений ${b.st.hits}`);
      // встают на места соперники; лодкой игрока после финиша правит сам игрок
      if (b.rival) {
        assert.ok(b.parked, `${def.id}: ${b.id} дошла до своего места`);
        assert.ok(GEO.sideOf(L, b) > 40, `${def.id}: ${b.id} отошла от финишной линии: ${GEO.sideOf(L, b).toFixed(0)} м`);
      }
      for (const o of race.boats) {
        if (o.id <= b.id) continue;
        const hb = hull(b), ho = hull(o), gap = GEO.segSeg(hb.a, hb.b, ho.a, ho.b).d - 2 * KRACE.HULL.r;
        assert.ok(gap > 3, `${def.id}: ${b.id} и ${o.id} стоят в ${gap.toFixed(1)} м`);
      }
    }
    const total = b => b.finishT + b.pen.due * KRACE.PEN_LATE, st = KRACE.standings(race);
    for (let i = 1; i < st.length; i++) assert.ok(total(st[i - 1]) <= total(st[i]), `${def.id}: порядок мест`);
  }
});

test('правила расхождения: штрафной оборот, левый галс, наветренная, догоняющая', () => {
  const race = KRACE.createRace(KCOURSES.byId('intro'), { mode: 'auto', rivals: 1 });
  const [a, b] = race.boats, twd = a.S.wind.twd;
  b.S.wind.twd = twd;
  const put = (o, p, hdg) => {
    o.x = p.x; o.y = p.y; o.S.boat.hdg = (hdg + 360) % 360;
    o.S.D.twa = SIM.wrap180(twd - hdg); o.S.D.twaAbs = Math.abs(o.S.D.twa); o.S.D.tack = o.S.D.twa >= 0 ? 1 : -1;
  };
  const U = GEO.dirOf(twd), R = GEO.dirOf(twd + 90);
  const spot = (u, v) => GEO.vec(R.x * u + U.x * v, R.y * u + U.y * v);
  const rule = (p, q, boat, why) => { for (const r of [KRACE.rightOfWay(race, p, q), KRACE.rightOfWay(race, q, p)]) { assert.equal(r.boat, boat); assert.equal(r.why, why); } };
  // левый галс уступает правому
  put(a, spot(0, 0), twd + 45); put(b, spot(30, 0), twd - 45);
  rule(a, b, a, 'port');
  // один галс, борт о борт: наветренная уступает
  put(a, spot(0, 8), twd - 45); put(b, spot(4, 0), twd - 45);
  rule(a, b, a, 'windward');
  // наветренная — та, что с наветренного борта другой, а не та, что дальше против ветра:
  // в бейдевинд она может быть чуть позади, на фордевинде — впереди
  const beside = (twa, fore, lat) => {
    const h = twd - twa, p0 = spot(0, 0);
    put(a, p0, h); put(b, GEO.add(GEO.add(p0, GEO.dirOf(h), fore), GEO.dirOf(h + 90), lat), h);
  };
  beside(42, -6, 3.2); rule(a, b, b, 'windward');
  beside(150, 6, 3.2); rule(a, b, b, 'windward');
  beside(150, -6, -3.2); rule(a, b, a, 'windward');
  // один галс, чисто позади: догоняющая уступает, даже если она под ветром
  const back = GEO.dirOf(twd - 45 + 180);
  put(b, spot(0, 0), twd - 45); put(a, GEO.add(GEO.add(spot(0, 0), back, 25), R, 3), twd - 45);
  rule(a, b, a, 'astern');
  // у знака ближняя к нему лодка получает место, даже если она на левом галсе на фордевинде;
  // на разных галсах в лавировку — по общему правилу
  const m = race.C.marks.W.pos, near = (du, dv) => GEO.add(GEO.add(m, R, du), U, dv);
  for (const o of [a, b]) { o.started = true; o.leg = 1; }
  put(a, near(-12, 6), twd + 150); put(b, near(-25, 14), twd - 150);
  rule(a, b, b, 'room');
  put(a, near(-8, -10), twd + 45); put(b, near(-20, -20), twd - 45);
  rule(a, b, a, 'port');
  for (const o of [a, b]) { o.started = false; o.leg = 0; }
  // лодка в повороте уступает той, что не поворачивает, даже если начала поворот правым галсом
  put(a, spot(0, 0), twd - 45); put(b, spot(30, 0), twd + 45);
  assert.ok(KRACE.maneuver(race, a, 'tack'));
  rule(a, b, a, 'turning');
  KRACE.abort(a);
  // лодка на штрафном обороте уступает всем, даже если она на правом галсе
  put(a, spot(0, 0), twd - 45); put(b, spot(30, 0), twd + 45);
  a.pen.due = 1;
  assert.ok(KRACE.maneuver(race, a, 'penalty'));
  rule(a, b, a, 'penalty');
});

test('штрафной оборот: путь предсказуем, повторное нажатие не сбрасывает, касание знака прерывает', () => {
  // соперник крутит оборот с уваливания: где он пройдёт, известно заранее
  const race = KRACE.createRace(KCOURSES.byId('triangle'), { mode: 'auto', rivals: 1 }), [you, b] = race.boats;
  you.x += 3000; you.y += 3000;
  race.t = 100; b.started = true; b.leg = 1;
  b.S.boat.hdg = (b.S.wind.twd - 90 + 360) % 360;
  for (let i = 0; i < 100; i++) KRACE.step(race, 0.1);
  b.pen.due = 1;
  const path = KRACE.turnPath(b, 'penalty', -1);
  assert.ok(KRACE.maneuver(race, b, 'penalty', -1));
  let t = 0, worst = 0;
  for (const p of path) {
    while (t + 1e-9 < p.t) { KRACE.step(race, 0.05); t += 0.05; }
    worst = Math.max(worst, GEO.dist(b, p));
  }
  assert.ok(worst < 6, `путь оборота предсказан с ошибкой ${worst.toFixed(1)} м`);
  assert.equal(b.pen.due, 0, 'оборот засчитан');
  // игрок нажал «Штрафной оборот» ещё раз посреди оборота: оборот продолжается, а не начинается заново
  const r2 = KRACE.createRace(KCOURSES.byId('intro'), { mode: 'auto' }), me = r2.boats[0];
  r2.t = 60; me.started = true; me.leg = 1; me.pen.due = 1;
  assert.ok(KRACE.maneuver(r2, me, 'penalty'));
  for (let i = 0; i < 100; i++) KRACE.step(r2, 0.1);
  const acc = me.pen.acc, left = me.S.helm.auto.left;
  assert.ok(Math.abs(acc) > 60, `повернули на ${acc.toFixed(0)}°`);
  assert.ok(KRACE.maneuver(r2, me, 'penalty'));
  assert.equal(me.pen.acc, acc); assert.equal(me.S.helm.auto.left, left);
  // корпус задел знак — оборот прерван, руль снова у рулевого
  const m = r2.C.marks.W.pos;
  me.x = m.x - 2.5; me.y = m.y; me.S.boat.hdg = 0;
  KRACE.step(r2, 0.05);
  assert.equal(me.S.helm.auto, null); assert.equal(me.maneuver, null);
  assert.equal(me.pen.due, 2, 'касание — ещё один оборот');
});

test('соперники: штраф у судейского судна, у финиша и до старта, огибание и финиш мимо линии', () => {
  // игрок стоит у линии перед стартом: соперники обходят его без фальстарта, со штрафом не застревают
  // у судейского судна (раньше круг оборота задевал судно и штраф рос без конца) и откручивают все обороты
  for (const [along, normal] of [[40, -25], [55, -15]]) {
    const race = KRACE.createRace(KCOURSES.byId('intro'), { mode: 'auto', rivals: 5 }), L = race.C.start, me = race.boats[0];
    const spot = GEO.add(GEO.add(L.mid, L.along, along), L.n, normal);
    const pilots = race.boats.map(b => KPILOT.createPilot(race, b, { tactics: b.rival ? b.tactics : false }));
    const rivals = race.boats.filter(b => b.rival);
    while (race.t < 1500 && rivals.some(b => b.finishT == null)) {
      if (race.t < 0) { me.x = spot.x; me.y = spot.y; me.S.boat.bsp = 0; me.S.boat.hdg = (me.S.wind.twd - 40 + 360) % 360; me.helm = 0; }
      pilots.forEach((p, i) => { if (race.boats[i].rival || race.t >= 0) p.update(0.1); });
      KRACE.step(race, 0.1); race.events.length = 0;
    }
    for (const b of rivals) {
      assert.ok(b.finishT != null, `(${along}, ${normal}): ${b.id} финишировала`);
      assert.equal(b.st.ocs, 0, `(${along}, ${normal}): ${b.id} без фальстарта`);
      assert.equal(b.pen.due, 0, `(${along}, ${normal}): ${b.id} открутила штраф`);
      assert.ok(b.st.touches <= 1, `(${along}, ${normal}): ${b.id} касаний ${b.st.touches}`);
    }
  }
  // штраф в 32 м от финиша: соперник отходит от линии, откручивает оборот и только потом финиширует
  const solo = id => {
    const race = KRACE.createRace(KCOURSES.byId(id), { mode: 'auto', rivals: 1 }), [you, b] = race.boats;
    you.x += 5000; you.y += 5000;
    return { race, b, C: race.C, pilot: KPILOT.createPilot(race, b, {}) };
  };
  {
    const { race, b, C, pilot } = solo('wl');
    let given = false;
    while (race.t < 3000 && b.finishT == null) {
      if (!given && b.started && C.legs[b.leg].type === 'finish' && GEO.closestOnSeg(b, C.finish.a, C.finish.b).d < 32) { b.pen.due = 1; given = true; }
      pilot.update(0.1); KRACE.step(race, 0.1); race.events.length = 0;
    }
    assert.ok(given && b.finishT != null);
    assert.equal(b.pen.due, 0, 'оборот откручен до финиша');
  }
  // к наветренному знаку снизу правым галсом, не дойдя до лейлайна: поворот не под самым знаком —
  // без касания и прохода не тем бортом
  for (const phi of [-150, -140, -130]) {
    const { race, b, C, pilot } = solo('intro'), leg = C.legs[1], m = leg.mark.pos;
    const p = GEO.add(m, GEO.mathDir(leg.beta + leg.side * phi), 200);
    race.t = 300; b.started = true; b.leg = 1; b.x = p.x; b.y = p.y;
    b.S.boat.hdg = (b.S.wind.twd - 43 + 360) % 360; b.S.boat.bsp = 5;
    const t0 = race.t;
    while (b.leg === 1 && race.t - t0 < 300) { pilot.update(0.1); KRACE.step(race, 0.1); race.events.length = 0; }
    assert.equal(b.leg, 2, `phi ${phi}: знак обогнут`);
    assert.equal(b.st.touches, 0, `phi ${phi}: без касания`);
    assert.equal(b.st.wrong, 0, `phi ${phi}: нужным бортом`);
  }
  // прошли мимо конца финишной линии: возвращаемся под неё и финишируем между буем и судном
  {
    const { race, b, C, pilot } = solo('triangle'), F = C.finish;
    race.t = 900; b.started = true; b.leg = C.legs.length - 1;
    const p = GEO.add(GEO.add(F.mid, F.along, -(F.len / 2 + 15)), F.n, 12);
    b.x = p.x; b.y = p.y; b.S.boat.hdg = (b.S.wind.twd - 45 + 360) % 360; b.fPrev = GEO.sideOf(F, b);
    while (race.t < 1300 && b.finishT == null) { pilot.update(0.1); KRACE.step(race, 0.1); race.events.length = 0; }
    assert.ok(b.finishT != null, 'финиш после возврата под линию');
    assert.equal(b.st.touches, 0);
  }
});

test('после финиша штрафные обороты не засчитываются', () => {
  const race = KRACE.createRace(KCOURSES.byId('intro'), { mode: 'auto', rivals: 1 }), [b, o] = race.boats;
  b.pen.due = 2; b.finishT = 480; o.finishT = 600;
  b.S.boat.bsp = 5;
  assert.equal(KRACE.maneuver(race, b, 'penalty'), false);
  // и руками: круг за кругом в одну сторону
  for (let i = 0; i < 1500; i++) { b.helm = 1; KRACE.step(race, 0.1); }
  assert.equal(b.pen.due, 2);
  assert.ok(!race.events.some(e => e.type === 'penaltyDone'));
  assert.equal(KRACE.result(race, b).total, 480 + 2 * KRACE.PEN_LATE);
  assert.deepEqual(KRACE.standings(race), [o, b]);
});

test('столкновение: штраф два оборота виноватой лодке, одно касание — один штраф', () => {
  const race = KRACE.createRace(KCOURSES.byId('intro'), { mode: 'auto', rivals: 1 });
  const [a, b] = race.boats, twd = a.S.wind.twd, C = race.C;
  race.t = 60;
  for (const o of race.boats) { o.started = true; o.leg = 1; }
  const p = C.toMap([0, 200]), d = GEO.dirOf(twd + 50);
  // a идёт левым галсом прямо в борт b, который на правом галсе
  a.x = p.x; a.y = p.y; a.S.boat.hdg = (twd + 50) % 360;
  b.x = p.x + d.x * 14; b.y = p.y + d.y * 14; b.S.boat.hdg = (twd - 45 + 360) % 360;
  let hits = 0;
  for (let i = 0; i < 80; i++) { a.helm = 0; KRACE.step(race, 0.05); hits += race.events.filter(e => e.type === 'collision').length; race.events.length = 0; }
  assert.equal(hits, 1);
  assert.equal(a.pen.due, KRACE.PEN_HIT);
  assert.equal(b.pen.due, 0);
});

test('ветер детерминирован, есть порывы и сдвиги', () => {
  const def = KCOURSES.byId('wl'), C = KCOURSES.buildCourse(def);
  const w1 = KWIND.createWind(def.wind, C.area, {}), w2 = KWIND.createWind(def.wind, C.area, {});
  for (const t of [-30, 100, 500, 900]) {
    const a = w1.sample(100, 200, t), b = w2.sample(100, 200, t);
    assert.equal(a.tws, b.tws); assert.equal(a.twd, b.twd);
  }
  assert.ok(w1.puffs.length > 50);
  const dirs = [0, 100, 200, 300].map(t => w1.base(0, 0, t).twd);
  assert.ok(Math.max(...dirs) - Math.min(...dirs) > 3, 'направление колеблется');
});

test('руль перекладывается плавно и возвращается', () => {
  const race = KRACE.createRace(KCOURSES.byId('intro'), { mode: 'auto' }), b = race.boats[0];
  b.helm = 1; KRACE.step(race, 0.1);
  assert.ok(b.rudder > 0.1 && b.rudder < 0.5, `через 0.1 с руль ${b.rudder.toFixed(2)}`);
  KRACE.step(race, 0.5);
  assert.equal(b.rudder, 1);
  b.helm = 0; KRACE.step(race, 0.5);
  assert.equal(b.rudder, 0);
});

test('все тексты регаты есть на английском и без кириллицы', () => {
  const fs = require('node:fs');
  const src = ['regatta/js/game.js', 'regatta/js/minimap.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const html = fs.readFileSync(path.join(ROOT, 'regatta/index.html'), 'utf8');
  const keys = new Set([...src.matchAll(/\bt\('([a-z0-9_]+)'(?!\s*\+)/g)].map(m => m[1]));
  for (const m of html.matchAll(/data-t[ha]?="([^"]+)"/g)) for (const part of m[1].split(';')) keys.add(part.includes(':') ? part.split(':')[1].trim() : part.trim());
  for (const k of ['sm_auto', 'sm_quick', 'sm_deck', 'mk_windward', 'mk_leeward', 'mk_wing', 'mk_turn', 'side_port', 'side_stbd', 'map_leg', 'map_course',
    'rb_pre', 'rb_race', 'rb_fin', 'ev_aground_rock', 'ev_aground_shoal', 'ev_aground_shore', 'ev_aground_buoy', 'auto_note', 'quick_note', 'deck_note_r', 'tack_bad', 'gybe_bad',
    'pen_none', 'pen_stuck']) keys.add(k);
  // кнопка «на русский» подписана по-русски намеренно: у неё lang="ru"
  keys.delete('lang_btn_aria');
  I18N.set('en');
  const cyr = /[А-Яа-яЁё]/;
  for (const k of keys) {
    assert.ok(I18N.has(k), `нет ключа ${k}`);
    const v = I18N.t(k, 1, 2, 3);
    const s = Array.isArray(v) ? v.join(' ') : String(v);
    assert.ok(!cyr.test(s), `${k}: ${s.slice(0, 60)}`);
  }
  for (const def of KCOURSES.COURSES) for (const f of ['title', 'brief']) assert.ok(def[f].en && !cyr.test(def[f].en), `${def.id}.${f}`);
  // у каждой причины уступить — своя фраза на обоих языках
  for (const lang of ['en', 'ru']) {
    I18N.set(lang);
    for (const why of ['penalty', 'room', 'turning', 'port', 'astern', 'windward']) for (const k of ['ev_hit_me', 'ev_give']) {
      const s = I18N.t(k, why, 'Petrel');
      assert.ok(typeof s === 'string' && !/undefined/.test(s) && (lang === 'ru' || !cyr.test(s)), `${lang} ${k}(${why}): ${s}`);
    }
  }
  I18N.set('ru');
});
