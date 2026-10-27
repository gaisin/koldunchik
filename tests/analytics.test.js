// Проверки статистики посещений: node --test tests/
// Модуль запускается на подставной странице; count.js GoatCounter заменён двойником,
// который так же, как настоящий, дополняет параметры хита из window.goatcounter.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/analytics.js'), 'utf8');

// страница с минимальным DOM; added: что модуль добавил в <head>, sent: хиты, ушедшие в GoatCounter
function page(loc, title) {
  const added = [], sent = [];
  const document = {
    title: 'Telltale: sail trim trainer', referrer: 'https://t.me/',
    currentScript: { dataset: { title } },
    head: { appendChild: el => added.push(el) },
    createElement: tag => ({ tagName: tag.toUpperCase(), dataset: {} }),
    querySelectorAll: () => [], documentElement: {}
  };
  const location = Object.assign({ protocol: 'https:', hostname: 'gaisin.github.io', pathname: '/koldunchik/', search: '', hash: '' }, loc);
  const w = vm.createContext({
    document, location, navigator: { languages: ['ru'] },
    localStorage: { getItem: () => null, setItem: () => {} },
    history: { replaceState() {} }
  });
  w.window = w;
  vm.runInContext(SRC, w);
  return { w, added, sent };
}
// count.js загрузился: сам считает просмотр страницы, затем срабатывает onload
function loadCounter(p) {
  const gc = p.w.goatcounter = p.w.goatcounter || {};
  const pick = (vars, k) => (vars[k] === undefined ? gc[k] : vars[k]);
  gc.count = vars => {
    vars = vars || {};
    const loc = p.w.location, title = pick(vars, 'title'), ref = pick(vars, 'referrer'), pth = pick(vars, 'path');
    p.sent.push({
      path: pth == null ? loc.pathname + loc.search : pth,
      title: title == null ? p.w.document.title : title,
      referrer: ref == null ? p.w.document.referrer : ref,
      event: !!(vars.event || gc.event)
    });
  };
  if (!gc.no_onload) gc.count();
  p.added[0].onload();
}

test('на localhost, 127.0.0.1 и file:// счётчик не загружается, события молча пропадают', () => {
  for (const loc of [{ protocol: 'http:', hostname: 'localhost' }, { protocol: 'http:', hostname: '127.0.0.1' }, { protocol: 'file:', hostname: '', pathname: '/Users/me/koldunchik/index.html' }]) {
    const p = page(loc, 'Тренажёр');
    assert.equal(p.added.length, 0, loc.hostname || loc.protocol);
    assert.doesNotThrow(() => p.w.KAnalytics.track('race_start', { course: 'wl' }));
  }
});

test('на gaisin.github.io подключается count.js со счётчиком koldunchik', () => {
  const p = page({}, 'Тренажёр');
  assert.equal(p.added.length, 1);
  const s = p.added[0];
  assert.equal(s.tagName, 'SCRIPT');
  assert.equal(s.src, 'https://gc.zgo.at/count.js');
  assert.equal(s.dataset.goatcounter, 'https://koldunchik.goatcounter.com/count');
  assert.equal(s.async, true);
});

test('один просмотр на загрузку: путь без хеша, параметров и index.html, заголовок не зависит от языка', () => {
  const p = page({ pathname: '/koldunchik/regatta/index.html', search: '?utm_source=tg', hash: '#en' }, 'Регата');
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/i18n.js'), 'utf8'), p.w);
  loadCounter(p);
  p.w.I18N.set('ru');
  p.w.I18N.set('en');
  assert.deepEqual(p.sent, [{ path: '/koldunchik/regatta/', title: 'Регата', referrer: 'https://t.me/', event: false }]);
});

test('событие: путь «имя ключ=значение», без заголовка и источника перехода', () => {
  const p = page({}, 'Регата');
  loadCounter(p);
  p.w.KAnalytics.track('race_finish', { course: 'wl', mode: 'auto', rivals: 3, place: 2 });
  assert.deepEqual(p.sent.slice(1), [{ path: 'race_finish course=wl mode=auto rivals=3 place=2', title: '', referrer: '', event: true }]);
});

test('значения события - идентификаторы: пробелы, разметка и кириллица не ломают путь', () => {
  const p = page({}, 'Тренажёр');
  loadCounter(p);
  p.w.KAnalytics.track('scenario_start', { scenario: 'tack <b>заново</b>', 'step no': 2.5 });
  assert.equal(p.sent[1].path, 'scenario_start scenario=tackbb stepno=2.5');
});

test('события до загрузки count.js уходят после неё, при блокировке и ошибках счётчика ничего не ломается', () => {
  const p = page({}, 'Тренажёр');
  p.w.KAnalytics.track('sail_mode', { mode: 'deck' });
  assert.equal(p.sent.length, 0);
  loadCounter(p);
  assert.deepEqual(p.sent.map(h => h.path), ['/koldunchik/', 'sail_mode mode=deck']);

  const blocked = page({}, 'Тренажёр');
  blocked.w.KAnalytics.track('sail_mode', { mode: 'deck' });
  blocked.added[0].onerror();
  assert.doesNotThrow(() => blocked.w.KAnalytics.track('sail_mode', { mode: 'quick' }));

  const broken = page({}, 'Тренажёр');
  loadCounter(broken);
  broken.w.goatcounter.count = () => { throw new Error('сбой в count.js'); };
  assert.doesNotThrow(() => broken.w.KAnalytics.track('sail_mode', { mode: 'deck' }));
});
