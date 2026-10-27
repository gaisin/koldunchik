/* ============================================================
   Колдунчик · Регата — автопилот (без DOM, работает и в Node)
   Ведёт лодку по дистанции так, как это делает рулевой: до старта
   выжидает под линией и выходит на неё к сигналу; к знакам на ветре
   лавирует до лейлайнов и не выходит из коридора; по ветру идёт
   оптимальным углом с поворотами фордевинд; знаки огибает нужным
   бортом; камни, мели и берег обходит, заглядывая вперёд по курсу.
   С tactics лавирует по заходам ветра, с trim сам подбирает шкоты
   в «Быстрых настройках». Соперникам уступает дорогу по правилам
   расхождения, а если уступать должны ему — держит курс и отворачивает
   только в последний момент. Поворот оверштаг или фордевинд начинает,
   только если по пути никого и ничего не заденет. Штрафной оборот крутит
   там, где весь его круг на чистой воде, и прерывает, если к нему
   подходит другая лодка; со штрафом у самого финиша сначала отходит от
   линии. После финиша уходит на своё место за линией и встаёт там.
   Им проверяется, что трассу можно пройти, и на нём же построены соперники.
   ============================================================ */
(function (G) {
'use strict';
const SIM = G.SIM, GEO = G.GEO, KRACE = G.KRACE;
const { clamp, wrap180, sgn } = SIM;
const { KN, vec, dist, bearing, dirOf, add, sub, norm, right, mathDir, dot, closestOnSeg, segSeg } = GEO;
const HULL = KRACE.HULL;

const R_OFF = 24;   // м: на таком расстоянии от знака проходит лодка
const REACH = 28;   // м: точка маршрута достигнута
const LOOK = 95;    // м: насколько вперёд смотреть на препятствия
const CLEAR = 15;   // м: запас до камней, мелей и берега
const BODY = 9;     // м: от точки лодки до края корпуса, с запасом
const SPIN = 25;    // с: столько вокруг должно быть пусто, чтобы начать штрафной оборот (дальше — прервём, если что)
const STANDOFF = 60; // м: на столько от финишной линии отходит лодка, чтобы открутить штраф до финиша
const HOLD = 25;    // м: на столько ниже линии соперник ждёт сигнала (с запасом на выбег, пока гасит ход)
const LAG = 1.5;    // с: через столько после сигнала пересекает линию сильнейший соперник
const LATE = 150;   // с на единицу мастерства: на столько позже стартуют соперники слабее
const BEST = Math.max(...KRACE.RIVALS.map(r => r.skill));
const ACCEL = 4;    // с: за столько соперник набирает ход (как в race.js)

function createPilot(race, b, opts) {
  opts = opts || {};
  const C = race.C;
  const st = { leg: -1, pts: [], wi: 0, segFrom: null, lastTurn: -1e9, hover: 1, avoid: null, mean: null, go: false, held: false, lane: null, spinAt: 0, standoff: false };

  // Через сколько метров по курсу hdg из точки p подойдём к камню, мели, берегу, знаку или
  // стоящей лодке ближе запаса; 0 — путь свободен. Если запас уже нарушен, мешает только то,
  // к чему ещё приближаемся: так из тесноты можно выйти
  function blockedAt(p, hdg, len) {
    const d = dirOf(hdg), bad = (dS, dNow, lim) => dS < lim && dS < dNow - 1;
    for (let s = 6; s <= len; s += 6) {
      const q = vec(p.x + d.x * s, p.y + d.y * s);
      for (const o of C.solids) if (bad(dist(q, o), dist(p, o), o.r + CLEAR)) return s;
      for (const sh of C.shoals) for (const bl of sh.blobs) if (bad(dist(q, bl.pos), dist(p, bl.pos), bl.r + CLEAR)) return s;
      for (const o of C.touch) {
        if (o.cap) { if (bad(closestOnSeg(q, o.a, o.b).d, closestOnSeg(p, o.a, o.b).d, o.r + 9)) return s; }
        else if (bad(dist(q, o), dist(p, o), o.r + 5)) return s;
      }
      // финишировавшие лодки стоят на месте или уходят с дистанции: обходим их, как камни
      for (const o of race.boats) if (o !== b && o.finishT != null && bad(dist(q, o), dist(p, o), 12)) return s;
    }
    return 0;
  }
  // своё место на стоянке после финиша — по порядку финиша
  const parkSpot = () => C.park[(b.finN - 1) % C.park.length];

  // путевые точки отрезка: обход островов из описания трассы, на финише — точка за линией
  function legPoints() {
    const leg = C.legs[b.leg];
    if (leg.type === 'mark') return (C.route[leg.n] || []).slice();
    const L = leg.line;
    return (C.route[C.nMarks + 1] || []).concat([add(L.mid, L.n, 30)]);
  }

  // Огибание знака — по углу лодки вокруг него от биссектрисы (минус — до неё, плюс — после):
  // издалека идём на точку снаружи за 70° до биссектрисы, вблизи — на точку за ней, пересекая её.
  // Оказались за биссектрисой, не обогнув знак, или прошли его не тем бортом — обходим по кругу
  // в нужную сторону: так счёт пересечений («натянутая нитка») выравнивается.
  // К знаку на ветре подходим лейлайном того галса, которым его огибают без поворота (левым бортом —
  // правого): не дойдя до лейлайна, выходим на него в 30 м ниже точки огибания, иначе поворот
  // на лейлайн придётся прямо под знаком и лодку в повороте навалит на него.
  function rounding(leg, from) {
    const m = leg.mark.pos, s = leg.side, phi = s * wrap180(GEO.angOf(b, m) - leg.beta), d = dist(b, m);
    const aim = a => add(m, mathDir(leg.beta + s * a), R_OFF);
    if ((b.rnd && b.rnd.cnt < 0) || (d < 60 && phi >= 5)) return { p: add(m, mathDir(GEO.angOf(b, m) + s * 70), R_OFF + 6), from: null };
    if (d < 60 && phi >= -100) return { p: aim(40), from: null };
    const p = aim(-70), D = b.S.D, beat = SIM.optimalBeatTWA(D.tws) + 1.5, rel = wrap180(bearing(b, p) - D.twd);
    if (d < 120 && Math.abs(rel) < beat && s * rel > 2 - beat) return { p: add(p, dirOf(D.twd - s * beat), -30), from };
    return { p, from };
  }

  // сколько идти до стартовой линии: с запасом на поворот, скорость — как на полном бейдевинде
  function timeToLine(tws) {
    const s = -GEO.sideOf(C.start, b);
    return Math.max(0, s) / Math.max(0.8, 0.8 * SIM.polarSpeed(tws, 60) * KN) + 6;
  }
  // соперник до старта: путь до линии бейдевиндом правого галса и время на него с разгоном от нынешнего хода
  function startRun(tws) {
    const beat = SIM.optimalBeatTWA(tws), hd = b.S.D.twd - beat - 1.5;
    const s = Math.max(0, -GEO.sideOf(C.start, KRACE.bowOf(b))) / Math.max(0.3, dot(dirOf(hd), C.start.n));
    const vf = SIM.polarSpeed(tws, beat) * b.skill * KN;
    return { s, t: s / vf + ACCEL * Math.max(0, 1 - b.S.boat.bsp * KN / vf) };
  }

  // Полоса старта соперника: своя, а если её место ожидания заняла стоящая лодка — ближайшая
  // свободная вдоль линии; выбранная полоса остаётся, пока её не займут
  function laneOf(L) {
    const spot = u => add(add(L.mid, L.along, u), L.n, -HOLD);
    const free = u => race.boats.every(o => o === b || o.S.boat.bsp > 2 || dist(o, spot(u)) > 22);
    if (st.lane == null || (race.t < 0 && !st.go && !free(st.lane))) {
      const own = b.lane || 0;
      st.lane = own;
      for (const k of [0, 1, -1, 2, -2, 3, -3]) {
        const u = own + k * 22;
        if (Math.abs(u) <= L.len / 2 - 10 && free(u)) { st.lane = u; break; }
      }
    }
    return add(L.mid, L.along, st.lane);
  }

  // куда идём сейчас: точка и отрезок, вдоль которого держим коридор
  function goal(tws) {
    if (b.finishT != null) return { p: parkSpot(), from: null };
    const L = C.start, lane = b.rival ? laneOf(L) : add(L.mid, L.along, b.lane || 0);
    if (!b.started) {
      st.leg = -1;
      if (race.t < 0 && b.rival) {
        // соперник ждёт сигнала на своей полосе чуть ниже линии и разгоняется так, чтобы пересечь
        // её сразу после сигнала; если идёт с опережением — гасит ход, у самой линии стоит.
        // Нос оказался над линией (например, уступая дорогу) — сначала уходим обратно под неё
        const run = startRun(tws), early = -race.t + LAG + (BEST - b.skill) * LATE - run.t;
        const side = GEO.sideOf(L, KRACE.bowOf(b));
        if (!st.go && early <= 0) st.go = true;
        if (side > 0) return { p: add(lane, L.n, -HOLD - 10), from: null };
        if (!st.go) return { p: add(lane, L.n, -HOLD), from: null, hold: true };
        return { p: add(lane, L.n, 28), from: add(lane, L.n, -90), half: 45, throttle: early > 2 && side > -5 ? 0 : clamp(1 - early / 4, 0.1, 1) };
      }
      if (race.t < 0) {
        // автопилот игрока ходит вдоль линии, пока не пора идти к ней
        const near = GEO.sideOf(L, b) > -18;
        if (near || -race.t > timeToLine(tws)) {
          const hold = add(lane, L.n, near ? -45 : -60), h = add(hold, L.along, 70 * st.hover);
          if (dist(b, h) < 22) st.hover = -st.hover;
          return { p: add(hold, L.along, 70 * st.hover), from: null };
        }
      }
      // после сигнала, но над линией (фальстарт или пересекли мимо линии) — сначала вниз, за линию
      const back = b.ocs || (race.t >= 0 && GEO.sideOf(L, b) > 0);
      return back ? { p: add(lane, L.n, -28), from: null } : { p: add(lane, L.n, 28), from: add(lane, L.n, -90), half: 45 };
    }
    if (st.leg !== b.leg) {
      st.leg = b.leg; st.pts = legPoints(); st.wi = 0; st.segFrom = vec(b.x, b.y);
    }
    const leg = C.legs[b.leg], pts = st.pts, mark = leg.type === 'mark';
    if (!mark) {
      const F = C.finish, side = GEO.sideOf(F, b), q = closestOnSeg(b, F.a, F.b);
      // со штрафом у самого финиша сначала отходим от линии: оборот там пересёк бы её
      if (b.pen.due <= 0) st.standoff = false;
      else if (st.standoff || (q.d < STANDOFF && side < 0)) { st.standoff = true; return { p: add(q, F.n, -STANDOFF - 15), from: null }; }
      // финиш засчитывается, только если пройти между концами линии: прошли мимо конца — обратно
      // под линию в обход знака на конце; подходим сбоку от конца — сначала под линию у её края
      const u = dot(sub(b, F.mid), F.along), half = F.len / 2 - 12, inner = add(F.mid, F.along, clamp(u, -half, half));
      if (side > 0) return { p: Math.abs(u) > half ? add(add(F.mid, F.along, sgn(u) * (F.len / 2 + 20)), F.n, -20) : add(inner, F.n, -25), from: null };
      if (Math.abs(u) > half + 6 && side > -40) return { p: add(inner, F.n, -25), from: null };
    }
    // путевые точки проходим по очереди; последняя точка финиша — цель до самой линии
    while (st.wi < pts.length - (mark ? 0 : 1)) {
      const p = pts[st.wi], from = st.wi ? pts[st.wi - 1] : st.segFrom;
      if (dist(b, p) < REACH || dot(sub(b, p), norm(sub(p, from))) > 0) { st.wi++; continue; }
      break;
    }
    const from = st.wi ? pts[st.wi - 1] : st.segFrom;
    if (mark && st.wi >= pts.length) return rounding(leg, from);
    return { p: pts[st.wi], from };
  }

  // Рулим на курс hd. Курс по ту сторону ветра — поворот целиком, как у рулевого с экипажем.
  // Если поворот сейчас кого-то или что-то заденет — пока остаёмся на прежнем галсе, на свободном
  // курсе, ближайшем к нужному. Мешает сосед — соперник сбавляет ход, чтобы разойтись с ним: две
  // лодки рядом не должны бесконечно мешать друг другу. true — поворот начат
  function turnTo(hd, D) {
    const B = b.S.boat, twa = wrap180(D.twd - B.hdg), twaD = wrap180(D.twd - hd);
    if (sgn(twa) !== sgn(twaD) && Math.abs(wrap180(hd - B.hdg)) > 25 && !b.S.helm.auto) {
      const kind = Math.abs(twa) + Math.abs(twaD) < 180 ? 'tack' : 'gybe';
      const why = turnBlock(kind);
      let hold = null;
      if (why) {
        // из свободных курсов прежнего галса — ближайший к нужному: цель за кормой — уваливаемся
        // (а потом повернём фордевинд), цель у самого ветра — идём круто к ветру
        const lim = kind === 'tack' ? SIM.optimalBeatTWA(D.tws) + 1.5 : Math.max(140, SIM.optimalRunTWA(D.tws) - 2);
        let best = null, far = -1;
        for (const k of [0, 15, 30, 50, 80, 110]) {
          const h = D.twd - sgn(twa) * (kind === 'tack' ? lim + k : Math.max(40, lim - k)), hit = blockedAt(b, h, 60);
          if (!hit) { if (hold == null || Math.abs(wrap180(h - hd)) < Math.abs(wrap180(hold - hd))) hold = h; }
          else if (hit > far) { far = hit; best = h; }
        }
        // поворачивать на знак или камень хуже, чем идти прежним галсом туда, где до помехи дальше всего
        if (hold == null && why === 'static') hold = best;
        if (hold != null && why === 'boat' && b.rival) b.throttle = Math.min(b.throttle, 0.6);
      }
      if (hold != null) hd = hold;
      else if (KRACE.maneuver(race, b, kind)) { st.lastTurn = race.t; return true; }
    }
    if (b.S.helm.auto) { b.helm = 0; return false; }
    b.helm = clamp(wrap180(hd - B.hdg) / 12, -1, 1);
    return false;
  }
  // До сигнала над линию не выходим: курс, который раньше сигнала выведет нос ближе 3 м к линии, — вдоль неё
  function keepBelow(hd) {
    if (b.started || race.t >= 0) return hd;
    const L = C.start, d = dirOf(hd), dn = dot(d, L.n), side = GEO.sideOf(L, KRACE.bowOf(b));
    if (dn <= 0 || side < -12 || race.t + Math.max(0, -side - 3) / (Math.max(1, b.S.boat.bsp) * KN * dn) > 0) return hd;
    return bearing(vec(0, 0), dot(d, L.along) >= 0 ? L.along : vec(-L.along.x, -L.along.y));
  }
  // Что мешает начать поворот: 'static' — по пути или сразу после него корпус заденет знак,
  // судейское судно, камень или мель или новым курсом сразу упрёмся в них; 'boat' — сосед окажется
  // рядом, пока мы поворачиваем и набираем ход (в повороте мы уступаем всем), запас — 6 м между
  // корпусами; '' — ничто
  const hullAt = (x, y, h) => { const d = dirOf(h); return [vec(x + d.x * HULL.stern, y + d.y * HULL.stern), vec(x + d.x * HULL.bow, y + d.y * HULL.bow)]; };
  function turnBlock(kind) {
    const path = KRACE.turnPath(b, kind, 1, 5), end = path[path.length - 1];
    // после поворота новым курсом должно быть куда идти: иначе отворачивать уже поздно
    if (!pathClear(path, false) || (end && blockedAt(end, end.h, 30))) return 'static';
    return race.boats.every(o => {
      if (o === b || Math.abs(o.x - b.x) > 90 || Math.abs(o.y - b.y) > 90) return true;
      const h = o.S.boat.hdg, v = dirOf(h), s = Math.max(0, o.S.boat.bsp) * KN;
      return path.every(p => {
        const [a1, b1] = hullAt(p.x, p.y, p.h), [a2, b2] = hullAt(o.x + v.x * s * p.t, o.y + v.y * s * p.t, h);
        return segSeg(a1, b1, a2, b2).d > 2 * HULL.r + 6;
      });
    }) ? '' : 'boat';
  }

  // как сойдёмся с лодкой o, если пойдём курсом hd, а она — прежним курсом и ходом;
  // наш ход на новом курсе — между нынешним и тем, что даёт поляра
  function meet(o, hd, horizon) {
    const D = b.S.D, twa = Math.abs(wrap180(D.twd - hd)), polar = twa < 32 ? 0 : SIM.polarSpeed(D.tws, twa);
    const va = dirOf(hd), vb = dirOf(o.S.boat.hdg), sa = Math.max(1.5, (b.S.boat.bsp + polar) / 2) * KN, sb = Math.max(0, o.S.boat.bsp) * KN;
    const rx = o.x - b.x, ry = o.y - b.y, vx = vb.x * sb - va.x * sa, vy = vb.y * sb - va.y * sa, v2 = vx * vx + vy * vy;
    const tc = v2 > 1e-6 ? clamp(-(rx * vx + ry * vy) / v2, 0, horizon) : 0;
    return { tc, d: Math.hypot(rx + vx * tc, ry + vy * tc), now: Math.hypot(rx, ry) };
  }

  // Соседние лодки: если должны уступить мы — отворачиваем заранее и настолько, чтобы разойтись
  // (на разных галсах уваливаемся и проходим за кормой, наветренная приводится или поворачивает,
  // догоняющая, дальняя от знака или прервавшая штрафной оборот отходит в сторону); если они — держим курс
  // и отворачиваем, только когда столкновение неизбежно. Сходимся ли — смотрим по курсу,
  // выбранному без соседа: пока он ведёт к столкновению, продолжаем расходиться.
  function traffic(D, beat, plan) {
    let worst = null;
    for (const o of race.boats) {
      if (o === b || o.finishT != null) continue;
      if (Math.abs(o.x - b.x) > 140 || Math.abs(o.y - b.y) > 140) continue;
      const c = meet(o, plan, 18);
      if (c.d < 16 && (c.tc > 0.3 || c.now < 22) && (!worst || c.tc < worst.c.tc)) worst = { o, c };
    }
    if (!worst) return null;
    const o = worst.o, tack = sgn(D.twa), a = Math.abs(wrap180(D.twd - plan));
    // расходимся со всеми соседями сразу: отворот от одного не должен вести на другого
    const around = race.boats.filter(q => q !== b && q.finishT == null && Math.abs(q.x - b.x) < 120 && Math.abs(q.y - b.y) < 120);
    // финишировавшая лодка в гонке уже не участвует и уступает всем
    const rw = b.finishT != null ? { boat: b, why: 'finished' } : KRACE.rightOfWay(race, b, o);
    // в сторону от соседа: куда он не идёт
    const side = sgn(GEO.dot(sub(o, b), right(dirOf(b.S.boat.hdg)))) || 1;
    // лодка в повороте должна уступить, но до конца поворота отвернуть не может: расходимся с ней сами
    if (rw.boat !== b && !(rw.why === 'turning' && o.S.helm.auto)) {
      if (!(worst.c.tc < 3 && worst.c.d < 7)) return null;
      // отворот в последний момент — не круче 34° к ветру, иначе лодка встанет против ветра
      const h = b.S.boat.hdg - side * 25, w = wrap180(D.twd - h);
      return { hd: Math.abs(w) < 34 ? D.twd - (sgn(w) || tack) * 34 : h };
    }
    // курс на том же галсе на k° дальше от ветра (k < 0 — круче к ветру): первый, на котором расходимся
    // со всеми (до сигнала — по возможности не выходя за стартовую линию), а если такого нет — на котором
    // проходим дальше всего
    const pick = ks => {
      let best = null, clear = null;
      for (const k of ks) {
        const hd = D.twd - tack * clamp(a + k, 34, 170), d = Math.min(...around.map(q => meet(q, hd, 30).d));
        if (d > 18) { if (keepBelow(hd) === hd) return { hd }; if (!clear) clear = { hd }; }
        if (!best || d > best.d) best = { hd, d };
      }
      return clear || { hd: best.hd };
    };
    // левый галс: уваливаемся и проходим за кормой, на фордевинде — приводимся
    if (rw.why === 'port') return pick(a > 110 ? [-20, -35, -50, -70, 10] : [30, 45, 60, 80, 100]);
    if (rw.why === 'windward') {
      // наветренная: приводится, а на бейдевинде — поворачивает от соседа на другой галс,
      // если только что поворачивала — идёт круче
      if (a > beat + 8) return pick([-20, -35, -50, 20, 35]);
      return { tack: true, hd: D.twd + tack * beat, alt: pick([-12, -20]).hd };
    }
    // догоняющая, дальняя от знака и остальные — в сторону от соседа: у знака это значит обойти его снаружи
    const away = side * tack;
    return pick([25, 40, 55, 70, -25, -40].map(k => k * away));
  }
  // поворот на курс hd по своей воле (лейлайн, коридор, заход) — только если на новом курсе
  // ни с кем не сойдёмся: нельзя поворачивать под нос лодке, которая не успеет отвернуть
  const safeTurn = hd => race.boats.every(o => o === b || o.finishT != null
    || Math.abs(o.x - b.x) > 120 || Math.abs(o.y - b.y) > 120 || meet(o, hd, 30).d > 24);
  // подойдёт ли лодка o ближе r к точке c за время T, если пойдёт прежним курсом.
  // Уходящая мешает, только если она совсем рядом; поворачивающая — где она сейчас
  function near(o, c, r, T) {
    const rx = o.x - c.x, ry = o.y - c.y, now = Math.hypot(rx, ry);
    if (o.S.helm.auto) return now < r;
    const v = dirOf(o.S.boat.hdg), s = Math.max(0, o.S.boat.bsp) * KN;
    const t = s > 0.01 ? clamp(-(rx * v.x + ry * v.y) / s, 0, T) : 0;
    if (t <= 0) return now < r / 2;
    return Math.hypot(rx + v.x * s * t, ry + v.y * s * t) < r;
  }
  // путь не задевает знаки, камни, мели и берег, до сигнала не выводит нос за стартовую линию, а на
  // финише — за продолжение финишной линии сбоку от её концов (там финиш не засчитают); путь
  // штрафного оборота (spin) ещё и не пересекает ни саму финишную линию, ни луч биссектрисы знака,
  // который огибаем: иначе засчитается финиш, огибание или проход не тем бортом
  function pathClear(path, spin) {
    const leg = C.legs[b.leg], F = b.started && leg.type === 'finish' ? C.finish : null;
    const m = spin && b.started && leg.type === 'mark' ? leg.mark.pos : null, u = m && mathDir(leg.beta);
    const ray = p => { const w = sub(p, m); return dot(w, u) > 0 ? Math.abs(w.x * u.y - w.y * u.x) : Math.hypot(w.x, w.y); };
    const aside = p => GEO.sideOf(F, p) > -BODY && Math.abs(dot(sub(p, F.mid), F.along)) > F.len / 2 + 2;
    // до сигнала: если и прежним курсом выйдем за линию, поворот не хуже
    const below = !b.started && race.t < 0 && keepBelow(b.S.boat.hdg) === b.S.boat.hdg;
    const early = p => below && race.t + p.t < 0 && GEO.sideOf(C.start, p) > -BODY;
    return path.every(p => C.touch.every(o => (o.cap ? closestOnSeg(p, o.a, o.b).d : dist(p, o)) > o.r + BODY + 3)
      && C.solids.every(o => dist(p, o) > o.r + BODY + 3)
      && C.shoals.every(sh => sh.blobs.every(bl => dist(p, bl.pos) > bl.r + 3))
      && !early(p)
      && (!F || (!aside(p) && (!spin || closestOnSeg(p, F.a, F.b).d > BODY + 3)))
      && (!m || ray(p) > BODY + 3));
  }
  // Оборот пора прервать: за ближайшие 12 с какая-то лодка подойдёт ближе 16 м к тому месту
  // круга, где мы тогда будем (или она уже рядом)
  function spinThreat() {
    const path = KRACE.turnPath(b).filter(p => p.t <= 12);
    return race.boats.some(o => {
      if (o === b || o.finishT != null || Math.abs(o.x - b.x) > 100 || Math.abs(o.y - b.y) > 100) return false;
      const v = dirOf(o.S.boat.hdg), s = Math.max(0, o.S.boat.bsp) * KN;
      return dist(o, b) < 16 || path.some(p => Math.hypot(o.x + v.x * s * p.t - p.x, o.y + v.y * s * p.t - p.y) < 16);
    });
  }
  // Штрафной оборот: в какую сторону крутить (1 — сначала привестись, −1 — увалиться), чтобы весь
  // круг прошёл по чистой воде и ни одна лодка не подошла, пока крутимся; лодка, которая сама
  // крутит оборот, может оказаться где угодно на своём круге — от неё ещё на круг дальше. 0 — сейчас негде
  function spinDir() {
    const first = Math.abs(b.S.D.twa) < 100 ? 1 : -1;
    for (const dir of [first, -first]) {
      const path = KRACE.turnPath(b, 'penalty', dir);
      if (!pathClear(path, true)) continue;
      const c = vec(path.reduce((s, p) => s + p.x, 0) / path.length, path.reduce((s, p) => s + p.y, 0) / path.length);
      const r = Math.max(...path.map(p => dist(p, c))) + BODY + 6;
      if (race.boats.every(o => o === b || (path.every(p => dist(p, o) > 2 * BODY) && !near(o, c, r, SPIN)
        && !(o.maneuver === 'penalty' && dist(o, c) < r + 50)))) return dir;
    }
    return 0;
  }

  // шкоты и погон — как у рулевого, который следит за колдунчиками
  function trimSheets(dt) {
    const Q = b.S.quick, T = b.trim;
    if (!T) return;
    const k = 1 - Math.exp(-dt / 2);
    for (const key of KRACE.Q_PLAYER.quick) Q[key] += (T[key] - Q[key]) * k;
  }

  function update(dt) {
    const S = b.S, D = S.D;
    if (opts.trim && b.mode === 'quick') trimSheets(dt || 0.1);
    if (!D) { b.helm = 0; return; }
    if (b.S.helm.auto) {
      // на штрафном обороте мы уступаем всем: если лодка вот-вот подойдёт — прерываем оборот и расходимся
      if (b.maneuver !== 'penalty' || !spinThreat()) { b.helm = 0; return; }
      KRACE.abort(b);
    }
    if (b.finishT != null) {
      // после финиша — на своё место за линией, там приводимся и стоим
      if (!b.parked && dist(b, parkSpot()) < 22) b.parked = true;
      if (b.parked) { turnTo(D.twd - sgn(D.twa) * 15, D); return; }
    }
    const tws = D.tws, twd = D.twd;
    // средний ветер за несколько минут: от него считаются заходы и отходы
    st.mean = st.mean == null ? twd : st.mean + wrap180(twd - st.mean) * Math.min(1, (dt || 0.1) / 150);
    // штраф крутим, как только для оборота найдётся место (путь оборота считаем дважды в секунду)
    if (b.pen.due > 0 && b.started && b.finishT == null && !b.contacts.size && b.stuck <= 0 && race.t >= st.spinAt) {
      st.spinAt = race.t + 0.5;
      const dir = spinDir();
      if (dir && KRACE.maneuver(race, b, 'penalty', dir)) return;
    }
    const g = goal(tws);
    b.throttle = g.throttle != null ? g.throttle : 1;
    if (g.hold && GEO.sideOf(C.start, KRACE.bowOf(b)) < -3 && (dist(b, g.p) < 12 || (st.held && dist(b, g.p) < 30))) {
      // ждём сигнала правым галсом, приведясь и потравив шкоты; должны уступить — отходим,
      // а если отойти можно только за линию — стоим
      st.held = true;
      const plan = twd - 38, y = race.boats.length > 1 ? traffic(D, SIM.optimalBeatTWA(tws) + 1.5, plan) : null;
      const yh = y && (y.tack ? y.alt : y.hd);
      b.throttle = y && keepBelow(yh) === yh ? 1 : 0;
      turnTo(y ? yh : keepBelow(plan), D);
      return;
    }
    const tack = sgn(D.twa);
    const beat = SIM.optimalBeatTWA(tws) + 1.5, run = Math.max(140, SIM.optimalRunTWA(tws) - 2);
    const brg = bearing(b, g.p), rel = wrap180(brg - twd);
    let hd = brg, mode = 'reach';
    const since = race.t - st.lastTurn;
    if (Math.abs(rel) < beat) {
      mode = 'beat';
      hd = twd - tack * beat;
      let turn = tack * rel >= beat - 2;
      if (!turn && g.from) {
        const seg = norm(sub(g.p, g.from)), xte = dot(sub(b, g.from), right(seg));
        const half = g.half || C.corridor || Math.max(110, 0.3 * dist(g.from, g.p));
        const going = dot(dirOf(hd), right(seg));
        if (Math.abs(xte) > half && sgn(going) === sgn(xte)) turn = true;
      }
      if (!turn && opts.tactics && since > 35 && Math.abs(rel) < beat - 12) {
        const header = tack > 0 ? wrap180(twd - st.mean) < -5 : wrap180(twd - st.mean) > 5;
        if (header) turn = true;
      }
      if (turn && since > 12 && safeTurn(twd + tack * beat)) hd = twd + tack * beat;
    } else if (Math.abs(rel) > run) {
      mode = 'run';
      const rd = wrap180(brg - (twd + 180)), side = 180 - run;
      hd = twd + 180 + tack * side;
      let turn = -tack * rd >= side - 2;
      if (!turn && g.from) {
        const seg = norm(sub(g.p, g.from)), xte = dot(sub(b, g.from), right(seg));
        const half = C.corridor || Math.max(110, 0.3 * dist(g.from, g.p));
        if (Math.abs(xte) > half && sgn(dot(dirOf(hd), right(seg))) === sgn(xte)) turn = true;
      }
      if (turn && since > 12 && safeTurn(twd + 180 - tack * side)) hd = twd + 180 - tack * side;
    }
    // соперник рядом — уступаем; препятствие впереди — другой галс или отворот в сторону цели
    const here = vec(b.x, b.y);
    let yieldTo = race.boats.length > 1 ? traffic(D, beat, hd) : null;
    if (yieldTo && yieldTo.tack) {
      if (race.t - st.lastTurn > 8 && blockedAt(here, yieldTo.hd, LOOK * 0.5) === 0 && turnTo(yieldTo.hd, D)) return;
      yieldTo = { hd: yieldTo.alt };
    }
    // курс ради соседа у стартовой линии не правим: уступить важнее (он и так выбран под линией, если можно);
    // а если уступить можно только за линию — соперник гасит ход
    let own = true;
    if (yieldTo && blockedAt(here, yieldTo.hd, LOOK * 0.5) === 0) { hd = yieldTo.hd; st.avoid = { hd, until: race.t + 3, boat: true }; own = false; }
    else if (st.avoid && race.t < st.avoid.until && blockedAt(here, st.avoid.hd, LOOK * 0.6) === 0) { hd = st.avoid.hd; own = !st.avoid.boat; }
    else {
      st.avoid = null;
      const hit = blockedAt(here, hd, LOOK);
      if (hit) {
        const cand = [];
        if (mode === 'beat') cand.push(twd + tack * beat);
        if (mode === 'run') cand.push(twd + 180 - tack * (180 - run));
        const toward = sgn(wrap180(brg - hd)) || 1;
        for (const k of [12, 24, 36, 50, 65, 80, 100, 125]) { cand.push(hd + toward * k); cand.push(hd - toward * k); }
        let best = null, bestHit = hit;
        for (const c of cand) {
          if (Math.abs(wrap180(twd - c)) < beat - 3) continue;
          const h = blockedAt(here, c, LOOK);
          if (h === 0) { best = c; break; }
          if (h > bestHit) { bestHit = h; best = c; }
        }
        if (best != null) { hd = best; st.avoid = { hd, until: race.t + 7 }; }
      }
    }
    if (!own && b.rival && GEO.sideOf(C.start, KRACE.bowOf(b)) < 0 && keepBelow(hd) !== hd) b.throttle = 0;
    turnTo(own ? keepBelow(hd) : hd, D);
  }
  return { update, state: st };
}

G.KPILOT = { createPilot };
})(typeof window !== 'undefined' ? window : globalThis);
