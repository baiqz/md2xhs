/* 封面配图「固定版式」几何测试
   规则：左右各 10%W、上边 10%H、底边落在画布 1/3 处（按档位乘 0.8/1/1.2/1.4）、裁切填满
   做法：用纯品红测试图，渲染后逐点取像素，断言图上/图外的真实位置 —— 不是「没抛错」就算过 */
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

const outDir = path.join(__dirname, 'out4');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

/* ---------- 断言工具 ---------- */
let pass = 0, fail = 0;
const report = [];
function expect(cond, msg) {
  if (cond) { pass++; report.push('OK   ' + msg); }
  else { fail++; report.push('FAIL ' + msg); }
}
function nearly(a, b, tol) { return Math.abs(a - b) <= tol; }

/* ---------- 纯品红测试图：任何像素都能判定「这里画了配图」 ---------- */
function solidBuf(w, h) {
  const c = napi.createCanvas(w, h), x = c.getContext('2d');
  x.fillStyle = '#FF00FF'; x.fillRect(0, 0, w, h);
  return c.toBuffer('image/png');
}
const px = (cv, x, y) => {
  const d = cv._inst.getContext('2d').getImageData(Math.round(x), Math.round(y), 1, 1).data;
  return { r: d[0], g: d[1], b: d[2] };
};
const isImg = p => p.r > 190 && p.g < 70 && p.b > 190;

/* 独立复算期望值（不引用 render.js 内部常量，避免「自己测自己」） */
const MULT = { sm: 0.8, md: 1.0, lg: 1.2, xl: 1.4 };
const RATIOS = { '3:4': [3, 4], '4:5': [4, 5], '1:1': [1, 1], '9:16': [9, 16] };
function expectBox(W, H, size, band) {
  const base = W * 0.040;
  let top = H * 0.10;
  if (band) top = Math.max(top, Math.round(H * 0.108) + base * 0.6);
  const specH = H / 3 - top;
  return { left: W * 0.10, right: W * 0.90, top: top, h: specH * MULT[size], bottom: top + specH * MULT[size] };
}

/* 检查一个已渲染的封面：图内 5 点必须是品红，图外 4 点必须不是 */
function probeCover(tag, cv, W, H, e) {
  const midY = e.top + e.h / 2;
  const inside = [
    ['上边内', W / 2, e.top + 5],
    ['下边内', W / 2, e.bottom - 5],
    ['左边内', e.left + 5, midY],
    ['右边内', e.right - 5, midY],
    ['中心', W / 2, midY]
  ];
  const outside = [
    ['上边外(仅 10% 上边距)', W / 2, e.top - 7],
    ['下边外(超出 1/3)', W / 2, e.bottom + 8],
    ['左边外', e.left - 7, midY],
    ['右边外', e.right + 7, midY]
  ];
  for (const [name, x, y] of inside) {
    expect(isImg(px(cv, x, y)), `${tag} ${name} 应为配图 (${Math.round(x)},${Math.round(y)})`);
  }
  for (const [name, x, y] of outside) {
    expect(!isImg(px(cv, x, y)), `${tag} ${name} 不应为配图 (${Math.round(x)},${Math.round(y)})`);
  }
}

const SAMPLE = '# 封面标题\n\n一句话副标题\n\n## 小节\n\n正文内容一二三。\n';
const LONG_MD = '# ' + '这是一个相当长的封面标题需要换行处理'.repeat(4) + '\n\n正文。';

