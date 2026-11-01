/* =========================================================
   随机
   ========================================================= */
function randomizeLayer(L){
  const s = clamp(S.randStrength, 0, 100);
  L.sat  = Math.round((Math.random()*2 - 1) * s);
  L.warm = Math.round((Math.random()*2 - 1) * s);
  L._col = null;
}
function randomizeAll(){
  if (!S.layers.length){ toast('还没有拉伸层'); return; }
  pushUndo();
  S.layers.forEach(function(L){
    randomizeLayer(L);
    if (L.order === 'shuffle') L.seed = randSeed();
  });
  renderAll();
  toast('已对 ' + S.layers.length + ' 层随机（强度 ' + S.randStrength + '）');
}
function reseedAll(){
  if (!S.layers.length){ toast('还没有拉伸层'); return; }
  pushUndo();
  S.layers.forEach(function(L){ L.seed = randSeed(); L._col = null; });
  render();
  toast('已重掷全部乱序种子');
}

/* =========================================================
   状态栏
   ========================================================= */
function renderStatus(){
  if (!S.src.canvas){ statusEl.textContent = '未载入图片'; return; }
  const L = getSel();
  const vis = S.layers.filter(function(x){ return x.visible; }).length;
  let t = S.src.w + '×' + S.src.h + '  ·  图层 ' + S.layers.length + '（可见 ' + vis + '）';
  const nSel = selSet().length;
  if (nSel > 1) t += '  ·  选中 ' + nSel + ' 层';
  else if (L) t += '  ·  选中 ' + Math.round(L.w) + '×' + Math.round(L.h) + ' @' + Math.round(L.x) + ',' + Math.round(L.y);
  statusEl.textContent = t;
  $('zVal').textContent = Math.round(S.view.s*100) + '%';
}
