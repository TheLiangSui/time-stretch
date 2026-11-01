/* =========================================================
   取样线：决定「取哪一条像素」以及「往哪个方向拉」
     dir = 'h' 取矩形内一条竖线（宽 1px、高 h），沿水平方向拉伸铺满矩形
     dir = 'v' 取矩形内一条横线（高 1px、宽 w），沿垂直方向拉伸铺满矩形
     sampleOff（-100 ~ +100，占半宽/半高的百分比）
       -100 = 左/上边缘   0 = 居中（默认）   +100 = 右/下边缘
   ========================================================= */
function sampleLine(L, x, y, w, h){
  const dir = (L.dir === 'v') ? 'v' : 'h';
  const off = clamp(L.sampleOff || 0, -100, 100) / 100;
  if (dir === 'h'){
    const cx = clamp(Math.round(x + w/2 + off * w/2), x, x + w - 1);
    return { dir:'h', sx:cx, sy:y, sw:1, sh:h, len:h, cw:1, ch:h, pos:cx };
  }
  const cy = clamp(Math.round(y + h/2 + off * h/2), y, y + h - 1);
  return { dir:'v', sx:x, sy:cy, sw:w, sh:1, len:w, cw:w, ch:1, pos:cy };
}

/* =========================================================
   M4 拉伸算法 —— 核心
   输入：图层 L、源图层、矩形 (x,y,w,h)
   处理：
     ① 按 dir 取一条 1px 宽的取样线（位置由 sampleOff 决定，默认居中）
     ② 沿线方向的像素序列做置换（乱序 / 间序）
     ③ 方块感：每 block 个像素一组，整组统一取该组首像素的颜色
     ④ 色彩：饱和度 / 冷暖度
     ⑤ 把这条成品线沿垂直方向放大铺满矩形（关闭插值 = 硬边纯色铺满）
   输出：矩形区域内的拉伸光栅
   ========================================================= */
function buildStripe(L, sl){
  const len = sl.len;
  const N = clamp(Math.round(L.block), 1, 100);
  const seq = (N > 1 || L.order !== 'none') ? buildSeq(len, L) : null;
  const sat = L.sat/100, warm = L.warm/100;
  if (!seq && sat === 0 && warm === 0) return null;   // 无需后处理 → 走快路径

  const srcData = S.src.ctx.getImageData(sl.sx, sl.sy, sl.sw, sl.sh).data;  // 连续的 len 个像素
  const img = new ImageData(sl.cw, sl.ch);
  const od = img.data;
  const memo = new Map();

  for (let i = 0; i < len; i++){
    const sr = seq ? seq[Math.floor(i/N)*N] : i;      // 组内统一取该组首像素
    let c = memo.get(sr);
    if (!c){
      let R = srcData[sr*4], G = srcData[sr*4+1], B = srcData[sr*4+2];
      if (sat !== 0){                                 // 饱和度：绕亮度轴外推
        const lum = 0.2126*R + 0.7152*G + 0.0722*B;
        const f = 1 + sat;
        R = lum + (R - lum)*f;
        G = lum + (G - lum)*f;
        B = lum + (B - lum)*f;
      }
      if (warm !== 0){                                // 冷暖：乘性偏移，保住黑场
        R *= (1 + 0.30*warm);
        G *= (1 + 0.06*warm);
        B *= (1 - 0.30*warm);
      }
      c = [R, G, B, srcData[sr*4+3]];                 // Uint8ClampedArray 自动取整+钳位
      memo.set(sr, c);
    }
    od[i*4] = c[0]; od[i*4+1] = c[1]; od[i*4+2] = c[2]; od[i*4+3] = c[3];
  }
  const out = document.createElement('canvas');
  out.width = sl.cw; out.height = sl.ch;
  out.getContext('2d').putImageData(img, 0, 0);
  return out;
}
/* 成品线缓存：只有参数或源图变了才重算（getImageData 是 GPU 回读，很贵） */
function stripeFor(L, sl){
  const N = clamp(Math.round(L.block), 1, 100);
  if (N <= 1 && L.order === 'none' && L.sat === 0 && L.warm === 0) return null;
  /* 缓存键 = 源图版本 + 这次取样到哪一条 + 图层自身全部字段。
     以前这里是手写清单，加一个像素参数忘了登记 → 改了值但画面不动，且极难查。
     现在用 stableStr 自动收录（_col 这类下划线字段自动排除）。
     stableStr 一次约几微秒，一屏几十层也不到一帧的零头。 */
  const key = S.src.version + '|' + sl.dir + '|' + sl.sx + '|' + sl.sy + '|' +
              sl.len + '|' + stableStr(L);
  if (L._col && L._col.key === key) return L._col.canvas;
  const c = buildStripe(L, sl);
  L._col = { key:key, canvas:c };
  return c;
}

/* 位图铺满矩形：保持比例、居中裁切（和 CSS 的 object-fit:cover 同理） */
function drawCover(g, img, x, y, w, h){
  const iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight;
  if (!iw || !ih) return;
  const k = Math.max(w / iw, h / ih);
  const dw = iw * k, dh = ih * k;
  g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}
function drawStretchedLayer(g, L){
  const s = S.src;
  if (!s.canvas || L.w <= 0 || L.h <= 0) return;
  if (L.kind === 'image' && !L.img) return;
  const x = Math.round(L.x), y = Math.round(L.y);
  const w = Math.round(L.w), h = Math.round(L.h);
  if (w <= 0 || h <= 0) return;
  const sl = sampleLine(L, x, y, w, h);

  g.save();
  g.globalAlpha = L.opacity;
  g.globalCompositeOperation = L.blend;
  /* 合并形状：clip 到若干矩形的并集，而不是整个包围盒 */
  if (L.parts && L.parts.length > 1){
    const path = new Path2D();
    for (let i = 0; i < L.parts.length; i++){
      const p = L.parts[i];
      path.rect(x + p.x, y + p.y, p.w, p.h);
    }
    g.clip(path);
  } else {
    g.beginPath(); g.rect(x, y, w, h); g.clip();
  }
  /* 色相：交给画布的 filter，一次 drawImage 搞定，比逐像素改 HSL 便宜得多 */
  if (L.hue) g.filter = 'hue-rotate(' + L.hue + 'deg)';
  if (L.kind === 'image'){
    g.imageSmoothingEnabled = true;
    drawCover(g, L.img, x, y, w, h);
  } else {
    g.imageSmoothingEnabled = false;             // 硬边：纯色铺满，不做插值
    const stripe = stripeFor(L, sl);
    if (stripe) g.drawImage(stripe, 0, 0, sl.cw, sl.ch, x, y, w, h);
    else        g.drawImage(s.canvas, sl.sx, sl.sy, sl.sw, sl.sh, x, y, w, h);
  }
  g.restore();
}
