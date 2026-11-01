/* =========================================================
   图层操作
   ========================================================= */
function deleteSel(){
  const ids = selSet(); if (!ids.length) return;
  pushUndo();
  const gone = {};
  ids.forEach(function(id){ gone[id] = 1; });
  S.layers = S.layers.filter(function(x){ return !gone[x.id]; });
  /* 合集空了就一起删掉 */
  Object.keys(S.groups).forEach(function(gid){
    if (!S.layers.some(function(L){ return L.gid === gid; })) delete S.groups[gid];
  });
  setSel([]);
  renderAll();
}
function duplicateSel(){
  const ids = selSet(); if (!ids.length) return;
  pushUndo();
  const copies = [];
  S.layers.forEach(function(L){
    if (ids.indexOf(L.id) < 0) return;
    const c = cloneLayer(L);
    c.id = uid();
    c.gid = null;                       // 副本不继承合集
    c.name = L.name + ' 副本';
    copies.push(c);
  });
  /* 全部插在最上面那个选中层的后面，保持相对顺序 */
  const topIdx = Math.max.apply(null, S.layers.map(function(L, i){
    return ids.indexOf(L.id) >= 0 ? i : -1;
  }));
  S.layers.splice(topIdx + 1, 0, ...copies);
  setSel(copies.map(function(c){ return c.id; }), copies[copies.length-1].id);
  renderAll();
}
/* ---- 图层剪贴板（Ctrl+C / Ctrl+X / Ctrl+V） ---- */
/* 图片层的位图不进 JSON（否则每次撤销快照都要带一份 base64）。
   用 id -> canvas 的注册表在撤销/复制后重新挂回去。 */
const IMG_REG = new Map();
function attachImg(L, cv, name){
  IMG_REG.set(L.id, cv);
  Object.defineProperty(L, 'img', { value: cv, writable: true, enumerable: false, configurable: true });
  L.kind = 'image';
  if (name) L.imgName = name;
  return L;
}
/* 把一张位图加成图层：按原尺寸放，超出画布就等比缩到 90% 以内，居中 */
function createImageLayer(cv, name){
  if (!S.src.canvas){ toast('先导入主图'); return null; }
  pushUndo();
  const k = Math.min(1, S.src.w * 0.9 / cv.width, S.src.h * 0.9 / cv.height);
  const w = Math.max(2, Math.round(cv.width * k));
  const hh = Math.max(2, Math.round(cv.height * k));
  const L = makeLayer({ x: Math.round((S.src.w - w) / 2), y: Math.round((S.src.h - hh) / 2), w: w, h: hh });
  L.name = (name || '图片').replace(/.[^.]+$/, '').slice(0, 28);
  attachImg(L, cv, name);
  S.layers.push(L);
  setSel([L.id], L.id);
  renderAll();
  return L;
}
/* 读一个图片文件成 canvas */
function fileToCanvas(file, cb){
  const fr = new FileReader();
  fr.onload = function(){
    const im = new Image();
    im.onload = function(){
      const c = document.createElement('canvas');
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      c.getContext('2d').drawImage(im, 0, 0);
      cb(c, file.name);
    };
    im.onerror = function(){ toast('这张图片读不出来'); };
    im.src = fr.result;
  };
  fr.onerror = function(){ toast('文件读取失败'); };
  fr.readAsDataURL(file);
}
function cloneLayer(L){
  const o = JSON.parse(JSON.stringify(L, function(k,v){ return k === '_col' ? undefined : v; }));
  if (L.kind === 'image' && L.img){
    o.id = uid();
    attachImg(o, L.img, L.imgName);
  }
  return o;
}
function copyLayer(){
  const L = getSel();
  if (!L){ toast('先选中一个图层再复制'); return; }
  S.clipboard = cloneLayer(L);
  S.pasteCount = 0;
  toast('已复制「' + L.name + '」，Ctrl+V 粘贴');
}
function cutLayer(){
  const L = getSel();
  if (!L){ toast('先选中一个图层再剪切'); return; }
  copyLayer();
  deleteSel();
  toast('已剪切「' + S.clipboard.name + '」，Ctrl+V 粘贴');
}
function pasteLayer(){
  if (!S.clipboard){ toast('剪贴板里还没有图层（先 Ctrl+C）'); return; }
  if (!S.src.canvas){ toast('先导入图片'); return; }
  pushUndo();
  const c = cloneLayer(S.clipboard);
  delete c.origId;
  c.id = uid();
  c.name = (c.name || '拉伸层') + ' 副本';
  /* 连续粘贴时逐次错开，不然全叠在同一个位置看不出来 */
  S.pasteCount = (S.pasteCount || 0) + 1;
  const dx = Math.max(6, Math.round(S.src.w * 0.015)) * S.pasteCount;
  const dy = Math.max(6, Math.round(S.src.h * 0.015)) * S.pasteCount;
  c.w = Math.min(c.w, S.src.w); c.h = Math.min(c.h, S.src.h);
  c.x = clamp(c.x + dx, 0, S.src.w - c.w);
  c.y = clamp(c.y + dy, 0, S.src.h - c.h);
  S.layers.push(c);
  S.sel = c.id;
  renderAll();
  toast('已粘贴「' + c.name + '」');
}
function clearAll(){
  if (!S.layers.length){ toast('已经没有拉伸层了'); return; }
  if (!confirm('删除全部 ' + S.layers.length + ' 个拉伸层？源图层会保留。')) return;
  pushUndo();
  S.layers = []; S.sel = null;
  renderAll();
  toast('已清空拉伸层');
}
/* 把一段长度切成 n 份，但每份大小随机不等（jitter=0 退化为等分）。
   做法：给每份抽一个 1±0.9·jitter 的权重，按权重占比分配长度，再取整并保证严格递增。 */
