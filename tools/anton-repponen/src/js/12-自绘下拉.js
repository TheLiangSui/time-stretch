/* =========================================================
   自绘下拉
   原生 select 的弹层由系统绘制 —— 做不了下拉动画，点下去还会闪一下。
   这里保留隐藏的 <select> 当数据源（值、change 事件都不变），
   视觉和展开动画全交给自绘的这一层。
   ========================================================= */
/* 分段控件的滑块：按子按钮数量算宽度，按 .on 的位置平移 */
function syncSeg(seg){
  if (!seg) return;
  const btns = [];
  for (let i = 0; i < seg.children.length; i++){
    if (seg.children[i].tagName === 'BUTTON') btns.push(seg.children[i]);
  }
  let idx = -1;
  for (let i = 0; i < btns.length; i++) if (btns[i].classList.contains('on')) { idx = i; break; }
  seg.style.setProperty('--n', btns.length || 1);
  seg.style.setProperty('--i', idx < 0 ? 0 : idx);
  seg.classList.toggle('no-thumb', idx < 0 || btns.length === 0);
}
function initSegs(root){
  const list = (root || document).querySelectorAll('.seg');
  for (let i = 0; i < list.length; i++){
    if (!list[i].querySelector('.seg-thumb')){
      const t = document.createElement('span');
      t.className = 'seg-thumb';
      list[i].insertBefore(t, list[i].firstChild);
    }
    syncSeg(list[i]);
  }
}

function closeAllDropdowns(){
  const all = document.querySelectorAll('.dd.open');
  for (let i = 0; i < all.length; i++){
    all[i].classList.remove('open');
    if (all[i]._ddClose) all[i]._ddClose();
  }
  /* 面板重建后可能留下没人认领的列表 */
  const loose = document.body.querySelectorAll(':scope > .dd-list');
  for (let i = 0; i < loose.length; i++) loose[i].remove();
}
function enhanceSelect(sel){
  if (!sel || sel._dd) return;
  if (sel.style && sel.style.position === 'absolute') return;   // 已经是隐藏中转的，跳过
  sel._dd = true;

  const wrap = document.createElement('div');
  wrap.className = 'dd';
  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);
  sel.classList.add('dd-sel');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dd-btn';
  btn.appendChild(h('span'));
  btn.appendChild(icon('i-chev', 'dd-chev'));
  const list = document.createElement('div');
  list.className = 'dd-list';
  wrap.insertBefore(btn, sel);
  wrap.insertBefore(list, sel);

  /* 打开时把列表搬到 body 上（真正的 portal）。
     右侧面板是滚动容器、details 的内容区还有 overflow / content-visibility 包含块，
     留在原地不管用 absolute 还是 fixed 都会被裁掉。 */
  let inBody = false;
  const close = function(){
    wrap.classList.remove('open');
    list.classList.remove('open');
    if (list.parentNode === document.body) list.remove();
    inBody = false;
  };
  wrap._ddClose = close;
  const openIt = function(){
    if (!inBody){ document.body.appendChild(list); inBody = true; }
    list.classList.add('open');
    wrap.classList.add('open');
    place();                       // 先摆位置再显形，避免看到它跳一下
  };
  /* 位置按按钮的 rect 现算；下方放不下就翻到上面 */
  const place = function(){
    const r = btn.getBoundingClientRect();
    const lh = list.offsetHeight || 0;
    const drop = 4;
    const up = (r.bottom + drop + lh > window.innerHeight - 8) && (r.top - drop - lh > 8);
    list.style.left = r.left + 'px';
    list.style.width = r.width + 'px';
    list.style.top = (up ? (r.top - drop - lh) : (r.bottom + drop)) + 'px';
    list.style.transformOrigin = up ? 'bottom center' : 'top center';
  };
  const sync = function(){
    const opt = sel.options[sel.selectedIndex];
    btn.querySelector('span').textContent = opt ? opt.textContent : '';
    Array.prototype.forEach.call(list.children, function(b, i){
      b.classList.toggle('on', i === sel.selectedIndex);
    });
  };
  Array.prototype.forEach.call(sel.options, function(o, i){
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dd-opt';
    b.textContent = o.textContent;
    b.addEventListener('click', function(e){
      e.stopPropagation();
      sel.selectedIndex = i;
      sel.dispatchEvent(new Event('change', { bubbles:true }));
      sync();
      close();
    });
    list.appendChild(b);
  });

  btn.addEventListener('click', function(e){
    e.stopPropagation();
    const wasOpen = wrap.classList.contains('open');
    closeAllDropdowns();
    if (!wasOpen) openIt();
  });

  sel.addEventListener('change', sync);
  sync();
  sel._syncDD = sync;
}
function enhanceSelects(root){
  const list = (root || document).querySelectorAll('select[id]');
  for (let i = 0; i < list.length; i++) enhanceSelect(list[i]);
}
/* 点空白处收起 */
document.addEventListener('pointerdown', function(e){
  if (!e.target.closest || !e.target.closest('.dd, .dd-list')) closeAllDropdowns();
}, true);
document.addEventListener('click', function(e){
  const b = e.target.closest && e.target.closest('.seg > button');
  if (b) syncSeg(b.parentNode);
});
/* 浮层是 fixed 的，面板一滚就和按钮错位 —— 直接收起 */
window.addEventListener('scroll', closeAllDropdowns, true);
window.addEventListener('resize', closeAllDropdowns);
/* 分组展开状态：renderProps 会整体重建 DOM，靠这个对象把展开状态带过去 */
const GRP_DEFAULT = { geo:true, stretch:true, block:true, order:false, color:true, blend:false };
const grpOpen = Object.assign({}, GRP_DEFAULT);

