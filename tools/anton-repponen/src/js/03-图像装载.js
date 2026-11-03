/* =========================================================
   M1 图像装载
   输入：本地图片文件 / 拖拽 / 粘贴
   处理：读入 -> Image -> 绘制到全分辨率离屏 canvas（源图层，像素永不被改写）
   输出：S.src（version 自增，用于失效所有图层缓存）
   ========================================================= */
function loadImageFromFile(file){
  if (!file || !/^image\//.test(file.type)) { toast('请选择图片文件'); return; }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = function(){ URL.revokeObjectURL(url); ingestImage(img, file.name); };
  img.onerror = function(){ URL.revokeObjectURL(url); toast('图片读取失败'); };
  img.src = url;
}
function setSource(canvas, name){
  S.src = {
    canvas: canvas, ctx: canvas.getContext('2d', { willReadFrequently:true }),
    w: canvas.width, h: canvas.height, name: name || 'image',
    version: (S.src.version || 0) + 1
  };
}
/* 删除源图层：连画布一起清空，回到「等待导入」的状态。
   源图像素不在撤销快照里（快照只存图层参数），留着撤销栈只会得到
   「图层回来了、源图没回来」的半截状态，所以这里把撤销栈一并清掉。 */
function removeSource(){
  if (!S.src.canvas) return;
  const n = S.layers.length;
  if (!confirm('删除源图层？' + (n ? '画布上 ' + n + ' 个拉伸层会一起清空，' : '') +
               '撤销记录也会清空。删掉之后可以重新导入一张图。')) return;
  S.src = { canvas:null, ctx:null, w:0, h:0, name:'', version: S.src.version + 1 };
  S.layers = []; setSel([]);
  S.groups = {}; S.nextGid = 1; S.hover = null;
  S.undoStack = []; S.redoStack = [];
  hint.classList.remove('hide');
  ['btnExport','btnTile','btnTileRe','btnRandAll','btnRandOrder'].forEach(function(id){
    const el = $(id);
    if (el) el.disabled = true;
  });
  $('srcInfo').textContent = '未载入图片';
  renderAll();
}
function ingestImage(img, name){
  const c = document.createElement('canvas');
  c.width  = img.naturalWidth  || img.width;
  c.height = img.naturalHeight || img.height;
  c.getContext('2d').drawImage(img, 0, 0);
  setSource(c, name);

  S.layers = []; S.sel = null; S.hover = null;
  S.groups = {}; S.nextGid = 1;
  S.undoStack = []; S.redoStack = [];
  const homeEl = $('home');
  if (homeEl) homeEl.classList.remove('show');
  pushUndo(true);

  $('btnExport').disabled = false;
  $('btnTile').disabled = false;
  $('btnTileRe').disabled = false;
  
  $('btnRandAll').disabled = false;
  $('btnRandOrder').disabled = false;
  $('srcInfo').replaceChildren(
    S.src.name, h('br'), S.src.w + ' × ' + S.src.h + ' px');
  hint.classList.add('hide');

  fitView();
  renderAll();
}
