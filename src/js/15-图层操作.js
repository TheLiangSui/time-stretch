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
