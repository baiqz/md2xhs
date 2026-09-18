/* 边界场景测试：空文稿 / 只有标题 / 关闭封面 / 各种比例 / 无署名 */
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

const base = {
  width: 1080, ratio: '3:4', themeId: 'mint', styleId: 'board', fontId: 'sans',
  fontScale: 0.040, padRatio: 0.085, account: '@测试', endText: '关注我',
  cover: true, end: true, pageNum: true, header: true
};
const cases = [
  ['空文稿', ''],
  ['只有标题', '# 只有一个标题'],
  ['关闭封面', '# 标题\n\n## 小节\n\n正文内容。'],
  ['无署名无页码', '# 标题\n\n正文。\n\n- a\n- b'],
  ['超长表格', '# 表\n\n| A | B | C | D |\n| --- | --- | --- | --- |\n' + Array.from({ length: 12 }).map((_, i) => `| 行${i}内容比较长一点 | 值${i} | x${i} | y${i} |`).join('\n')],
  ['超长无空格串', '# 标题\n\n' + 'A'.repeat(300)],
  ['代码块超长', '# 代码\n\n```\n' + Array.from({ length: 40 }).map((_, i) => 'line ' + i + ' // 这是一行比较长的注释内容用于测试分页').join('\n') + '\n```']
];
const ratios = ['3:4', '1:1', '9:16', '4:5'];
const out = [];
const outDir = path.join(__dirname, 'out2');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

cases.forEach(([name, md]) => {
  ratios.forEach(rt => {
    const o = Object.assign({}, base, { ratio: rt });
    if (name === '关闭封面') o.cover = false;
    if (name === '无署名无页码') { o.account = ''; o.pageNum = false; o.header = false; }
    try {
      const pages = RENDER.renderSync(MD.parse(md), o, {});
      const dims = pages.length ? [pages[0].canvas.width, pages[0].canvas.height] : ['-', '-'];
      out.push('OK   ' + name + ' [' + rt + '] pages=' + pages.length + ' size=' + dims.join('x') + ' types=' + pages.map(p => p.type[0]).join(''));
      if (rt === '3:4') {
        const last = pages[pages.length - 1];
        fs.writeFileSync(path.join(outDir, name + '-last.png'), last.canvas._inst.toBuffer('image/png'));
        if (pages[0].type === 'cover') fs.writeFileSync(path.join(outDir, name + '-cover.png'), pages[0].canvas._inst.toBuffer('image/png'));
      }
    } catch (e) {
      out.push('FAIL ' + name + ' [' + rt + '] ' + e.message + ' @ ' + (e.stack.split('\n')[1] || '').trim());
    }
  });
});
fs.writeFileSync(path.join(__dirname, 'edge-log.txt'), out.join('\n'), 'utf8');
console.log(out.join('\n'));
