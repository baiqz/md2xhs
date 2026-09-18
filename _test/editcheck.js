/* Markdown 编辑增强测试
   两层：
     A. 纯函数层：apply/enterCmd/tabCmd 给定 文本+选区 → 断言新文本与新选区
        （选区断言不能省：位置算错会导致"按了快捷键光标乱跳"，肉眼很难发现）
     B. DOM 桩层：用最小 DOM 桩跑 attach()，模拟真实按键与工具栏点击
        含 execCommand 可用/不可用两条路径、输入法组合态不被劫持
   另外还做语法互通校验：快捷键产出的东西必须能被 md.js 解析成预期块类型
   （否则快捷键"能用"，但生成的是渲染不出来的废语法） */
const fs = require('fs');
const path = require('path');

const MD = require('../js/md.js');
const MDE = require('../js/editor.js');

let pass = 0, fail = 0;
const report = [];
function expect(cond, msg) {
  if (cond) { pass++; report.push('OK   ' + msg); }
  else { fail++; report.push('FAIL ' + msg); }
}
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  expect(a === b, a === b ? msg : `${msg} —— 实际 ${a}，期望 ${b}`);
}
// 只断言文本 + 选区（apply 的返回值里就这三样）
const R = r => r ? { text: r.text, s: r.s, e: r.e } : null;
const run = (text, s, e, act) => R(MDE.apply(text, s, e, act));

/* =====================================================================
   A. 纯函数层
   ===================================================================== */

report.push('—— A. 纯函数：行内标记 ——');

eq(run('', 0, 0, 'bold'), { text: '**加粗文字**', s: 2, e: 6 }, '[加粗] 空选区插入占位词并选中');
eq(run('你好世界', 0, 2, 'bold'), { text: '**你好**世界', s: 2, e: 4 }, '[加粗] 包裹选中内容');
eq(run('**你好**', 2, 4, 'bold'), { text: '你好', s: 0, e: 2 }, '[加粗] 再按一次取消格式');
eq(run('**你好**', 0, 6, 'bold'), { text: '你好', s: 0, e: 2 }, '[加粗] 选中内容自带标记 → 去标记');
eq(run('**你好**', 2, 4, 'italic'), { text: '*你好*', s: 1, e: 3 }, '[斜体] 加粗内层切换为斜体（不产生 *** 废语法）');
eq(run('高亮', 0, 2, 'hl'), { text: '==高亮==', s: 2, e: 4 }, '[高亮] == 包裹');
eq(run('删除', 0, 2, 'strike'), { text: '~~删除~~', s: 2, e: 4 }, '[删除线] ~~ 包裹');
eq(run('x = 1', 0, 5, 'code'), { text: '`x = 1`', s: 1, e: 6 }, '[行内代码] 反引号包裹');
eq(run('官网', 0, 2, 'link'), { text: '[官网](https://)', s: 1, e: 3 }, '[链接] 文字进方括号，光标选中链接文字');
eq(run('https://a.com', 0, 13, 'link'), { text: '[](https://a.com)', s: 1, e: 1 }, '[链接] 选中 URL → 只补方括号');
eq(run('abc', 5, 5, 'bold'), { text: 'abc**加粗文字**', s: 5, e: 9 }, '[加粗] 越界选区自动夹到文本长度');
expect(MDE.apply('abc', 0, 0, '不存在的动作') === null, '[未知动作] 返回 null 而不是抛错');

report.push('—— A. 纯函数：标题 ——');
eq(run('标题', 0, 2, 'h2'), { text: '## 标题', s: 3, e: 5 }, '[H2] 加前缀，选区仍跟着原内容（落在 标题 上）');
eq(run('## 标题', 3, 5, 'h2'), { text: '标题', s: 0, e: 2 }, '[H2] 再按一次取消（选区映射正确）');
eq(run('## 标题', 3, 5, 'h1'), { text: '# 标题', s: 2, e: 4 }, '[H1] 直接把 H2 改成 H1');
eq(run('## a\n## b', 0, 9, 'h2'), { text: 'a\nb', s: 0, e: 3 }, '[H2] 多行整体取消');
eq(run('一\n\n二', 0, 4, 'h3'), { text: '### 一\n\n### 二', s: 4, e: 12 }, '[H3] 多行加前缀，空行不动');
eq(run('- 列表项', 2, 5, 'h2'), { text: '## 列表项', s: 3, e: 6 }, '[H2] 原列表标记被替换，不出现 "## - x"');

