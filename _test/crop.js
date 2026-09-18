/* 局部放大：检查封面上副标题处那条横线是什么 */
const fs = require('fs'), path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

(async () => {
  const src = process.argv[2];
  const img = await loadImage(src);
  const sx = Number(process.argv[3]), sy = Number(process.argv[4]), sw = Number(process.argv[5]), sh = Number(process.argv[6]);
  const z = 4;
  const c = createCanvas(sw * z, sh * z);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw * z, sh * z);
  const out = path.join(__dirname, 'crop.png');
  fs.writeFileSync(out, c.toBuffer('image/png'));
  console.log('saved ' + out);
})();
