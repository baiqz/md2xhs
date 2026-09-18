/* ===== 排版渲染引擎：Markdown 块 -> 分页画布 ===== */
(function (root) {
  'use strict';

  const U = root.U, TH = root.TH;
  const hexA = U.hexA, mix = U.mix, pad2 = U.pad2;
  const MONO = TH.MONO;

  const RATIOS = { '3:4': [1080, 1440], '4:5': [1080, 1350], '1:1': [1080, 1080], '9:16': [1080, 1920] };

  /* ---------- 基础绘制工具 ---------- */
  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawSpaced(ctx, text, x, y, sp, align) {
    const chars = Array.from(text);
    let total = -sp;
    for (const c of chars) total += ctx.measureText(c).width + sp;
    let cx = align === 'center' ? x - total / 2 : (align === 'right' ? x - total : x);
    for (const c of chars) { ctx.fillText(c, cx, y); cx += ctx.measureText(c).width + sp; }
    return total;
  }

  function lineWidth(ctx, toks, padOf) {
    let w = 0;
    for (const tk of toks) { ctx.font = tk.font; w += ctx.measureText(tk.t).width + (padOf ? padOf(tk) : 0); }
    return w;
  }

  /* ---------- 行内绘制 ---------- */
  function drawSegs(ctx, toks, x, yMid, C) {
    let cx = x;
    for (const tk of toks) {
      const s = tk.seg, size = s.size;
      ctx.font = tk.font;
      const w = ctx.measureText(tk.t).width;
      if (s.hl) {
        ctx.fillStyle = C.hl;
        rr(ctx, cx - size * 0.1, yMid - size * 0.68, w + size * 0.2, size * 1.36, size * 0.18); ctx.fill();
      }
      if (s.code) {
        ctx.fillStyle = C.codeBg;
        rr(ctx, cx - size * 0.18, yMid - size * 0.74, w + size * 0.36, size * 1.48, size * 0.24); ctx.fill();
      }
      ctx.fillStyle = s.code ? C.codeText : (s.link ? C.accent : C.text);
      ctx.fillText(tk.t, cx, yMid);
      if (s.strike) {
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = Math.max(1.2, size * 0.05);
        ctx.beginPath(); ctx.moveTo(cx, yMid + size * 0.02); ctx.lineTo(cx + w, yMid + size * 0.02); ctx.stroke();
      }
      if (s.link) {
        ctx.strokeStyle = C.accent; ctx.lineWidth = Math.max(1.2, size * 0.05);
        ctx.beginPath(); ctx.moveTo(cx, yMid + size * 0.52); ctx.lineTo(cx + w, yMid + size * 0.52); ctx.stroke();
      }
      cx += w + (s.code ? size * 0.36 : 0);
    }
    return cx - x;
  }

  /* ---------- 图片预加载 ---------- */
  const imgCache = {};   // 同一 src 只解码一次（封面配图是 data URL，反复解码会拖慢实时预览）
  let imgCacheN = 0;

  // extra: 额外的图片地址（如封面配图），与正文图片一起预加载
  function preloadImages(blocks, extra) {
    const srcs = [];
    blocks.forEach(b => { if (b.type === 'img' && srcs.indexOf(b.src) < 0) srcs.push(b.src); });
    (extra || []).forEach(s => { if (s && srcs.indexOf(s) < 0) srcs.push(s); });
    const map = {};
    return Promise.all(srcs.map(src => {
      if (imgCache[src]) { map[src] = imgCache[src]; return Promise.resolve(); }
      return new Promise(res => {
        const img = new Image();
        if (!/^data:/i.test(src)) img.crossOrigin = 'anonymous';   // data: 同源，无需也不能设 crossOrigin
        let done = false;
        const fin = ok => {
          if (done) return; done = true;
          if (ok) {
            const entry = { img: img, w: img.naturalWidth, h: img.naturalHeight };
            map[src] = entry;
            if (imgCacheN > 40) { for (const k in imgCache) delete imgCache[k]; imgCacheN = 0; }
            imgCache[src] = entry; imgCacheN++;
          } else map[src] = null;   // 失败不缓存，下次仍可重试
          res();
        };
        img.onload = () => fin(img.naturalWidth > 0);
        img.onerror = () => fin(false);
        setTimeout(() => fin(false), 8000);
        img.src = src;
      });
    })).then(() => map);
  }

  /* ---------- 封面信息 ---------- */
  function extractCover(blocks) {
    let title = '', subtitle = '', ti = -1, remove = false;
    for (let i = 0; i < blocks.length; i++) if (blocks[i].type === 'h1') { title = blocks[i].text; ti = i; remove = true; break; }
    if (ti < 0) {
      for (let i = 0; i < Math.min(3, blocks.length); i++) {
        const b = blocks[i];
        if (b.type === 'h2') { title = b.text; ti = i; remove = true; break; }
        if (b.type === 'p') { title = b.text; ti = i; remove = false; break; }
      }
    }
    let subIndex = -1;
    if (ti >= 0 && ti + 1 < blocks.length && blocks[ti + 1].type === 'p') {
      const t = blocks[ti + 1].text.replace(/[*_`~=]/g, '').trim();
      if (t.length <= 56) { subtitle = t; subIndex = ti + 1; }
    }
    const gone = {};
    if (remove) gone[ti] = 1;
    if (subIndex >= 0) gone[subIndex] = 1;   // 副标题已上封面，正文不再重复
    return { title: (title || '小红书笔记').trim(), subtitle: subtitle, rest: blocks.filter((b, i) => !gone[i]) };
  }

  /* ---------- 测量上下文 ---------- */
  let mctx = null;
  function ensureMctx() {
    if (!mctx) { const c = document.createElement('canvas'); c.width = 10; c.height = 10; mctx = c.getContext('2d'); }
    mctx.textBaseline = 'middle';
    return mctx;
  }

  /* ---------- 主渲染 ---------- */
  function renderSync(blocks, opts, images) {
    ensureMctx();
    const ratio = RATIOS[opts.ratio] || RATIOS['3:4'];
    const W = opts.width || 1080, H = Math.round(W * ratio[1] / ratio[0]);
    const theme = TH.THEMES.filter(t => t.id === opts.themeId)[0] || TH.THEMES[0];
    const style = TH.STYLES.filter(s => s.id === opts.styleId)[0] || TH.STYLES[0];
    const font = TH.FONTS.filter(f => f.id === opts.fontId)[0] || TH.FONTS[1];
    const stack = font.stack;
    const dark = U.lum(theme.bg) < 0.32;

    const base = W * (opts.fontScale || 0.040);
    const pad = Math.round(W * (opts.padRatio || 0.085));
    const contentW = W - pad * 2;
    const bandH = style.band ? Math.round(H * 0.108) : 0;
    const hasHeader = !style.band && !!opts.header && !!opts.account;
    let contentTop = pad;
    if (style.band) contentTop = bandH + Math.round(base * 0.7);
    else if (hasHeader) contentTop = pad + Math.round(base * 1.05);
    const contentBottom = H - pad - Math.round(base * 0.5);
    const contentH = contentBottom - contentTop;

    const padOf = tk => (tk.seg.code ? tk.seg.size * 0.36 : 0);
    const fontFor = s => (s.italic ? 'italic ' : '') + (s.bold ? 700 : (s.weight || 400)) + ' ' + s.size + 'px ' + (s.code ? MONO : stack);
    const tok = (text, size, weight) => {
      const segs = root.MD.parseInline(text);
      segs.forEach(s => { s.size = size; s.weight = weight || 400; });
      return root.MD.tokenize(segs, fontFor);
    };
    const wrapTo = (toks, w) => root.MD.wrap(mctx, toks, w, padOf);

    const C = { text: theme.text, accent: theme.accent, codeBg: theme.codeBg, codeText: theme.codeText, hl: theme.hl };
    const CT = { text: theme.title, accent: theme.accent, codeBg: theme.codeBg, codeText: theme.codeText, hl: theme.hl };

    /* 分组背景（引用 / 代码块） */
    function groupBg(ctx, box, first, last, padTop, padBot, color, radius) {
      const x = box.x - base * 0.4, w = contentW + base * 0.8;
      const y0 = box.y - (first ? padTop : 0);
      const y1 = box.y + box.h + (last ? padBot : 0);
      ctx.fillStyle = color;
      if (first || last) {
        rr(ctx, x, y0, w, y1 - y0, radius); ctx.fill();
        if (first && !last) ctx.fillRect(x, y1 - radius, w, radius);
        if (last && !first) ctx.fillRect(x, y0, w, radius);
      } else ctx.fillRect(x, y0, w, y1 - y0);
    }

    /* ====== 构建条目 ====== */
    const coverEnabled = opts.cover !== false;
    const endEnabled = opts.end !== false;
    const cover = coverEnabled ? extractCover(blocks) : null;
    const contentBlocks = cover ? cover.rest : blocks;

    const items = [];
    const bodySize = base, bodyLH = Math.round(base * 1.78);
    let gidSeq = 0;

    const lineItem = (toks, size, lh, o) => {
      o = o || {};
      const colors = o.colors || C;
      return {
        kind: 'line', h: o.h || lh, gap: o.gap || 0, heading: !!o.heading,
        draw(ctx, box) {
          const x = box.x + (o.inset || 0);
          const yMid = box.y + lh / 2;
          if (o.deco === 'quote') {
            groupBg(ctx, box, !!o.first, !!o.last, base * 0.34, base * 0.34, theme.quoteBg, base * 0.26);
            ctx.fillStyle = theme.accent;
            const barY0 = box.y - (o.first ? base * 0.34 : 0);
            const barY1 = box.y + box.h + (o.last ? base * 0.34 : 0);
            rr(ctx, box.x - base * 0.4, barY0, Math.max(2, base * 0.12), barY1 - barY0, base * 0.06); ctx.fill();
          }
          if (o.deco === 'code') {
            groupBg(ctx, box, !!o.first, !!o.last, base * 0.44, base * 0.44, theme.codeBg, base * 0.28);
          }
          if (o.marker) {
            ctx.font = '700 ' + Math.round(base * 0.95) + 'px ' + stack;
            ctx.fillStyle = theme.accent;
            ctx.fillText(o.marker, box.x + base * 0.14, yMid);
          }
          drawSegs(ctx, toks, x, yMid, colors);
          ctx.textAlign = 'left';
        }
      };
    };

    const headingItem = (text, size, weight, mark, gap, topExtra, accentColor) => {
      const toks = tok(text, size, weight);
      const inset = mark === 'bar' ? base * 0.8 : 0;
      const lines = wrapTo(toks, contentW - inset);
      const lh = Math.round(size * 1.44);
      const extra = mark === 'underline' ? base * 0.8 : 0;
      return {
        kind: 'line', h: lines.length * lh + extra + (topExtra || 0), gap: gap, heading: true,
        draw(ctx, box) {
          const x = box.x + inset;
          const y0 = box.y + (topExtra || 0);
          if (mark === 'block') {
            ctx.fillStyle = theme.accent;
            rr(ctx, box.x - base * 0.55, box.y - base * 0.05, contentW + base * 1.1, lines.length * lh + base * 0.6, base * 0.34);
            ctx.fill();
          }
          if (mark === 'highlight') {
            lines.forEach((ln, i) => {
              ctx.font = fontFor(ln[0].seg);
              const lw = lineWidth(ctx, ln, padOf);
              ctx.fillStyle = hexA(theme.accent, 0.24);
              rr(ctx, x - size * 0.14, y0 + i * lh + lh / 2 - size * 0.7, lw + size * 0.28, size * 1.4, size * 0.16);
              ctx.fill();
            });
          }
          const colors = mark === 'block'
            ? { text: theme.onAccent, accent: theme.onAccent, codeBg: hexA(theme.onAccent, .2), codeText: theme.onAccent, hl: hexA(theme.onAccent, .25) }
            : (accentColor ? { text: theme.accent, accent: theme.accent, codeBg: theme.codeBg, codeText: theme.codeText, hl: theme.hl } : CT);
          lines.forEach((ln, i) => drawSegs(ctx, ln, x, y0 + i * lh + lh / 2, colors));
          if (mark === 'bar') {
            ctx.fillStyle = theme.accent;
            rr(ctx, box.x, y0 + lh * 0.12, base * 0.26, lines.length * lh - lh * 0.24, base * 0.13); ctx.fill();
          }
          if (mark === 'underline') {
            ctx.fillStyle = theme.accent;
            rr(ctx, box.x, y0 + lines.length * lh + base * 0.2, base * 2.5, base * 0.19, base * 0.1); ctx.fill();
          }
          ctx.textAlign = 'left';
        }
      };
    };

    /* ---- 遍历块 ---- */
    for (const b of contentBlocks) {
      if (b.type === 'h1') { items.push(headingItem(b.text, base * 1.45, 700, style.titleMark, base * 1.15, 0)); continue; }
      if (b.type === 'h2') { items.push(headingItem(b.text, base * 1.18, 700, style.titleMark === 'block' ? 'bar' : style.titleMark, base * 0.95, 0)); continue; }
      if (b.type === 'h3') { items.push(headingItem(b.text, base * 1.04, 700, 'none', base * 0.72, 0, true)); continue; }

      if (b.type === 'p') {
        wrapTo(tok(b.text, bodySize, 400), contentW).forEach((ln, i) =>
          items.push(lineItem(ln, bodySize, bodyLH, { gap: i === 0 ? base * 0.55 : 0 })));
        continue;
      }

      if (b.type === 'ul' || b.type === 'ol') {
        const inset = base * 1.3;
        b.items.forEach((it, k) => {
          const text = typeof it === 'string' ? it : it.text;
          const marker = b.type === 'ul' ? '•' : ((it.n || k + 1) + '.');
          wrapTo(tok(text, bodySize, 400), contentW - inset).forEach((ln, i) =>
            items.push(lineItem(ln, bodySize, bodyLH, {
              gap: i === 0 ? (k === 0 ? base * 0.55 : base * 0.34) : 0,
              inset: inset,
              marker: i === 0 ? marker : null
            })));
        });
        continue;
      }

      if (b.type === 'quote') {
        const qs = base * 0.95, qlh = Math.round(qs * 1.62);
        const lines = wrapTo(tok(b.text.replace(/\n/g, ' '), qs, 400), contentW - base * 1.5);
        lines.forEach((ln, i) => items.push(lineItem(ln, qs, qlh, {
          gap: i === 0 ? base * 0.72 : 0, inset: base * 1.15, deco: 'quote',
          first: i === 0, last: i === lines.length - 1
        })));
        continue;
      }

      if (b.type === 'code') {
        const cs = base * 0.86, clh = Math.round(cs * 1.62);
        b.lines.forEach((raw, i) => {
          const seg = { t: raw === '' ? ' ' : raw, code: false, italic: false, bold: false, size: cs, weight: 400 };
          const toks = [{ t: seg.t, seg: seg, font: fontFor(seg) }];
          items.push(lineItem(toks, cs, clh, {
            gap: i === 0 ? base * 0.72 : 0, inset: base * 0.75, deco: 'code',
            first: i === 0, last: i === b.lines.length - 1,
            colors: { text: theme.codeText, accent: theme.accent, codeBg: theme.codeBg, codeText: theme.codeText, hl: theme.hl }
          }));
        });
        continue;
      }

      if (b.type === 'hr') {
        items.push({
          kind: 'line', h: Math.round(base * 1.5), gap: base * 0.9,
          draw(ctx, box) {
            const yb = box.y + box.h / 2;
            ctx.fillStyle = hexA(theme.accent, 0.38);
            if (style.id === 'journal') {
              for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(W / 2 + i * base * 0.62, yb, base * 0.11, 0, 7); ctx.fill(); }
            } else {
              rr(ctx, W / 2 - contentW * 0.18, yb - base * 0.035, contentW * 0.36, base * 0.07, base * 0.05); ctx.fill();
            }
          }
        });
        continue;
      }

      if (b.type === 'img') {
        const info = images ? images[b.src] : null;
        const maxH = contentH * 0.72;
        let dw = contentW, dh = contentW * 0.5;
        if (info) { dh = contentW * info.h / info.w; if (dh > maxH) { dh = maxH; dw = dh * info.w / info.h; } }
        dh = Math.round(dh);
        items.push({
          kind: 'block', h: dh + Math.round(base * 0.6), gap: base * 0.8,
          draw(ctx, box) {
            const x = box.x + (contentW - dw) / 2, y = box.y + base * 0.3;
            ctx.save();
            rr(ctx, x, y, dw, dh, base * 0.4); ctx.clip();
            if (info) ctx.drawImage(info.img, x, y, dw, dh);
            else {
              ctx.fillStyle = theme.codeBg; ctx.fillRect(x, y, dw, dh);
              ctx.fillStyle = theme.sub; ctx.font = '600 ' + Math.round(base * 0.8) + 'px ' + stack;
              ctx.textAlign = 'center'; ctx.fillText('图片加载失败', x + dw / 2, y + dh / 2); ctx.textAlign = 'left';
            }
            ctx.restore();
            if (!info) {
              ctx.strokeStyle = hexA(theme.sub, .4); ctx.lineWidth = Math.max(1, base * .03);
              rr(ctx, x, y, dw, dh, base * 0.4); ctx.stroke();
            }
          }
        });
        continue;
      }

      if (b.type === 'table') {
        const cols = Math.max(b.header.length, b.rows.map(r => r.length).concat([1]).reduce((a, c) => Math.max(a, c), 1));
        const colW = contentW / cols, cp = base * 0.4;
        const ts = base * 0.88, tlh = Math.round(ts * 1.62);
        const totalRows = b.rows.length + 1;
        const mkRow = (cells, isHeader, ri) => {
          const wrapped = [];
          for (let c = 0; c < cols; c++) wrapped.push(wrapTo(tok(cells[c] || '', ts, isHeader ? 700 : 400), colW - cp * 2));
          const nLines = wrapped.reduce((a, w) => Math.max(a, w.length), 1);
          const rh = nLines * tlh + cp * 1.6;
          const first = ri === 0, last = ri === totalRows - 1;
          items.push({
            kind: 'block', h: rh, gap: first ? base * 0.6 : 0,
            draw(ctx, box) {
              const bx = box.x - base * 0.35, bw = contentW + base * 0.7, radius = base * 0.2;
              if (isHeader) { ctx.fillStyle = hexA(theme.accent, 0.15); rr(ctx, bx, box.y, bw, box.h, radius); ctx.fill(); }
              else if (ri % 2 === 0) { ctx.fillStyle = hexA(theme.sub, 0.07); ctx.fillRect(bx, box.y, bw, box.h); }
              ctx.strokeStyle = hexA(theme.sub, isHeader ? 0.45 : 0.18);
              ctx.lineWidth = Math.max(1, base * 0.028);
              ctx.beginPath();
              ctx.moveTo(bx, box.y + box.h - ctx.lineWidth / 2);
              ctx.lineTo(bx + bw, box.y + box.h - ctx.lineWidth / 2);
              ctx.stroke();
              const colors = { text: isHeader ? theme.title : theme.text, accent: theme.accent, codeBg: theme.codeBg, codeText: theme.codeText, hl: theme.hl };
              for (let c = 0; c < cols; c++) {
                const cx = box.x + c * colW + cp;
                wrapped[c].forEach((ln, i) => drawSegs(ctx, ln, cx, box.y + cp * 0.8 + tlh * (i + 0.5), colors));
              }
              if (first) { ctx.fillStyle = hexA(theme.accent, 0.15); rr(ctx, bx, box.y, bw, radius * 2, radius); ctx.fill(); }
            }
          });
        };
        mkRow(b.header, true, 0);
        b.rows.forEach((r, i) => mkRow(r, false, i + 1));
        continue;
      }
    }

    /* ====== 分页 ====== */
    const slack = base * 0.85;   // 容差：避免只差几像素就整行换页
    const pages = [[]];
    let y = 0;
    for (const it of items) {
      const cur = pages[pages.length - 1];
      const gap = cur.length ? it.gap : 0;
      const over = y + gap + it.h > contentH + slack;
      const orphan = !!it.heading && y + gap + it.h + bodyLH * 1.7 > contentH;
      if (cur.length && (over || orphan)) {
        pages.push([]);
        const np = pages[pages.length - 1];
        it._top = 0; np.push(it); y = it.h;
      } else {
        it._top = y + gap; cur.push(it); y = it._top + it.h;
      }
    }
    const contentPages = pages.filter(p => p.length);

    /* ====== 画布与页面绘制 ====== */
    const newCanvas = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };

    function paintBg(ctx) {
      if (style.gradient) {
        const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
        g.addColorStop(0, theme.bg); g.addColorStop(1, theme.bg2);
        ctx.fillStyle = g;
      } else ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, W, H);

      if (style.pattern === 'dots') {
        ctx.fillStyle = hexA(theme.accent, 0.18);
        const st = base * 1.5, r = Math.max(1.2, base * 0.055);
        for (let yy = st / 2; yy < H; yy += st) for (let xx = st / 2; xx < W; xx += st) { ctx.beginPath(); ctx.arc(xx, yy, r, 0, 7); ctx.fill(); }
      } else if (style.pattern === 'grid') {
        ctx.strokeStyle = hexA(theme.sub, 0.16); ctx.lineWidth = Math.max(1, base * 0.02);
        const st = base * 1.6;
        for (let xx = st; xx < W; xx += st) { ctx.beginPath(); ctx.moveTo(xx, 0); ctx.lineTo(xx, H); ctx.stroke(); }
        for (let yy = st; yy < H; yy += st) { ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke(); }
      } else if (style.pattern === 'blob') {
        const blob = (cx, cy, rad, col, a) => {
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
          g.addColorStop(0, hexA(col, a)); g.addColorStop(1, hexA(col, 0));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 7); ctx.fill();
        };
        blob(W * 0.94, H * 0.05, W * 0.62, theme.accent, dark ? 0.32 : 0.3);
        blob(W * 0.03, H * 0.95, W * 0.6, theme.bg2, dark ? 0.6 : 0.95);
        blob(W * 0.06, H * 0.12, W * 0.32, theme.accent, dark ? 0.16 : 0.14);
        blob(W * 0.9, H * 0.88, W * 0.34, theme.accent, dark ? 0.14 : 0.12);
      }
    }

    function paintBand(ctx, rightText) {
      if (!style.band) return;
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, theme.accent);
      g.addColorStop(1, mix(theme.accent, theme.bg, dark ? 0.5 : 0.35));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, bandH);
      ctx.fillStyle = theme.onAccent;
      ctx.font = '700 ' + Math.round(base * 0.7) + 'px ' + stack;
      const name = String(opts.account || 'NOTES');
      drawSpaced(ctx, name.length > 14 ? name.slice(0, 14) : name, pad, bandH / 2, base * 0.06);
      if (rightText) {
        ctx.font = '700 ' + Math.round(base * 0.62) + 'px ' + stack;
        ctx.fillStyle = hexA(theme.onAccent, 0.9);
        drawSpaced(ctx, rightText, W - pad, bandH / 2, base * 0.05, 'right');
      }
    }

    function paintCard(ctx) {
      if (!style.card) return;
      const cx = Math.round(pad * 0.45), cy = contentTop - Math.round(base * 0.9);
      const cw = W - cx * 2, ch = (contentBottom + Math.round(base * 0.9)) - cy;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,' + (dark ? 0.55 : 0.12) + ')';
      ctx.shadowBlur = base * 1.6; ctx.shadowOffsetY = base * 0.35;
      ctx.fillStyle = theme.card;
      rr(ctx, cx, cy, cw, ch, base * 0.8); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = theme.cardLine; ctx.lineWidth = Math.max(1, base * 0.03);
      rr(ctx, cx, cy, cw, ch, base * 0.8); ctx.stroke();
    }

    function paintFooter(ctx, idx, total) {
      if (!opts.pageNum || style.num === 'none') return;
      const footY = H - pad * 0.5 - base * 0.1;
      if (style.num === 'badge') {
        const r = base * 0.72, cx = W - pad - r;
        ctx.fillStyle = hexA(theme.accent, 0.16);
        ctx.beginPath(); ctx.arc(cx, footY, r, 0, 7); ctx.fill();
        ctx.fillStyle = theme.accent;
        ctx.font = '700 ' + Math.round(base * 0.62) + 'px ' + stack;
        ctx.textAlign = 'center';
        ctx.fillText(String(idx), cx, footY + base * 0.02);
        ctx.textAlign = 'left';
      } else {
        ctx.fillStyle = hexA(theme.sub, 0.95);
        ctx.font = '600 ' + Math.round(base * 0.6) + 'px ' + stack;
        drawSpaced(ctx, pad2(idx) + ' / ' + pad2(total), W - pad, footY, base * 0.04, 'right');
      }
    }

    function paintHeaderName(ctx) {
      if (!hasHeader) return;
      ctx.fillStyle = hexA(theme.sub, 0.95);
      ctx.font = '600 ' + Math.round(base * 0.62) + 'px ' + stack;
      drawSpaced(ctx, String(opts.account).slice(0, 18), W - pad, pad * 0.5, base * 0.04, 'right');
    }

    /* ---- 封面配图（置于标题上方） ---- */
    const cImg = (opts.coverImg && images) ? images[opts.coverImg] : null;
    const SIZE_RATIO = { sm: 0.42, md: 0.56, lg: 0.72, xl: 0.88 };
    const MAT = base * 0.46;   // 拍立得白边

    // 依据可用空间算出配图外框尺寸；横竖图统一按长边计算，观感更一致
    function coverImageBox(maxW, maxH) {
      if (!cImg) return null;
      const shape = opts.coverImgShape || 'rounded';
      const ratio = Math.max(0.22, Math.min(4.5, cImg.w / Math.max(1, cImg.h)));
      const side = Math.max(base * 3, maxW * (SIZE_RATIO[opts.coverImgSize] || SIZE_RATIO.md));
      const matTop = shape === 'polaroid' ? MAT : 0;
      const matBot = shape === 'polaroid' ? MAT * 1.9 : 0;
      const mh = maxH - matTop - matBot;      // 扣除相纸白边后的可用高度
      if (mh < base * 2.4) return null;       // 空间不足：宁可不放图，也不画一个米粒大的装饰
      let iw, ih;
      if (shape === 'circle') {
        iw = ih = Math.min(side, mh);
      } else if (ratio >= 1) {
        iw = Math.min(side, mh * ratio); ih = iw / ratio;
      } else {
        ih = Math.min(side, mh); iw = ih * ratio;
      }
      return { w: iw + matTop * 2, h: ih + matTop + matBot, iw: iw, ih: ih, mat: matTop, matBot: matBot };
    }

    // 等比铺满（object-fit: cover）绘制
    function drawFitted(ctx, x, y, w, h) {
      const ir = cImg.w / Math.max(1, cImg.h), br = w / Math.max(1, h);
      let sw, sh, sx, sy;
      if (ir > br) { sh = cImg.h; sw = sh * br; sx = (cImg.w - sw) / 2; sy = 0; }
      else { sw = cImg.w; sh = sw / br; sx = 0; sy = (cImg.h - sh) / 2; }
      ctx.drawImage(cImg.img, sx, sy, sw, sh, x, y, w, h);
    }

    function paintCoverImage(ctx, x, y, box) {
      const shape = opts.coverImgShape || 'rounded';
      const shadowed = (r, fill) => {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,' + (dark ? 0.6 : 0.16) + ')';
        ctx.shadowBlur = base * 1.4; ctx.shadowOffsetY = base * 0.32;
        ctx.fillStyle = fill;
        rr(ctx, x, y, box.w, box.h, r); ctx.fill();
        ctx.restore();
      };

      if (shape === 'circle') {
        const r = Math.min(box.w, box.h) / 2, cx = x + box.w / 2, cyy = y + box.h / 2;
        ctx.fillStyle = hexA(theme.accent, 0.14);
        ctx.beginPath(); ctx.arc(cx, cyy, r + base * 0.32, 0, 7); ctx.fill();
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cyy, r, 0, 7); ctx.clip();
        drawFitted(ctx, cx - r, cyy - r, r * 2, r * 2);
        ctx.restore();
        ctx.strokeStyle = hexA(theme.accent, 0.55);
        ctx.lineWidth = Math.max(1.4, base * 0.1);
        ctx.beginPath(); ctx.arc(cx, cyy, r, 0, 7); ctx.stroke();
        return;
      }

      if (shape === 'polaroid') {
        shadowed(base * 0.22, '#FFFFFF');
        ctx.save();
        rr(ctx, x + box.mat, y + box.mat, box.iw, box.ih, base * 0.1); ctx.clip();
        drawFitted(ctx, x + box.mat, y + box.mat, box.iw, box.ih);
        ctx.restore();
        ctx.fillStyle = hexA(theme.accent, 0.5);
        rr(ctx, x + box.w / 2 - base * 0.55, y + box.h - box.matBot / 2 - base * 0.06, base * 1.1, base * 0.12, base * 0.06);
        ctx.fill();
        return;
      }

      const rad = shape === 'plain' ? 0 : base * 0.9;
      shadowed(rad, '#FFFFFF');
      ctx.save();
      rr(ctx, x, y, box.w, box.h, rad); ctx.clip();
      drawFitted(ctx, x, y, box.w, box.h);
      ctx.restore();
      ctx.strokeStyle = hexA(theme.sub, 0.3);
      ctx.lineWidth = Math.max(1, base * 0.03);
      rr(ctx, x, y, box.w, box.h, rad); ctx.stroke();
    }

    /* ---- 封面 ---- */
    function renderCover(title, subtitle, total) {
      const c = newCanvas(), ctx = c.getContext('2d');
      ctx.textBaseline = 'middle';
      paintBg(ctx);
      paintCard(ctx);
      if (style.tape) {
        ctx.save(); ctx.translate(W * 0.17, H * 0.12); ctx.rotate(-0.07);
        ctx.fillStyle = hexA(theme.accent, 0.3); ctx.fillRect(-W * 0.1, -base * 0.5, W * 0.28, base * 1.0);
        ctx.restore();
        ctx.save(); ctx.translate(W * 0.845, H * 0.185); ctx.rotate(0.09);
        ctx.fillStyle = hexA(theme.accent, 0.2); ctx.fillRect(-W * 0.12, -base * 0.45, W * 0.24, base * 0.9);
        ctx.restore();
      }
      paintBand(ctx, '');

      const tSize = base * 1.95, tLH = Math.round(tSize * 1.3);
      const tLines = wrapTo(tok(title, tSize, 700), contentW * 0.94);
      const sSize = base * 0.86, sLH = Math.round(sSize * 1.62);
      const sLines = subtitle ? wrapTo(tok(subtitle, sSize, 400), contentW * 0.82).slice(0, 3) : [];

      const top = style.band ? bandH + base * 0.7 : H * 0.1;
      const bot = H - pad * 1.6;
      const kickerAdv = style.titleMark === 'block' ? base * 1.65 : base * 1.3;
      const textH = kickerAdv + tLines.length * tLH + base * 1.35 + sLines.length * sLH;

      // 配图 + 文字整体垂直居中；配图高度自适应可用空间，保证文字不被挤出
      const gapImg = base * 1.25;
      const box = coverImageBox(contentW, bot - top - textH - gapImg);
      const totalH = textH + (box ? box.h + gapImg : 0);
      let cy = top + Math.max(0, (bot - top - totalH) * 0.5);

      if (box) {
        paintCoverImage(ctx, (W - box.w) / 2, cy, box);
        cy += box.h + gapImg;
      }

      ctx.fillStyle = theme.accent;
      ctx.font = '700 ' + Math.round(base * 0.6) + 'px ' + stack;
      const kText = (opts.account ? String(opts.account).replace(/^@/, '') : 'RED NOTEBOOK');
      drawSpaced(ctx, kText.slice(0, 16), W / 2, cy, base * 0.13, 'center');
      cy += style.titleMark === 'block' ? base * 1.65 : base * 1.3;

      if (style.titleMark === 'block') {
        ctx.fillStyle = theme.accent;
        rr(ctx, pad * 0.5, cy - base * 0.55, W - pad, tLines.length * tLH + base * 1.1, base * 0.42); ctx.fill();
      }
      const tColors = style.titleMark === 'block'
        ? { text: theme.onAccent, accent: theme.onAccent, codeBg: hexA(theme.onAccent, .2), codeText: theme.onAccent, hl: hexA(theme.onAccent, .25) }
        : { text: theme.title, accent: theme.accent, codeBg: theme.codeBg, codeText: theme.codeText, hl: theme.hl };

      tLines.forEach(ln => {
        ctx.font = fontFor(ln[0].seg);
        const lw = lineWidth(ctx, ln, padOf);
        const x = (W - lw) / 2;
        if (style.titleMark === 'highlight' && ln.length) {
          ctx.fillStyle = hexA(theme.accent, 0.24);
          rr(ctx, x - tSize * 0.12, cy + tLH / 2 - tSize * 0.72, lw + tSize * 0.24, tSize * 1.44, tSize * 0.18); ctx.fill();
        }
        drawSegs(ctx, ln, x, cy + tLH / 2, tColors);
        cy += tLH;
      });

      if (style.titleMark !== 'block') {
        ctx.fillStyle = theme.accent;
        rr(ctx, W / 2 - base * 1.3, cy + base * 0.5, base * 2.6, base * 0.17, base * 0.09); ctx.fill();
      }
      cy += base * 1.35;

      for (const ln of sLines) {
        ctx.font = fontFor(ln[0].seg);
        drawSegs(ctx, ln, (W - lineWidth(ctx, ln, padOf)) / 2, cy + sLH / 2, { text: theme.sub, accent: theme.accent, codeBg: theme.codeBg, codeText: theme.codeText, hl: theme.hl });
        cy += sLH;
      }

      ctx.fillStyle = hexA(theme.sub, 0.92);
      ctx.font = '600 ' + Math.round(base * 0.58) + 'px ' + stack;
      drawSpaced(ctx, U.dateCN() + '   ·   共 ' + total + ' 页', W / 2, H - pad * 0.62, base * 0.06, 'center');
      ctx.fillStyle = hexA(theme.accent, 0.5);
      rr(ctx, W / 2 - base * 1.6, H - pad * 1.5, base * 3.2, base * 0.08, base * 0.04); ctx.fill();
      return c;
    }

    /* ---- 结尾页 ---- */
    function renderEnd() {
      const c = newCanvas(), ctx = c.getContext('2d');
      ctx.textBaseline = 'middle';
      paintBg(ctx);
      paintCard(ctx);
      paintBand(ctx, '');
      const midY = (contentTop + contentBottom) / 2;
      ctx.fillStyle = hexA(theme.accent, 0.15);
      ctx.beginPath(); ctx.arc(W / 2, midY - base * 3.3, base * 1.3, 0, 7); ctx.fill();
      ctx.fillStyle = theme.accent;
      ctx.beginPath(); ctx.arc(W / 2, midY - base * 3.3, base * 0.44, 0, 7); ctx.fill();

      ctx.fillStyle = theme.title;
      ctx.font = '700 ' + Math.round(base * 1.8) + 'px ' + stack;
      drawSpaced(ctx, '感谢阅读', W / 2, midY - base * 0.5, base * 0.1, 'center');

      ctx.fillStyle = theme.accent;
      ctx.font = '600 ' + Math.round(base * 0.9) + 'px ' + stack;
      drawSpaced(ctx, String(opts.endText || '点赞 · 收藏 · 关注不迷路').slice(0, 22), W / 2, midY + base * 1.2, base * 0.05, 'center');

      if (opts.account) {
        ctx.fillStyle = hexA(theme.sub, 0.95);
        ctx.font = '600 ' + Math.round(base * 0.76) + 'px ' + stack;
        drawSpaced(ctx, String(opts.account), W / 2, midY + base * 2.6, base * 0.05, 'center');
      }
      ctx.fillStyle = hexA(theme.accent, 0.45);
      rr(ctx, W / 2 - base * 2.2, midY - base * 1.9, base * 4.4, base * 0.08, base * 0.04); ctx.fill();
      return c;
    }

    /* ====== 组装输出 ====== */
    const out = [];
    const hasContent = contentPages.length > 0;
    const showHint = !hasContent && blocks.length === 0;   // 完全空文稿才显示提示页
    const totalPages = (coverEnabled ? 1 : 0) + (hasContent ? contentPages.length : (showHint ? 1 : 0)) + (endEnabled ? 1 : 0);

    if (coverEnabled && cover) out.push({ canvas: renderCover(cover.title, cover.subtitle, totalPages), type: 'cover' });

    (hasContent ? contentPages : (showHint ? [[]] : [])).forEach((page, pi) => {
      const c = newCanvas(), ctx = c.getContext('2d');
      ctx.textBaseline = 'middle';
      const absIdx = pi + 1 + (coverEnabled ? 1 : 0);
      paintBg(ctx);
      paintCard(ctx);
      paintBand(ctx, opts.pageNum ? (pad2(absIdx) + ' / ' + pad2(totalPages)) : '');
      paintHeaderName(ctx);
      if (!page.length) {
        ctx.fillStyle = hexA(theme.sub, 0.95);
        ctx.font = '600 ' + Math.round(base * 0.95) + 'px ' + stack;
        ctx.textAlign = 'center';
        ctx.fillText('在左侧输入 Markdown 文稿，即可生成图片', W / 2, (contentTop + contentBottom) / 2);
        ctx.textAlign = 'left';
      }
      for (const it of page) it.draw(ctx, { x: pad, y: contentTop + it._top, w: contentW, h: it.h });
      paintFooter(ctx, absIdx, totalPages);
      out.push({ canvas: c, type: 'content' });
    });

    if (endEnabled) out.push({ canvas: renderEnd(), type: 'end' });
    return out;
  }

  const api = { RATIOS: RATIOS, preloadImages: preloadImages, renderSync: renderSync, ensureMctx: ensureMctx };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RENDER = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