report.push('—— A. 纯函数：列表 / 引用 ——');
eq(run('a\nb', 0, 3, 'ul'), { text: '- a\n- b', s: 2, e: 7 }, '[无序] 多行加 - ');
eq(run('- a\n- b', 0, 7, 'ul'), { text: 'a\nb', s: 0, e: 3 }, '[无序] 再按一次取消');
eq(run('a', 1, 1, 'ul'), { text: '- a', s: 3, e: 3 }, '[无序] 光标停在行尾仍映射到行尾（曾算错）');
eq(run('a\nb', 0, 3, 'ol'), { text: '1. a\n2. b', s: 3, e: 9 }, '[有序] 自动编号');
eq(run('1. a\nb', 0, 6, 'ol'), { text: '1. a\n2. b', s: 0, e: 9 }, '[有序] 顺着已有编号续（不是重新从 1 开始）');
eq(run('  缩进项', 2, 5, 'ul'), { text: '  - 缩进项', s: 4, e: 7 }, '[无序] 保留缩进');
eq(run('a', 0, 1, 'quote'), { text: '> a', s: 2, e: 3 }, '[引用] 加 > ，选区留在内容上');
eq(run('> a', 2, 3, 'quote'), { text: 'a', s: 0, e: 1 }, '[引用] 再按一次取消');
eq(run('- a', 0, 3, 'quote'), { text: '> a', s: 0, e: 3 }, '[引用] 从无序列表切换过来，不叠加标记');
eq(run('## 标题', 3, 5, 'clear'), { text: '标题', s: 0, e: 2 }, '[清除格式] 去掉标题标记');
eq(run('> - a', 4, 5, 'clear'), { text: 'a', s: 0, e: 1 }, '[清除格式] 引用+列表标记一起清掉');

report.push('—— A. 纯函数：代码块 ——');
eq(run('abc', 3, 3, 'codeblock'), { text: '```\nabc\n```', s: 7, e: 7 }, '[代码块] 单行包裹，光标落在内容末尾');
eq(run('a\nb', 0, 3, 'codeblock'), { text: '```\na\nb\n```', s: 4, e: 7 }, '[代码块] 多行包裹，选区覆盖原内容');
eq(run('```\nabc\n```', 4, 7, 'codeblock'), { text: 'abc', s: 0, e: 3 }, '[代码块] 再按一次取消围栏');

report.push('—— A. 纯函数：智能回车 ——');
eq(R(MDE.enterCmd('普通一行', 4, 4)), null, '[回车] 普通段落不接管，交回浏览器');
eq(R(MDE.enterCmd('- a', 3, 3)), { text: '- a\n- ', s: 6, e: 6 }, '[回车] 无序列表自动续行');
eq(R(MDE.enterCmd('1. a', 4, 4)), { text: '1. a\n2. ', s: 8, e: 8 }, '[回车] 有序列表序号递增');
eq(R(MDE.enterCmd('  - a', 5, 5)), { text: '  - a\n  - ', s: 10, e: 10 }, '[回车] 续行保留缩进');
eq(R(MDE.enterCmd('- ', 2, 2)), { text: '', s: 0, e: 0 }, '[回车] 空条目退出列表');
eq(R(MDE.enterCmd('- a\n- ', 7, 7)), { text: '- a\n', s: 4, e: 4 }, '[回车] 空条目只删自己那一行');
eq(R(MDE.enterCmd('> 引用', 4, 4)), { text: '> 引用\n> ', s: 7, e: 7 }, '[回车] 引用自动续行');
eq(R(MDE.enterCmd('> ', 2, 2)), { text: '', s: 0, e: 0 }, '[回车] 空引用退出');
eq(R(MDE.enterCmd('abc', 0, 3)), null, '[回车] 有选区时不接管');

