/* =========================================================
   画布输入：滚轮 / 拖放载入 / 粘贴 / 键盘
   ========================================================= */

/* 拖拽载入 */
['dragenter','dragover'].forEach(function(ev){
  vp.addEventListener(ev, function(e){ e.preventDefault(); vp.classList.add('dropping'); });
});
['dragleave','drop'].forEach(function(ev){
  vp.addEventListener(ev, function(e){
    e.preventDefault();
    if (ev === 'dragleave' && vp.contains(e.relatedTarget)) return;
    vp.classList.remove('dropping');
  });
});
vp.addEventListener('drop', function(e){
  e.preventDefault();
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) loadImageFromFile(f);
});
window.addEventListener('dragover', function(e){ e.preventDefault(); });
window.addEventListener('drop', function(e){ e.preventDefault(); });

/* 滚轮缩放 */
/* Ctrl+滚轮在页面任何位置都不该触发浏览器级别的页面缩放 */
document.addEventListener('wheel', function(e){
  if (e.ctrlKey || e.metaKey) e.preventDefault();
}, { passive:false });

/* 滚轮：跟 Figma 一致
   Ctrl/⌘ + 滚轮 = 缩放（以指针为中心）
   普通滚轮      = 上下平移画布
   Shift + 滚轮  = 只左右平移
   触控板的横向分量（deltaX）始终生效 */
vp.addEventListener('wheel', function(e){
  if (!S.src.canvas) return;
  e.preventDefault();
  if (e.ctrlKey || e.metaKey){
    const p = localPos(e);
    zoomAt(p.x, p.y, e.deltaY < 0 ? 1.1 : 1/1.1);
    renderAll();
    return;
  }
  /* deltaMode: 0=像素 1=行 2=页 */
  const unit = e.deltaMode === 1 ? 16 : (e.deltaMode === 2 ? 400 : 1);
  if (e.shiftKey) S.view.tx -= (e.deltaY + e.deltaX) * unit;
  else { S.view.tx -= e.deltaX * unit; S.view.ty -= e.deltaY * unit; }
  render(); renderStatus();
}, { passive:false });

/* 粘贴 */
window.addEventListener('paste', function(e){
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (let i = 0; i < items.length; i++){
    if (items[i].type.indexOf('image') === 0){ loadImageFromFile(items[i].getAsFile()); break; }
  }
});

