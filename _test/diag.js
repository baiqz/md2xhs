/* 分页诊断：打印每一页的条目与坐标 */
const fs = require('fs');
const path = require('path');
require('../js/util.js');
require('../js/md.js');
require('../js/themes.js');

function makeCtx(w, h) {
  const t = { texts: [] };
  const noop = () => { };
  return {
    _t: t, canvas: { width: w, height: h },
    font: '', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, textAlign: 'left', textBaseline: 'alphabetic',
    globalAlpha: 1, shadowColor: '', shadowBlur: 0, shadowOffsetY: 0,
    save: noop, restore: noop, translate: noop, rotate: noop, scale: noop, clip: noop, closePath: noop,
    beginPath: noop, moveTo: noop, lineTo: noop, arc: noop, arcTo: noop, quadraticCurveTo: noop, bezierCurveTo: noop,
    fill: noop, stroke: noop, fillRect: noop, strokeText: noop, drawImage: noop, setLineDash: noop, clearRect: noop,
    fillText: function (s, x, y) { t.texts.push({ s: s, x: Math.round(x), y: Math.round(y) }); },
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => null,
    measureText: function (txt) {
      const m = /(\d+(?:\.\d+)?)px/.exec(this.font);
      const s = m ? parseFloat(m[1]) : 40;
      let w2 = 0;
      for (const ch of String(txt)) w2 += /[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef\u3040-\u30ff]/.test(ch) ? s : s * 0.55;
      return { width: w2 };
    }
  };
}

global.document = {
  createElement: function () {
    const wrap = { _w: 0, _h: 0, _ctx: null };
    Object.defineProperty(wrap, 'width', { get() { return this._w; }, set(v) { this._w = v; } });
    Object.defineProperty(wrap, 'height', { get() { return this._h; }, set(v) { this._h = v; } });
    wrap.getContext = function () { if (!this._ctx) this._ctx = makeCtx(this._w, this._h); return this._ctx; };
    return wrap;
  }
};
require('../js/render.js');
const MD = global.MD, RENDER = global.RENDER;

const sample = fs.readFileSync(path.join(__dirname, 'sample.md'), 'utf8');
const opts = {
  width: 1080, ratio: '3:4', themeId: process.env.THEME || 'dark', styleId: process.env.STYLE || 'magazine',
  fontId: 'serif', fontScale: 0.040, padRatio: 0.085, account: '@大豆的笔记',
  endText: '点赞', cover: true, end: true, pageNum: true, header: true
};
const pages = RENDER.renderSync(MD.parse(sample), opts, {});
const out = [];
out.push('theme=' + opts.themeId + ' style=' + opts.styleId + ' pages=' + pages.length);
pages.forEach((p, i) => {
  const t = p.canvas._ctx._t;
  out.push('--- page ' + (i + 1) + ' (' + p.type + ') texts=' + t.texts.length);
  // 只保留 x ≈ 92 或 92+inset 的正文行（过滤掉表格/装饰），按 y 排序
  t.texts.sort((a, b) => a.y - b.y).forEach(o => {
    if (o.y > 200 && o.x < 700) out.push('    y=' + o.y + ' x=' + o.x + '  ' + o.s);
  });
});
fs.writeFileSync(path.join(__dirname, 'diag.txt'), out.join('\n'), 'utf8');
