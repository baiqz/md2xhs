/* ===== 纯 JS ZIP 打包（store 存储，无需外部库） ===== */
(function (root) {
  'use strict';

  let TABLE = null;
  function table() {
    if (TABLE) return TABLE;
    TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      TABLE[n] = c >>> 0;
    }
    return TABLE;
  }

  function crc32(u8) {
    const T = table();
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) crc = (crc >>> 8) ^ T[(crc ^ u8[i]) & 0xFF];
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  /** files: [{name, data: Uint8Array}] -> Blob(browser) / Buffer(node) */
  function create(files) {
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = (((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF);
    const dosDate = ((((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF);

    const chunks = [];
    const central = [];
    let offset = 0;

    for (const f of files) {
      const nameBytes = enc.encode(f.name);
      const data = f.data;
      const crc = crc32(data);

      const local = new Uint8Array(30 + nameBytes.length);
      const dv = new DataView(local.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 0x0800, true);   // UTF-8 名称
      dv.setUint16(8, 0, true);        // 不压缩
      dv.setUint16(10, dosTime, true);
      dv.setUint16(12, dosDate, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, data.length, true);
      dv.setUint32(22, data.length, true);
      dv.setUint16(26, nameBytes.length, true);
      dv.setUint16(28, 0, true);
      local.set(nameBytes, 30);

      chunks.push(local, data);
      central.push({ nameBytes: nameBytes, crc: crc, size: data.length, offset: offset });
      offset += local.length + data.length;
    }

    const cdParts = [];
    let cdSize = 0;
    for (const c of central) {
      const h = new Uint8Array(46 + c.nameBytes.length);
      const dv = new DataView(h.buffer);
      dv.setUint32(0, 0x02014b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 20, true);
      dv.setUint16(8, 0x0800, true);
      dv.setUint16(10, 0, true);
      dv.setUint16(12, dosTime, true);
      dv.setUint16(14, dosDate, true);
      dv.setUint32(16, c.crc, true);
      dv.setUint32(20, c.size, true);
      dv.setUint32(24, c.size, true);
      dv.setUint16(28, c.nameBytes.length, true);
      dv.setUint32(42, c.offset, true);
      h.set(c.nameBytes, 46);
      cdParts.push(h);
      cdSize += h.length;
    }

    const eocd = new Uint8Array(22);
    const dv = new DataView(eocd.buffer);
    dv.setUint32(0, 0x06054b50, true);
    dv.setUint16(8, central.length, true);
    dv.setUint16(10, central.length, true);
    dv.setUint32(12, cdSize, true);
    dv.setUint32(16, offset, true);

    const all = chunks.concat(cdParts, [eocd]);
    if (typeof Blob !== 'undefined' && typeof document !== 'undefined') {
      return new Blob(all, { type: 'application/zip' });
    }
    const total = all.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let p = 0;
    for (const c of all) { out.set(c, p); p += c.length; }
    return out;
  }

  const api = { create: create, crc32: crc32 };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ZIP = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
