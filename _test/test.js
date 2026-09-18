/* 离线自测：Markdown 解析 + 断行 + ZIP 打包 */
const fs = require('fs');
const path = require('path');
const MD = require('../js/md.js');
const ZIP = require('../js/zip.js');

const sample = fs.readFileSync(path.join(__dirname, 'sample.md'), 'utf8');
const blocks = MD.parse(sample);
const log = [];
log.push('块数量: ' + blocks.length);
log.push('块类型序列: ' + blocks.map(b => b.type + (b.items ? '(' + b.items.length + ')' : '')).join(' '));

// 模拟 canvas 测量上下文（中文按 1em、英文按 0.55em 估算）
const ctx = {
  font: '',
  _size() { const m = /(\d+(?:\.\d+)?)px/.exec(this.font); return m ? parseFloat(m[1]) : 40; },
  measureText(t) {
    const s = this._size();
    let w = 0;
    for (const ch of t) w += /[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? s : s * 0.55;
    return { width: w };
  }
};
const padOf = tk => (tk.seg.code ? tk.seg.size * 0.36 : 0);
const fontFor = s => (s.italic ? 'italic ' : '') + (s.bold ? 700 : 400) + ' ' + s.size + 'px x';
const tok = (t, size, w) => { const segs = MD.parseInline(t); segs.forEach(s => { s.size = size; s.weight = w || 400; }); return MD.tokenize(segs, fontFor); };

const lines = MD.wrap(ctx, tok(sample.split('\n')[0].replace(/^#\s*/, ''), 80, 700), 900, padOf);
log.push('标题断行数: ' + lines.length + ' -> ' + lines.map(l => l.map(t => t.t).join('')).join(' / '));

// 行内样式解析
log.push('行内解析: ' + JSON.stringify(MD.parseInline('这是**加粗**和*斜体*还有`代码`与==高亮==以及~~删除~~和[链接](http://a.com)')));

// 表格识别
const tb = blocks.filter(b => b.type === 'table')[0];
log.push('表格: ' + (tb ? tb.header.length + ' 列 / ' + tb.rows.length + ' 行' : '未识别'));

// ZIP 打包校验
const enc = new TextEncoder();
const files = [];
for (let i = 0; i < 5; i++) {
  const data = enc.encode('page-' + (i + 1) + '-'.repeat(500) + '中文内容测试');
  files.push({ name: '0' + (i + 1) + '.png', data: data });
}
const zipBytes = ZIP.create(files);
fs.writeFileSync(path.join(__dirname, 'out-test.zip'), Buffer.from(zipBytes));
log.push('ZIP 大小: ' + zipBytes.length + ' 字节, crc32(abc)=' + ZIP.crc32(enc.encode('abc')).toString(16));

fs.writeFileSync(path.join(__dirname, 'log.txt'), log.join('\n'), 'utf8');
console.log(log.join('\n'));
