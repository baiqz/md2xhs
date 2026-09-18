/* 静态校验：app.js 里 $('#xxx') 引用的元素 id 是否都在 index.html 中存在 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');

const ids = new Set();
const idRe = /\sid="([^"]+)"/g; let m;
while ((m = idRe.exec(html))) ids.add(m[1]);

const used = new Set();
const useRe = /\$\('#([A-Za-z0-9_-]+)'\)|getElementById\('([A-Za-z0-9_-]+)'\)/g;
while ((m = useRe.exec(app))) used.add(m[1] || m[2]);

const missing = [...used].filter(x => !ids.has(x));
const unused = [...ids].filter(x => !used.has(x) && !/#[A-Za-z0-9_-]+/.test(css.split('\n').filter(l => l.includes('#' + x)).join('')));

const out = [];
out.push('html ids      = ' + ids.size);
out.push('app refs      = ' + used.size);
out.push('MISSING in html: ' + (missing.length ? missing.join(', ') : '(none)'));
out.push('html ids not referenced by $("#.."): ' + (unused.length ? unused.join(', ') : '(none)'));
out.push('');
out.push('--- 新增控件 ---');
['coverImgInput', 'coverImgDrop', 'coverImgThumb', 'coverImgPick', 'coverImgClear', 'coverImgName', 'coverImgOpts', 'coverImgSize', 'coverImgShape']
  .forEach(k => out.push('  ' + k + ' : html=' + ids.has(k) + ' app=' + used.has(k)));
out.push('');
const cls = ['imgdrop', 'imgdrop-thumb', 'imgdrop-text', 'danger', 'imgsize', 'off'];
out.push('CSS 类: ' + cls.map(c => c + '=' + (css.includes('.' + c) ? 'Y' : 'N')).join('  '));

fs.writeFileSync(path.join(__dirname, 'domcheck.txt'), out.join('\n'), 'utf8');
console.log(out.join('\n'));
