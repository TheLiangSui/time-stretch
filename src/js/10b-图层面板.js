/* =========================================================
   图层面板：视图
   ---------------------------------------------------------
   结构操作在 10-图层结构操作.js。这里只管「怎么画一行」。
   ========================================================= */
/* 图层缩略图：把该层实际采样到的那条像素带画进小方块，
   一眼就能认出「这一层是什么效果」，不必靠读名字。 */
const THUMB_W = 44, THUMB_H = 56;
function paintThumb(cv, L){
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  if (!S.src.canvas) return;
  g.imageSmoothingEnabled = false;
  if (!L){                                   // 源图层：整图等比缩进
    const k = Math.min(cv.width / S.src.w, cv.height / S.src.h);
    const w = Math.max(1, Math.round(S.src.w * k)), h = Math.max(1, Math.round(S.src.h * k));
    g.imageSmoothingEnabled = true;
    g.drawImage(S.src.canvas, Math.round((cv.width-w)/2), Math.round((cv.height-h)/2), w, h);
    return;
  }
  const x = Math.round(L.x), y = Math.round(L.y);
  const w = Math.max(1, Math.round(L.w)), h = Math.max(1, Math.round(L.h));
  if (L.kind === 'image'){
    if (!L.img) return;
    g.imageSmoothingEnabled = true;
    g.save();
    if (L.parts && L.parts.length > 1){
      const kx = cv.width / w, ky = cv.height / h;
      const p0 = new Path2D();
      for (let i = 0; i < L.parts.length; i++){
        const q = L.parts[i];
        p0.rect(q.x * kx, q.y * ky, q.w * kx, q.h * ky);
      }
      g.clip(p0);
    }
    if (L.hue) g.filter = 'hue-rotate(' + L.hue + 'deg)';
    drawCover(g, L.img, 0, 0, cv.width, cv.height);
    g.restore();
    return;
  }
  const sl = sampleLine(L, x, y, w, h);
  if (L.parts && L.parts.length > 1){
    const kx = cv.width / w, ky = cv.height / h;
    const path = new Path2D();
    for (let i = 0; i < L.parts.length; i++){
      const p = L.parts[i];
      path.rect(p.x * kx, p.y * ky, p.w * kx, p.h * ky);
    }
    g.save(); g.clip(path);
    const st0 = stripeFor(L, sl);
    if (st0) g.drawImage(st0, 0, 0, sl.cw, sl.ch, 0, 0, cv.width, cv.height);
    else g.drawImage(S.src.canvas, sl.sx, sl.sy, sl.sw, sl.sh, 0, 0, cv.width, cv.height);
    g.restore();
    return;
  }
  const stripe = stripeFor(L, sl);
  if (stripe) g.drawImage(stripe, 0, 0, sl.cw, sl.ch, 0, 0, cv.width, cv.height);
  else g.drawImage(S.src.canvas, sl.sx, sl.sy, sl.sw, sl.sh, 0, 0, cv.width, cv.height);
}
function makeThumb(L){
  const c = document.createElement('canvas');
  c.width = THUMB_W; c.height = THUMB_H;
  paintThumb(c, L);
  return c;
}
function makeGroupRow(g){
  const members = S.layers.filter(function(L){ return L.gid === g.id; });
  const allSel = members.length > 0 && members.every(function(L){ return isSel(L.id); });

  const tog = h('span', {
    class: 'gtog' + (g.collapsed ? '' : ' open'), title: '展开 / 收起',
    on: { click: function(e){
      e.stopPropagation();
      g.collapsed = !g.collapsed;
      renderLayerList();
    } }
  }, icon('i-chev', 'ic-s'));

  const eye = h('span', {
    class: 'eye ' + (g.visible ? 'on' : 'off'), title: '显示 / 隐藏整组',
    on: { click: function(e){
      e.stopPropagation();
      pushUndo();
      g.visible = !g.visible;
      members.forEach(function(L){ L.visible = g.visible; });
      renderAll();
    } }
  }, icon(g.visible ? 'i-eye' : 'i-eyeoff', 'ic-s'));

  const row = h('div', { class: 'li grp-row' + (allSel ? ' sel' : ''), draggable: 'true' },
    tog,
    h('span', { class: 'gico' }, icon('i-group', 'ic-s')),
    h('span', { class: 'txt' },
      h('span', { class: 'nm', text: g.name }),
      h('span', { class: 'meta', text: '合集 · ' + members.length + ' 层' })),
    eye);

  row._G = g;

  /* 组头和普通行一样能拖 —— 拖的是整组，落点是另一组的整块或某个单层 */
  row.addEventListener('dragstart', function(e){
    dragIds = members.map(function(L){ return L.id; });
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', 'g:' + g.id); } catch(_){}
  });
  row.addEventListener('dragend', function(){ dragIds = null; clearDropMarks(); renderLayerList(); });
  row.addEventListener('dragover', function(e){
    if (!dragIds) return;
    if (members.some(function(L){ return dragIds.indexOf(L.id) >= 0; })) return;
    e.preventDefault(); clearDropMarks();
    const r = row.getBoundingClientRect();
    row.classList.add((e.clientY - r.top) > r.height/2 ? 'dropafter' : 'dropbefore');
  });
  row.addEventListener('drop', function(e){
    if (!dragIds) return;
    if (members.some(function(L){ return dragIds.indexOf(L.id) >= 0; })) return;
    e.preventDefault(); e.stopPropagation();
    const r = row.getBoundingClientRect();
    moveBlockRelative(dragIds, { gid: g.id }, (e.clientY - r.top) > r.height/2);
    dragIds = null; clearDropMarks();
  });

  row.addEventListener('click', function(e){
    if (e.ctrlKey || e.metaKey || e.shiftKey){
      members.forEach(function(L){ if (!isSel(L.id)) S.selIds.push(L.id); });
      if (members.length) S._sel = members[members.length-1].id;
    } else {
      setSel(members.map(function(L){ return L.id; }),
             members.length ? members[members.length-1].id : null);
    }
    renderAll();
  });
  row.addEventListener('dblclick', function(e){
    if (e.target.closest('.gtog, .eye')) return;
    const n = prompt('合集名称', g.name);
    if (n !== null && n.trim()){ pushUndo(); g.name = n.trim(); renderAll(); }
  });
  return row;
}