report.push('—— A. 纯函数：缩进 ——');
eq(run('ab', 1, 1, 'indent'), { text: '  ab', s: 3, e: 3 }, '[Tab] 光标处插入两个空格');
eq(run('a\nb', 0, 3, 'indent'), { text: '  a\n  b', s: 2, e: 7 }, '[Tab] 多行整体缩进');
eq(run('  a\n  b', 0, 7, 'outdent'), { text: 'a\nb', s: 0, e: 3 }, '[Shift+Tab] 多行反缩进');
eq(run('a', 1, 1, 'outdent'), { text: 'a', s: 1, e: 1 }, '[Shift+Tab] 无缩进时保持原样');

report.push('—— A. 纯函数：插入整块 ——');
eq(run('x', 1, 1, 'table'), { text: 'x\n' + MDE.TABLE_TPL, s: 2, e: 2 + MDE.TABLE_TPL.length }, '[表格] 插在当前行下方并选中');
eq(run('', 0, 0, 'table'), { text: MDE.TABLE_TPL, s: 0, e: MDE.TABLE_TPL.length }, '[表格] 空文稿直接插入，不产生多余空行');
eq(run('段落', 2, 2, 'hr'), { text: '段落\n---', s: 3, e: 6 }, '[分割线] 插在下方');
eq(run('a\nb', 1, 1, 'image'), { text: 'a\n' + MDE.IMG_TPL + '\nb', s: 2, e: 2 + MDE.IMG_TPL.length }, '[图片] 插在两行之间，选中占位内容');

report.push('—— A. 纯函数：Windows / Mac 按键归一 ——');
eq(MDE.normalizeKey({ key: '&', code: 'Digit7' }), '7', '[按键] Shift+7 的 & 归一成数字 7');
eq(MDE.normalizeKey({ key: 'B', code: 'KeyB' }), 'b', '[按键] 大写字母归一成小写');
eq(MDE.normalizeKey({ key: '*', code: 'Numpad8' }), '8', '[按键] 小键盘也认');
eq(MDE.shortcutOf({ ctrlKey: true, key: 'b', code: 'KeyB' }), 'b', '[快捷键] Ctrl+B');
eq(MDE.shortcutOf({ metaKey: true, key: 'B', code: 'KeyB' }), 'b', '[快捷键] Mac 的 ⌘+B 同样生效');
eq(MDE.shortcutOf({ ctrlKey: true, shiftKey: true, altKey: true, key: '&', code: 'Digit7' }), 'alt+shift+7', '[快捷键] 组合键拼装顺序');
eq(MDE.shortcutOf({ key: 'b', code: 'KeyB' }), '', '[快捷键] 没按 Ctrl/Cmd 时不认');

report.push('—— A. 语法互通：快捷键产物必须能被解析器识别 ——');
const hasBlock = (res, type) => MD.parse(res.text).some(b => b.type === type);
expect(hasBlock(run('标题', 0, 2, 'h2'), 'h2'), '[互通] H2 → 解析成 h2 块');
expect(hasBlock(run('a', 1, 1, 'h1'), 'h1'), '[互通] H1 → 解析成 h1 块');
expect(hasBlock(run('a\nb', 0, 3, 'ul'), 'ul'), '[互通] 无序列表 → ul 块');
expect(hasBlock(run('a\nb', 0, 3, 'ol'), 'ol'), '[互通] 有序列表 → ol 块');
expect(hasBlock(run('a', 1, 1, 'quote'), 'quote'), '[互通] 引用 → quote 块');
expect(hasBlock(run('abc', 3, 3, 'codeblock'), 'code'), '[互通] 代码块 → code 块');
expect(hasBlock(run('x', 1, 1, 'table'), 'table'), '[互通] 表格 → table 块');
expect(hasBlock(run('段落', 2, 2, 'hr'), 'hr'), '[互通] 分割线 → hr 块');
expect(hasBlock(run('a', 1, 1, 'image'), 'img'), '[互通] 图片 → img 块');
// 代码块里的内容不能被当成段落解析（围栏必须真的生效）
{
  const r = run('abc\n---\nxyz', 0, 11, 'codeblock');
  const types = MD.parse(r.text).map(b => b.type);
  expect(types.length === 1 && types[0] === 'code',
    `[互通] 代码块内的 --- 不被当成分割线（实际 ${types.join('+')}）`);
}

