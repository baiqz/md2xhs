/* ===== 应用逻辑 ===== */
(function () {
  'use strict';
  const U = window.U, MD = window.MD, RENDER = window.RENDER, TH = window.TH;
  const $ = U.$, pad2 = U.pad2;

  const PREVIEW_W = 900;   // 预览渲染宽度（按比例缩放，分页结果与导出完全一致）
  const KEY = 'md2xhs.state.v1';

  const el = {
    md: $('#md'), pages: $('#pages'), stat: $('#stat'), pageInfo: $('#pageInfo'),
    themeGrid: $('#themeGrid'), styleGrid: $('#styleGrid'), fontGrid: $('#fontGrid'),
    themeName: $('#themeName'), styleName: $('#styleName'),
    ratio: $('#ratio'), fontSize: $('#fontSize'), padSize: $('#padSize'), exportWidth: $('#exportWidth'),
    account: $('#account'), endText: $('#endText'),
    optCover: $('#optCover'), optEnd: $('#optEnd'), optPageNum: $('#optPageNum'), optHeader: $('#optHeader'),
    progress: $('#progress'), fileInput: $('#fileInput'),
    coverImgDrop: $('#coverImgDrop'), coverImgInput: $('#coverImgInput'), coverImgPick: $('#coverImgPick'),
    coverImgClear: $('#coverImgClear'), coverImgThumb: $('#coverImgThumb'), coverImgName: $('#coverImgName'),
    coverImgOpts: $('#coverImgOpts'), coverImgSize: $('#coverImgSize'), coverImgShape: $('#coverImgShape')
  };

  const SAMPLE = `# 3 个让笔记好看 10 倍的排版习惯

写给每一个想把内容**认真做好**的你。

## 01 留白比装饰更重要

很多人一上手就想加边框、贴纸和各种元素，结果画面反而变得很吵。

- 页边距至少留出画面宽度的 8%
- 正文行距设置在 1.6 ~ 1.8 倍之间
- 一段话不超过 5 行，超过就拆成两段

## 02 建立稳定的视觉秩序

统一，比好看更重要。读者记住的是整体感觉，而不是某处花哨的装饰。

> 好的排版是"没有存在感"的：读者只会记得内容，不会记得字体。

需要强调时，用 ==高亮== 或者 **加粗** 就够了，不要同时用三种强调方式。

## 03 让配色只做一件事

一份笔记里，主色最好不要超过 2 个。

| 用途 | 建议 | 占比 |
| --- | --- | --- |
| 背景 | 低饱和浅色 | 70% |
| 文字 | 深灰而非纯黑 | 25% |
| 强调 | 高饱和点色 | 5% |

## 最后

排版是内容的放大器，不是替代品。先把话说清楚，再让它好看。

---

换一下左侧的配色和风格，同一份文稿会有完全不同的气质。`;

  const state = {
    md: SAMPLE, themeId: 'cream', styleId: 'board', fontId: 'sans',
    ratio: '3:4', fontScale: 0.040, padRatio: 0.085, exportWidth: 1080,
    account: '', endText: '点赞 · 收藏 · 关注不迷路',
    cover: true, end: true, pageNum: true, header: true,
    coverImg: '', coverImgName: '', coverImgSize: 'md', coverImgShape: 'rounded'
  };

  let pages = [];       // 当前预览的画布
  let renderToken = 0;
  let busy = false;

  /* ---------- 状态存取 ---------- */
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { }
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(state, JSON.parse(raw));
    } catch (e) { }
  }

  /* ---------- 选项 ---------- */
  function opts(width) {
    return {
      width: width || PREVIEW_W,
      ratio: state.ratio, themeId: state.themeId, styleId: state.styleId, fontId: state.fontId,
      fontScale: state.fontScale, padRatio: state.padRatio,
      account: state.account, endText: state.endText,
      cover: state.cover, end: state.end, pageNum: state.pageNum, header: state.header,
      coverImg: state.coverImg, coverImgSize: state.coverImgSize, coverImgShape: state.coverImgShape
    };
  }

  /* ---------- 设置界面 ---------- */
  function buildThemeGrid() {
    el.themeGrid.innerHTML = '';
    TH.THEMES.forEach(t => {
      const d = document.createElement('div');
      d.className = 'sw' + (t.id === state.themeId ? ' active' : '');
      d.dataset.id = t.id;
      d.innerHTML = '<div class="bar" style="background:linear-gradient(135deg,' + t.bg + ' 0 62%,' + t.accentSoft + ' 62% 100%)">' +
        '<i style="background:' + t.accent + '"></i></div><span>' + t.name + '</span>';
      d.onclick = () => {
        state.themeId = t.id; save(); syncActive();
        el.themeName.textContent = t.name;
        regenerate();
      };
      el.themeGrid.appendChild(d);
    });
  }

  function buildStyleGrid() {
    el.styleGrid.innerHTML = '';
    TH.STYLES.forEach(s => {
      const b = document.createElement('div');
      b.className = 'chip' + (s.id === state.styleId ? ' active' : '');
      b.dataset.id = s.id; b.textContent = s.name;
      b.onclick = () => {
        state.styleId = s.id; save(); syncActive();
        el.styleName.textContent = s.name;
        regenerate();
      };
      el.styleGrid.appendChild(b);
    });
  }

  function buildFontGrid() {
    el.fontGrid.innerHTML = '';
    TH.FONTS.forEach(f => {
      const b = document.createElement('div');
      b.className = 'chip' + (f.id === state.fontId ? ' active' : '');
      b.dataset.id = f.id; b.textContent = f.name;
      b.title = f.note;
      b.style.fontFamily = f.stack;
      b.onclick = () => { state.fontId = f.id; save(); syncActive(); regenerate(); };
      el.fontGrid.appendChild(b);
    });
  }

  function syncActive() {
    document.querySelectorAll('#themeGrid .sw').forEach(e => e.classList.toggle('active', e.dataset.id === state.themeId));
    document.querySelectorAll('#styleGrid .chip').forEach(e => e.classList.toggle('active', e.dataset.id === state.styleId));
    document.querySelectorAll('#fontGrid .chip').forEach(e => e.classList.toggle('active', e.dataset.id === state.fontId));
    const th = TH.THEMES.filter(t => t.id === state.themeId)[0];
    const st = TH.STYLES.filter(s => s.id === state.styleId)[0];
    if (th) el.themeName.textContent = th.name;
    if (st) el.styleName.textContent = st.name;
  }

  function syncControls() {
    el.md.value = state.md;
    el.ratio.value = state.ratio;
    el.fontSize.value = Number(state.fontScale).toFixed(3);
    el.padSize.value = Number(state.padRatio).toFixed(3);
    el.exportWidth.value = String(state.exportWidth);
    el.account.value = state.account;
    el.endText.value = state.endText;
    el.optCover.checked = state.cover;
    el.optEnd.checked = state.end;
    el.optPageNum.checked = state.pageNum;
    el.optHeader.checked = state.header;
    el.coverImgSize.value = state.coverImgSize;
    el.coverImgShape.value = state.coverImgShape;
  }

  function updateInfo() {
    const r = RENDER.RATIOS[state.ratio] || [1080, 1440];
    const ew = Number(state.exportWidth) || 1080;
    el.pageInfo.textContent = pages.length + ' 页 · 导出 ' + ew + ' × ' + Math.round(ew * r[1] / r[0]) + ' px';
    el.stat.textContent = state.md.replace(/\s/g, '').length + ' 字 · ' + pages.length + ' 页';
  }

  /* ---------- 封面配图 ---------- */
  const IMG_MAX = 1280;          // 长边上限（同时兼顾清晰度与 localStorage 体积）
  const IMG_SOFT_LIMIT = 2600000; // data URL 字符数上限，超出则退化为 JPEG

  function syncCoverImage() {
    const has = !!state.coverImg;
    el.coverImgDrop.classList.toggle('has', has);
    el.coverImgThumb.style.backgroundImage = has ? 'url("' + state.coverImg + '")' : '';
    el.coverImgThumb.textContent = has ? '' : '图片';   // 占位字不能留在图片上面
    el.coverImgPick.textContent = has ? '点击更换图片' : '点击选择图片';
    el.coverImgName.textContent = has ? (state.coverImgName || '已添加') : '未添加';
    el.coverImgClear.hidden = !has;
    el.coverImgOpts.classList.toggle('off', !has);
  }

  function loadImageFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type || '')) { U.toast('请选择图片文件（JPG / PNG / WebP）'); return; }
    const fr = new FileReader();
    fr.onload = () => normalizeImage(String(fr.result), file.name);
    fr.onerror = () => U.toast('图片读取失败，请重试');
    fr.readAsDataURL(file);
  }

  // 缩放到安全尺寸后再存：避免大图撑爆 localStorage，也加快每次重渲染
  function normalizeImage(src, name) {
    const img = new Image();
    img.onload = () => {
      const nw = img.naturalWidth || 1, nh = img.naturalHeight || 1;
      const k = Math.min(1, IMG_MAX / Math.max(nw, nh));
      const w = Math.max(1, Math.round(nw * k)), h = Math.max(1, Math.round(nh * k));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      // 抽样检测透明通道：有透明就用 PNG，否则用 JPEG（体积小得多）
      let alpha = false;
      try {
        const d = ctx.getImageData(0, 0, w, h).data;
        for (let i = 3; i < d.length; i += 4 * 31) { if (d[i] < 250) { alpha = true; break; } }
      } catch (e) { }
      let url = alpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.87);
      if (alpha && url.length > IMG_SOFT_LIMIT) {
        const c2 = document.createElement('canvas');
        c2.width = w; c2.height = h;
        const x2 = c2.getContext('2d');
        x2.fillStyle = '#FFFFFF'; x2.fillRect(0, 0, w, h); x2.drawImage(c, 0, 0);
        url = c2.toDataURL('image/jpeg', 0.85);
      }

      state.coverImg = url;
      state.coverImgName = String(name || 'cover').replace(/\.[^.]+$/, '').slice(0, 12);
      save();
      syncCoverImage();
      regenerate();
      U.toast('已添加封面配图' + (k < 1 ? '（已压缩至 ' + w + '×' + h + '）' : ''));
    };
    img.onerror = () => U.toast('图片解析失败，请换一张试试');
    img.src = src;
  }

  function clearCoverImage() {
    state.coverImg = ''; state.coverImgName = '';
    save(); syncCoverImage(); regenerate();
    U.toast('已移除封面配图');
  }

  /* ---------- 预览 ---------- */
  async function regenerate() {
    const token = ++renderToken;
    const blocks = MD.parse(state.md);
    const images = await RENDER.preloadImages(blocks, state.coverImg ? [state.coverImg] : []);
    if (token !== renderToken) return;

    const out = RENDER.renderSync(blocks, opts(PREVIEW_W), images);
    if (token !== renderToken) return;

    pages = out.map(o => o.canvas);
    el.pages.innerHTML = '';
    pages.forEach((c, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'page';
      const badge = document.createElement('span');
      badge.className = 'idx';
      badge.textContent = (i + 1) + (i === 0 && state.cover ? ' · 封面' : (i === pages.length - 1 && state.end ? ' · 结尾' : ''));
      const hint = document.createElement('span');
      hint.className = 'dl';
      hint.textContent = '点击下载本页';
      wrap.appendChild(c); wrap.appendChild(badge); wrap.appendChild(hint);
      wrap.onclick = () => exportOne(i);
      el.pages.appendChild(wrap);
    });

    const chars = state.md.replace(/\s/g, '').length;
    el.stat.textContent = chars + ' 字 · ' + pages.length + ' 页';
    updateInfo();
  }

  const regenerateLazy = U.debounce(regenerate, 280);

  /* ---------- 导出 ---------- */
  const toBlob = c => new Promise(r => c.toBlob(r, 'image/png'));
  async function toBytes(c) { return new Uint8Array(await (await toBlob(c)).arrayBuffer()); }

  function showProgress(on, text, ratio) {
    el.progress.classList.toggle('on', on);
    if (text) el.progress.querySelector('span').textContent = text;
    el.progress.querySelector('i').style.width = Math.round((ratio || 0) * 100) + '%';
  }

  function setBusy(b) {
    busy = b;
    document.querySelectorAll('.btn').forEach(x => x.disabled = b);
  }

  async function renderForExport() {
    const blocks = MD.parse(state.md);
    const images = await RENDER.preloadImages(blocks, state.coverImg ? [state.coverImg] : []);
    return RENDER.renderSync(blocks, opts(Number(state.exportWidth) || 1080), images).map(o => o.canvas);
  }

  async function exportZip() {
    if (busy) return;
    setBusy(true);
    try {
      showProgress(true, '正在生成图片…', 0.05);
      const canvases = await renderForExport();
      const files = [];
      for (let i = 0; i < canvases.length; i++) {
        const bytes = await toBytes(canvases[i]);
        files.push({ name: pad2(i + 1) + '.png', data: bytes });
        showProgress(true, '正在打包 ' + (i + 1) + '/' + canvases.length, (i + 1) / (canvases.length + 1) * 0.9);
        await U.nextFrame();
      }
      const blob = window.ZIP.create(files);
      U.download(blob, '小红书笔记-' + U.stamp() + '.zip');
      showProgress(true, '打包完成', 1);
      U.toast('已下载 ZIP（' + files.length + ' 张图片）');
      setTimeout(() => showProgress(false), 900);
    } catch (e) {
      showProgress(false);
      U.toast('导出失败：' + e.message);
    } finally { setBusy(false); }
  }

  async function exportPngs() {
    if (busy) return;
    setBusy(true);
    try {
      showProgress(true, '正在生成图片…', 0.05);
      const canvases = await renderForExport();
      for (let i = 0; i < canvases.length; i++) {
        const blob = await toBlob(canvases[i]);
        U.download(blob, pad2(i + 1) + '.png');
        showProgress(true, '正在下载 ' + (i + 1) + '/' + canvases.length, (i + 1) / canvases.length);
        await U.sleep(180);
      }
      U.toast('已下载 ' + canvases.length + ' 张 PNG');
      setTimeout(() => showProgress(false), 900);
    } catch (e) {
      showProgress(false);
      U.toast('导出失败：' + e.message);
    } finally { setBusy(false); }
  }

  async function exportOne(index) {
    if (busy) return;
    setBusy(true);
    try {
      U.toast('正在导出第 ' + (index + 1) + ' 页…');
      const canvases = await renderForExport();
      const c = canvases[index];
      if (!c) { U.toast('该页不存在'); return; }
      U.download(await toBlob(c), pad2(index + 1) + '.png');
      U.toast('已下载第 ' + (index + 1) + ' 页');
    } catch (e) { U.toast('导出失败：' + e.message); }
    finally { setBusy(false); }
  }

  /* ---------- 事件绑定 ---------- */
  function bind() {
    el.md.addEventListener('input', () => { state.md = el.md.value; save(); regenerateLazy(); });

    const onChange = () => { syncActive(); regenerateLazy(); };
    el.ratio.onchange = () => { state.ratio = el.ratio.value; save(); updateInfo(); onChange(); };
    el.fontSize.onchange = () => { state.fontScale = parseFloat(el.fontSize.value); save(); onChange(); };
    el.padSize.onchange = () => { state.padRatio = parseFloat(el.padSize.value); save(); onChange(); };
    el.exportWidth.onchange = () => { state.exportWidth = Number(el.exportWidth.value); save(); updateInfo(); };
    el.account.oninput = () => { state.account = el.account.value.trim(); save(); regenerateLazy(); };
    el.endText.oninput = () => { state.endText = el.endText.value; save(); regenerateLazy(); };

    const onToggle = () => {
      state.cover = el.optCover.checked; state.end = el.optEnd.checked;
      state.pageNum = el.optPageNum.checked; state.header = el.optHeader.checked;
      save(); regenerateLazy();
    };
    [el.optCover, el.optEnd, el.optPageNum, el.optHeader].forEach(x => x.onchange = onToggle);

    /* ---- 封面配图 ---- */
    el.coverImgDrop.onclick = e => {
      if (e.target.closest('#coverImgClear')) return;
      el.coverImgInput.click();
    };
    el.coverImgInput.onchange = e => {
      const f = e.target.files && e.target.files[0];
      el.coverImgInput.value = '';
      loadImageFile(f);
    };
    el.coverImgClear.onclick = e => { e.stopPropagation(); clearCoverImage(); };
    el.coverImgSize.onchange = () => { state.coverImgSize = el.coverImgSize.value; save(); regenerateLazy(); };
    el.coverImgShape.onchange = () => { state.coverImgShape = el.coverImgShape.value; save(); regenerateLazy(); };

    ['dragenter', 'dragover'].forEach(t => el.coverImgDrop.addEventListener(t, e => {
      e.preventDefault(); e.stopPropagation(); el.coverImgDrop.classList.add('over');
    }));
    ['dragleave', 'dragend'].forEach(t => el.coverImgDrop.addEventListener(t, e => {
      e.preventDefault(); e.stopPropagation(); el.coverImgDrop.classList.remove('over');
    }));
    el.coverImgDrop.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation();
      el.coverImgDrop.classList.remove('over');
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadImageFile(f);
    });

    // Ctrl/Cmd + V 直接粘贴剪贴板里的图片
    document.addEventListener('paste', e => {
      const items = (e.clipboardData && e.clipboardData.items) || [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image/') === 0) {
          const f = items[i].getAsFile();
          if (f) { e.preventDefault(); loadImageFile(f); }
          return;
        }
      }
    });

    $('#btnZip').onclick = exportZip;
    $('#btnPng').onclick = exportPngs;
    $('#btnSample').onclick = () => { el.md.value = SAMPLE; state.md = SAMPLE; save(); regenerate(); U.toast('已载入示例文稿'); };
    $('#btnClear').onclick = () => { el.md.value = ''; state.md = ''; save(); regenerate(); el.md.focus(); };

    el.fileInput.onchange = e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        el.md.value = r.result; state.md = r.result; save(); regenerate();
        U.toast('已导入 ' + f.name);
      };
      r.readAsText(f, 'utf-8');
      el.fileInput.value = '';
    };

    // 拖拽导入
    const panel = document.querySelector('.panel.left');
    ['dragenter', 'dragover'].forEach(t => panel.addEventListener(t, e => { e.preventDefault(); panel.classList.add('drop'); }));
    ['dragleave', 'drop'].forEach(t => panel.addEventListener(t, e => { e.preventDefault(); panel.classList.remove('drop'); }));
    panel.addEventListener('drop', e => {
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      // 拖进来的是图片 → 直接作为封面配图，而不是当成 Markdown 导入
      if (/^image\//.test(f.type || '')) { loadImageFile(f); return; }
      const r = new FileReader();
      r.onload = () => { el.md.value = r.result; state.md = r.result; save(); regenerate(); U.toast('已导入 ' + f.name); };
      r.readAsText(f, 'utf-8');
    });

    // 快捷键：Ctrl/Cmd + S 打包
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); exportZip(); }
    });

    // Markdown 编辑增强：快捷键 / 工具栏 / 列表自动续行
    // 写入 textarea 会派发 input 事件，走上面对 input 的监听，所以这里不用另外触发预览
    MDE.attach(el.md, { toolbar: '#mdbar' });
  }

  /* ---------- 启动 ---------- */
  load();
  buildThemeGrid(); buildStyleGrid(); buildFontGrid();
  syncControls(); syncActive(); syncCoverImage();
  bind();
  regenerate();
})();