/* 成组：把选中的层在数组里挪到一起（顺序不变），共用同一个 gid */

function renderLayerList(){
  if (!S.src.canvas){
    listEl.replaceChildren(h('div', { class: 'empty', text: '尚未载入图片。' }));
    sigLayers = layerListSig();
    return;
  }

  const rows = [makeSrcRow()];
  const seenG = {};

  for (let i = S.layers.length-1; i >= 0; i--){
    const L = S.layers[i];
    const g = L.gid ? S.groups[L.gid] : null;

    /* 迭代方向是「顶 → 底」，所以第一次遇到某个合集的成员时，
       就是它最上面那个成员，组头插在这里 */
    if (g && !seenG[g.id]){
      seenG[g.id] = 1;
      rows.push(makeGroupRow(g));
    }
    if (g && g.collapsed) continue;          // 折叠时只留组头

    rows.push(makeLayerRow(L, g));
  }
  listEl.replaceChildren.apply(listEl, rows);
  sigLayers = layerListSig();
}

/* 源图层那一行：它没有 L 对象，单独一条 */
function makeSrcRow(){
  const thumb = h('span', { class: 'th' }, makeThumb(null));
  const eye = h('span', {
    class: 'eye ' + (S.showSrc ? 'on' : 'off'), title: '显示 / 隐藏原图',
    on: { click: function(e){
      e.stopPropagation();
      S.showSrc = !S.showSrc;
      const cb = $('srcVisible');
      if (cb) cb.checked = S.showSrc;
      render(); renderLayerList();
    } }
  }, icon(S.showSrc ? 'i-eye' : 'i-eyeoff', 'ic-s'));
  /* 删除源图层：清空画布回到「等待导入」，好换一张图重来 */
  const del = h('span', {
    class: 'del', title: '删除源图层（重新上传）',
    on: { click: function(e){ e.stopPropagation(); removeSource(); } }
  }, icon('i-trash', 'ic-s'));

  const row = h('div', { class: 'li li-src' },
    thumb,
    h('span', { class: 'txt' },
      h('span', { class: 'nm src', text: '源图层' }),
      h('span', { class: 'meta', text: '原图 · ' + (S.showSrc ? '可见' : '已隐藏') })),
    del, eye);
  row.addEventListener('click', function(){ setSel([]); renderAll(); });
  return row;
}