// 表格模板的具体行列数
{
  const t = MD.parse(MDE.TABLE_TPL)[0];
  expect(t.type === 'table' && t.header.length === 2 && t.rows.length === 1,
    `[互通] 表格模板结构正确（${t.header.length} 列 / ${t.rows.length} 行）`);
}
// 光标停在段落里插表格：段落、表格、段落应各自成块，不粘连
{
  const r = run('前一段', 3, 3, 'table');
  const types = MD.parse(r.text).map(b => b.type);
  expect(types.length === 2 && types[0] === 'p' && types[1] === 'table',
    `[互通] 段落下方插表格 → ${types.join('+')}（应 p+table）`);
}
{
  const r = run('a\nb', 1, 1, 'image');
  const types = MD.parse(r.text).map(b => b.type);
  expect(types.join('+') === 'p+img+p', `[互通] 两行之间插图片 → ${types.join('+')}（应 p+img+p）`);
}
// 行内标记
{
  const seg = MD.parseInline('**加粗**')[0];
  expect(seg.bold === true && seg.t === '加粗', '[互通] **x** → bold 段');
  const h = MD.parseInline('==高亮==')[0];
  expect(h.hl === true, '[互通] ==x== → hl 段');
  const st = MD.parseInline('~~删~~')[0];
  expect(st.strike === true, '[互通] ~~x~~ → strike 段');
  const cd = MD.parseInline('`c`')[0];
  expect(cd.code === true, '[互通] `x` → code 段');
  const it = MD.parseInline('*斜*')[0];
  expect(it.italic === true, '[互通] *x* → italic 段');
  const lk = MD.parseInline('[官网](https://)')[0];
  expect(lk.link === true && lk.t === '官网', '[互通] [T](U) → link 段');
}

/* =====================================================================
   B. DOM 桩层
   ===================================================================== */

report.push('—— B. DOM 桩：键盘与工具栏接线 ——');

function makeEl(tag) {
  const handlers = {};
  const cls = new Set();
  const el = {
    tagName: tag, _h: handlers, _cls: cls, _act: null,
    value: '', selectionStart: 0, selectionEnd: 0,
    clientWidth: 500, clientHeight: 300, scrollTop: 0, style: {},
    addEventListener(t, fn) { (handlers[t] = handlers[t] || []).push(fn); },
    dispatchEvent(ev) { (handlers[ev.type] || []).slice().forEach(fn => fn(ev)); return true; },
    fire(type, obj) {
      const ev = Object.assign({
        type, target: this,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.stopped = true; }
      }, obj || {});
      this.dispatchEvent(ev);
      return ev;
    },
    focus() { this.focused = true; },
    setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; },
    classList: {
      add(c) { cls.add(c); }, remove(c) { cls.delete(c); },
      contains(c) { return cls.has(c); },
      toggle(c) { if (cls.has(c)) { cls.delete(c); return false; } cls.add(c); return true; }
    },
    contains(o) { return o === this; },
    matches(sel) { return sel === '[data-act]' ? !!this._act : false; },
    closest(sel) { return this.matches(sel) ? this : null; },
    getAttribute(n) { return n === 'data-act' ? this._act : null; }
  };
  return el;
}

const ta = makeEl('textarea');
const bar = makeEl('div');
const helpBtn = makeEl('button');
const helpPanel = makeEl('div');
let execEnabled = true;
let inputCount = 0;

global.Event = function (type) { return { type: type }; };
global.document = {
  querySelector(sel) { return sel === '#mdbar' ? bar : null; },
  getElementById(id) {
    if (id === 'btnKeyHelp') return helpBtn;
    if (id === 'keyHelp') return helpPanel;
    return null;
  },
  // 模拟浏览器：把选中区间替换成 text，光标移到插入内容之后，并派发 input
  execCommand(cmd, ui, val) {
    if (!execEnabled) return false;
    const v = ta.value;
    ta.value = v.slice(0, ta.selectionStart) + val + v.slice(ta.selectionEnd);
    ta.selectionStart = ta.selectionEnd = ta.selectionStart + val.length;
    ta.dispatchEvent({ type: 'input' });
    return true;
  },
  addEventListener() {}
};
ta.addEventListener('input', () => { inputCount++; });
global.getComputedStyle = () => ({ lineHeight: '24px', paddingTop: '16px', paddingLeft: '16px' });

