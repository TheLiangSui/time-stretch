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

  const row = h('div', { class: 'li grp-row' + (allSel ? ' sel' : '') },
    tog,
    h('span', { class: 'gico' }, icon('i-group', 'ic-s')),
    h('span', { class: 'txt' },
      h('span', { class: 'nm', text: g.name }),
      h('span', { class: 'meta', text: '合集 · ' + members.length + ' 层' })),
    eye);

  row._G = g;
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

  const row = h('div', { class: 'li' },
    thumb,
    h('span', { class: 'txt' },
      h('span', { class: 'nm src', text: '源图层' }),
      h('span', { class: 'meta', text: '原图 · ' + (S.showSrc ? '可见' : '已隐藏') })),
    eye);
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
  /* 点击 = 单选；Ctrl / Shift + 点击 = 增减选 */
  row.addEventListener('click', function(e){
    if (e.ctrlKey || e.metaKey || e.shiftKey){
      const list = selSet().slice();
      const i = list.indexOf(L.id);
      if (i < 0) list.push(L.id);
      else if (list.length > 1) list.splice(i, 1);
      setSel(list, L.id);
    } else {
      setSel([L.id], L.id);
    }
    renderAll();
  });
  row.addEventListener('dblclick', function(){
    const n = prompt('图层名称', L.name);
    if (n !== null && n.trim()){ pushUndo(); L.name = n.trim(); renderAll(); }
  });
  row.addEventListener('dragstart', function(e){
    dragId = L.id; row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(L.id)); } catch(_){}
  });
  row.addEventListener('dragend', function(){ dragId = null; clearDropMarks(); renderLayerList(); });
  row.addEventListener('dragover', function(e){
    if (dragId === null || dragId === L.id) return;
    e.preventDefault(); clearDropMarks();
    const r = row.getBoundingClientRect();
    row.classList.add((e.clientY - r.top) > r.height/2 ? 'dropafter' : 'dropbefore');
  });
  row.addEventListener('drop', function(e){
    if (dragId === null || dragId === L.id) return;
    e.preventDefault(); e.stopPropagation();
    const r = row.getBoundingClientRect();
    moveLayerRelative(dragId, L.id, (e.clientY - r.top) > r.height/2);
    dragId = null; clearDropMarks();
  });
  return row;
}

function clearDropMarks(){
  listEl.querySelectorAll('.dropbefore,.dropafter').forEach(function(el){
    el.classList.remove('dropbefore','dropafter');
  });
}