/* 键盘 */
window.addEventListener('keydown', function(e){
  const inField = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();

  /* 撤销 / 重做必须在 inField 之前处理。
     原来放在后面，导致拖完滑块、改完数字框之后焦点还在控件里，
     Ctrl+Z 被整条 return 掉 —— 这就是「撤回不了饱和度」的根因。 */
  if (mod && k === 'z'){ e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if (mod && k === 'y'){ e.preventDefault(); redo(); return; }

  if (e.code === 'Space' && !inField){ spaceDown = true; if (!mode) vp.style.cursor = 'grab'; e.preventDefault(); return; }
  if (e.key === 'Escape'){
    const openModal = document.querySelector('.modal.show');
    if (openModal){ openModal.classList.remove('show'); e.preventDefault(); return; }
    if (document.querySelector('.dd.open')){ closeAllDropdowns(); e.preventDefault(); return; }
    /* 在输入框里按 Esc 只退出输入，不顺带取消选中 */
    if (inField){ document.activeElement.blur(); e.preventDefault(); return; }
    if (mode === 'draw'){ mode = null; draft = null; renderAll(); return; }
    S.sel = null; renderAll(); return;
  }
  if (inField) return;

  if (mod && k === 'd'){ e.preventDefault(); duplicateSel(); return; }
  if (mod && k === 'm'){ e.preventDefault(); mergeSelectedShapes(); return; }
  if (mod && k === 'g'){
    e.preventDefault();
    if (e.shiftKey) ungroupSelected(); else groupSelected();
    return;
  }
  if (mod && k === 'c'){ e.preventDefault(); copyLayer(); return; }
  if (mod && k === 'x'){ e.preventDefault(); cutLayer(); return; }
  /* Ctrl+V = 粘贴图层；Ctrl+Shift+V 放行给系统剪贴板，用来粘外部图片 */
  if (mod && k === 'v' && !e.shiftKey){ e.preventDefault(); pasteLayer(); return; }
  if (mod && k === 's'){
    e.preventDefault();
    if (e.shiftKey) exportProjectFile(); else saveToLibrary();
    return;
  }
  if (mod && k === 'o'){ e.preventDefault(); $('projPick').click(); return; }
  if (mod && e.key === ','){ e.preventDefault(); $('btnSettings').click(); return; }
  if (mod && e.key === '0'){ e.preventDefault(); fitView(); renderAll(); return; }
  if (mod && e.key === '1'){
    e.preventDefault();
    zoomAt(vp.clientWidth/2, vp.clientHeight/2, 1/S.view.s);
    renderAll(); return;
  }
  /* Ctrl+\ 隐藏两侧面板，只看图；再按恢复 */
  if (mod && (e.code === 'Backslash' || e.key === '\\')){ e.preventDefault(); toggleUI(); return; }
  /* Ctrl+Shift+K 导入图片（Figma 的 place image） */
  if (mod && e.shiftKey && k === 'k'){ e.preventDefault(); $('filePick').click(); return; }
  /* Shift+0 = 100%，Shift+1 = 适应窗口（Figma 习惯） */
  if (e.shiftKey && !mod && e.code === 'Digit0'){
    e.preventDefault(); zoomAt(vp.clientWidth/2, vp.clientHeight/2, 1/S.view.s); renderAll(); return;
  }
  if (e.shiftKey && !mod && e.code === 'Digit1'){
    e.preventDefault(); fitView(); renderAll(); return;
  }
  /* ? 打开快捷键面板 */
  if (e.key === '?'){ e.preventDefault(); $('modalHelp').classList.add('show'); return; }

  if (e.key === 'Delete' || e.key === 'Backspace'){ e.preventDefault(); deleteSel(); return; }
  if (e.key === '['){ shiftLayer(-1); return; }
  if (e.key === ']'){ shiftLayer(1); return; }
  if (k === 'e'){
    const L = getSel();
    if (L){ pushUndo(); L.visible = !L.visible; renderAll(); }
    return;
  }
  if (k === 'l'){
    const L = getSel();
    if (L){ pushUndo(); L.locked = !L.locked; renderAll();
      toast(L.locked ? '已锁定位置（不能拖动/缩放）' : '已解锁位置'); }
    return;
  }
  if (k === 'r'){
    const L = getSel();
    if (L){ pushUndo(); randomizeLayer(L); renderProps(); render(); }
    return;
  }
  if (e.key.indexOf('Arrow') === 0){
    e.preventDefault();
    const stepP = e.shiftKey ? 80 : 20;
    const L = getSel();
    if (!L){                                   // 没选中任何层 → 方向键平移画布
      if (e.key === 'ArrowLeft')  S.view.tx += stepP;
      if (e.key === 'ArrowRight') S.view.tx -= stepP;
      if (e.key === 'ArrowUp')    S.view.ty += stepP;
      if (e.key === 'ArrowDown')  S.view.ty -= stepP;
      renderAll();
      return;
    }
    if (L.locked){ toast('该层已锁定位置，不能移动'); return; }
    const step = e.shiftKey ? 10 : 1;
    beginLive('nudge');
    clearTimeout(nudgeT); nudgeT = setTimeout(endLive, 700);
    /* 多选时整组微调 */
    const ids = selSet();
    const targets = ids.length > 1
      ? ids.map(byId).filter(function(m){ return m && !m.locked; })
      : [L];
    targets.forEach(function(m){
      let dx = 0, dy = 0;
      if (e.key === 'ArrowLeft')  dx = -step;
      if (e.key === 'ArrowRight') dx =  step;
      if (e.key === 'ArrowUp')    dy = -step;
      if (e.key === 'ArrowDown')  dy =  step;
      m.x = clamp(m.x + dx, 0, S.src.w - m.w);
      m.y = clamp(m.y + dy, 0, S.src.h - m.h);
    });
    renderStatus(); render();
    clearTimeout(nudgeR); nudgeR = setTimeout(renderAll, 750);
    return;
  }
});
window.addEventListener('keyup', function(e){
  if (e.code === 'Space'){ spaceDown = false; if (!mode) vp.style.cursor = ''; }
});