MDE.attach(ta, { toolbar: '#mdbar' });

function setText(text, s, e) {
  ta.value = text;
  ta.selectionStart = s;
  ta.selectionEnd = (e === undefined ? s : e);
  inputCount = 0;
}
function press(key, mods) {
  return ta.fire('keydown', Object.assign({
    key, code: 'Key' + String(key).toUpperCase(),
    ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
    isComposing: false, keyCode: 0
  }, mods || {}));
}

/* --- 键盘 --- */
setText('你好世界', 0, 2);
let ev = press('b', { ctrlKey: true, code: 'KeyB' });
eq({ v: ta.value, s: ta.selectionStart, e: ta.selectionEnd }, { v: '**你好**世界', s: 2, e: 4 }, '[键盘] Ctrl+B 加粗，选区正确');
expect(ev.defaultPrevented === true, '[键盘] 已阻止浏览器默认行为（否则 Chrome 会触发其它动作）');
expect(inputCount === 1, '[键盘] execCommand 路径下派发了一次 input 事件');

setText('标题', 0, 2);
press('@', { ctrlKey: true, altKey: true, code: 'Digit2' });
eq(ta.value, '## 标题', '[键盘] Ctrl+Alt+2 → 二级标题（按 code 认键，不看 key）');

setText('a\nb', 0, 3);
press('&', { ctrlKey: true, shiftKey: true, code: 'Digit7' });
eq(ta.value, '1. a\n2. b', '[键盘] Ctrl+Shift+7 → 有序列表（Shift+7 的 key 是 & 也不受影响）');

setText('a\nb', 0, 3);
press('*', { ctrlKey: true, shiftKey: true, code: 'Digit8' });
eq(ta.value, '- a\n- b', '[键盘] Ctrl+Shift+8 → 无序列表');

setText('ab', 1, 1);
press('Tab');
eq({ v: ta.value, s: ta.selectionStart }, { v: '  ab', s: 3 }, '[键盘] Tab 插入缩进而不是跳转焦点');
setText('  ab', 3, 3);
press('Tab', { shiftKey: true });
eq(ta.value, 'ab', '[键盘] Shift+Tab 反缩进');

setText('- a', 3, 3);
press('Enter');
eq(ta.value, '- a\n- ', '[键盘] 列表里回车自动续行');

setText('普通一行', 4, 4);
ev = press('Enter');
expect(ev.defaultPrevented !== true && ta.value === '普通一行', '[键盘] 普通段落回车不被接管（交回浏览器换行）');

setText('你好', 1, 1);
ev = press('Enter', { isComposing: true });
expect(ev.defaultPrevented !== true && ta.value === '你好', '[键盘] 输入法组合态的回车不被劫持（否则中文输入会坏）');
setText('你好', 1, 1);
press('b', { ctrlKey: true, isComposing: true, code: 'KeyB' });
eq(ta.value, '你好', '[键盘] 输入法组合态的 Ctrl+B 不生效');

setText('abc', 3, 3);
press('x', { ctrlKey: true });   // 未映射的组合键
eq(ta.value, 'abc', '[键盘] 未映射的快捷键不产生任何改动');

/* --- execCommand 不可用时的兜底路径 --- */
execEnabled = false;
setText('你好', 0, 2);
press('b', { ctrlKey: true, code: 'KeyB' });
eq({ v: ta.value, s: ta.selectionStart, e: ta.selectionEnd }, { v: '**你好**', s: 2, e: 4 }, '[兜底] execCommand 不可用时结果一致');
expect(inputCount === 1, '[兜底] 手动赋值后补派发 input 事件（否则预览不刷新）');
execEnabled = true;

/* --- 工具栏 --- */
const acts = ['h1', 'h2', 'h3', 'bold', 'italic', 'strike', 'hl', 'code', 'link',
  'ul', 'ol', 'quote', 'codeblock', 'table', 'hr', 'image'];
let wired = 0;
for (const act of acts) {
  const btn = makeEl('button'); btn._act = act;
  setText('测试', 0, 2);
  bar.fire('click', { target: btn });
  const changed = MDE.apply('测试', 0, 2, act);
  if (changed && ta.value === changed.text) wired++;
  else report.push(`FAIL [工具栏] ${act} 按钮没生效：${JSON.stringify(ta.value)}`);
}
expect(wired === acts.length, `[工具栏] ${acts.length} 个按钮全部对应到有效动作（实际生效 ${wired} 个）`);

