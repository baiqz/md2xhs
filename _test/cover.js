/* 封面配图专项测试：4 种样式 × 横/竖/方 图源 × 4 种画布比例 + 加载失败兜底 */
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
    w.getContext = function () {
      if (!this._inst) this._inst = napi.createCanvas(this._w || 1, this._h || 1);
      const c = this._inst.getContext('2d'); c.textBaseline = 'middle'; return c;
    };
    return w;
  }
};
require('../js/render.js');
const MD = global.MD, RENDER = global.RENDER;

const outDir = path.join(__dirname, 'out3');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

/* 造三张测试图：横向 / 竖向 / 正方（带透明角的正方图用于测 alpha 分支） */
function buildImage(w, h, label) {
  const c = napi.createCanvas(w, h);
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#3ba7ff');
  g.addColorStop(1, '#7c4dff');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(255,255,255,.9)';
  x.beginPath(); x.arc(w * 0.5, h * 0.42, Math.min(w, h) * 0.2, 0, 7); x.fill();
  x.fillStyle = 'rgba(0,0,0,.35)';
  x.fillRect(0, h * 0.78, w, h * 0.22);
  x.fillStyle = '#fff';
  x.font = 'bold ' + Math.round(Math.min(w, h) * 0.16) + 'px sans-serif';
  x.textAlign = 'center';
  x.fillText(label, w / 2, h * 0.88);
  return { buf: c.toBuffer('image/png'), w: w, h: h };
}

function square() {
  const s = 600, c = napi.createCanvas(s, s), x = c.getContext('2d');
  x.clearRect(0, 0, s, s);
  x.fillStyle = '#ff8a5c';
  x.beginPath(); x.arc(s / 2, s / 2, s * 0.42, 0, 7); x.fill();
  x.fillStyle = '#fff';
  x.font = 'bold 130px sans-serif'; x.textAlign = 'center';
  x.fillText('头像', s / 2, s * 0.62);
  return { buf: c.toBuffer('image/png'), w: s, h: s };
}

const srcs = {
  wide: buildImage(1200, 700, 'LANDSCAPE 1.71'),
  tall: buildImage(720, 1100, 'PORTRAIT 0.65'),
  square: square()
};

const sample = fs.readFileSync(path.join(__dirname, 'sample.md'), 'utf8');
const report = [];

