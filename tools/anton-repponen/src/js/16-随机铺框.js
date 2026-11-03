/* =========================================================
   随机铺框
   ---------------------------------------------------------
   在源图上切出一组矩形：**铺满整张图、彼此不重叠**。
   参数只有两个 —— 数量、大小差异。

   做法是二叉切分：每次挑当前面积最大的一块，沿它的长边切一刀，
   切点在中间附近抖动。「大小差异」就是这个抖动的幅度：
   0 = 每一刀都从正中间切（块面尽量等大）；
   100 = 切点可以在 10%~90% 之间乱跳（大小混排）。

   和以前那个「随机网格」的区别：网格是先切列再切行，结果一眼能看出是格子；
   这里每次切的是「当前最大的一块」，所以能出大小错落的版式，
   而且切到第 n 块就停，天然满足「数量 = n」。
   ========================================================= */

function tileSplit(w, h, n, variance){
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  n = clamp(Math.round(n), 1, 200);
  const v = clamp(variance, 0, 100) / 100;

  const out = [{ x: 0, y: 0, w: w, h: h }];
  let guard = 0;
  while (out.length < n && guard++ < n * 10){
    /* 挑面积最大、且还切得动的一块 */
    let bi = -1, ba = -1;
    for (let i = 0; i < out.length; i++){
      const r = out[i];
      if (r.w < 4 && r.h < 4) continue;
      const a = r.w * r.h;
      if (a > ba){ ba = a; bi = i; }
    }
    if (bi < 0) break;                       // 已经切不动了（图太小 / 块太多）

    const r = out.splice(bi, 1)[0];
    const vertical = r.w >= r.h;             // 沿长边切，避免切出细长条
    const len = vertical ? r.w : r.h;
    if (len < 4){ out.push(r); break; }

    const k = 0.5 + (Math.random() * 2 - 1) * 0.5 * v * 0.8;
    const cut = clamp(Math.round(len * k), 2, len - 2);

    if (vertical){
      out.push({ x: r.x,         y: r.y, w: cut,     h: r.h });
      out.push({ x: r.x + cut,   y: r.y, w: r.w - cut, h: r.h });
    } else {
      out.push({ x: r.x, y: r.y,         w: r.w, h: cut });
      out.push({ x: r.x, y: r.y + cut,   w: r.w, h: r.h - cut });
    }
  }
  return out;
}

/* 铺出来的框替换掉现有图层 —— 它们是一整套铺满画面的版式，混着别的层没有意义 */
function doTiling(){
  if (!S.src.canvas){ toast('先导入图片'); return; }
  const n = clamp(parseInt($('tileN').value) || 6, 1, 60);
  const v = clamp(parseFloat($('tileVar').value) || 0, 0, 100);

  const rects = tileSplit(S.src.w, S.src.h, n, v);
  pushUndo();
  S.layers = [];
  rects.forEach(function(r, i){
    const L = makeLayer(r);
    L.name = '铺框 ' + (i + 1);
    S.layers.push(L);
  });
  setSel([]);
  renderAll();
  toast('已铺 ' + rects.length + ' 个框 · 覆盖全图、互不重叠');
}
