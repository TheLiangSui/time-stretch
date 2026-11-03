/* =========================================================
   M3 图层数据
   ========================================================= */
function getSel(){ return S.layers.find(function(L){ return L.id === S.sel; }) || null; }
function byId(id){ return S.layers.find(function(L){ return L.id === id; }) || null; }

/* 选择：selIds 是唯一事实来源，_sel 只是「主选中」（属性面板读它） */
function selSet(){
  if (S.selIds && S.selIds.length) return S.selIds;
  return S._sel ? [S._sel] : [];
}
function setSel(ids, primary){
  const list = (ids || []).slice();
  let p = (primary !== undefined) ? primary : (list.length ? list[list.length-1] : null);
  if (p && list.indexOf(p) < 0) p = list.length ? list[list.length-1] : null;
  S.selIds = list;
  S._sel = p;               // 直接写后备字段，避免 setter 把多选收敛成单选
}
function isSel(id){ return selSet().indexOf(id) >= 0; }
function makeLayer(r){
  return {
    id: uid(),
    gid: null,            // 所属合集 id
    parts: null,          // 合并形状：相对图层左上角的一组矩形；null = 普通矩形层
    x: r.x, y: r.y, w: r.w, h: r.h,
    dir: (r.dir === 'v' || r.dir === 'h') ? r.dir : newLayerDir,  // 拉伸方向 h=左右 v=上下
    sampleOff: 0,         // 取样偏移 -100..+100（-100=左/上边缘 0=居中 +100=右/下边缘）
    block: 1,             // 方块感：沿取样线的分组像素数 1-100
    order: 'none',        // none | shuffle | interleave
    shufAmt: 60,          // 乱序强度 0-100
    shufBlock: 1,         // 乱序块大小（几个像素一组参与洗牌）
    seed: randSeed(),     // 乱序种子（固定 -> 结果可复现）
    interSeg: 4,          // 间序段数
    sat: 0,               // 饱和度 -100..100
    warm: 0,              // 冷暖度 -100..100
    hue: 0,               // 色相 -180..180 度（绕色环旋转）
    kind: 'stretch',      // stretch = 从源图取样拉伸；image = 自带位图（导入 / 抠图）
    img: null,            // kind=image 时的位图（canvas，运行期字段，存盘转 dataURL）
    imgName: '',
    opacity: 1,
    blend: 'source-over',
    visible: true,
    locked: false,        // 位置锁定：锁定后不能拖动/缩放（仍可选中、改参数）
    name: '拉伸层 ' + S.layers.length
  };
}
/* 命中测试：给定 cycleFromId 时返回该层「下面」那一层（Alt 点击穿透用）。
   锁定的层对指针完全透明 —— 既不能被选中，也不会挡住「从它上面开始拖新框」。 */
function hitLayer(ix, iy, cycleFromId){
  const hits = [];
  for (let i = S.layers.length-1; i >= 0; i--){
    const L = S.layers[i];
    if (L.locked || L.visible === false) continue;
    if (ix >= L.x && ix <= L.x+L.w && iy >= L.y && iy <= L.y+L.h) hits.push(L);
  }
  if (!hits.length) return null;
  if (cycleFromId != null){
    const k = hits.findIndex(function(L){ return L.id === cycleFromId; });
    if (k >= 0) return hits[(k+1) % hits.length];
  }
  return hits[0];
}

/* ---- 吸附 ---- */
function snapCandidatesX(excludeId){
  const c = [0, S.src.w];
  for (const L of S.layers){ if (L.id === excludeId) continue; c.push(L.x, L.x+L.w); }
  return c;
}
function snapCandidatesY(excludeId){
  const c = [0, S.src.h];
  for (const L of S.layers){ if (L.id === excludeId) continue; c.push(L.y, L.y+L.h); }
  return c;
}
function snapVal(v, cands){
  const tol = 6 / S.view.s;
  let best = v, bd = tol;
  for (const c of cands){
    const d = Math.abs(c - v);
    if (d < bd){ bd = d; best = c; }
  }
  return best;
}
