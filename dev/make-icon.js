/*
 * 生成 icon.ico —— 不依赖图形库，手写 PNG + ICO 容器。
 * 图案：四个色块拼成 2×2 —— 合集里有多个工具，颜色取自各工具的 accent。
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const os = require('os');

function crc32(buf){
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++){
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, c]);
}
function encodePNG(w, h, rgba){
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = w*4 + 1;
  const raw = Buffer.alloc(stride*h);
  for (let y = 0; y < h; y++){
    raw[y*stride] = 0;
    rgba.copy(raw, y*stride + 1, y*w*4, (y+1)*w*4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- 图案 ---------- */
const COLORS = [
  [13, 153, 255],    // 蓝 · Anton Repponen
  [139, 92, 246],    // 紫 · 渐变网格
  [249, 115, 22],    // 橙 · 半调网点
  [236, 72, 153]     // 粉 · 故障位移
];

/* 圆角矩形覆盖率：返回 0..1 的 alpha */
function roundRectCov(x, y, left, top, w, h, r){
  const cx = Math.min(Math.max(x, left + r), left + w - r);
  const cy = Math.min(Math.max(y, top + r), top + h - r);
  const d = Math.hypot(x - cx, y - cy);
  if (x < left || x > left + w || y < top || y > top + h) return 0;
  if (d <= r - 0.6) return 1;
  if (d >= r + 0.6) return 0;
  return (r + 0.6 - d) / 1.2;
}

function drawIcon(size){
  const buf = Buffer.alloc(size*size*4);
  const R = size * 0.235;                       // 外圆角
  const pad = Math.max(1.5, size * 0.135);
  const gap = Math.max(1, size * 0.055);
  const cell = (size - pad*2 - gap) / 2;
  const cr = cell * 0.26;                       // 色块圆角

  for (let y = 0; y < size; y++){
    for (let x = 0; x < size; x++){
      const px = x + 0.5, py = y + 0.5;
      const i = (y*size + x)*4;

      // 底：#171717，带外圆角
      const outer = roundRectCov(px, py, 0, 0, size, size, R);
      if (outer <= 0){ buf[i+3] = 0; continue; }
      let r = 23, g = 23, b = 23, a = outer;

      // 四个色块
      for (let k = 0; k < 4; k++){
        const cx = pad + (k % 2) * (cell + gap);
        const cy = pad + Math.floor(k / 2) * (cell + gap);
        const cov = roundRectCov(px, py, cx, cy, cell, cell, cr);
        if (cov > 0){
          const c = COLORS[k];
          r = Math.round(r * (1 - cov) + c[0] * cov);
          g = Math.round(g * (1 - cov) + c[1] * cov);
          b = Math.round(b * (1 - cov) + c[2] * cov);
        }
      }

      buf[i] = r; buf[i+1] = g; buf[i+2] = b;
      buf[i+3] = Math.round(255 * a);
    }
  }
  return buf;
}

/* ---------- ICO 容器 ---------- */
function buildICO(sizes){
  const pngs = sizes.map(function(s){
    return { s: s, data: encodePNG(s, s, drawIcon(s)) };
  });
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(pngs.length, 4);
  let offset = 6 + pngs.length*16;
  const entries = pngs.map(function(p){
    const e = Buffer.alloc(16);
    e[0] = p.s >= 256 ? 0 : p.s;
    e[1] = p.s >= 256 ? 0 : p.s;
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(p.data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += p.data.length;
    return e;
  });
  return Buffer.concat([dir].concat(entries).concat(pngs.map(function(p){ return p.data; })));
}

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const ico = buildICO(SIZES);
fs.writeFileSync(path.join(__dirname, '..', 'icon.ico'), ico);

const prev = path.join(__dirname, '..', 'icon-preview.png');
fs.writeFileSync(prev, encodePNG(256, 256, drawIcon(256)));

console.log('icon.ico  ' + ico.length + ' bytes, ' + SIZES.length + ' sizes (' + SIZES.join('/') + ')');
console.log('preview   ' + prev);