function makeLayerRow(L, g){
  let tag = (L.dir === 'v') ? '↕ 垂直' : '↔ 水平';
  if (L.block > 1) tag += ' · 块 ' + L.block;
  else if (L.order !== 'none') tag += (L.order === 'shuffle' ? ' · 乱序' : ' · 间序');
  if (L.sampleOff) tag += ' · 偏移 ' + (L.sampleOff > 0 ? '+' : '') + L.sampleOff;
  if (L.parts && L.parts.length) tag += ' · 合并 ' + L.parts.length + ' 块';

  const eye = h('span', {
    class: 'eye ' + (L.visible ? 'on' : 'off'), title: '显示 / 隐藏',
    on: { click: function(e){
      e.stopPropagation();
      pushUndo(); L.visible = !L.visible; renderAll();
    } }
  }, icon(L.visible ? 'i-eye' : 'i-eyeoff', 'ic-s'));

  const lk = h('span', {
    class: 'lk' + (L.locked ? ' on' : ''), title: L.locked ? '已锁定，点击解锁' : '锁定位置',
    on: { click: function(e){
      e.stopPropagation();
      pushUndo();
      L.locked = !L.locked;
      renderAll();
      toast(L.locked ? '已锁定位置（画布上点不中它）' : '已解锁位置');
    } }
  }, icon('i-lock', 'ic-s'));

  const row = h('div', {
    class: 'li' + (isSel(L.id) ? ' sel' : '') + (g ? ' in-grp' : ''),
    draggable: 'true'
  },
    h('span', { class: 'th' }, makeThumb(L)),
    h('span', { class: 'txt' },
      h('span', { class: 'nm', text: L.name }),
      h('span', { class: 'meta', text: tag })),
    lk, eye);

  row._L = L;
  /* 点击 = 单选（同时记下范围锚点）
     Shift + 点击 = 从锚点到这一行全选
     Ctrl / ⌘ + 点击 = 逐个加减 */
  row.addEventListener('click', function(e){
    if (e.shiftKey && !e.ctrlKey && !e.metaKey && lastRowId && lastRowId !== L.id){
      if (selectRange(lastRowId, L.id)){ renderAll(); return; }
    }
    if (e.ctrlKey || e.metaKey || e.shiftKey){
      const list = selSet().slice();
      const i = list.indexOf(L.id);
      if (i < 0) list.push(L.id);
      else if (list.length > 1) list.splice(i, 1);
      setSel(list, L.id);
    } else {
      setSel([L.id], L.id);
      lastRowId = L.id;
    }
    renderAll();
  });
  row.addEventListener('dblclick', function(){
    const n = prompt('图层名称', L.name);
    if (n !== null && n.trim()){ pushUndo(); L.name = n.trim(); renderAll(); }
  });
  /* 拖一行 = 拖它所在的整批：多选时整批走，单选时就是它自己 */
  row.addEventListener('dragstart', function(e){
    const sel = selSet();
    dragIds = (sel.length > 1 && sel.indexOf(L.id) >= 0) ? sel.slice() : [L.id];
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(L.id)); } catch(_){}
  });
  row.addEventListener('dragend', function(){ dragIds = null; clearDropMarks(); renderLayerList(); });
  row.addEventListener('dragover', function(e){
    if (!dragIds || dragIds.indexOf(L.id) >= 0) return;
    e.preventDefault(); clearDropMarks();
    const r = row.getBoundingClientRect();
    row.classList.add((e.clientY - r.top) > r.height/2 ? 'dropafter' : 'dropbefore');
  });
  row.addEventListener('drop', function(e){
    if (!dragIds || dragIds.indexOf(L.id) >= 0) return;
    e.preventDefault(); e.stopPropagation();
    const r = row.getBoundingClientRect();
    moveBlockRelative(dragIds, { id: L.id }, (e.clientY - r.top) > r.height/2);
    dragIds = null; clearDropMarks();
  });
  return row;
}

