/*
 * 生成应用图标 icon.ico —— 不依赖任何图形库，手写 PNG + ICO 容器
 * 图案就是本工具自己的效果：两侧是横向拉伸色带，中间保留了窄窄的「主体」竖条
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const os = require('os');

/* ---------- 最小 PNG 编码器 ---------- */
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
    raw[y*stride] = 0;                                  // filter = none
    rgba.copy(raw, y*stride + 1, y*w*4, (y+1)*w*4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- 画图案 ---------- */
function lerp(a, b, u){ return a + (b - a)*u; }
function drawIcon(size){
  const buf = Buffer.alloc(size*size*4);
  const stripW = Math.max(2, Math.round(size*0.19));
  const sx0 = Math.round((size - stripW)/2), sx1 = sx0 + stripW;
  const rad = size*0.17;

  for (let y = 0; y < size; y++){
    const t = y/(size - 1);
    let R, G, B;
    if (t < 0.45){ const u = t/0.45;        R = lerp(27,201,u);  G = lerp(42,138,u);  B = lerp(74,94,u);  }
    else if (t < 0.72){ const u = (t-0.45)/0.27; R = lerp(201,232,u); G = lerp(138,184,u); B = lerp(94,122,u); }
    else { const u = (t-0.72)/0.28;         R = lerp(232,42,u);  G = lerp(184,34,u);  B = lerp(122,48,u); }

    for (let x = 0; x < size; x++){
      let r = R, g = G, b = B;
      if (x >= sx0 && x < sx1){                          // 中央「主体」竖条：提亮
        r = Math.min(255, R*0.45 + 150);
        g = Math.min(255, G*0.45 + 128);
        b = Math.min(255, B*0.45 + 92);
      }
      const i = (y*size + x)*4;
      buf[i] = r; buf[i+1] = g; buf[i+2] = b; buf[i+3] = 255;
    }
  }
  // 圆角
  for (let y = 0; y < size; y++){
    for (let x = 0; x < size; x++){
      const dx = Math.min(x, size-1-x), dy = Math.min(y, size-1-y);
      if (dx < rad && dy < rad){
        const d = Math.hypot(rad - dx, rad - dy);
        const i = (y*size + x)*4 + 3;
        if (d > rad) buf[i] = 0;
        else if (d > rad - 1.2) buf[i] = Math.round(255 * (rad - d) / 1.2);
      }
    }
  }
  return buf;
}

/* ---------- ICO 容器（内嵌 PNG，Vista+ 支持） ---------- */
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

/* 顺手在临时目录导一张 256 PNG，方便肉眼确认 */
const prev = path.join(os.tmpdir(), 'repponen-demo', 'icon_preview.png');
fs.mkdirSync(path.dirname(prev), { recursive: true });
fs.writeFileSync(prev, encodePNG(256, 256, drawIcon(256)));

console.log('icon.ico  ' + ico.length + ' bytes, ' + SIZES.length + ' sizes (' + SIZES.join('/') + ')');
console.log('preview   ' + prev);
