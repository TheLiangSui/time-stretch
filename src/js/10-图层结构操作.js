/* =========================================================
   图层结构操作
   ---------------------------------------------------------
   动的是数据：数组顺序、gid、parts。不画界面 ——
   改完自己调 renderAll()，面板靠签名判断要不要重建。
   ========================================================= */
let dragId = null;

function groupSelected(){
  const ids = selSet();
  if (ids.length < 2){ toast('至少选中两层才能成组（Ctrl / Shift + 点击图层行）'); return; }
  pushUndo();
  const members = S.layers.filter(function(L){ return ids.indexOf(L.id) >= 0; });
  const out = [];
  let inserted = false;
  for (const L of S.layers){
    if (ids.indexOf(L.id) >= 0){
      if (!inserted){ members.forEach(function(m){ out.push(m); }); inserted = true; }
      continue;
    }
    out.push(L);
  }
  S.layers = out;
  const gid = 'g' + (S.nextGid++);
  S.groups[gid] = { id:gid, name:'合集 ' + S.nextGid, collapsed:false, visible:true };
  members.forEach(function(L){ L.gid = gid; });
  setSel(members.map(function(L){ return L.id; }), members[members.length-1].id);
  renderAll();
  toast('已成组：' + S.groups[gid].name);
}
function ungroupSelected(){
  const ids = selSet();
  const gids = {};
  ids.forEach(function(id){ const L = byId(id); if (L && L.gid) gids[L.gid] = 1; });
  const keys = Object.keys(gids);
  if (!keys.length){ toast('选中的图层不在合集里'); return; }
  pushUndo();
  S.layers.forEach(function(L){ if (L.gid && gids[L.gid]) L.gid = null; });
  keys.forEach(function(k){ delete S.groups[k]; });
  renderAll();
  toast('已解散合集');
}

/* 合并形状：把选中的若干矩形并成「一个图层 + 若干矩形块」，
   拉伸时只在这些块的并集里出像素 —— 这样能拼出 L 形、T 形、凹形等。 */
function mergeSelectedShapes(){
  const ids = selSet();
  if (ids.length < 2){ toast('至少选中两层才能合并（Ctrl / Shift + 点击图层行）'); return; }
  pushUndo();
  const members = S.layers.filter(function(L){ return ids.indexOf(L.id) >= 0; });
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  members.forEach(function(m){
    minX = Math.min(minX, m.x); minY = Math.min(minY, m.y);
    maxX = Math.max(maxX, m.x + m.w); maxY = Math.max(maxY, m.y + m.h);
  });
  const parts = [];
  members.forEach(function(m){
    const list = (m.parts && m.parts.length)
      ? m.parts.map(function(p){ return { x:m.x + p.x, y:m.y + p.y, w:p.w, h:p.h }; })
      : [{ x:m.x, y:m.y, w:m.w, h:m.h }];
    list.forEach(function(p){
      parts.push({
        x: Math.round(p.x - minX), y: Math.round(p.y - minY),
        w: Math.max(1, Math.round(p.w)), h: Math.max(1, Math.round(p.h))
      });
    });
  });
  const base = members[members.length-1];
  const L = makeLayer({
    x: Math.round(minX), y: Math.round(minY),
    w: Math.round(maxX - minX), h: Math.round(maxY - minY),
    dir: base.dir
  });
  L.parts = parts;
  L.name = '合并形状';
  /* 拉伸参数沿用主选中层 */
  ['block','order','shufAmt','shufBlk','seed','interSeg','sat','warm','opacity','blend','sampleOff']
    .forEach(function(k){ if (base[k] !== undefined) L[k] = base[k]; });
  S.layers = S.layers.filter(function(x){ return ids.indexOf(x.id) < 0; });
  S.layers.push(L);
  setSel([L.id], L.id);
  renderAll();
  toast('已把 ' + members.length + ' 个图层合并成 1 个形状');
}

function moveLayerRelative(fromId, toId, placeAfterInList){
  const from = S.layers.findIndex(function(L){ return L.id === fromId; });
  if (from < 0) return;
  const item = S.layers.splice(from, 1)[0];
  let to = S.layers.findIndex(function(L){ return L.id === toId; });
  if (to < 0){ S.layers.splice(from, 0, item); return; }
  if (!placeAfterInList) to += 1;   // 列表是「顶->底」，数组是「底->顶」，方向相反
  pushUndo();
  S.layers.splice(to, 0, item);
  renderAll();
}
function shiftLayer(dir){   // +1 上浮（数组后移），-1 下沉
  const L = getSel(); if (!L) return;
  const i = S.layers.indexOf(L), j = i + dir;
  if (j < 0 || j >= S.layers.length) return;
  pushUndo();
  S.layers.splice(i,1); S.layers.splice(j,0,L);
  renderAll();
}