function clearDropMarks(){
  listEl.querySelectorAll('.dropbefore,.dropafter').forEach(function(el){
    el.classList.remove('dropbefore','dropafter');
  });
}
/* =========================================================
   图层区框选 + 范围选择
   ---------------------------------------------------------
   框选：在列表空白处按下拖动，矩形碰到的行进入选择集。
        行上按下仍然是排序拖拽（HTML5 drag），两者不打架 ——
        这也是为什么框选只从空白起步：同一块区域不能既排序又框选。
        列表底部留了 44px 空白，层数满了也能从这里起手。
   范围：Shift + 点击某行 = 从上次点的那行到这一行全选（Ctrl 仍是逐个加减）。
   ========================================================= */
let lassoOn = false, lassoY0 = 0, lassoEl = null;
let lastRowId = null;              // 范围选择的锚点

function listPointY(e){
  const r = listEl.getBoundingClientRect();
  return e.clientY - r.top + listEl.scrollTop;
}
function ensureLasso(){
  /* renderAll 会 replaceChildren 整个列表，框选矩形会被一起摘掉 ——
     所以每次都要确认它还挂在上面，否则第二次框选时就画不出来了 */
  if (!lassoEl || !lassoEl.isConnected){
    lassoEl = h('div', { class: 'lasso' });
    listEl.appendChild(lassoEl);
  }
  return lassoEl;
}
function lassoPick(y0, y1){
  const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
  const ids = [];
  for (let i = 0; i < listEl.children.length; i++){
    const row = listEl.children[i];
    if (!row._L) continue;                       // 组头不参与框选
    const top = row.offsetTop, bot = top + row.offsetHeight;
    if (bot >= lo && top <= hi) ids.push(row._L.id);
  }
  setSel(ids, ids.length ? ids[ids.length - 1] : null);
  syncLayerSel();                                // 只切 class，不重建行
  renderStatus(); syncButtons();
}
function endLasso(){
  if (!lassoOn) return;
  lassoOn = false;
  if (lassoEl) lassoEl.style.display = 'none';
  renderAll();                                   // 松手后把属性面板补上
}
listEl.addEventListener('pointerdown', function(e){
  if (e.button !== 0) return;
  if (e.target.closest && e.target.closest('.li')) return;   // 行上交给排序 / 点击
  if (!listEl.querySelector('.li')) return;
  lassoOn = true;
  lassoY0 = listPointY(e);
  const el = ensureLasso();
  el.style.display = 'block';
  el.style.top = lassoY0 + 'px';
  el.style.height = '0px';
  try { listEl.setPointerCapture(e.pointerId); } catch(_){}
  e.preventDefault();
});
listEl.addEventListener('pointermove', function(e){
  if (!lassoOn) return;
  const y = listPointY(e);
  lassoEl.style.top = Math.min(y, lassoY0) + 'px';
  lassoEl.style.height = Math.abs(y - lassoY0) + 'px';
  lassoPick(lassoY0, y);
});
listEl.addEventListener('pointerup', endLasso);
listEl.addEventListener('pointercancel', endLasso);
window.addEventListener('pointerup', endLasso);

/* 范围选择：锚点 -> 目标，中间的行全选 */
function selectRange(anchorId, targetId){
  const a = S.layers.findIndex(function(L){ return L.id === anchorId; });
  const b = S.layers.findIndex(function(L){ return L.id === targetId; });
  if (a < 0 || b < 0) return false;
  const lo = Math.min(a, b), hi = Math.max(a, b);
  setSel(S.layers.slice(lo, hi + 1).map(function(L){ return L.id; }), targetId);
  return true;
}
