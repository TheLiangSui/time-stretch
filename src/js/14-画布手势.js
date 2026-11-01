/* =========================================================
   画布手势：指针
   ========================================================= */
let mode = null, draft = null, drag = {}, spaceDown = false, draftDir = 'h';

/* 指针捕获：真实环境必成功；合成事件（自动化测试）下会抛 NotFoundError，兜住以免整段拖拽逻辑中断 */
function capture(e){ try { vp.setPointerCapture(e.pointerId); } catch(_){} }
function release(e){
  if (!e || e.pointerId === undefined) return;
  try { if (vp.hasPointerCapture(e.pointerId)) vp.releasePointerCapture(e.pointerId); } catch(_){}
}
/* 屏幕坐标统一为「相对视口左上角的 CSS 像素」，
   与 canvas 绘制坐标系（setTransform(dpr,…) 之后的单位）严格一致 */
function localPos(e){
  const r = vp.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
function clampRect(r){
  const x0 = clamp(r.x, 0, S.src.w), y0 = clamp(r.y, 0, S.src.h);
  const x1 = clamp(r.x + r.w, 0, S.src.w), y1 = clamp(r.y + r.h, 0, S.src.h);
  return { x: Math.min(x0,x1), y: Math.min(y0,y1), w: Math.abs(x1-x0), h: Math.abs(y1-y0) };
}
function normRect(x0,y0,x1,y1){
  return { x: Math.min(x0,x1), y: Math.min(y0,y1), w: Math.abs(x1-x0), h: Math.abs(y1-y0) };
}

vp.addEventListener('pointerdown', function(e){
  if (e.button === 1 || e.button === 2) e.preventDefault();
  /* 只要按在视口范围内就算画布手势。
     以前这里写的是 e.target === cvs，结果 #hint 那层覆盖物（.box）把点击全吃了：
     坐标换算和命中测试都是对的，但事件根本没进到画布逻辑里 —— 表现就是
     「点了选不中、选中也拖不动」，而且只在提示层还盖着的时候复现。
     控件（缩放条 / 小地图 / 按钮）单独排除，避免又回到「按钮收不到 pointerup」。 */
  if (!vp.contains(e.target)) return;
  if (e.target.closest && e.target.closest('button, input, select, textarea, #zoombar, #nav')) return;
  if (!S.src.canvas) return;

  const p  = localPos(e);
  const im = scr2img(p.x, p.y);

  /* 平移：空格拖 / 中键拖 / 右键拖（右键最省事，不用先按空格） */
  if (spaceDown || e.button === 1 || e.button === 2){
    mode = 'pan';
    drag = { sx:p.x, sy:p.y, tx:S.view.tx, ty:S.view.ty };
    vp.classList.add('panning');
    capture(e);
    return;
  }
  if (e.button !== 0) return;

  const h = hitHandle(p.x, p.y);
  if (h){
    pushUndo();
    mode = 'resize';
    drag = { hd:h };
    capture(e);
    return;
  }
  /* Alt + 点击 = 穿透到下一层（矩形重叠时的选中手段） */
  const hit = hitLayer(im.x, im.y, e.altKey ? S.sel : null);
  if (hit){
    /* 点已在多选里的层：保留整组选择，只把主选中切过去 */
    if (!isSel(hit.id)) setSel([hit.id], hit.id);
    else S._sel = hit.id;
    pushUndo();
    mode = 'move';
    drag = {
      ox: im.x - hit.x, oy: im.y - hit.y,
      px: hit.x, py: hit.y,
      items: selSet().map(function(id){
        const L = byId(id);
        return (L && !L.locked) ? { id:id, x:L.x, y:L.y } : null;
      }).filter(Boolean)
    };
    capture(e);
    renderAll();
    return;
  }
  /* 这一下没命中任何可选中层 —— 如果位置上盖着锁定层，说明白原因 */
  for (let i = S.layers.length - 1; i >= 0; i--){
    const Lk = S.layers[i];
    if (Lk.locked && Lk.visible !== false &&
        im.x >= Lk.x && im.x <= Lk.x + Lk.w && im.y >= Lk.y && im.y <= Lk.y + Lk.h){
      toast('「' + Lk.name + '」已锁定位置，解锁后才能选中');
      break;
    }
  }
  setSel([]);
  mode = 'draw';
  /* Shift 临时反转拉伸方向，方便随手画一条垂直的 */
  draftDir = e.shiftKey ? (newLayerDir === 'h' ? 'v' : 'h') : newLayerDir;
  drag = { x0: clamp(im.x,0,S.src.w), y0: clamp(im.y,0,S.src.h) };
  draft = { x:drag.x0, y:drag.y0, w:0, h:0 };
  capture(e);
  renderAll();
});

vp.addEventListener('pointermove', function(e){
  const p  = localPos(e);
  const im = scr2img(p.x, p.y);

  if (!mode){
    const h = hitHandle(p.x, p.y);
    const under = hitLayer(im.x, im.y, null);
    const hov = under ? under.id : null;
    if (hov !== S.hover){ S.hover = hov; render(); }
    if (h) vp.style.cursor = cursorForHandle(h);
    else if (spaceDown) vp.style.cursor = 'grab';
    else vp.style.cursor = under ? 'move' : 'crosshair';
    return;
  }

  if (mode === 'pan'){
    S.view.tx = drag.tx + (p.x - drag.sx);
    S.view.ty = drag.ty + (p.y - drag.sy);
    render(); return;
  }

  if (mode === 'draw'){
    let x1 = clamp(im.x, 0, S.src.w), y1 = clamp(im.y, 0, S.src.h);
    x1 = snapVal(x1, snapCandidatesX(-1));
    y1 = snapVal(y1, snapCandidatesY(-1));
    draft = clampRect({ x:drag.x0, y:drag.y0, w:x1-drag.x0, h:y1-drag.y0 });
    draftDir = e.shiftKey ? (newLayerDir === 'h' ? 'v' : 'h') : newLayerDir;
    renderStatus(); render();
    return;
  }

  if (mode === 'move'){
    const L = getSel(); if (!L) return;
    let nx = clamp(im.x - drag.ox, 0, S.src.w - L.w);
    let ny = clamp(im.y - drag.oy, 0, S.src.h - L.h);
    const cx = snapCandidatesX(L.id), cy = snapCandidatesY(L.id);
    const l = snapVal(nx, cx), r = snapVal(nx + L.w, cx) - L.w;
    nx = (Math.abs(l-nx) <= Math.abs(r-nx)) ? l : r;
    const t = snapVal(ny, cy), b = snapVal(ny + L.h, cy) - L.h;
    ny = (Math.abs(t-ny) <= Math.abs(b-ny)) ? t : b;
    nx = clamp(nx, 0, S.src.w - L.w);
    ny = clamp(ny, 0, S.src.h - L.h);

    let dx = nx - drag.px, dy = ny - drag.py;
    /* 多选时整体位移：用所有被拖层的包围盒限制，避免某个层出界把整组挤变形 */
    if (drag.items && drag.items.length > 1){
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      drag.items.forEach(function(it){
        const m = byId(it.id); if (!m) return;
        minX = Math.min(minX, it.x); minY = Math.min(minY, it.y);
        maxX = Math.max(maxX, it.x + m.w); maxY = Math.max(maxY, it.y + m.h);
      });
      if (isFinite(minX)){
        dx = clamp(dx, -minX, S.src.w - maxX);
        dy = clamp(dy, -minY, S.src.h - maxY);
      }
    }
    (drag.items || [{ id:L.id, x:drag.px, y:drag.py }]).forEach(function(it){
      const m = byId(it.id) || (it.id === L.id ? L : null);
      if (!m || m.locked) return;
      m.x = it.x + dx; m.y = it.y + dy;
    });
    renderStatus(); render();
    return;
  }

  if (mode === 'resize'){
    const L = getSel(); if (!L) return;
    const hd = drag.hd, minS = Math.max(2, 4/S.view.s);
    let x0 = L.x, y0 = L.y, x1 = L.x + L.w, y1 = L.y + L.h;

    if (hd.indexOf('w') >= 0) x0 = snapVal(im.x, snapCandidatesX(L.id));
    if (hd.indexOf('e') >= 0) x1 = snapVal(im.x, snapCandidatesX(L.id));
    if (hd.indexOf('n') >= 0) y0 = snapVal(im.y, snapCandidatesY(L.id));
    if (hd.indexOf('s') >= 0) y1 = snapVal(im.y, snapCandidatesY(L.id));

    x0 = clamp(x0, 0, S.src.w); x1 = clamp(x1, 0, S.src.w);
    y0 = clamp(y0, 0, S.src.h); y1 = clamp(y1, 0, S.src.h);
    if (Math.abs(x1-x0) < minS){ if (hd.indexOf('w') >= 0) x0 = x1 - minS; else x1 = x0 + minS; }
    if (Math.abs(y1-y0) < minS){ if (hd.indexOf('n') >= 0) y0 = y1 - minS; else y1 = y0 + minS; }
    x0 = clamp(x0, 0, S.src.w); x1 = clamp(x1, 0, S.src.w);
    y0 = clamp(y0, 0, S.src.h); y1 = clamp(y1, 0, S.src.h);

    const nr = normRect(x0,y0,x1,y1);
    L.x = nr.x; L.y = nr.y; L.w = nr.w; L.h = nr.h;
    L._col = null;
    renderStatus(); render();
    return;
  }
});

function endDrag(e){
  if (mode === 'draw' && draft){
    const r = draft;
    if (r.w >= 3 && r.h >= 3){
      pushUndo();
      const L = makeLayer({ x:r.x, y:r.y, w:r.w, h:r.h, dir:draftDir });
      S.layers.push(L);            // 追加到末尾 = 堆叠最顶
      S.sel = L.id;
      draft = null; mode = null;
      release(e);
      renderAll();
      return;
    }
  }
  if (mode === 'move' || mode === 'resize'){
    if (mode === 'move' && drag.items && drag.items.length){
      /* 多选整体落定：逐个取整并各自钳回画面内 */
      drag.items.forEach(function(it){
        const m = byId(it.id);
        if (!m || m.locked) return;
        m.x = Math.round(m.x); m.y = Math.round(m.y);
        m.x = clamp(m.x, 0, S.src.w - m.w);
        m.y = clamp(m.y, 0, S.src.h - m.h);
      });
    } else {
      const L = getSel();
      if (L){                          // 落定后取整，保证导出像素对齐
        L.x = Math.round(L.x); L.y = Math.round(L.y);
        L.w = Math.max(2, Math.round(L.w)); L.h = Math.max(2, Math.round(L.h));
        L.w = Math.min(L.w, S.src.w - L.x); L.h = Math.min(L.h, S.src.h - L.y);
        L._col = null;
      }
    }
    renderAll();
  }
  draft = null; mode = null;
  vp.classList.remove('panning');
  release(e);
}
vp.addEventListener('pointerup', endDrag);
vp.addEventListener('pointercancel', endDrag);
/* 在画布外（甚至窗口外）松手时，vp 收不到 pointerup，mode 会卡在 move/resize —— 
   下一次点击就会变成「继续拖动上一次的层」，表现就是点不中新层、也拖不动。
   补到 window 上兜底。 */
window.addEventListener('pointerup', function(e){ if (mode) endDrag(e); });
window.addEventListener('pointercancel', function(e){ if (mode) endDrag(e); });
window.addEventListener('blur', function(){ if (mode) endDrag({}); });
vp.addEventListener('pointerleave', function(){ if (!mode && S.hover !== null){ S.hover = null; render(); } });
/* 键盘 / 滚轮 / 粘贴 / 拖放载入在 14b-画布输入.js */
