/* =========================================================
   绑定
   ========================================================= */
const filePick = $('filePick');
$('btnOpen').onclick = function(){ filePick.click(); };
filePick.onchange = function(){ if (filePick.files[0]) loadImageFromFile(filePick.files[0]); filePick.value = ''; };
$('btnExport').onclick = function(){ updateExInfo(); $('modalExport').classList.add('show'); };
function updateExInfo(){
  if (!S.src.canvas){ $('exInfo').textContent = ''; return; }
  const s = parseFloat($('exScale').value);
  $('exInfo').textContent =
    '输出尺寸 ' + Math.round(S.src.w*s) + ' × ' + Math.round(S.src.h*s) + ' px  ·  ' +
    ($('exSrc').checked ? '含源图层' : '不含源图层（只剩拉伸层）') +
    '  ·  可见拉伸层 ' + S.layers.filter(function(x){ return x.visible; }).length + ' 个';
}
$('exCancel').onclick = function(){ $('modalExport').classList.remove('show'); };
$('exGo').onclick = doExport;
$('exCopy').onclick = copyToClipboard;
$('modalExport').addEventListener('click', function(e){
  if (e.target === this) this.classList.remove('show');
});
$('exFmt').onchange = function(){
  const png = this.value === 'image/png';
  $('exQ').disabled = png;
  $('exQ').style.opacity = png ? .4 : 1;
};
$('exScale').onchange = updateExInfo;
$('exSrc').onchange = updateExInfo;
$('btnUndo').onclick = undo;
$('btnRedo').onclick = redo;
$('btnFit').onclick = function(){ fitView(); renderAll(); };
$('btn100').onclick = function(){
  zoomAt(vp.clientWidth/2, vp.clientHeight/2, 1/S.view.s); renderAll(); };
$('zIn').onclick = function(){ zoomCenter(1.2); renderAll(); };
$('zOut').onclick = function(){ zoomCenter(1/1.2); renderAll(); };
$('zFit').onclick = function(){ fitView(); renderAll(); };
$('btnGrid').onclick = makeGrid;
$('btnGridRe').onclick = makeGrid;
$('btnRandBox').onclick = doRandomBox;
$('btnClear').onclick = clearAll;
$('btnImg').onclick = function(){
  if (!S.src.canvas){ toast('先导入主图'); return; }
  $('imgPick').click();
};
$('imgPick').onchange = function(e){
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  fileToCanvas(f, function(cv, name){ createImageLayer(cv, name); });
};
$('btnMerge').onclick = mergeSelectedShapes;
$('btnGroup').onclick = function(){
  const ids = selSet();
  const gids = {};
  ids.forEach(function(id){ const L = byId(id); if (L && L.gid) gids[L.gid] = 1; });
  if (Object.keys(gids).length === 1 && ids.length > 1) ungroupSelected();
  else groupSelected();
};
const newDirSel = $('newDir');
newDirSel.value = newLayerDir;
newDirSel.onchange = function(){
  newLayerDir = (this.value === 'v') ? 'v' : 'h';
  toast('新框默认方向：' + (newLayerDir === 'v' ? '垂直 · 上下拉伸' : '水平 · 左右拉伸'));
};
$('btnUp').onclick = function(){ shiftLayer(1); };
$('btnDown').onclick = function(){ shiftLayer(-1); };
$('btnHelp').onclick = function(){ $('modalHelp').classList.add('show'); };
$('helpOk').onclick = function(){ $('modalHelp').classList.remove('show'); };
/* 每个弹窗右上角都有个叉，任何位置都能关 */
Array.prototype.forEach.call(document.querySelectorAll('.modal [data-close]'), function(b){
  b.onclick = function(){ const m = b.closest('.modal'); if (m) m.classList.remove('show'); };
});
$('srcVisible').onchange = function(){ S.showSrc = this.checked; render(); };
/* 静态面板的四个数值行：源图不透明度、随机强度走模型，网格两参数由 makeGrid 现读 */
bindNum('srcOpacity', function(v){ S.srcOpacity = v/100; });
bindNum('randStr',   function(v){ S.randStrength = v; });
bindNum('gridJit',   function(){});
bindNum('gridOv',    function(){});
bindNum('gridC',     function(){});
bindNum('gridR',     function(){});
bindAllScrubs(document);
$('btnRandAll').onclick = randomizeAll;
$('btnRandOrder').onclick = reseedAll;
$('btnSaveProj').onclick = function(){ saveToLibrary(); };
  $('btnHome').onclick = goHome;
const projPick = $('projPick');
$('btnOpenProj').onclick = function(){ projPick.click(); };
projPick.onchange = function(){
  if (projPick.files[0]){ openProject(projPick.files[0]); enterEditor(); }
  projPick.value = '';
};

window.addEventListener('resize', function(){ render(); });
