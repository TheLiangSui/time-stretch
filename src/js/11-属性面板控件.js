/* =========================================================
   属性面板
   ========================================================= */
/* 滑杆行：min<0 视为双向滑杆，填充从 0 处向两侧展开。
   标签带 data-def，双击可回默认值。 */
/* =========================================================
   参数单元：标签在上、控件在下。
   多个单元放进 .cells 自动排成两列（Figma 外观面板的排法），
   短标签一行两个，省掉「标签靠左、数值靠右」中间那一大片空白。

   返回的是节点本身，数字框挂在 cell._inp 上 ——
   调用方拿到单元就能直接绑定，不用再按 id 去查。
   ========================================================= */
function cellNum(inputId, label, val, opt){
  opt = opt || {};
  const input = h('input', {
    type: 'number', id: inputId, value: val,
    min: opt.min, max: opt.max, step: (opt.step || 1),
    disabled: !!opt.disabled
  });
  const num = h('div', { class: 'num' });
  if (opt.icon){
    /* 图标就是拖拽热区：按住左右拖改数值（文字只作标签） */
    const ico = hs('svg', {
      class: 'cell-ico', 'data-scrub': inputId, 'data-def': String(val), 'aria-hidden': 'true'
    }, hs('use', { href: '#' + opt.icon }));
    ico._numEl = input;              // 拖拽时直接取到自己的数字框
    num.appendChild(ico);
  }
  num.appendChild(input);
  if (opt.unit) num.appendChild(h('span', { class: 'sfx', text: opt.unit }));

  const cell = h('div', { class: 'cell' }, h('label', { for: inputId, text: label }), num);
  cell._inp = input;
  return cell;
}
/* 整行版本：一个单元独占一行 */
function ctlNum(id, label, min, max, step, val, unit, icon){
  const cell = cellNum(id + 'V', label, val, { unit:unit, min:min, max:max, step:step, icon:icon });
  const wrap = h('div', { class: 'cells' }, cell);
  wrap._inp = cell._inp;
  return wrap;
}

/* 给一个数字框接上写回路径。scrub 与键盘输入共用同一个 apply，不另开分支。
   第一个参数可以是 id，也可以是节点本身（面板重建后调用方手里就有节点）。
   bounds 可选：返回 {min,max} 的函数，用于「宽的上限取决于 x」这类联动约束 ——
   传函数而不是读 DOM 属性，就不用为了刷新上限而重建整个面板（那会丢焦点）。 */
function bindNum(idOrEl, after, bounds){
  const el = (typeof idOrEl === 'string') ? $(idOrEl) : idOrEl;
  if (!el) return null;
  const inputId = el.id;
  const step = parseFloat(el.step) || 1;
  const b0 = { min: parseFloat(el.min), max: parseFloat(el.max) };
  const getB = function(){
    if (!bounds) return b0;
    const b = bounds();
    return {
      min: isFinite(b.min) ? b.min : b0.min,
      max: isFinite(b.max) ? b.max : b0.max
    };
  };
  let last = parseFloat(el.value);
  /* 数据条：跟数值同步的填充，也是第二种拖拽热区 */
  const paintBar = function(v){
    const cell = el.closest('.cell');
    if (!cell) return;
    const bar = cell.querySelector('.sbar');
    if (!bar) return;
    const b = getB();
    const p = Math.max(0, Math.min(100, (v - b.min) / ((b.max - b.min) || 1) * 100));
    const fill = bar.querySelector('i');
    if (fill) fill.style.width = p + '%';
    bar.style.setProperty('--p', p + '%');       // 锚点位置跟着走
  };
  const apply = function(v, quiet){
    if (!isFinite(v)) v = last;
    const b = getB();
    v = clamp(v, b.min, b.max);
    v = Math.round(v / step) * step;
    last = v;
    el.value = v;
    paintBar(v);
    after(v);
    if (!quiet){ render(); renderStatus(); }
  };
  el._apply = apply;
  el._last  = function(){ return last; };
  el._paint = function(){ paintBar(last); };
  el.addEventListener('change', function(){
    beginLive('n:' + inputId);
    apply(parseFloat(el.value));
    endLive(); syncButtons();
  });
  paintBar(last);
  return el;
}

/* 标签拖拽：dx 直接映射到数值步长 */
/* 图标拖拽：按住数字框左侧的小图标左右拖改数值。
   文字标签只负责「这是什么」，不再兼拖拽热区 —— 两个都能拖会互相打架。 */
function bindIcoScrub(icoEl){
  if (!icoEl || icoEl._scrub) return;
  const el = icoEl._numEl || $(icoEl.getAttribute('data-scrub') || '');
  if (!el || !el._apply) return;
  icoEl._scrub = true;
  const step = parseFloat(el.step) || 1;
  let on = false, x0 = 0, v0 = 0;
  icoEl.addEventListener('pointerdown', function(e){
    if (e.button !== 0 || el.disabled) return;
    /* 以 DOM 里的当前值为起点：撤销 / 打开工程会直接改 input.value，
       闭包里缓存的 last 会过期 */
    const dv = parseFloat(el.value);
    on = true; x0 = e.clientX; v0 = isFinite(dv) ? dv : el._last();
    beginLive('scrub:' + el.id);
    icoEl.classList.add('scrubbing');
    try { icoEl.setPointerCapture(e.pointerId); } catch(_){}
    e.preventDefault(); e.stopPropagation();
  });
  icoEl.addEventListener('pointermove', function(e){
    if (!on) return;
    const k = e.shiftKey ? 10 : (e.altKey ? 0.1 : 1);
    el._apply(v0 + (e.clientX - x0) * step * k);
  });
  const end = function(){
    if (!on) return;
    on = false;
    icoEl.classList.remove('scrubbing');
    endLive(); syncButtons();
  };
  icoEl.addEventListener('pointerup', end);
  icoEl.addEventListener('pointercancel', end);
  /* 双击图标 = 回到默认值 */
  icoEl.addEventListener('dblclick', function(){
    const d = parseFloat(icoEl.getAttribute('data-def'));
    if (!isFinite(d)) return;
    beginLive('scrub-reset:' + el.id);
    el._apply(d);
    endLive(); syncButtons();
  });
}
/* 给每个数值单元补一条数据条（标记里不写，省得到处重复） */
function ensureBars(root){
  const cells = (root || document).querySelectorAll('.cell');
  for (let i = 0; i < cells.length; i++){
    const inp = cells[i].querySelector('input[type=number]');
    if (!inp || !inp.id) continue;
    if (cells[i].querySelector('.sbar')) continue;
    const b = document.createElement('div');
    b.className = 'sbar';
    b.setAttribute('data-scrub', inp.id);
    b.setAttribute('data-def', inp.value);
    b.appendChild(h('i'));
    b.appendChild(h('b'));
    b._numEl = inp;                  // 拖动时直接取到对应的数字框
    cells[i].appendChild(b);
  }
}
function bindAllScrubs(root){
  root = root || document;
  ensureBars(root);
  const icos = root.querySelectorAll('[data-scrub]');
  for (let i = 0; i < icos.length; i++) bindIcoScrub(icos[i]);
  /* 数据条是后补的，绑定完补画一次填充 */
  const nums = root.querySelectorAll('input[type=number][id]');
  for (let i = 0; i < nums.length; i++) if (nums[i]._paint) nums[i]._paint();
}
