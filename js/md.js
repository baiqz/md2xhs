/* ===== Markdown 解析 / 行内切分 / 断行 ===== */
(function (root) {
  'use strict';

  /* ---------- 行内样式解析 ---------- */
  // 输出 [{t, bold, italic, code, strike, link, hl}]
  const INLINE_RE = /(\*\*[^*]+\*\*)|(__[^_]+__)|(`[^`]+`)|(~~[^~]+~~)|(==[^=]+==)|(\[[^\]]*\]\([^)\s]+\))|(\*[^*\n]+\*)|(_[^_\n]+_)/g;

  function plainSeg(t) { return { t: t, bold: false, italic: false, code: false, strike: false, link: false, hl: false }; }

  function parseInline(text) {
    const out = [];
    let last = 0, m;
    INLINE_RE.lastIndex = 0;
    while ((m = INLINE_RE.exec(text)) !== null) {
      if (m.index > last) out.push(plainSeg(text.slice(last, m.index)));
      const s = m[0];
      if (s.startsWith('**') || s.startsWith('__')) { const o = plainSeg(s.slice(2, -2)); o.bold = true; out.push(o); }
      else if (s.startsWith('`')) { const o = plainSeg(s.slice(1, -1)); o.code = true; out.push(o); }
      else if (s.startsWith('~~')) { const o = plainSeg(s.slice(2, -2)); o.strike = true; out.push(o); }
      else if (s.startsWith('==')) { const o = plainSeg(s.slice(2, -2)); o.hl = true; out.push(o); }
      else if (s.startsWith('[')) {
        const mm = /^\[([^\]]*)\]\(([^)\s]+)\)$/.exec(s);
        const o = plainSeg(mm ? mm[1] : s);
        o.link = true; o.href = mm ? mm[2] : '';
        out.push(o);
      }
      else if (s.startsWith('*') || s.startsWith('_')) { const o = plainSeg(s.slice(1, -1)); o.italic = true; out.push(o); }
      last = m.index + s.length;
    }
    if (last < text.length) out.push(plainSeg(text.slice(last)));
    return out.filter(s => s.t !== '');
  }

  /* ---------- 块级解析 ---------- */
  const RE_UL = /^\s{0,6}[-*+]\s+(.*)$/;
  const RE_OL = /^\s{0,6}(\d{1,3})[.)]\s+(.*)$/;
  const RE_QUOTE = /^\s{0,3}>\s?(.*)$/;
  const RE_H = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
  const RE_HR = /^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/;
  const RE_FENCE = /^\s{0,3}(`{3,}|~{3,})(.*)$/;
  const RE_IMG = /^\s*!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/;
  const RE_TSEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

  const isBlank = s => /^\s*$/.test(s);
  const startsBlock = s =>
    RE_H.test(s) || RE_HR.test(s) || RE_FENCE.test(s) || RE_QUOTE.test(s) ||
    RE_UL.test(s) || RE_OL.test(s) || RE_IMG.test(s) || isBlank(s);

  function isCJK(ch) { return /[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef\u3040-\u30ff]/.test(ch); }

  function smartJoin(a, b) {
    if (!a) return b;
    const l = a[a.length - 1], r = b[0];
    if (isCJK(l) || isCJK(r)) return a + b;
    return a + ' ' + b;
  }

  function splitCell(row) {
    let s = row.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|')) s = s.slice(0, -1);
    return s.split('|').map(c => c.trim());
  }

  function parse(text) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
    const blocks = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      if (isBlank(line)) { i++; continue; }

      // 代码块
      let m = RE_FENCE.exec(line);
      if (m) {
        const fence = m[1][0];
        const lang = m[2].trim();
        const buf = [];
        i++;
        while (i < lines.length && !new RegExp('^\\s{0,3}' + (fence === '`' ? '`{3,}' : '~{3,}') + '\\s*$').test(lines[i])) {
          buf.push(lines[i]); i++;
        }
        i++; // 跳过闭合
        blocks.push({ type: 'code', lang: lang, lines: buf.length ? buf : [''] });
        continue;
      }

      // 标题
      m = RE_H.exec(line);
      if (m) {
        const lv = Math.min(m[1].length, 3);
        blocks.push({ type: 'h' + lv, text: m[2].trim() });
        i++; continue;
      }

      // 分割线
      if (RE_HR.test(line)) { blocks.push({ type: 'hr' }); i++; continue; }

      // 引用
      if (RE_QUOTE.test(line)) {
        const buf = [];
        while (i < lines.length && RE_QUOTE.test(lines[i])) {
          const t = RE_QUOTE.exec(lines[i])[1];
          if (buf.length) buf[buf.length - 1] = smartJoin(buf[buf.length - 1], t); else buf.push(t);
          i++;
        }
        blocks.push({ type: 'quote', text: buf.join('\n') });
        continue;
      }

      // 无序列表
      if (RE_UL.test(line)) {
        const items = [];
        while (i < lines.length && RE_UL.test(lines[i])) { items.push(RE_UL.exec(lines[i])[1]); i++; }
        blocks.push({ type: 'ul', items: items });
        continue;
      }

      // 有序列表
      if (RE_OL.test(line)) {
        const items = [];
        while (i < lines.length && RE_OL.test(lines[i])) {
          const mm = RE_OL.exec(lines[i]);
          items.push({ n: parseInt(mm[1], 10), text: mm[2] });
          i++;
        }
        blocks.push({ type: 'ol', items: items });
        continue;
      }

      // 图片
      m = RE_IMG.exec(line);
      if (m) { blocks.push({ type: 'img', alt: m[1], src: m[2] }); i++; continue; }

      // 表格
      if (line.indexOf('|') >= 0 && i + 1 < lines.length && RE_TSEP.test(lines[i + 1])) {
        const header = splitCell(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].indexOf('|') >= 0 && !isBlank(lines[i])) {
          rows.push(splitCell(lines[i])); i++;
        }
        blocks.push({ type: 'table', header: header, rows: rows });
        continue;
      }

      // 段落
      const buf = [line.trim()];
      i++;
      while (i < lines.length && !startsBlock(lines[i])) {
        if (lines[i].indexOf('|') >= 0 && i + 1 < lines.length && RE_TSEP.test(lines[i + 1])) break;
        buf[buf.length - 1] = smartJoin(buf[buf.length - 1], lines[i].trim());
        i++;
      }
      blocks.push({ type: 'p', text: buf.join('') });
    }
    return blocks;
  }

  /* ---------- 切分为可断行的 token ---------- */
  // fontFor(seg) => font 字符串；返回 [{t, space, seg, font}]
  function tokenize(segs, fontFor) {
    const out = [];
    for (const s of segs) {
      const font = fontFor(s);
      let buf = '';
      const flush = () => {
        if (!buf) return;
        if (buf.length > 26) {
          for (let k = 0; k < buf.length; k += 20) out.push({ t: buf.substr(k, 20), seg: s, font: font });
        } else out.push({ t: buf, seg: s, font: font });
        buf = '';
      };
      for (const ch of s.t) {
        if (isCJK(ch)) { flush(); out.push({ t: ch, seg: s, font: font }); }
        else if (ch === ' ' || ch === '\u3000') { flush(); out.push({ t: ' ', space: true, seg: s, font: font }); }
        else buf += ch;
      }
      flush();
    }
    return out;
  }

  /* ---------- 断行（含简单禁则处理） ---------- */
  // 不能出现在行首的标点
  const NO_START = /^[，。、；：？！）】》」』〉…—～·%）,.;:!?)\]}"'’”]$/;
  // 不能出现在行尾的标点
  const NO_END = /^[（【《「『〈([{"'“‘]$/;

  // ctx: 2D context（仅用 measureText）；padOf(token) => 额外宽度
  function wrap(ctx, tokens, maxW, padOf) {
    const lines = [];
    let cur = [], w = 0;
    const widthOf = tk => {
      ctx.font = tk.font;
      return ctx.measureText(tk.t).width + (padOf ? padOf(tk) : 0);
    };
    const flush = () => {
      while (cur.length && cur[cur.length - 1].space) cur.pop();
      const carry = [];
      while (cur.length > 1 && NO_END.test(cur[cur.length - 1].t)) carry.unshift(cur.pop());
      lines.push(cur);
      cur = carry;
      w = 0;
      for (const t of cur) w += widthOf(t);
    };
    for (const tk of tokens) {
      const tw = widthOf(tk);
      if (tk.space) {
        if (!cur.length) continue;
        if (w + tw > maxW) { flush(); continue; }
        cur.push(tk); w += tw; continue;
      }
      // 行首禁则标点允许悬挂（超出宽度也留在本行）
      if (w + tw > maxW && cur.length && !NO_START.test(tk.t)) flush();
      cur.push(tk); w += tw;
    }
    while (cur.length && cur[cur.length - 1].space) cur.pop();
    if (cur.length) lines.push(cur);
    return lines;
  }

  const api = { parse, parseInline, tokenize, wrap, isCJK, smartJoin };

  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MD = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
