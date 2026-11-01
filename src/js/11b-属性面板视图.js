/* =========================================================
   属性面板：视图
   ---------------------------------------------------------
   纯构造，不查 DOM。控件先建出来、拿到手里，再拼进面板 ——
   绑定直接用那个变量，不经过 id 字符串。
   （旧写法是拼 190 行字符串再 getElementById 逐个找回，拼错一个字就是 null。）

   面板每次结构性变化都会整体重建，所以控件实例只在本函数内有效。
   ========================================================= */
const BLEND_MODES = [
  ['source-over', '正常（覆盖）'], ['multiply', '正片叠底'],
  ['screen', '滤色'], ['overlay', '叠加'],
  ['difference', '差值'], ['lighter', '变亮（相加）'],
  ['darken', '变暗'], ['lighten', '提亮']
];

/* 下拉：先建 option 再赋 value（顺序和旧标记一致） */
function mkSelect(id, opts, cur, onChange){
  const sel = h('select', { id: id, on: onChange ? { change: onChange } : null });
  opts.forEach(function(o){
    sel.appendChild(h('option', { value: o[0], text: o[1] }));
  });
  sel.value = cur;
  return sel;
}

function renderProps(){
  closeAllDropdowns();
  const L = getSel();

  if (!L){
    propsEl.classList.remove('img-layer');
    propsEl.replaceChildren(
      h('div', { class: 'empty' },
        h('b', { text: '没有选中图层' }),
        '在画布上拖拽即可框出拉伸层，',
        h('br'),
        '点已有矩形可以选中它并编辑参数。')
    );
    sigProps = 'none';
    return;
  }

  const isShuf = L.order === 'shuffle', isInt = L.order === 'interleave';
  const sl0 = sampleLine(L, Math.round(L.x), Math.round(L.y),
                         Math.max(1, Math.round(L.w)), Math.max(1, Math.round(L.h)));
  const dirTag = (L.dir === 'v') ? '↕ 垂直' : '↔ 水平';
  const offTag = L.sampleOff ? ' · ' + (L.sampleOff > 0 ? '+' : '') + L.sampleOff + '%' : '';
  const colTag = (L.sat === 0 && L.warm === 0 && !L.hue) ? '默认'
               : (L.hue ? 'H' + (L.hue > 0 ? '+' : '') + L.hue + '° ' : '') +
                 'S' + (L.sat > 0 ? '+' : '') + L.sat + ' W' + (L.warm > 0 ? '+' : '') + L.warm;
  const isImg = (L.kind === 'image');
  const orderTag = isShuf ? '乱序' : isInt ? '间序' : '顺序';

  propsEl.classList.toggle('img-layer', isImg);

  /* ---------- 先建控件 ---------- */
  const pName  = h('input', { type: 'text', id: 'pName', value: L.name });
  const pX     = cellNum('pX', 'X', Math.round(L.x), { unit:'px', min:0, max:Math.round(S.src.w - L.w), disabled:L.locked, icon:'i-ax-x' });
  const pY     = cellNum('pY', 'Y', Math.round(L.y), { unit:'px', min:0, max:Math.round(S.src.h - L.h), disabled:L.locked, icon:'i-ax-y' });
  const pW     = cellNum('pW', '宽', Math.round(L.w), { unit:'px', min:2, max:Math.round(S.src.w - L.x), disabled:L.locked, icon:'i-ax-w' });
  const pH     = cellNum('pH', '高', Math.round(L.h), { unit:'px', min:2, max:Math.round(S.src.h - L.y), disabled:L.locked, icon:'i-ax-h' });
  const sxGeo  = h('span', { class: 'sx', id: 'sxGeo', text: Math.round(L.w) + ' × ' + Math.round(L.h) });

  const pLock  = h('button', { id: 'pLock', class: L.locked ? 'lock-on' : '' },
                   icon('i-lock', 'ic-s'), L.locked ? '解锁位置' : '锁定位置');
  const pDup   = h('button', { id: 'pDup', text: '复制' });
  const pDel   = h('button', { id: 'pDel', text: '删除' });

  const pDir   = mkSelect('pDir', [
    ['h', '水平 · 取竖列左右拉伸'],
    ['v', '垂直 · 取横行上下拉伸']
  ], L.dir);

  const pOff   = ctlNum('pOff', '取样偏移', -100, 100, 1, L.sampleOff, '%', 'i-offset');
  const pBlock = ctlNum('pBlock', '分组像素', 1, 100, 1, L.block, 'px', 'i-grid2');

  const pOrder = mkSelect('pOrder', [
    ['none', '顺序（默认）'],
    ['shuffle', '乱序（打乱取样线上的像素）'],
    ['interleave', '间序（分段交错）']
  ], L.order);

  const pShufAmt  = cellNum('pShufAmtV', '强度', L.shufAmt, { unit:'%', min:0, max:100, icon:'i-bolt' });
  const pShufBlkV = cellNum('pShufBlkV', '块大小', L.shufBlock, { unit:'px', min:1, max:16, icon:'i-block2' });
  const pSeed     = h('input', { type: 'number', id: 'pSeed', value: L.seed });
  const pReseed   = h('button', { id: 'pReseed' }, icon('i-dice', 'ic'), '重掷种子');
  const grpShuf   = h('div', { id: 'grpShuf', style: isShuf ? null : 'display:none' },
    cells(pShufAmt, pShufBlkV),
    h('div', { class: 'stack' }, h('label', { text: '种子' }), h('div', { class: 'num' }, pSeed)),
    h('div', { class: 'btnrow' }, pReseed),
    info('块大小 = 以几个像素为单位整体搬家；', h('br'), '强度 = 每一步发生交换的概率。'));

  const pSeg   = ctlNum('pSeg', '段数', 2, 16, 1, L.interSeg, '段', 'i-seg2');
  const grpInt = h('div', { id: 'grpInt', style: isInt ? null : 'display:none' },
    pSeg,
    info('把取样线切成 N 段再交错缝回，产生规律的条带错位。'));

  const pSat  = cellNum('pSatV', '饱和度', L.sat, { min:-100, max:100, icon:'i-drop' });
  const pWarm = cellNum('pWarmV', '冷暖度', L.warm, { min:-100, max:100, icon:'i-temp' });
  const pHue  = cellNum('pHueV', '色相', L.hue, { min:-180, max:180, unit:'°', icon:'i-hue' });
  const pRand = h('button', { id: 'pRand' }, icon('i-dice', 'ic'), '本层随机');

  const pOp    = ctlNum('pOp', '不透明度', 0, 100, 1, Math.round(L.opacity * 100), '%', 'i-alpha');
  const pBlend = mkSelect('pBlend', BLEND_MODES, L.blend);

  /* ---------- 再拼成面板 ---------- */
  const nodes = [];

  if (isImg){
    nodes.push(h('div', { class: 'img-note',
      text: '图片图层：按位图本身显示，下面的拉伸参数对它不生效。' }));
  }

  nodes.push(
    h('details', { class: 'grp', 'data-grp': 'geo', open: !!grpOpen.geo },
      h('summary', null, icon('i-chev', 'chev'), '几何', sxGeo),
      h('div', { class: 'grp-body' },
        h('div', { class: 'stack' }, h('label', { text: '名称' }), pName),
        cells(pX, pY),
        cells(pW, pH),
        h('div', { class: 'btnrow', style: 'margin-top:10px' }, pLock, pDup, pDel),
        L.locked
          ? h('div', { class: 'mini', style: 'margin:8px 0 0',
              text: '位置已锁定：拖动 / 缩放失效，参数仍可修改。' })
          : null)),

    h('details', { class: 'grp', 'data-grp': 'stretch', open: !!grpOpen.stretch },
      h('summary', null, icon('i-chev', 'chev'), '拉伸与取样',
        h('span', { class: 'sx', text: dirTag + offTag })),
      h('div', { class: 'grp-body' },
        stack('方向', 'pDir', pDir),
        pOff,
        info('−100 左 / 上边缘　0 居中　+100 右 / 下边缘',
          h('br'),
          '当前取样线 ',
          h('strong', { text: (sl0.dir === 'v' ? 'y = ' : 'x = ') + sl0.pos + ' px' }),
          '，就是画布上那条黄线。'))),

    h('details', { class: 'grp', 'data-grp': 'block', open: !!grpOpen.block },
      h('summary', null, icon('i-chev', 'chev'), '方块感',
        h('span', { class: 'sx', text: L.block > 1 ? L.block + ' px' : '关闭' })),
      h('div', { class: 'grp-body' },
        pBlock,
        info('每 N 个像素一组，整组只取首像素的颜色。',
          h('br'), '1 = 原样，2–5 = 细条纹，',
          h('strong', { text: '10 以上 = 粗色块' }), '。'))),

    h('details', { class: 'grp', 'data-grp': 'order', open: !!grpOpen.order },
      h('summary', null, icon('i-chev', 'chev'), '像素顺序',
        h('span', { class: 'sx', text: orderTag })),
      h('div', { class: 'grp-body' },
        stack('模式', 'pOrder', pOrder),
        grpShuf,
        grpInt)),

    h('details', { class: 'grp', 'data-grp': 'color', open: !!grpOpen.color },
      h('summary', null, icon('i-chev', 'chev'), '色彩',
        h('span', { class: 'sx', text: colTag })),
      h('div', { class: 'grp-body' },
        cells(pSat, pWarm, pHue),
        h('div', { class: 'btnrow' }, pRand),
        info('随机幅度由右侧「全局随机 · 强度」决定。'))),

    h('details', { class: 'grp', 'data-grp': 'blend', open: !!grpOpen.blend },
      h('summary', null, icon('i-chev', 'chev'), '混合',
        h('span', { class: 'sx', text: Math.round(L.opacity * 100) + '%' })),
      h('div', { class: 'grp-body' },
        pOp,
        stack('模式', 'pBlend', pBlend)))
  );

  propsEl.replaceChildren.apply(propsEl, nodes);

  /* ---------- 绑定：直接用上面那些变量 ---------- */

  fillAllRanges(propsEl);

  pName.addEventListener('change', function(e){
    pushUndo(); L.name = e.target.value || L.name; renderAll();
  });

  /* 几何四个参数同样走 bindNum：键盘输入 + 拖图标都通。
     上下限用函数给，X 一变「宽」的上限立刻跟着变，不需要重建面板。 */
  const syncGeoTxt = function(){
    sxGeo.textContent = Math.round(L.w) + ' × ' + Math.round(L.h);
  };
  bindNum(pX._inp, function(v){ L.x = v; syncGeoTxt(); }, function(){ return { min:0, max:S.src.w - L.w }; });
  bindNum(pY._inp, function(v){ L.y = v; syncGeoTxt(); }, function(){ return { min:0, max:S.src.h - L.h }; });
  bindNum(pW._inp, function(v){ L.w = v; syncGeoTxt(); }, function(){ return { min:2, max:S.src.w - L.x }; });
  bindNum(pH._inp, function(v){ L.h = v; syncGeoTxt(); }, function(){ return { min:2, max:S.src.h - L.y }; });

  bindNum(pBlock._inp, function(v){ L.block = Math.round(v); });

  pDir.addEventListener('change', function(e){
    pushUndo(); 
    L.dir = (e.target.value === 'v') ? 'v' : 'h';
    newLayerDir = L.dir;                       // 顺手变成新框的默认方向
    $('newDir').value = L.dir;
    renderAll();
  });
  bindNum(pOff._inp, function(v){ L.sampleOff = Math.round(v); });

  pLock.addEventListener('click', function(){
    pushUndo(); L.locked = !L.locked; renderAll();
    toast(L.locked ? '已锁定位置（不能拖动/缩放）' : '已解锁位置');
  });

  pOrder.addEventListener('change', function(e){
    pushUndo(); L.order = e.target.value;
    grpShuf.style.display = (L.order === 'shuffle') ? '' : 'none';
    grpInt.style.display  = (L.order === 'interleave') ? '' : 'none';
    renderAll();
  });

  bindNum(pShufAmt._inp,  function(v){ L.shufAmt = Math.round(v); });
  bindNum(pShufBlkV._inp, function(v){ L.shufBlock = Math.round(v); });

  pSeed.addEventListener('change', function(e){
    pushUndo(); L.seed = (parseInt(e.target.value) || 0) >>> 0;
    pRender();
  });
  pReseed.addEventListener('click', function(){
    pushUndo(); L.seed = randSeed(); renderProps(); render();
  });

  bindNum(pSeg._inp, function(v){ L.interSeg = Math.round(v); });

  bindNum(pSat._inp,  function(v){ L.sat  = Math.round(v); });
  bindNum(pWarm._inp, function(v){ L.warm = Math.round(v); });
  bindNum(pHue._inp,  function(v){ L.hue = Math.round(v); });

  pRand.addEventListener('click', function(){
    pushUndo(); randomizeLayer(L); renderProps(); render();
  });

  bindNum(pOp._inp, function(v){ L.opacity = v / 100; });

  pBlend.addEventListener('change', function(e){
    pushUndo(); L.blend = e.target.value; render();
  });

  pDup.addEventListener('click', duplicateSel);
  pDel.addEventListener('click', deleteSel);

  /* 所有数值框都绑好之后，再挂图标拖拽（bindIcoScrub 依赖 el._apply） */
  bindAllScrubs(propsEl);
  enhanceSelects(propsEl);

  /* 记下这次渲染用的签名：下次 renderAll 据此判断要不要重建 */
  sigProps = propsSig(L);
}
function pRender(){ render(); renderStatus(); }