function randomCuts(total, n, jitter){
  if (n <= 1) return [0, total];
  const w = [];
  let sum = 0;
  for (let i = 0; i < n; i++){
    const v = 1 + (Math.random()*2 - 1) * jitter * 0.9;
    w.push(Math.max(0.05, v));
    sum += Math.max(0.05, v);
  }
  const cuts = [0];
  let acc = 0;
  for (let i = 0; i < n; i++){
    acc += w[i];
    cuts.push(Math.round(acc / sum * total));
  }
  cuts[0] = 0;
  cuts[n] = total;
  for (let i = 1; i <= n; i++){          // 保证严格递增，至少留 1px
    if (cuts[i] <= cuts[i-1]) cuts[i] = cuts[i-1] + 1;
  }
  return cuts;
}
/* 把切点转成 [起, 止] 区间；overlap>0 时每段向两侧外扩自身长度的一定比例，制造重叠 */
function cutsToSegs(cuts, total, overlap){
  const segs = [];
  for (let i = 0; i < cuts.length - 1; i++){
    let a = cuts[i], b = cuts[i+1];
    if (overlap > 0){
      const pad = Math.round((b - a) * overlap * 0.5);
      a = Math.max(0, a - pad);
      b = Math.min(total, b + pad);
    }
    segs.push([a, b]);
  }
  return segs;
}
function makeGrid(){
  const cols = clamp(parseInt($('gridC').value) || 1, 1, 60);
  const rows = clamp(parseInt($('gridR').value) || 1, 1, 60);
  const jit  = clamp(parseFloat($('gridJit').value) || 0, 0, 100) / 100;
  const ov   = clamp(parseFloat($('gridOv').value) || 0, 0, 60) / 100;
  if (!S.src.canvas) return;
  if (cols * rows > 900){ toast('最多 900 个格子'); return; }

  pushUndo();
  const xs = cutsToSegs(randomCuts(S.src.w, cols, jit), S.src.w, ov);
  const ys = cutsToSegs(randomCuts(S.src.h, rows, jit), S.src.h, ov);

  S.layers = []; S.nextId = 1;
  let n = 1;
  for (let r = 0; r < rows; r++){
    for (let c = 0; c < cols; c++){
      const L = makeLayer({ x: xs[c][0], y: ys[r][0], w: xs[c][1]-xs[c][0], h: ys[r][1]-ys[r][0] });
      L.name = '拉伸层 ' + (n++);
      S.layers.push(L);
    }
  }
  S.sel = null;
  renderAll();
  const overlapNote = ov > 0 ? '，相邻重叠 ' + Math.round(ov*100) + '%' : '';
  toast('已生成 ' + (cols*rows) + ' 个不等分格（随机度 ' + Math.round(jit*100) + '%' + overlapNote + '）');
}
