/* 生成示例图：带封面配图的封面页 */
const fs = require('fs');
const path = require('path');
require('../js/util.js');
require('../js/md.js');
require('../js/themes.js');
const napi = require('@napi-rs/canvas');
global.document = {
  createElement: function () {
    const w = { _w: 0, _h: 0, _inst: null };
    Object.defineProperty(w, 'width', { get() { return this._w; }, set(v) { this._w = v; } });
    Object.defineProperty(w, 'height', { get() { return this._h; }, set(v) { this._h = v; } });
    w.getContext = function () { if (!this._inst) this._inst = napi.createCanvas(this._w || 1, this._h || 1); const c = this._inst.getContext('2d'); c.textBaseline = 'middle'; return c; };
    return w;
  }
};
require('../js/render.js');
const MD = global.MD, RENDER = global.RENDER;

const outDir = path.join(__dirname, 'out3');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

// 造一张竖版「封面照」——模拟用户上传的图片
function shot(w, h, c1, c2, label) {
  const c = napi.createCanvas(w, h), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, c1); g.addColorStop(1, c2);
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(255,255,255,.22)';
  for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(w * (0.15 + i * 0.15), h * (0.2 + (i % 3) * 0.22), Math.min(w, h) * 0.09, 0, 7); x.fill(); }
  x.fillStyle = 'rgba(255,255,255,.9)';
  x.font = 'bold ' + Math.round(w * 0.11) + 'px sans-serif';
  x.textAlign = 'center';
  x.fillText(label, w / 2, h * 0.9);
  return c.toBuffer('image/png');
}

const md = fs.readFileSync(path.join(__dirname, 'sample.md'), 'utf8');

(async function () {
  const tall = await napi.loadImage(shot(800, 1000, '#ff9d6c', '#ff5d7a', 'PHOTO'));
  const wide = await napi.loadImage(shot(1200, 800, '#5ec8f2', '#2b6cff', 'PHOTO'));
  const sq = await napi.loadImage(shot(800, 800, '#3ddc97', '#0f8f6a', 'PHOTO'));

  const jobs = [
    ['09-cover-cream-rounded', { themeId: 'cream', styleId: 'board', fontId: 'sans', shape: 'rounded', size: 'md', key: 'tall' }],
    ['10-cover-dark-polaroid', { themeId: 'dark', styleId: 'journal', fontId: 'serif', shape: 'polaroid', size: 'md', key: 'tall' }],
    ['11-cover-sakura-circle', { themeId: 'sakura', styleId: 'bold', fontId: 'sans', shape: 'circle', size: 'md', key: 'sq' }],
    ['12-cover-ocean-plain', { themeId: 'ocean', styleId: 'gradient', fontId: 'sans', shape: 'plain', size: 'lg', key: 'wide' }]
  ];
  const map = {
    'img:tall': { img: tall, w: 800, h: 1000 },
    'img:wide': { img: wide, w: 1200, h: 800 },
    'img:sq': { img: sq, w: 800, h: 800 }
  };
  const log = [];
  for (const [name, j] of jobs) {
    const opts = {
      width: 1080, ratio: '3:4', themeId: j.themeId, styleId: j.styleId, fontId: j.fontId,
      fontScale: 0.040, padRatio: 0.085, account: '@大豆的笔记', endText: '点赞 · 收藏 · 关注不迷路',
      cover: true, end: true, pageNum: true, header: true,
      coverImg: 'img:' + j.key, coverImgSize: j.size, coverImgShape: j.shape
    };
    try {
      const pages = RENDER.renderSync(MD.parse(md), opts, map);
      fs.writeFileSync(path.join(outDir, name + '.png'), pages[0].canvas._inst.toBuffer('image/png'));
      log.push('OK   ' + name);
    } catch (e) { log.push('FAIL ' + name + ' ' + e.message); }
  }
  fs.writeFileSync(path.join(__dirname, 'sample-log.txt'), log.join('\n'), 'utf8');
  console.log(log.join('\n'));
})();
