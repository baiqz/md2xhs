/* 离线渲染验证：用 @napi-rs/canvas（若可用）或桩上下文跑通 render.js 并输出 PNG */
const fs = require('fs');
const path = require('path');

require('../js/util.js');
require('../js/md.js');
require('../js/themes.js');

let napi = null, mode = 'stub';
try { napi = require('@napi-rs/canvas'); mode = 'napi'; } catch (e) { mode = 'stub'; }

function makeCtx(w, h) {
  const t = { texts: [], maxY: 0, minY: 1e9, fills: 0 };
  const noop = () => { };
  const ctx = {
    _t: t, canvas: { width: w, height: h },
    font: '', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, textAlign: 'left', textBaseline: 'alphabetic',
    globalAlpha: 1, shadowColor: '', shadowBlur: 0, shadowOffsetY: 0,
    save: noop, restore: noop, translate: noop, rotate: noop, scale: noop, clip: noop, closePath: noop,
    beginPath: noop, moveTo: noop, lineTo: noop, arc: noop, arcTo: noop, quadraticCurveTo: noop, bezierCurveTo: noop,
    fill: function () { t.fills++; }, stroke: noop,
    fillRect: function (x, y, ww, hh) { t.fills++; t.maxY = Math.max(t.maxY, y + hh); },
    fillText: function (s, x, y) { t.texts.push({ s: s, x: x, y: y }); t.maxY = Math.max(t.maxY, y); t.minY = Math.min(t.minY, y); },
    strokeText: noop, drawImage: noop, setLineDash: noop, clearRect: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => null,
    measureText: function (txt) {
      const m = /(\d+(?:\.\d+)?)px/.exec(this.font);
      const s = m ? parseFloat(m[1]) : 40;
      let w2 = 0;
      for (const ch of String(txt)) w2 += /[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef\u3040-\u30ff]/.test(ch) ? s : s * 0.55;
      return { width: w2, actualBoundingBoxAscent: s * 0.8, actualBoundingBoxDescent: s * 0.2 };
    }
  };
  return ctx;
}

const canvases = [];
if (mode === 'napi') {
  global.document = {
    createElement: function () {
      const wrap = { _w: 0, _h: 0, _inst: null, _stub: null };
      Object.defineProperty(wrap, 'width', { get() { return this._w; }, set(v) { this._w = v; } });
      Object.defineProperty(wrap, 'height', { get() { return this._h; }, set(v) { this._h = v; } });
      wrap.getContext = function () {
        if (!this._inst) { this._inst = napi.createCanvas(this._w, this._h); const c = this._inst.getContext('2d'); c.textBaseline = 'middle'; }
        return this._inst.getContext('2d');
      };
      return wrap;
    }
  };
} else {
  global.document = {
    createElement: function () {
      const wrap = { _w: 0, _h: 0, _ctx: null };
      Object.defineProperty(wrap, 'width', { get() { return this._w; }, set(v) { this._w = v; } });
      Object.defineProperty(wrap, 'height', { get() { return this._h; }, set(v) { this._h = v; } });
      wrap.getContext = function () { if (!this._ctx) this._ctx = makeCtx(this._w, this._h); return this._ctx; };
      return wrap;
    }
  };
}

require('../js/render.js');
const MD = global.MD, RENDER = global.RENDER, TH = global.TH;

const sample = fs.readFileSync(path.join(__dirname, 'sample.md'), 'utf8');
const outDir = path.join(__dirname, 'out');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

const combos = JSON.parse(process.env.COMBOS || '[]');
const list = combos.length ? combos : [
  { themeId: 'cream', styleId: 'board', fontId: 'sans', tag: '1-cream-board-sans' },
  { themeId: 'dark', styleId: 'magazine', fontId: 'serif', tag: '2-dark-magazine-serif' },
  { themeId: 'paper', styleId: 'minimal', fontId: 'serif', tag: '3-paper-minimal-serif' },
  { themeId: 'sakura', styleId: 'journal', fontId: 'round', tag: '4-sakura-journal-round' },
  { themeId: 'y2k', styleId: 'bold', fontId: 'sans', tag: '5-y2k-bold-sans' },
  { themeId: 'ocean', styleId: 'gradient', fontId: 'sans', tag: '6-ocean-gradient-sans' }
];

const report = ['mode=' + mode];
for (const c of list) {
  const opts = {
    width: 1080, ratio: '3:4', themeId: c.themeId, styleId: c.styleId, fontId: c.fontId,
    fontScale: 0.040, padRatio: 0.085, account: '@大豆的笔记', endText: '点赞 · 收藏 · 关注不迷路',
    cover: true, end: true, pageNum: true, header: true
  };
  let pages;
  try { pages = RENDER.renderSync(MD.parse(sample), opts, {}); }
  catch (e) { report.push(c.tag + ' ERROR ' + e.stack.split('\n').slice(0, 3).join(' | ')); continue; }

  report.push(c.tag + ' pages=' + pages.length + ' types=' + pages.map(p => p.type).join(','));
  pages.forEach((p, i) => {
    const cv = p.canvas;
    if (mode === 'napi') {
      const buf = cv._inst.toBuffer('image/png');
      fs.writeFileSync(path.join(outDir, c.tag + '-' + (i + 1) + '.png'), buf);
    } else {
      const t = cv._ctx._t;
      report.push('   page' + (i + 1) + ' ops=' + t.fills + ' texts=' + t.texts.length + ' maxY=' + Math.round(t.maxY) + ' (H=1440)');
      const sampleTexts = t.texts.slice(0, 5).map(o => o.s).join('|');
      report.push('     head: ' + sampleTexts);
    }
  });
}

fs.writeFileSync(path.join(__dirname, 'render-log.txt'), report.join('\n'), 'utf8');
console.log(report.join('\n'));
