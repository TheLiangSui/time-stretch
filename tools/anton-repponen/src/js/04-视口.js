/* =========================================================
   M2 视口
   ========================================================= */
function fitView(){
  if (!S.src.w) return;
  const cw = vp.clientWidth, ch = vp.clientHeight, pad = 48;
  const s = Math.min((cw - pad*2)/S.src.w, (ch - pad*2)/S.src.h);
  S.view.s = clamp(s, 0.01, 8);
  S.view.tx = (cw - S.src.w*S.view.s)/2;
  S.view.ty = (ch - S.src.h*S.view.s)/2;
}
function zoomAt(scrX, scrY, factor){
  if (!S.src.w) return;
  const before = scr2img(scrX, scrY);
  S.view.s = clamp(S.view.s * factor, 0.02, 32);
  const after = scr2img(scrX, scrY);
  S.view.tx += (after.x - before.x) * S.view.s;
  S.view.ty += (after.y - before.y) * S.view.s;
}
function zoomCenter(factor){ zoomAt(vp.clientWidth/2, vp.clientHeight/2, factor); }

/* =========================================================
   像素顺序（乱序 / 间序）
   输入：矩形高度 h、图层参数
   处理：生成「输出第 i 行 -> 取源第几行」的置换表
   输出：Int32Array(h)，恒为一个 0..h-1 的排列
   ========================================================= */
function buildSeq(h, L){
  const seq = new Int32Array(h);
  for (let i = 0; i < h; i++) seq[i] = i;

  if (L.order === 'shuffle'){
    const amt = clamp(L.shufAmt/100, 0, 1);
    if (amt <= 0) return seq;
    const bs  = clamp(Math.round(L.shufBlock), 1, 64);
    const rnd = mulberry32(L.seed >>> 0);
    const n   = Math.ceil(h/bs);
    const ord = new Int32Array(n);
    for (let i = 0; i < n; i++) ord[i] = i;
    /* 以「块」为单位做 Fisher-Yates：强度 = 每一步真正发生交换的概率。
       amt=0 → 原序；amt=1 → 完全打乱；中间值 → 局部错位 */
    for (let i = n-1; i > 0; i--){
      if (rnd() >= amt) continue;
      const j = Math.floor(rnd() * (i + 1));
      const t = ord[i]; ord[i] = ord[j]; ord[j] = t;
    }
    let p = 0;
    for (let i = 0; i < n; i++){
      const s = ord[i]*bs, e = Math.min(h, s + bs);
      for (let k = s; k < e; k++) seq[p++] = k;
    }
  } else if (L.order === 'interleave'){
    /* 把竖向像素切成 k 段，再按「各段第 1 行、各段第 2 行…」的轮转顺序缝回 */
    const k = clamp(Math.round(L.interSeg), 2, 64);
    const segLen = Math.ceil(h/k);
    let p = 0;
    for (let r = 0; r < segLen; r++){
      for (let s = 0; s < k; s++){
        const idx = s*segLen + r;
        if (idx < h) seq[p++] = idx;
      }
    }
  }
  return seq;
}
