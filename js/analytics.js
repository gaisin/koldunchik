/* ============================================================
   Колдунчик - статистика посещений (GoatCounter)
   Без cookie и персональных данных. Счётчик загружается только
   на gaisin.github.io: при локальном запуске ничего не уходит.
   Подключается в <head>; data-title у тега - название страницы
   в отчётах, одно на оба языка.
   ============================================================ */
(function (G) {
'use strict';
const live = G.location.hostname === 'gaisin.github.io';
let queue = [];  // события до загрузки count.js; null, когда он загрузился или заблокирован

const token = v => String(v).replace(/[^\w.-]/g, '');
function send(hit) {
  try { if (G.goatcounter && G.goatcounter.count) G.goatcounter.count(hit); } catch (e) { /* статистика не мешает сайту */ }
}
// событие уходит как путь «имя ключ=значение …»: в параметрах только идентификаторы и числа
function track(name, params) {
  if (!live) return;
  try {
    const p = params || {};
    const path = [token(name)].concat(Object.keys(p).map(k => token(k) + '=' + token(p[k]))).join(' ');
    const hit = { path, title: '', referrer: '', event: true };
    if (queue) queue.push(hit); else send(hit);
  } catch (e) { /* статистика не мешает сайту */ }
}

if (live) {
  const me = G.document.currentScript;
  // просмотр страницы count.js считает сам, один раз за загрузку; хеш #ru/#en в путь не попадает
  G.goatcounter = { path: G.location.pathname.replace(/index\.html$/, ''), title: (me && me.dataset.title) || '' };
  const s = G.document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.dataset.goatcounter = 'https://koldunchik.goatcounter.com/count';
  s.onload = () => { const q = queue; queue = null; q.forEach(send); };
  s.onerror = () => { queue = null; };
  G.document.head.appendChild(s);
}
G.KAnalytics = { track };
})(window);