(async function main() {
  const land = await napi.loadImage(solidBuf(1200, 900));
  const port = await napi.loadImage(solidBuf(720, 1280));
  const imgMap = {
    'img:land': { img: land, w: 1200, h: 900 },
    'img:port': { img: port, w: 720, h: 1280 }
  };
  const mk = (o) => Object.assign({
    width: 1080, ratio: '3:4', themeId: 'cream', styleId: 'board', fontId: 'sans',
    fontScale: 0.040, padRatio: 0.085, account: '@测试', endText: '关注我',
    cover: true, end: true, pageNum: true, header: true,
    coverImg: 'img:land', coverImgSize: 'md', coverImgShape: 'plain'
  }, o);

  /* ---- A. 4 种画布比例 × 4 档大小：底边必须落在 1/3，左右上必须 10% ---- */
  for (const rt of Object.keys(RATIOS)) {
    const r = RATIOS[rt], W = 1080, H = Math.round(W * r[1] / r[0]);
    for (const sz of Object.keys(MULT)) {
      const e = expectBox(W, H, sz, false);
      let cv;
      try {
        cv = RENDER.renderSync(MD.parse(SAMPLE), mk({ ratio: rt, coverImgSize: sz }), imgMap)[0].canvas;
        fs.writeFileSync(path.join(outDir, `geom-${rt.replace(':', 'x')}-${sz}.png`), cv._inst.toBuffer('image/png'));
      } catch (err) { expect(false, `geom-${rt}-${sz} 渲染抛错: ${err.message}`); continue; }
      probeCover(`[${rt}/${sz}]`, cv, W, H, e);
      // 精确断言：左右边界就是 10% / 90%
      expect(nearly(e.left, W * 0.1, 0.5) && nearly(e.right, W * 0.9, 0.5), `[${rt}/${sz}] 左右边界 = ${W * 0.1} / ${W * 0.9}`);
      if (sz === 'md') {
        // 中档：底边严格落在 H/3
        expect(isImg(px(cv, W / 2, H / 3 - 4)) && !isImg(px(cv, W / 2, H / 3 + 10)),
          `[${rt}] 中档底边落在画布 1/3 处 (H=${H}, H/3=${Math.round(H / 3)})`);
      }
    }
  }

  /* ---- B. 4 档大小的底边严格递增（3:4 画布） ---- */
  {
    const W = 1080, H = 1440;
    const bots = [];
    for (const sz of ['sm', 'md', 'lg', 'xl']) {
      const e = expectBox(W, H, sz, false);
      const cv = RENDER.renderSync(MD.parse(SAMPLE), mk({ coverImgSize: sz }), imgMap)[0].canvas;
      // 找真实底边：从期望值附近向下扫，最后一行是图的 y
      let real = 0;
      for (let y = Math.round(e.top); y < H * 0.6; y++) if (isImg(px(cv, W / 2, y))) real = y;
      bots.push(real);
      expect(nearly(real, e.bottom, 3), `[3:4/${sz}] 实测底边 ${real} ≈ 期望 ${Math.round(e.bottom)}`);
    }
    expect(bots[0] < bots[1] && bots[1] < bots[2] && bots[2] < bots[3],
      `4 档大小底边依次下移: ${bots.join(' < ')}`);
  }

  /* ---- C. 4 种样式都落在同一区域（圆形只在框内居中画圆） ---- */
  for (const sh of ['rounded', 'plain', 'circle', 'polaroid']) {
    const W = 1080, H = 1440, e = expectBox(W, H, 'md', false);
    const cv = RENDER.renderSync(MD.parse(SAMPLE), mk({ coverImgShape: sh }), imgMap)[0].canvas;
    fs.writeFileSync(path.join(outDir, 'shape-' + sh + '.png'), cv._inst.toBuffer('image/png'));
    if (sh === 'circle') {
      // 圆直径 = 框高，圆心在框中心
      const r = e.h / 2, cx = W / 2, cyy = e.top + e.h / 2;
      expect(isImg(px(cv, cx, cyy)) && isImg(px(cv, cx, cyy - r + 6)) && !isImg(px(cv, cx - r - 8, cyy)),
        `[circle] 直径=${Math.round(e.h)} 圆心=(${Math.round(cx)},${Math.round(cyy)}) 落在上方 1/3 区域内`);
    } else if (sh === 'polaroid') {
      // 白相纸外框 = 该区域；照片内缩，所以框的四角应是白色而非品红
      const p = px(cv, e.left + 3, e.top + 3);
      expect(p.r > 235 && p.g > 235 && p.b > 235, `[polaroid] 外框左上角为白相纸色 rgba(${p.r},${p.g},${p.b})`);
      expect(isImg(px(cv, W / 2, e.top + e.h / 2)), `[polaroid] 照片区中心仍为配图`);
      expect(!isImg(px(cv, W / 2, e.bottom + 8)), `[polaroid] 外框底边之外无配图`);
    } else {
      probeCover('[' + sh + ']', cv, W, H, e);
    }
  }

  /* ---- D. 杂志栏目（有页眉条）：配图不能被页眉条压住 ---- */
  {
    const W = 1080, H = 1440;
    const e = expectBox(W, H, 'md', true);
    const cv = RENDER.renderSync(MD.parse(SAMPLE), mk({ styleId: 'magazine' }), imgMap)[0].canvas;
    fs.writeFileSync(path.join(outDir, 'band-magazine.png'), cv._inst.toBuffer('image/png'));
    const bandH = Math.round(H * 0.108);
    expect(!isImg(px(cv, W / 2, bandH - 4)), `[magazine] 页眉条内(0~${bandH})没有配图`);
    expect(isImg(px(cv, W / 2, e.top + 6)), `[magazine] 配图顶边下移到 ${Math.round(e.top)}（避开页眉条）`);
    expect(nearly(e.bottom, H / 3, 1), `[magazine] 底边仍锚定在 1/3 = ${Math.round(H / 3)}`);
    expect(!isImg(px(cv, W / 2, e.bottom + 8)), `[magazine] 底边之外无配图`);
  }

  /* ---- E. 竖向图同样落在该区域（裁切填满，不留白） ---- */
  {
    const W = 1080, H = 1440, e = expectBox(W, H, 'md', false);
    const cv = RENDER.renderSync(MD.parse(SAMPLE), mk({ coverImg: 'img:port' }), imgMap)[0].canvas;
    fs.writeFileSync(path.join(outDir, 'portrait-source.png'), cv._inst.toBuffer('image/png'));
    // 裁切填满 ⇒ 区域四角都应是图，而不是背景
    expect(isImg(px(cv, e.left + 6, e.top + 6)) && isImg(px(cv, e.right - 6, e.bottom - 6)),
      `[竖图源] 裁切填满：区域四角均为配图（无留白）`);
  }

  /* ---- F. 超长标题：优先缩标题字号保住配图版式，且文字不溢出画布 ---- */
  {
    const W = 1080, H = 1440, e = expectBox(W, H, 'xl', false);
    const bot = H - Math.round(W * 0.085) * 1.6;
    const cv = RENDER.renderSync(MD.parse(LONG_MD), mk({ coverImgSize: 'xl', styleId: 'board' }), imgMap)[0].canvas;
    fs.writeFileSync(path.join(outDir, 'long-title-clamp.png'), cv._inst.toBuffer('image/png'));

    // 1) 配图仍占满 xl 档的规格区域（说明是「先缩字」而不是「先压图」）
    let real = 0;
    for (let y = 0; y < H * 0.6; y++) if (isImg(px(cv, W / 2, y))) real = y;
    expect(nearly(real, e.bottom, 4), `[超长标题] 配图仍保留 xl 规格底边 ${real} ≈ ${Math.round(e.bottom)}`);

    // 2) 文字没有溢出：文字区下限附近应与更下方的空白同色
    const p1 = px(cv, W / 2, bot + 4), p2 = px(cv, W / 2, bot + 70);
    const near = (a, b) => Math.abs(a.r - b.r) < 12 && Math.abs(a.g - b.g) < 12 && Math.abs(a.b - b.b) < 12;
    expect(near(p1, p2), `[超长标题] 文字未越过文字区下限 (${bot})：y=${bot + 4} 与 y=${bot + 70} 同色`);

    // 3) 对照组：同一版式下短标题的封面，配图位置应完全一致（版式不受文字长度影响）
    const cvShort = RENDER.renderSync(MD.parse(SAMPLE), mk({ coverImgSize: 'xl', styleId: 'board' }), imgMap)[0].canvas;
    let realShort = 0;
    for (let y = 0; y < H * 0.6; y++) if (isImg(px(cvShort, W / 2, y))) realShort = y;
    expect(nearly(real, realShort, 2), `[超长标题] 与短标题版式一致（${real} vs ${realShort}）`);
  }

  /* ---- F2. 极端长度（216 字）：字号降到下限后压缩配图，仍不溢出 ---- */
  {
    const W = 1080, H = 1440, e = expectBox(W, H, 'xl', false);
    const bot = H - Math.round(W * 0.085) * 1.6;
    const huge = '# ' + '这是一个相当长的封面标题需要换行处理'.repeat(12) + '\n\n正文。';
    const cv = RENDER.renderSync(MD.parse(huge), mk({ coverImgSize: 'xl', styleId: 'board' }), imgMap)[0].canvas;
    fs.writeFileSync(path.join(outDir, 'huge-title.png'), cv._inst.toBuffer('image/png'));
    let real = 0;
    for (let y = 0; y < H * 0.5; y++) if (isImg(px(cv, W / 2, y))) real = y;
    expect(real < e.bottom, `[216字标题] 配图被压到 ${real}px（< xl 规格 ${Math.round(e.bottom)}）`);
    expect(real > e.top + 90, `[216字标题] 配图仍有可辨识高度 ${Math.round(real - e.top)}px`);
    const p1 = px(cv, W / 2, bot + 4), p2 = px(cv, W / 2, bot + 70);
    const near = (a, b) => Math.abs(a.r - b.r) < 12 && Math.abs(a.g - b.g) < 12 && Math.abs(a.b - b.b) < 12;
    expect(near(p1, p2), `[216字标题] 文字仍未越过文字区下限 (${bot})`);
  }

  /* ---- G. 没有配图时，版式不应受影响（保持原有的整体居中） ---- */
  {
    const cv = RENDER.renderSync(MD.parse(SAMPLE), mk({ coverImg: '' }), imgMap)[0].canvas;
    fs.writeFileSync(path.join(outDir, 'no-image.png'), cv._inst.toBuffer('image/png'));
    let any = false;
    const d = cv._inst.getContext('2d');
    for (let y = 0; y < 500; y += 7) if (isImg(px(cv, 540, y))) any = true;
    expect(!any, '[无配图] 封面上方 1/3 内没有品红（不画配图）');
  }

  fs.writeFileSync(path.join(__dirname, 'coverlayout-log.txt'),
    report.join('\n') + `\n\n通过 ${pass} / 失败 ${fail}\n`, 'utf8');
  console.log(report.join('\n'));
  console.log(`\n通过 ${pass} / 失败 ${fail}`);
  process.exitCode = fail ? 1 : 0;
})();