(async function main() {
  for (const k of Object.keys(srcs)) {
    const im = await napi.loadImage(srcs[k].buf);
    srcs[k].img = im;
  }
  const imgMap = {
    'img:wide': { img: srcs.wide.img, w: srcs.wide.w, h: srcs.wide.h },
    'img:tall': { img: srcs.tall.img, w: srcs.tall.w, h: srcs.tall.h },
    'img:square': { img: srcs.square.img, w: srcs.square.w, h: srcs.square.h }
  };

  const shapes = ['rounded', 'plain', 'circle', 'polaroid'];
  const sizes = ['sm', 'md', 'lg', 'xl'];
  const ratios = ['3:4', '4:5', '1:1', '9:16'];

  // 1) 4 种样式 × 3 种图源（md 尺寸）
  for (const sh of shapes) {
    for (const k of ['wide', 'tall', 'square']) {
      const tag = 'shape-' + sh + '-' + k;
      const opts = {
        width: 1080, ratio: '3:4', themeId: 'cream', styleId: 'board', fontId: 'sans',
        fontScale: 0.040, padRatio: 0.085, account: '@大豆的笔记', endText: '点赞 · 收藏 · 关注不迷路',
        cover: true, end: true, pageNum: true, header: true,
        coverImg: 'img:' + k, coverImgSize: 'md', coverImgShape: sh
      };
      try {
        const pages = RENDER.renderSync(MD.parse(sample), opts, imgMap);
        const cover = pages[0];
        fs.writeFileSync(path.join(outDir, tag + '.png'), cover.canvas._inst.toBuffer('image/png'));
        report.push('OK   ' + tag + ' pages=' + pages.length + ' type0=' + cover.type);
      } catch (e) {
        report.push('FAIL ' + tag + ' ' + e.message + ' @ ' + (e.stack.split('\n')[1] || '').trim());
      }
    }
  }

  // 2) 4 种尺寸档位 → 配图应逐档变大（用竖向图，保证高度受空间约束）
  for (const sz of sizes) {
    const opts = {
      width: 1080, ratio: '3:4', themeId: 'dark', styleId: 'journal', fontId: 'sans',
      fontScale: 0.040, padRatio: 0.085, account: '@测试', endText: '关注我',
      cover: true, end: true, pageNum: true, header: true,
      coverImg: 'img:tall', coverImgSize: sz, coverImgShape: 'rounded'
    };
    try {
      const pages = RENDER.renderSync(MD.parse(sample), opts, imgMap);
      fs.writeFileSync(path.join(outDir, 'size-' + sz + '.png'), pages[0].canvas._inst.toBuffer('image/png'));
      report.push('OK   size-' + sz + ' pages=' + pages.length);
    } catch (e) { report.push('FAIL size-' + sz + ' ' + e.message); }
  }

  // 3) 4 种画布比例
  for (const rt of ratios) {
    const opts = {
      width: 1080, ratio: rt, themeId: 'sakura', styleId: 'minimal', fontId: 'serif',
      fontScale: 0.040, padRatio: 0.085, account: '@测试', endText: '关注我',
      cover: true, end: true, pageNum: true, header: true,
      coverImg: 'img:tall', coverImgSize: 'lg', coverImgShape: 'polaroid'
    };
    try {
      const pages = RENDER.renderSync(MD.parse(sample), opts, imgMap);
      const cv = pages[0].canvas;
      fs.writeFileSync(path.join(outDir, 'ratio-' + rt.replace(':', 'x') + '.png'), cv._inst.toBuffer('image/png'));
      report.push('OK   ratio-' + rt + ' size=' + cv.width + 'x' + cv.height + ' pages=' + pages.length);
    } catch (e) { report.push('FAIL ratio-' + rt + ' ' + e.message); }
  }

  // 4) 兜底：配图加载失败（images 里没有该项）→ 不应抛错，退化为无图封面
  try {
    const opts = {
      width: 1080, ratio: '3:4', themeId: 'cream', styleId: 'board', fontId: 'sans',
      fontScale: 0.040, padRatio: 0.085, account: '', endText: '',
      cover: true, end: true, pageNum: true, header: true,
      coverImg: 'img:missing', coverImgSize: 'md', coverImgShape: 'polaroid'
    };
    const pages = RENDER.renderSync(MD.parse(sample), opts, imgMap);
    report.push('OK   missing-image fallback pages=' + pages.length + ' type0=' + pages[0].type);
  } catch (e) { report.push('FAIL missing-image ' + e.message); }

  // 5) 极长标题 + 配图：不应把文字挤出画布
  try {
    const longMd = '# ' + '这是一个相当长的封面标题需要换行处理'.repeat(4) + '\n\n正文内容。';
    const opts = {
      width: 1080, ratio: '3:4', themeId: 'ocean', styleId: 'bold', fontId: 'sans',
      fontScale: 0.040, padRatio: 0.085, account: '', endText: '',
      cover: true, end: true, pageNum: true, header: true,
      coverImg: 'img:wide', coverImgSize: 'xl', coverImgShape: 'circle'
    };
    const pages = RENDER.renderSync(MD.parse(longMd), opts, imgMap);
    fs.writeFileSync(path.join(outDir, 'long-title.png'), pages[0].canvas._inst.toBuffer('image/png'));
    report.push('OK   long-title+circle pages=' + pages.length);
  } catch (e) { report.push('FAIL long-title ' + e.message + ' @ ' + (e.stack.split('\n')[1] || '').trim()); }

  // 6) 关闭封面页 → 配图不应出现，也不应报错
  try {
    const opts = {
      width: 1080, ratio: '3:4', themeId: 'cream', styleId: 'board', fontId: 'sans',
      fontScale: 0.040, padRatio: 0.085, account: '', endText: '',
      cover: false, end: true, pageNum: true, header: true,
      coverImg: 'img:wide', coverImgSize: 'md', coverImgShape: 'rounded'
    };
    const pages = RENDER.renderSync(MD.parse(sample), opts, imgMap);
    report.push('OK   cover-off pages=' + pages.length + ' types=' + pages.map(p => p.type).join(','));
  } catch (e) { report.push('FAIL cover-off ' + e.message); }

  fs.writeFileSync(path.join(__dirname, 'cover-log.txt'), report.join('\n'), 'utf8');
  console.log(report.join('\n'));
})();
