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
  $('btnGrid').disabled = false;
  $('btnGridRe').disabled = false;
  $('btnRandBox').disabled = false;
  $('btnRandAll').disabled = false;
  $('btnRandOrder').disabled = false;
  $('srcInfo').replaceChildren(
    S.src.name, h('br'), S.src.w + ' × ' + S.src.h + ' px');
  hint.classList.add('hide');

  fitView();
  renderAll();
}
