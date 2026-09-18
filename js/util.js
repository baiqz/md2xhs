/* ===== 通用工具 ===== */
(function (root) {
  'use strict';

  const $ = (s, el) => (el || document).querySelector(s);

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function debounce(fn, wait) {
    let t = 0;
    return function () {
      const args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(self, args), wait);
    };
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function stamp() {
    const d = new Date();
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
  }

  function dateCN() {
    const d = new Date();
    return d.getFullYear() + '.' + pad2(d.getMonth() + 1) + '.' + pad2(d.getDate());
  }

  /** hex -> rgba */
  function hexA(hex, a) {
    if (!hex) return 'rgba(0,0,0,0)';
    let h = String(hex).replace('#', '').trim();
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  /** 线性插值两个 hex 颜色 */
  function mix(c1, c2, t) {
    const p = h => {
      let x = String(h).replace('#', '');
      if (x.length === 3) x = x.split('').map(c => c + c).join('');
      return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)];
    };
    const a = p(c1), b = p(c2);
    const r = a.map((v, i) => Math.round(v + (b[i] - v) * t));
    return '#' + r.map(v => v.toString(16).padStart(2, '0')).join('');
  }

  /** 亮度（0-1） */
  function lum(hex) {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function toast(msg) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('on'), 2200);
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

  root.U = { $, download, debounce, stamp, dateCN, hexA, mix, lum, toast, sleep, nextFrame, pad2 };
})(typeof globalThis !== 'undefined' ? globalThis : this);
