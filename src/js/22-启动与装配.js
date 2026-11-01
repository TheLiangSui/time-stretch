/* =========================================================
   UI 装配：主题 / 面板宽度 / 分段控件 / 折叠分组
   ========================================================= */
Array.prototype.forEach.call(document.querySelectorAll('#segNumMode button'), function(b){
  b.onclick = function(){
    UI_PREF.num = b.getAttribute('data-num');
    applyUiPrefs();
  };
});
Array.prototype.forEach.call(document.querySelectorAll('#segUiScale button'), function(b){
  b.onclick = function(){
    UI_PREF.ui = parseFloat(b.getAttribute('data-ui'));
    applyUiPrefs();
    renderAll();
  };
});

$('btnTheme').onclick = function(){
  applyTheme(PAL.light ? 'dark' : 'light');
};
$('btnHintOpen').onclick = function(){
  $('filePick').click();
};

/* 分组展开状态跟着用户走，renderProps 重建 DOM 时不会弹回去 */
propsEl.addEventListener('toggle', function(e){
  const d = e.target;
  if (d && d.dataset && d.dataset.grp) grpOpen[d.dataset.grp] = d.open;
}, true);

/* 左侧「随机网格 / 随机框选」两个面板用分段控件切换 */
(function initAutoSeg(){
  const seg = $('autoSeg');
  if (!seg) return;
  const panes = {
    grid: $('paneGrid'),
    rand: $('paneRand')
  };
  seg.addEventListener('click', function(e){
    const b = e.target.closest('button[data-pane]');
    if (!b) return;
    Array.prototype.forEach.call(seg.children, function(x){
      x.classList.toggle('on', x === b);
    });
    for (const k in panes){
      if (panes[k]) panes[k].style.display = (k === b.getAttribute('data-pane')) ? '' : 'none';
    }
  });
})();

/* 拉伸方向：分段控件是门面，真正的值仍存在 select#newDir 里（工程文件与快捷键都读它） */
function syncDirSeg(){
  const sel = $('newDir');
  const seg = $('dirSeg');
  if (!sel || !seg) return;
  const v = sel.value;
  Array.prototype.forEach.call(seg.querySelectorAll('button'), function(b){
    b.classList.toggle('on', b.getAttribute('data-dir') === v);
  });
}
$('dirSeg').addEventListener('click', function(e){
  const b = e.target.closest('button[data-dir]');
  if (!b) return;
  const sel = $('newDir');
  sel.value = b.getAttribute('data-dir');
  syncDirSeg();
  if (sel.onchange) sel.onchange.call(sel);
});

/* 侧栏宽度可拖动，双击复位，宽度记在 localStorage */
(function initPanels(){
  const KEY = 'ts.panels';
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch(_){}
  if (saved && saved.l && saved.r){
    document.documentElement.style.setProperty('--w-left-base', saved.l + 'px');
    document.documentElement.style.setProperty('--w-right-base', saved.r + 'px');
  }
  function save(){
    const cs = getComputedStyle(document.documentElement);
    try {
      localStorage.setItem(KEY, JSON.stringify({
        l: parseInt(cs.getPropertyValue('--w-left-base'), 10),
        r: parseInt(cs.getPropertyValue('--w-right-base'), 10)
      }));
    } catch(_){}
  }
  function bind(id, side){
    const el = $(id);
    if (!el) return;
    const prop = side === 'l' ? '--w-left-base' : '--w-right-base';
    const lim  = side === 'l' ? [200, 460] : [250, 520];
    const def  = side === 'l' ? 250 : 302;
    let on = false, x0 = 0, w0 = 0;
    el.addEventListener('pointerdown', function(e){
      on = true; x0 = e.clientX;
      w0 = parseInt(getComputedStyle(document.documentElement).getPropertyValue(prop), 10) || def;
      el.classList.add('on');
      try { el.setPointerCapture(e.pointerId); } catch(_){}
      document.body.classList.add('resizing');
      e.preventDefault(); e.stopPropagation();
    });
    el.addEventListener('pointermove', function(e){
      if (!on) return;
      let w = w0 + (side === 'l' ? (e.clientX - x0) : (x0 - e.clientX));
      w = Math.max(lim[0], Math.min(lim[1], Math.round(w)));
      document.documentElement.style.setProperty(prop, w + 'px');
      render();
    });
    const done = function(){
      if (!on) return;
      on = false; el.classList.remove('on');
      document.body.classList.remove('resizing');
      save(); render();
    };
    el.addEventListener('pointerup', done);
    el.addEventListener('pointercancel', done);
    el.addEventListener('dblclick', function(){
      document.documentElement.style.setProperty(prop, def + 'px');
      save(); render();
    });
  }
  bind('rzL', 'l');
  bind('rzR', 'r');
})();

/* 主题：默认深色，记住上次选择 */
(function initTheme(){
  let t = 'dark';
  try { t = localStorage.getItem('ts.theme') || 'dark'; } catch(_){}
  /* 合集壳用 ?theme= 传主题过来 —— file:// 下跨源写不了本页的 localStorage */
  try {
    const q = new URLSearchParams(location.search).get('theme');
    if (q === 'light' || q === 'dark') t = q;
  } catch(_){}
  applyTheme(t, true);
})();

/* Ctrl+\ ：隐藏 / 恢复两侧面板，用来看画面本身 */
function toggleUI(){
  const on = document.body.classList.toggle('hide-ui');
  renderAll();
  toast(on ? '面板已隐藏 · Ctrl+\\ 恢复' : '面板已恢复');
}

/* 启动 */
enhanceSelects(document);
initSegs(document);
loadUiPrefs();
applyUiPrefs(true);
renderAll();
$('homeNew').onclick = newProject;
$('homeOpenFile').onclick = function(){
  $('projPick').click();
};
$('home').classList.add('show');
Store.open().then(renderHome).catch(function(){ renderHome(); });

/* 便于自动化测试 / 高级用户 */
window.__tool = {
  S: S,
  loadDataURL: function(dataURL, name){
    const img = new Image();
    img.onload = function(){ ingestImage(img, name || 'test'); };
    img.src = dataURL;
  },
  addLayer: function(r){
    const L = makeLayer(r);
    S.layers.push(L); S.sel = L.id; renderAll(); return L;
  },
  buildExportCanvas: buildExportCanvas,
  buildSeq: buildSeq,
  randSeed: randSeed,
  randomCuts: randomCuts,
  cutsToSegs: cutsToSegs,
  makeGrid: makeGrid,
  randomBoxes: randomBoxes,
  sampleLine: sampleLine,
  copyLayer: copyLayer,
  createImageLayer: createImageLayer,
  pushUndo: pushUndo,
  restore: restore,
  projectData: projectData,
  groupSelected: groupSelected,
  mergeSelectedShapes: mergeSelectedShapes,
  home: {
    enter: enterEditor, go: goHome, create: newProject,
    save: saveToLibrary, render: renderHome,
    del: function(id){ return Store.del(id); },
    all: function(){ return Store.all(); },
    clear: async function(){
      const l = await Store.all();
      for (let i = 0; i < l.length; i++) await Store.del(l[i].id);
      return true;
    }
  },
  ungroupSelected: ungroupSelected,
  setSel: setSel,
  selSet: selSet,
  cutLayer: cutLayer,
  pasteLayer: pasteLayer,
  renderNav: renderNav,
  settings: function(){ return settings; },
  isDesktop: hasDesktop,
  render: renderAll
};

})();
