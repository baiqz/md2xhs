/* 静态校验：app.js 里 $('#xxx') 引用的元素 id 是否都在 index.html 中存在 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const ed = fs.readFileSync(path.join(root, 'js', 'editor.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

const ids = new Set();
const idRe = /\sid="([^"]+)"/g; let m;
while ((m = idRe.exec(html))) ids.add(m[1]);

const used = new Set();
const useRe = /\$\('#([A-Za-z0-9_-]+)'\)|getElementById\('([A-Za-z0-9_-]+)'\)|toolbar:\s*'#([A-Za-z0-9_-]+)'/g;
while ((m = useRe.exec(app))) used.add(m[1] || m[2] || m[3]);
// editor.js 里用字符串选择器引用的元素（工具栏 / 快捷键面板）
const edRefs = new Set();
const edRe = /querySelector\('#([A-Za-z0-9_-]+)'\)|getElementById\('([A-Za-z0-9_-]+)'\)/g;
while ((m = edRe.exec(ed))) edRefs.add(m[1] || m[2]);
edRefs.forEach(x => used.add(x));
const edMissing = [...edRefs].filter(x => !ids.has(x));

const missing = [...used].filter(x => !ids.has(x));
const unused = [...ids].filter(x => !used.has(x) && !/#[A-Za-z0-9_-]+/.test(css.split('\n').filter(l => l.includes('#' + x)).join('')));

const out = [];
out.push('html ids      = ' + ids.size);
out.push('app refs      = ' + used.size);
out.push('editor refs   = ' + edRefs.size + ' (' + [...edRefs].join(', ') + ')');
out.push('MISSING in html: ' + (missing.length ? missing.join(', ') : '(none)'));
out.push('editor.js MISSING in html: ' + (edMissing.length ? edMissing.join(', ') : '(none)'));
out.push('html ids not referenced by $("#.."): ' + (unused.length ? unused.join(', ') : '(none)'));
out.push('');
out.push('--- 新增控件 ---');
['coverImgInput', 'coverImgDrop', 'coverImgThumb', 'coverImgPick', 'coverImgClear', 'coverImgName', 'coverImgOpts', 'coverImgSize', 'coverImgShape']
  .forEach(k => out.push('  ' + k + ' : html=' + ids.has(k) + ' app=' + used.has(k)));
out.push('');
out.push('--- 编辑工具栏 ---');
['mdbar', 'btnKeyHelp', 'keyHelp', 'md']
  .forEach(k => out.push('  ' + k + ' : html=' + ids.has(k) + ' ref=' + used.has(k)));
out.push('');
const cls = ['imgdrop', 'imgdrop-thumb', 'imgdrop-text', 'danger', 'imgsize', 'off',
  'mdbar', 'mdb', 'mdb-sep', 'keyhelp'];
out.push('CSS 类: ' + cls.map(c => c + '=' + (css.includes('.' + c) ? 'Y' : 'N')).join('  '));

// CSS 大括号配平（少一个花括号会让后面所有样式静默失效，肉眼很难看出来）
const open = (css.match(/{/g) || []).length;
const close = (css.match(/}/g) || []).length;
out.push('CSS 花括号: { ' + open + ' / } ' + close + ' → ' + (open === close ? '配平' : '不配平！'));
// 工具栏用到的 CSS 变量都必须在 :root 里定义
const vars = new Set();
const vRe = /--([a-z0-9-]+)\s*:/g;
while ((m = vRe.exec(css))) vars.add(m[1]);
const usedVars = new Set();
const uvRe = /var\(--([a-z0-9-]+)\)/g;
while ((m = uvRe.exec(css))) usedVars.add(m[1]);
const undef = [...usedVars].filter(v => !vars.has(v));
out.push('CSS 变量: 定义 ' + vars.size + ' 个 / 使用 ' + usedVars.size + ' 个 → 未定义: ' + (undef.length ? undef.join(', ') : '(none)'));

fs.writeFileSync(path.join(__dirname, 'domcheck.txt'), out.join('\n'), 'utf8');
console.log(out.join('\n'));
