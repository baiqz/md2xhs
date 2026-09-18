/* ===== 配色主题 / 版式风格 / 字体 ===== */
(function (root) {
  'use strict';

  /* ---------------- 配色主题 ---------------- */
  const THEMES = [
    {
      id: 'cream', name: '奶油拿铁', sw: ['#FFF9F0', '#E08C36', '#1F1A17'],
      bg: '#FFF9F0', bg2: '#FFE9CF', card: '#FFFFFF', cardLine: '#F1E2CF',
      title: '#1F1A17', text: '#463B32', sub: '#9C8C7C',
      accent: '#E08C36', accentSoft: '#FBE3C0', onAccent: '#FFFFFF',
      codeBg: '#F6EBDC', codeText: '#8A5A20', quoteBg: '#FBF1E2', hl: '#FCE7BE'
    },
    {
      id: 'sakura', name: '樱花粉', sw: ['#FFF2F5', '#EE6C8B', '#2B1620'],
      bg: '#FFF2F5', bg2: '#FFDCE5', card: '#FFFFFF', cardLine: '#F7DCE3',
      title: '#2B1620', text: '#4C323B', sub: '#B08A97',
      accent: '#EE6C8B', accentSoft: '#FBD3DE', onAccent: '#FFFFFF',
      codeBg: '#FBE7EC', codeText: '#B33A5B', quoteBg: '#FDEFF3', hl: '#FBD0DC'
    },
    {
      id: 'mint', name: '薄荷绿', sw: ['#EDFBF4', '#22B183', '#0F2A21'],
      bg: '#EDFBF4', bg2: '#D2F2E2', card: '#FFFFFF', cardLine: '#D6EDE2',
      title: '#0F2A21', text: '#23423A', sub: '#7BA294',
      accent: '#22B183', accentSoft: '#C9EFDF', onAccent: '#FFFFFF',
      codeBg: '#E3F5EC', codeText: '#17795A', quoteBg: '#E9F7F1', hl: '#C6EEDC'
    },
    {
      id: 'morandi', name: '莫兰迪蓝', sw: ['#EFF3F7', '#4E86B6', '#16212B'],
      bg: '#EFF3F7', bg2: '#DAE4EF', card: '#FFFFFF', cardLine: '#DCE5EE',
      title: '#16212B', text: '#2F3D4A', sub: '#8697A6',
      accent: '#4E86B6', accentSoft: '#D3E3F1', onAccent: '#FFFFFF',
      codeBg: '#E7EFF6', codeText: '#35648C', quoteBg: '#EDF3F8', hl: '#CFE1F0'
    },
    {
      id: 'dark', name: '暗夜黑', sw: ['#15171C', '#FFC94D', '#FFFFFF'],
      bg: '#15171C', bg2: '#232733', card: '#1F232C', cardLine: '#2E3440',
      title: '#FFFFFF', text: '#DEE3EC', sub: '#8B94A5',
      accent: '#FFC94D', accentSoft: '#4A3F1E', onAccent: '#16181D',
      codeBg: '#23282F', codeText: '#9BE1C0', quoteBg: '#1D222A', hl: '#4A3D18'
    },
    {
      id: 'paper', name: '复古报刊', sw: ['#F2EADA', '#A63F26', '#201C15'],
      bg: '#F2EADA', bg2: '#E5D8BE', card: '#FBF6EA', cardLine: '#E0D3B8',
      title: '#201C15', text: '#3D3729', sub: '#8B8171',
      accent: '#A63F26', accentSoft: '#EBD3C6', onAccent: '#FFFFFF',
      codeBg: '#EDE3CE', codeText: '#7A3A22', quoteBg: '#F6EEDC', hl: '#EADFC2'
    },
    {
      id: 'y2k', name: '千禧紫', sw: ['#F4EFFF', '#7C4DFF', '#20143A'],
      bg: '#F4EFFF', bg2: '#E3D6FF', card: '#FFFFFF', cardLine: '#E4DBF7',
      title: '#20143A', text: '#372B52', sub: '#9285B3',
      accent: '#7C4DFF', accentSoft: '#E0D5FF', onAccent: '#FFFFFF',
      codeBg: '#EDE6FF', codeText: '#5B2FD6', quoteBg: '#F3EEFF', hl: '#DED2FF'
    },
    {
      id: 'orange', name: '元气橙', sw: ['#FFF5EA', '#F97316', '#2A180B'],
      bg: '#FFF5EA', bg2: '#FFE3C6', card: '#FFFFFF', cardLine: '#F7E3CE',
      title: '#2A180B', text: '#4C3624', sub: '#AB8E72',
      accent: '#F97316', accentSoft: '#FDE0C2', onAccent: '#FFFFFF',
      codeBg: '#FCEBDA', codeText: '#B34E0A', quoteBg: '#FDF1E4', hl: '#FBD9B4'
    },
    {
      id: 'forest', name: '森林绿', sw: ['#F0F6F0', '#3F8F55', '#12241A'],
      bg: '#F0F6F0', bg2: '#DCEBDA', card: '#FFFFFF', cardLine: '#DEECDD',
      title: '#12241A', text: '#24382C', sub: '#78907C',
      accent: '#3F8F55', accentSoft: '#D2E9D7', onAccent: '#FFFFFF',
      codeBg: '#E6F2E8', codeText: '#2C6B3D', quoteBg: '#EDF5EE', hl: '#CFE7D5'
    },
    {
      id: 'graphite', name: '高级灰', sw: ['#F4F4F5', '#E4572E', '#111214'],
      bg: '#F4F4F5', bg2: '#E4E5E8', card: '#FFFFFF', cardLine: '#E2E3E6',
      title: '#111214', text: '#2E3034', sub: '#83878F',
      accent: '#E4572E', accentSoft: '#F7DCD4', onAccent: '#FFFFFF',
      codeBg: '#ECEDEF', codeText: '#B34124', quoteBg: '#F0F1F3', hl: '#F5D9D1'
    },
    {
      id: 'ocean', name: '深海蓝', sw: ['#EFF7FA', '#1E93B8', '#0D2530'],
      bg: '#EFF7FA', bg2: '#D3EAF3', card: '#FFFFFF', cardLine: '#D8EAF2',
      title: '#0D2530', text: '#1F3B48', sub: '#7C9AA6',
      accent: '#1E93B8', accentSoft: '#CDE8F1', onAccent: '#FFFFFF',
      codeBg: '#E4F1F6', codeText: '#146E8C', quoteBg: '#ECF6FA', hl: '#CBE6F0'
    },
    {
      id: 'mono', name: '黑白极简', sw: ['#FFFFFF', '#FF2E4D', '#0A0A0A'],
      bg: '#FFFFFF', bg2: '#F1F1F1', card: '#FFFFFF', cardLine: '#E6E6E6',
      title: '#0A0A0A', text: '#232323', sub: '#8A8A8A',
      accent: '#FF2E4D', accentSoft: '#FFDDE3', onAccent: '#FFFFFF',
      codeBg: '#F4F4F4', codeText: '#C42A44', quoteBg: '#FAFAFA', hl: '#FFE2E7'
    }
  ];

  /* ---------------- 版式风格 ---------------- */
  // pattern: none | dots | grid | blob
  // titleMark: underline | bar | highlight | block
  // num: plain | badge
  const STYLES = [
    { id: 'minimal',  name: '极简留白', pattern: 'none', card: false, band: false, gradient: false, titleMark: 'underline', num: 'plain' },
    { id: 'board',    name: '圆角卡片', pattern: 'none', card: true,  band: false, gradient: false, titleMark: 'bar',       num: 'plain' },
    { id: 'magazine', name: '杂志栏目', pattern: 'none', card: false, band: true,  gradient: false, titleMark: 'bar',       num: 'none' },
    { id: 'journal',  name: '手账格纹', pattern: 'dots', card: false, band: false, gradient: false, titleMark: 'highlight', num: 'badge', tape: true },
    { id: 'bold',     name: '大字标题', pattern: 'none', card: false, band: false, gradient: false, titleMark: 'block',     num: 'badge' },
    { id: 'gradient', name: '渐变氛围', pattern: 'blob', card: false, band: false, gradient: true,  titleMark: 'highlight', num: 'plain' }
  ];

  /* ---------------- 字体 ---------------- */
  const FONTS = [
    { id: 'serif', name: '衬线', note: '宋体 / 思源宋体', stack: '"Source Han Serif SC","Noto Serif SC","Songti SC",STSong,SimSun,"Times New Roman",Georgia,serif' },
    { id: 'sans',  name: '非衬线', note: '苹方 / 微软雅黑', stack: '"PingFang SC","HarmonyOS Sans SC","Microsoft YaHei","Hiragino Sans GB","Source Han Sans SC","Noto Sans SC",system-ui,-apple-system,sans-serif' },
    { id: 'round', name: '圆体', note: '圆润可爱', stack: '"Yuanti SC","YouYuan","Hiragino Maru Gothic ProN","PingFang SC","Microsoft YaHei",sans-serif' },
    { id: 'kai',   name: '楷体', note: '文艺手写感', stack: '"Kaiti SC",KaiTi,STKaiti,"Source Han Serif SC","Songti SC",serif' },
    { id: 'mono',  name: '等宽', note: '技术/代码风', stack: 'ui-monospace,Consolas,"SFMono-Regular","Cascadia Code","Microsoft YaHei",monospace' }
  ];

  const MONO = 'ui-monospace,Consolas,"SFMono-Regular","Cascadia Code","Microsoft YaHei",monospace';

  const api = { THEMES: THEMES, STYLES: STYLES, FONTS: FONTS, MONO: MONO };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TH = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