// 点按钮不能抢焦点（否则选区丢失，快捷键作用到错误位置）
{
  const btn = makeEl('button'); btn._act = 'bold';
  setText('你好', 0, 2);
  const mev = bar.fire('mousedown', { target: btn });
  expect(mev.defaultPrevented === true, '[工具栏] mousedown 被拦下，textarea 选区不会因失焦而丢');
}

// index.html 里的 data-act 必须都在 ACTIONS 里
{
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const used = [];
  const re = /data-act="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) used.push(m[1]);
  const unknown = used.filter(a => MDE.ACTIONS.indexOf(a) < 0);
  expect(used.length > 0, `[接线] index.html 中解析到 ${used.length} 个 data-act 按钮`);
  expect(unknown.length === 0, `[接线] 所有 data-act 都在 ACTIONS 中（未知：${unknown.join(',') || '无'}）`);
  const missing = MDE.ACTIONS.filter(a => MDE.KEYBOARD_ONLY.indexOf(a) < 0 && used.indexOf(a) < 0);
  expect(missing.length === 0, `[接线] ACTIONS 里的动作都有按钮（仅快捷键的除外，缺：${missing.join(',') || '无'}）`);
  expect(MDE.ACTIONS.length === used.length + MDE.KEYBOARD_ONLY.length,
    `[接线] 动作总数对得上：${MDE.ACTIONS.length} = ${used.length} 个按钮 + ${MDE.KEYBOARD_ONLY.length} 个仅快捷键`);

  // 结构：工具栏按钮和快捷键面板必须在 #mdbar 内部（面板靠 .mdbar 的 relative 定位）
  const iBar = html.indexOf('id="mdbar"');
  const iTa = html.indexOf('<textarea id="md"');
  expect(iBar > 0 && iTa > iBar, '[接线] #mdbar 位于输入框之前');
  const actPos = [];
  const re2 = /data-act="/g;
  let m2;
  while ((m2 = re2.exec(html)) !== null) actPos.push(m2.index);
  expect(actPos.every(p => p > iBar && p < iTa), '[接线] 所有工具栏按钮都在 #mdbar 内');
  const iHelp = html.indexOf('id="keyHelp"');
  expect(iHelp > iBar && iHelp < iTa, '[接线] 快捷键面板在 #mdbar 内（否则定位与遮挡会不对）');
  // 每个按钮都要有 title（提示快捷键），否则用户不知道有快捷键
  const noTitle = (html.match(/<button class="mdb"[^>]*>/g) || []).filter(t => !/title="/.test(t));
  expect(noTitle.length === 0, `[接线] 工具栏按钮都带快捷键提示（缺提示的：${noTitle.length} 个）`);
}

// 快捷键说明面板
{
  setText('', 0, 0);
  helpBtn.fire('click');
  expect(helpPanel.classList.contains('on') === true, '[快捷键面板] 点击按钮展开');
  helpBtn.fire('click');
  expect(helpPanel.classList.contains('on') === false, '[快捷键面板] 再点一次收起');
}

// 滚动补偿：光标跑出可视区时不应抛错
{
  setText(Array.from({ length: 80 }, (_, i) => '第 ' + i + ' 行').join('\n'), 0, 0);
  ta.value = ta.value + '\n**加粗**';
  setText(ta.value, ta.value.length - 6, ta.value.length - 4);
  let threw = null;
  try { press('b', { ctrlKey: true, code: 'KeyB' }); } catch (err) { threw = err; }
  expect(threw === null && ta.scrollTop > 0, `[滚动] 光标在文末时自动滚动（scrollTop=${ta.scrollTop}）`);
}

/* ---------- 汇总 ---------- */
fs.writeFileSync(path.join(__dirname, 'editcheck-log.txt'),
  report.join('\n') + `\n\n通过 ${pass} / 失败 ${fail}\n`, 'utf8');
console.log(report.join('\n'));
console.log(`\n通过 ${pass} / 失败 ${fail}`);
process.exitCode = fail ? 1 : 0;
