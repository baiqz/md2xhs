/* ===== Markdown 输入框增强：快捷键 / 工具栏 / 智能回车 =====
 *
 * 设计要点：
 *  1. 核心变换（apply / enterCmd / tabCmd）全是**纯函数**：输入 text + 选区，输出新
 *     text + 新选区。不碰 DOM，因此可以在 Node 里直接单测（见 _test/editcheck.js）。
 *  2. attach() 才做 DOM 接线：键盘映射、工具栏点击、写入 textarea。
 *  3. 写入 textarea 时优先用 document.execCommand('insertText') —— 它能保留浏览器
 *     原生撤销栈（Ctrl+Z）。只替换「公共前后缀之外的差异区间」，不整篇重写。浏览器
 *     不支持时退回直接赋值 + 手动派发 input 事件（app.js 靠 input 事件刷新预览）。
 */
(function (root) {
  'use strict';

  const INDENT = '  ';
  const TABLE_TPL = '| 项目 | 说明 |\n| --- | --- |\n| 内容 | 内容 |';
  const IMG_TPL = '![图片说明](https://)';

  /* =====================================================================
     一、纯函数核心
     ===================================================================== */

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // 选区覆盖到的行范围 [首行起点, 末行终点)，不含末行的换行符
  function lineRange(text, s, e) {
    // 注意：s 为 0 时不能写成 lastIndexOf('\n', s - 1) —— 规范会把负位置夹到 0，
    // 若首字符正好是换行符会误判成"第 2 行开头"
    const ls = s <= 0 ? 0 : text.lastIndexOf('\n', s - 1) + 1;
    let le = text.indexOf('\n', e);
    if (le < 0) le = text.length;
    // 选区正好停在行尾（含那个换行符）：不要把下一行算进来
    if (e > s && text[e - 1] === '\n') le = e - 1;
    return [ls, le];
  }

  /* 行内列号映射：行变换只会改"行首前缀"，所以用「公共前后缀」把行切成三段，
     中段是真正被改写的内容，前后两段原样保留。
       old: [ 前缀 cp ][ 中段 ][ 后缀 cs ]
       new: [ 前缀 cp ][ 新中段 ][ 后缀 cs ]
     列号落在前缀里按原样；落在后缀里按"距行尾的距离"保持；落在中段里夹到新中段内。
     这样"光标停在行尾"这种最常见的情况才不会算错。 */
  function mapCol(oldLine, newLine, col) {
    if (oldLine === newLine) return col;
    const min = Math.min(oldLine.length, newLine.length);
    let cp = 0;
    while (cp < min && oldLine[cp] === newLine[cp]) cp++;
    let cs = 0;
    while (cs < min - cp &&
           oldLine[oldLine.length - 1 - cs] === newLine[newLine.length - 1 - cs]) cs++;
    const oldMidEnd = oldLine.length - cs;
    // 先判「后缀区」再判「前缀区」：光标停在行尾、或停在内容首字符时，
    // 都希望它跟着内容走，而不是留在刚插入的标记里
    if (col >= oldMidEnd) return newLine.length - (oldLine.length - col);
    if (col <= cp) return col;
    const newMidLen = Math.max(0, newLine.length - cs - cp);
    return cp + clamp(col - cp, 0, newMidLen);
  }

  // 对「选区覆盖的若干行」做整体变换（只允许改行首前缀），并把选区映射回新文本
  function mapLines(text, s, e, transform) {
    const r = lineRange(text, s, e);
    const ls = r[0], le = r[1];
    const lines = text.slice(ls, le).split('\n');
    const out = transform(lines);

    const starts = [];
    let acc = ls;
    for (let i = 0; i < lines.length; i++) { starts.push(acc); acc += lines[i].length + 1; }

    const shift = pos => {
      const p = clamp(pos, ls, le);
      let k = lines.length - 1;
      for (let i = 0; i < lines.length; i++) {
        if (p <= starts[i] + lines[i].length) { k = i; break; }
      }
      let base = ls;
      for (let j = 0; j < k; j++) base += out[j].length + 1;
      return base + mapCol(lines[k], out[k] === undefined ? lines[k] : out[k], p - starts[k]);
    };

    return {
      text: text.slice(0, ls) + out.join('\n') + text.slice(le),
      s: shift(s),
      e: shift(e)
    };
  }

  // 去掉行首的标题/列表/引用标记，返回纯内容（保留缩进）
  // 先剥引用再剥列表："> - a" 必须两趟都剥掉，顺序反了会剩下 "- a"
  function stripMarkers(l) {
    return l
      .replace(/^(\s*)>\s?/, '$1')
      .replace(/^(\s*)(?:#{1,6}\s+|[-*+]\s+|\d{1,3}[.)]\s+)/, '$1');
  }

  /* ---------- 行内标记（可反包裹） ---------- */
  const INLINE = {
    bold:   { open: '**', close: '**', ph: '加粗文字' },
    italic: { open: '*',  close: '*',  ph: '斜体文字' },
    strike: { open: '~~', close: '~~', ph: '删除线' },
    hl:     { open: '==', close: '==', ph: '高亮文字' },
    code:   { open: '`',  close: '`',  ph: '代码' },
    link:   { open: '[',  close: '](https://)', ph: '链接文字' }
  };

  function inlineCmd(text, s, e, name) {
    const cfg = INLINE[name];
    if (!cfg) return null;
    const o = cfg.open, c = cfg.close;
    const sel = text.slice(s, e);

    // 选中一段 URL 时，直接包成 [](url)，光标落在方括号里
    if (name === 'link' && /^https?:\/\/\S+$/i.test(sel)) {
      return { text: text.slice(0, s) + '[](' + sel + ')' + text.slice(e), s: s + 1, e: s + 1 };
    }
    // 1) 选区自带标记 → 去掉标记
    if (sel.length >= o.length + c.length &&
        sel.slice(0, o.length) === o && sel.slice(sel.length - c.length) === c) {
      const inner = sel.slice(o.length, sel.length - c.length);
      return { text: text.slice(0, s) + inner + text.slice(e), s: s, e: s + inner.length };
    }
    // 2) 标记正好贴在选区两侧 → 去掉标记（同一个快捷键再按一次即取消格式）
    if (s >= o.length && e + c.length <= text.length &&
        text.slice(s - o.length, s) === o && text.slice(e, e + c.length) === c) {
      return {
        text: text.slice(0, s - o.length) + sel + text.slice(e + c.length),
        s: s - o.length, e: e - o.length
      };
    }
    // 3) 包裹；没有选中内容时插入占位词并选中它，直接打字即可替换
    const body = sel || cfg.ph;
    return {
      text: text.slice(0, s) + o + body + c + text.slice(e),
      s: s + o.length, e: s + o.length + body.length
    };
  }

  /* ---------- 行首标记 ---------- */
  const LINE = {
    ul:    { re: /^(\s*)([-*+])\s+/, strip: '$1', make: ind => ind + '- ' },
    ol:    { re: /^(\s*)(\d{1,3})[.)]\s+/, strip: '$1', make: (ind, n) => ind + n + '. ' },
    quote: { re: /^(\s*)>\s?/, strip: '$1', make: ind => ind + '> ' }
  };

  function prefixCmd(text, s, e, name) {
    const cfg = LINE[name];
    if (!cfg) return null;
    return mapLines(text, s, e, lines => {
      const hit = lines.filter(l => l.trim());
      const active = hit.length > 0 && hit.every(l => cfg.re.test(l));   // 已全部带标记 → 再按一次取消
      let n = 1;
      if (!active && name === 'ol') {
        const first = lines.filter(l => cfg.re.test(l))[0];
        if (first) n = parseInt(cfg.re.exec(first)[2], 10) || 1;         // 顺着已有编号续
      }
      return lines.map(l => {
        if (!l.trim()) return l;
        if (active) return l.replace(cfg.re, cfg.strip);
        const ind = (l.match(/^(\s*)/) || ['', ''])[1].slice(0, 6);
        return cfg.make(ind, n++) + stripMarkers(l).trim();
      });
    });
  }

  function headingCmd(text, s, e, level) {
    const re = /^(\s{0,3})(#{1,6})\s+/;
    return mapLines(text, s, e, lines => {
      const hit = lines.filter(l => l.trim());
      const active = hit.length > 0 && hit.every(l => {
        const m = l.match(re);
        return m && m[2].length === level;
      });
      return lines.map(l => {
        if (!l.trim()) return l;
        const ind = (l.match(/^(\s*)/) || ['', ''])[1].slice(0, 3);
        const body = stripMarkers(l).trim();
        return active ? body : ind + '#'.repeat(level) + ' ' + body;
      });
    });
  }

  function clearCmd(text, s, e) {
    return mapLines(text, s, e, lines => lines.map(l => stripMarkers(l)));
  }

  // 代码块会整行插入/删除，行号会错位，所以单独算，不用 mapLines
  const FENCE_LINE = /^\s{0,3}`{3,}\s*$/;
  const FENCE_OPEN = /^\s{0,3}`{3,}/;
  function codeblockCmd(text, s, e) {
    const r = lineRange(text, s, e);
    const ls = r[0], le = r[1];
    const lines = text.slice(ls, le).split('\n');

    // 情况一：选区把围栏一起选中了
    if (lines.length >= 2 && FENCE_OPEN.test(lines[0]) && FENCE_LINE.test(lines[lines.length - 1])) {
      const removed = lines[0].length + 1;                       // 首行围栏 + 换行
      return {
        text: text.slice(0, ls) + lines.slice(1, -1).join('\n') + text.slice(le),
        s: Math.max(ls, s - removed),
        e: Math.max(ls, e - removed)
      };
    }
    // 情况二：围栏在选区之外（只选中了内容）→ 反包裹
    const before = text.slice(0, ls);
    const after = text.slice(le);
    const openLine = ls > 0 ? before.replace(/\n$/, '').split('\n').pop() : null;
    const closeLine = after.indexOf('\n') >= 0 ? after.slice(1).split('\n')[0] : null;
    if (ls > 0 && openLine !== null && FENCE_OPEN.test(openLine) &&
        closeLine !== null && FENCE_LINE.test(closeLine) && /^\n/.test(after)) {
      const cut = openLine.length + 1;                            // 开围栏整行（含换行）
      const tailCut = 1 + closeLine.length;                       // 闭围栏前换行 + 闭围栏
      return {
        text: text.slice(0, ls - cut) + text.slice(ls, le) + text.slice(le + tailCut),
        s: Math.max(0, s - cut),
        e: Math.max(0, e - cut)
      };
    }
    // 情况三：包裹
    const open = '```\n';
    return {
      text: text.slice(0, ls) + open + text.slice(ls, le) + '\n```' + text.slice(le),
      s: s + open.length,
      e: e + open.length
    };
  }

  // 在「当前行（选区末行）下方」插入整块内容，并选中它（表格 / 分割线 / 图片）
  function insertBlock(text, s, e, chunk) {
    const r = lineRange(text, s, e);
    const at = r[1];                                  // 插在末行行尾之后
    const before = text.slice(0, at);
    const after = text.slice(at);
    const lead = /(^|\n)\s*$/.test(before) ? '' : '\n';   // 光标已在行首空行上时不用再换行
    const tail = (!after || /^\s*\n/.test(after)) ? '' : '\n';
    const p = before.length + lead.length;
    return { text: before + lead + chunk + tail + after, s: p, e: p + chunk.length };
  }

  /* ---------- 智能回车：列表 / 引用自动续行 ---------- */
  const LIST_RE = /^(\s*)(?:([-*+])|(\d{1,3})[.)])(\s+)([\s\S]*)$/;
  const QUOTE_RE = /^(\s*)>\s?([\s\S]*)$/;

  function enterCmd(text, s, e) {
    if (s !== e) return null;                       // 有选区时交回浏览器处理
    const ls = s <= 0 ? 0 : text.lastIndexOf('\n', s - 1) + 1;
    let le = text.indexOf('\n', s);
    if (le < 0) le = text.length;
    const line = text.slice(ls, le);

    const m = line.match(LIST_RE);
    if (m && s - ls > m[1].length) {
      if (!m[5].trim()) {                            // 空条目：再按一次回车退出列表
        return { text: text.slice(0, ls) + text.slice(le), s: ls, e: ls };
      }
      const marker = m[2] ? m[2] : (parseInt(m[3], 10) + 1) + '.';
      const ins = '\n' + m[1] + marker + ' ';
      return { text: text.slice(0, s) + ins + text.slice(e), s: s + ins.length, e: s + ins.length };
    }

    const q = line.match(QUOTE_RE);
    if (q && s - ls > q[1].length) {
      if (!q[2].trim()) return { text: text.slice(0, ls) + text.slice(le), s: ls, e: ls };
      const ins = '\n' + q[1] + '> ';
      return { text: text.slice(0, s) + ins + text.slice(e), s: s + ins.length, e: s + ins.length };
    }
    return null;
  }

  /* ---------- Tab / Shift+Tab ----------
     光标在行内时也按「整行缩进」处理：写笔记时 Tab 的意图基本都是"把这个列表项
     降一级"，而不是在字中间塞两个空格。 */
  function tabCmd(text, s, e, shift) {
    return mapLines(text, s, e, lines => lines.map(l => {
      if (!l.trim()) return l;
      if (shift) return l.replace(/^ {1,2}|\t/, '');
      return INDENT + l;
    }));
  }

  // 所有可执行动作（工具栏 data-act 必须落在集合里，_test/editcheck.js 会校验）
  const ACTIONS = [
    'bold', 'italic', 'strike', 'hl', 'code', 'link',
    'h1', 'h2', 'h3', 'clear',
    'ul', 'ol', 'quote', 'codeblock',
    'table', 'hr', 'image',
    'indent', 'outdent'
  ];

  // 只有快捷键、没有对应按钮的动作（Tab / Shift+Tab 本身就是最自然的入口）
  const KEYBOARD_ONLY = ['indent', 'outdent'];

  function apply(text, s, e, act) {
    s = clamp(s, 0, text.length);
    e = clamp(e, s, text.length);
    switch (act) {
      case 'bold': case 'italic': case 'strike': case 'hl': case 'code': case 'link':
        return inlineCmd(text, s, e, act);
      case 'h1': return headingCmd(text, s, e, 1);
      case 'h2': return headingCmd(text, s, e, 2);
      case 'h3': return headingCmd(text, s, e, 3);
      case 'clear': return clearCmd(text, s, e);
      case 'ul': case 'ol': case 'quote': return prefixCmd(text, s, e, act);
      case 'codeblock': return codeblockCmd(text, s, e);
      case 'table': return insertBlock(text, s, e, TABLE_TPL);
      case 'hr': return insertBlock(text, s, e, '---');
      case 'image': return insertBlock(text, s, e, IMG_TPL);
      case 'indent': return tabCmd(text, s, e, false);
      case 'outdent': return tabCmd(text, s, e, true);
      default: return null;
    }
  }

  /* =====================================================================
     二、DOM 接线
     ===================================================================== */

  // 快捷键 → 动作；键名不含 Ctrl/Cmd（那是前置条件），见 shortcutOf()
  const KEYMAP = {
    'b': 'bold',
    'i': 'italic',
    'u': 'hl',
    'e': 'code',
    'k': 'link',
    'shift+x': 'strike',
    'alt+1': 'h1',
    'alt+2': 'h2',
    'alt+3': 'h3',
    'alt+0': 'clear',
    'shift+8': 'ul',
    'shift+7': 'ol',
    'shift+9': 'quote',
    'shift+k': 'codeblock'
  };

  // 数字键在 Shift 下 key 会变成符号（Shift+7 → '&'），必须用 e.code 归一
  function normalizeKey(e) {
    const code = e.code || '';
    if (/^Digit\d$/.test(code)) return code.slice(5);
    if (/^Numpad\d$/.test(code)) return code.slice(6);
    const k = e.key || '';
    if (k === ' ' || k === 'Spacebar') return 'space';
    return k.toLowerCase();
  }
  function shortcutOf(e) {
    if (!(e.ctrlKey || e.metaKey)) return '';
    const parts = [];
    if (e.altKey) parts.push('alt');
    if (e.shiftKey) parts.push('shift');
    parts.push(normalizeKey(e));
    return parts.join('+');
  }

  // 只重写「公共前后缀之外的差异区间」，尽量保住撤销栈
  function write(ta, r) {
    if (!r) return false;
    const old = ta.value;
    let p = 0;
    const maxP = Math.min(old.length, r.text.length);
    while (p < maxP && old.charCodeAt(p) === r.text.charCodeAt(p)) p++;
    let q = 0;
    const maxQ = Math.min(old.length - p, r.text.length - p);
    while (q < maxQ &&
           old.charCodeAt(old.length - 1 - q) === r.text.charCodeAt(r.text.length - 1 - q)) q++;
    const ins = r.text.slice(p, r.text.length - q);

    ta.focus();
    ta.setSelectionRange(p, old.length - q);
    let ok = false;
    try { ok = document.execCommand('insertText', false, ins); } catch (err) { ok = false; }
    if (!ok || ta.value !== r.text) {
      ta.value = r.text;
      // 手动赋值不会触发 input，这里补一个，预览才会刷新
      try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (err) { /* noop */ }
    }
    try { ta.setSelectionRange(r.s, r.e); } catch (err) { /* noop */ }
    revealCaret(ta);
    return true;
  }

  // 手动插入不会让浏览器自动把光标滚进可视区，这里按行高粗估补一下
  function revealCaret(ta) {
    if (!root.getComputedStyle) return;
    const cs = root.getComputedStyle(ta);
    const lh = parseFloat(cs.lineHeight) || 20;
    const padT = parseFloat(cs.paddingTop) || 0;
    const padX = parseFloat(cs.paddingLeft) || 0;
    const upto = ta.value.slice(0, ta.selectionStart);
    const lineNo = upto.split('\n').length - 1;
    const col = upto.length - (upto.lastIndexOf('\n') + 1);
    const perLine = Math.max(16, Math.floor((ta.clientWidth - padX * 2) / (lh * 0.58)));
    const y = padT + (lineNo + Math.floor(col / perLine)) * lh;
    const top = ta.scrollTop, bot = top + (ta.clientHeight || 0);
    if (y < top) ta.scrollTop = Math.max(0, y - lh);
    else if (y + lh > bot) ta.scrollTop = y + lh - bot + lh / 2;
  }

  function run(ta, act) {
    return write(ta, apply(ta.value, ta.selectionStart, ta.selectionEnd, act));
  }

  function bindToolbar(ta, bar) {
    if (!bar) return;
    // mousedown 拦掉，否则按钮会抢走焦点、textarea 选区丢失
    bar.addEventListener('mousedown', function (e) {
      if (e.target.closest && e.target.closest('[data-act]')) e.preventDefault();
    });
    bar.addEventListener('click', function (e) {
      const b = e.target.closest && e.target.closest('[data-act]');
      if (!b) return;
      e.preventDefault();
      run(ta, b.getAttribute('data-act'));
    });
  }

  function attach(ta, opts) {
    if (!ta) return null;
    opts = opts || {};

    ta.addEventListener('keydown', function (e) {
      // 输入法组合中的按键一律不接管，否则中文输入会坏
      if (e.isComposing || e.keyCode === 229) return;

      if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
        const r = enterCmd(ta.value, ta.selectionStart, ta.selectionEnd);
        if (r) { e.preventDefault(); write(ta, r); }
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        write(ta, tabCmd(ta.value, ta.selectionStart, ta.selectionEnd, e.shiftKey));
        return;
      }
      const act = KEYMAP[shortcutOf(e)];
      if (!act) return;
      e.preventDefault();
      e.stopPropagation();
      run(ta, act);
    });

    const bar = typeof opts.toolbar === 'string' ? document.querySelector(opts.toolbar) : opts.toolbar;
    bindToolbar(ta, bar);

    // 快捷键说明面板
    const helpBtn = document.getElementById('btnKeyHelp');
    const helpPanel = document.getElementById('keyHelp');
    if (helpBtn && helpPanel) {
      helpBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        helpPanel.classList.toggle('on');
      });
      document.addEventListener('click', function (e) {
        if (!helpPanel.classList.contains('on')) return;
        if (helpPanel.contains(e.target) || helpBtn.contains(e.target)) return;
        helpPanel.classList.remove('on');
      });
    }

    return api;
  }

  const api = {
    apply, inlineCmd, enterCmd, tabCmd, mapLines, mapCol, lineRange, stripMarkers,
    attach, run, write, bindToolbar, normalizeKey, shortcutOf,
    KEYMAP, ACTIONS, KEYBOARD_ONLY,
    TABLE_TPL, IMG_TPL, INDENT
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MDE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
