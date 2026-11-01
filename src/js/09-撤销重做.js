/* =========================================================
   撤销 / 重做
   语义：pushUndo() 存的是「本次编辑发生之前」的状态，
        所以栈顶 = 上一次编辑前的快照，当前状态不在栈里。
        撤销 = 当前状态转存 redo + 弹出栈顶还原；重做反之。
   ========================================================= */
function snapshot(){
  return JSON.stringify({
    layers: S.layers, sel: S.sel, nextId: S.nextId,
    selIds: S.selIds, groups: S.groups, nextGid: S.nextGid,
    showSrc: S.showSrc, srcOpacity: S.srcOpacity, randStrength: S.randStrength
  }, function(k, v){ return k === '_col' ? undefined : v; });
}
function pushUndo(silent){
  const snap = snapshot();
  if (S.undoStack.length && S.undoStack[S.undoStack.length-1] === snap) return;
  S.undoStack.push(snap);
  if (S.undoStack.length > MAX_UNDO) S.undoStack.shift();
  S.redoStack.length = 0;
  if (!silent) syncButtons();
}
let liveKey = null, nudgeT = 0, nudgeR = 0;
function beginLive(key){ if (liveKey === key) return; liveKey = key; pushUndo(); }
function endLive(){ liveKey = null; }

function restore(snap){
  const d = JSON.parse(snap);
  S.layers = d.layers; S.sel = d.sel; S.nextId = d.nextId;
  S.layers.forEach(function(L){
    if (L.kind === 'image'){
      const cv = IMG_REG.get(L.id);
      if (cv) Object.defineProperty(L, 'img', { value: cv, writable: true, enumerable: false, configurable: true });
    }
  });
  S.selIds = d.selIds || (d.sel ? [d.sel] : []);
  S.groups = d.groups || {};
  S.nextGid = d.nextGid || 1;
  S.showSrc = d.showSrc; S.srcOpacity = d.srcOpacity;
  S.randStrength = (d.randStrength === undefined) ? 60 : d.randStrength;
  $('srcVisible').checked = S.showSrc;
  $('srcOpacity').value = Math.round(S.srcOpacity*100);
  $('randStr').value = S.randStrength;
}
function undo(){
  if (!S.undoStack.length) return;
  S.redoStack.push(snapshot());
  restore(S.undoStack.pop());
  renderAll();
}
function redo(){
  if (!S.redoStack.length) return;
  S.undoStack.push(snapshot());
  restore(S.redoStack.pop());
  renderAll();
}
