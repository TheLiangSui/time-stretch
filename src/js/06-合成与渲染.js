/* =========================================================
   M6 合成
   顺序：调用方先铺背景/源图层 -> 本函数按 index 升序逐层盖上去（画家算法）
   ========================================================= */
function compositeInto(g){
  g.save();
  for (var i = 0; i < S.layers.length; i++){
    var L = S.layers[i];
    if (!L.visible) continue;
    drawStretchedLayer(g, L);
  }
  g.restore();
}

/* =========================================================
   M2/M6 屏幕渲染
   ========================================================= */
let dpr = 1;

/* ---------- 渲染调度 ----------
   以前 renderAll() 一律「画布 + 图层列表 + 属性面板 + 状态栏」全套重建：
   点一下图层就要重画所有缩略图（50 层 = 50 次 canvas 重绘），
   正在展开的下拉也会被无关的刷新掐掉。

   现在先算「签名」：签名不变就不重建，只同步选中态。
   签名里带对象的唯一序号 oid()：撤销 / 打开工程后图层是新对象，
   即使字段一模一样也必须重建，否则行里的事件还挂在旧对象上。 */
const OBJ_ID = new WeakMap();
let OBJ_SEQ = 1;
function oid(o){
  let v = OBJ_ID.get(o);
  if (v === undefined){ v = OBJ_SEQ++; OBJ_ID.set(o, v); }
  return v;
}
let sigLayers = null;      // 图层列表的签名（不含选中态）
let sigProps = null;       // 属性面板的签名

/* 稳定的对象指纹：把图层 / 合集序列化成一串可比对的文本。
   以 _ 开头的键（_col 这类像素缓存）不参与 —— 它们会变，但不影响显示。
   注意这里是「自动收录所有字段」，不是手写清单：
   将来加参数不用回来登记，也不会出现「改了值但面板不刷新」。 */
function stableStr(o){
  return JSON.stringify(o, function(k, v){
    if (k && k.charAt(0) === '_') return undefined;
    return v;
  });
}

function layerListSig(){
  if (!S.src.canvas) return 'empty';
  const p = ['v' + S.src.version, S.showSrc ? 1 : 0, S.src.w + 'x' + S.src.h];
  for (let i = 0; i < S.layers.length; i++){
    const L = S.layers[i];
    p.push(oid(L) + ':' + stableStr(L));      // oid = 对象身份，字段全等也得重建
  }
  for (const k in S.groups){
    const g = S.groups[k];
    p.push('g' + oid(g) + ':' + stableStr(g));
  }
  return p.join('|');
}

function propsSig(L){
  if (!L) return 'none';
  return oid(L) + ':' + S.src.w + 'x' + S.src.h + ':' + stableStr(L);
}

/* 只有选中变了：切 class，不重建（缩略图一个都不用重画） */
function syncLayerSel(){
  const sel = selSet();
  for (let i = 0; i < listEl.children.length; i++){
    const row = listEl.children[i];
    if (row._L){
      row.classList.toggle('sel', sel.indexOf(row._L.id) >= 0);
    } else if (row._G){
      const ms = S.layers.filter(function(L){ return L.gid === row._G.id; });
      row.classList.toggle('sel',
        ms.length > 0 && ms.every(function(L){ return sel.indexOf(L.id) >= 0; }));
    }
  }
}

function renderAll(){
  render();
  if (layerListSig() !== sigLayers) renderLayerList();
  else syncLayerSel();

  const L = getSel();
  if (propsSig(L) !== sigProps) renderProps();

  renderStatus(); syncButtons(); syncDirSeg(); fillAllRanges();
}
function syncButtons(){
  $('btnUndo').disabled = S.undoStack.length === 0;
  $('btnRedo').disabled = S.redoStack.length === 0;
  $('btnUp').disabled = !S.sel;
  $('btnDown').disabled = !S.sel;
}

function render(){
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cw = vp.clientWidth, ch = vp.clientHeight;
  const bw = Math.round(cw*dpr), bh = Math.round(ch*dpr);
  if (cvs.width !== bw || cvs.height !== bh){ cvs.width = bw; cvs.height = bh; }
  /* 兜底：CSS 里已写死 100%，这里再显式对齐一次，
     确保任何 dpr 下「绘制坐标 = 相对视口的 CSS 像素」这条不变量成立 */
  if (cvs.style.width  !== cw + 'px') cvs.style.width  = cw + 'px';
  if (cvs.style.height !== ch + 'px') cvs.style.height = ch + 'px';

  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,cw,ch);

  if (S.src.canvas){
    ctx.save();
    ctx.translate(S.view.tx, S.view.ty);
    ctx.scale(S.view.s, S.view.s);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = PAL.canvasBg; ctx.fillRect(0,0,S.src.w,S.src.h);
    if (S.showSrc && S.srcOpacity > 0){
      ctx.save();
      ctx.globalAlpha = S.srcOpacity;
      ctx.drawImage(S.src.canvas, 0, 0);
      ctx.restore();
    }
    compositeInto(ctx);
    ctx.restore();
  }
  drawOverlay();
  renderNav();
}
