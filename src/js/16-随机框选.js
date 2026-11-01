/* =========================================================
   随机框选
   输入：宽/高范围（占画面尺寸百分比）、个数
   处理：每层独立抽宽高与位置
   输出：追加到图层栈顶
   ========================================================= */
function boxSizeRange(){
  const p = function(id, dft){ const v = parseFloat($(id).value); return isFinite(v) ? v : dft; };
  let wMin = clamp(p('rbWMin', 8), 1, 100), wMax = clamp(p('rbWMax', 40), 1, 100);
  let hMin = clamp(p('rbHMin', 20), 1, 100), hMax = clamp(p('rbHMax', 100), 1, 100);
  if (wMin > wMax){ const t = wMin; wMin = wMax; wMax = t; }
  if (hMin > hMax){ const t = hMin; hMin = hMax; hMax = t; }
  return {
    wMin: Math.max(2, S.src.w * wMin/100), wMax: Math.max(2, S.src.w * wMax/100),
    hMin: Math.max(2, S.src.h * hMin/100), hMax: Math.max(2, S.src.h * hMax/100)
  };
}
function clampIntoImage(r){
  const w = clamp(Math.round(r.w), 2, S.src.w);
  const h = clamp(Math.round(r.h), 2, S.src.h);
  return {
    w: w, h: h,
    x: clamp(Math.round(r.x), 0, S.src.w - w),
    y: clamp(Math.round(r.y), 0, S.src.h - h)
  };
}
function randomBoxes(count){
  if (!S.src.canvas) return [];
  const R = boxSizeRange();
  const out = [];
  for (let i = 0; i < count; i++){
    const w = R.wMin + Math.random() * (R.wMax - R.wMin);
    const h = R.hMin + Math.random() * (R.hMax - R.hMin);
    out.push(clampIntoImage({ w: w, h: h,
      x: Math.random() * (S.src.w - w), y: Math.random() * (S.src.h - h) }));
  }
  return out;
}
function addBoxes(rects, label){
  if (!rects.length) return;
  pushUndo();
  let last = null;
  rects.forEach(function(r){
    const L = makeLayer(r);
    L.name = (label || '随机框') + ' ' + S.layers.length;
    S.layers.push(L);
    last = L;
  });
  S.sel = last ? last.id : null;
  renderAll();
}
function doRandomBox(){
  if (!S.src.canvas){ toast('先导入图片'); return; }
  const n = clamp(parseInt($('rbN').value) || 1, 1, 50);
  addBoxes(randomBoxes(n), '随机框');
  toast('已随机生成 ' + n + ' 个框');
}

