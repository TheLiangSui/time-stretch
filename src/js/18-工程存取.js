/* =========================================================
   工程存取
   ========================================================= */
/* 当前工程的序列化（存项目库和导出 .json 用的是同一份数据） */
function projectData(){
  return {
    v: 3,
    src: S.src.canvas ? S.src.canvas.toDataURL('image/png') : null,
    srcName: S.src.name,
    layers: S.layers.map(function(L){
      const o = {};
      for (const k in L){ if (k === '_col' || k === 'img') continue; o[k] = L[k]; }
      if (L.kind === 'image' && L.img) o.imgData = L.img.toDataURL('image/png');
      return o;
    }),
    nextId: S.nextId,
    groups: S.groups, nextGid: S.nextGid,
    showSrc: S.showSrc, srcOpacity: S.srcOpacity, randStrength: S.randStrength
  };
}
/* 项目卡片缩略图：小尺寸就够了，别把几 MB 的原图塞进去 */
function makeThumbDataURL(){
  if (!S.src.canvas) return '';
  const k = Math.min(1, 420 / Math.max(S.src.w, S.src.h));
  try { return buildExportCanvas(k, '#1b1b1f', true).toDataURL('image/jpeg', 0.82); }
  catch (e) { return ''; }
}
/* 导出成 .json 文件（Ctrl+Shift+S） */
function exportProjectFile(){
  if (!S.src.canvas){ toast('先导入图片'); return; }
  const data = projectData();
  const blob = new Blob([JSON.stringify(data)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (S.project.name || S.src.name || 'image').replace(/\.[^.]+$/,'') + '_工程.json';
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('工程已导出为 .json');
}
/* 工程数据 → 画布。文件导入和项目库打开共用这一条路径。 */
function applyProjectData(d, opt){
  opt = opt || {};
  const img = new Image();
  img.onload = function(){
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    setSource(c, d.srcName || 'image');
    const raw = d.layers || [];
    /* 位图是 dataURL，解码是异步的 —— 全部就绪后再一次性建层 */
    Promise.all(raw.map(function(L){
      if (!L.imgData) return Promise.resolve(null);
      return new Promise(function(res){
        const im = new Image();
        im.onload = function(){
          const cc = document.createElement('canvas');
          cc.width = im.naturalWidth; cc.height = im.naturalHeight;
          cc.getContext('2d').drawImage(im, 0, 0);
          res(cc);
        };
        im.onerror = function(){ res(null); };
        im.src = L.imgData;
      });
    })).then(function(cvs){
    S.layers = raw.map(function(L, i){
      const base = makeLayer({ x:L.x, y:L.y, w:L.w, h:L.h });
      const o = Object.assign(base, L, { _col:null });
      delete o.imgData;
      if (o.kind === 'image' && cvs[i]){
        o.id = L.id;
        attachImg(o, cvs[i], L.imgName);
      } else if (o.kind === 'image'){
        o.kind = 'stretch';            // 位图丢了就退回拉伸层，至少不报错
      }
      return o;
    });
    S.nextId = d.nextId || (S.layers.length+1);
    S.groups = d.groups || {};
    S.nextGid = d.nextGid || 1;
    S.showSrc = d.showSrc !== false;
    S.srcOpacity = (d.srcOpacity === undefined) ? 1 : d.srcOpacity;
    S.randStrength = (d.randStrength === undefined) ? 60 : d.randStrength;
    S.project = { id: opt.id || uid(), name: opt.name || (d.srcName || '未命名工程').replace(/\.[^.]+$/, '') };
    $('srcVisible').checked = S.showSrc;
    $('srcOpacity').value = Math.round(S.srcOpacity*100);
    $('randStr').value = S.randStrength;
    setSel([]); S.undoStack = []; S.redoStack = [];
    pushUndo(true);
    $('btnExport').disabled = false;
    $('btnTile').disabled = false;
    $('btnTileRe').disabled = false;
    
    $('btnRandAll').disabled = false;
    $('btnRandOrder').disabled = false;
    $('srcInfo').replaceChildren(
      S.src.name, h('br'), S.src.w + ' × ' + S.src.h + ' px');
    hint.classList.add('hide');
    fitView(); renderAll();
    if (!opt.quiet) toast('工程已载入');
    });
  };
  img.src = d.src;
}
