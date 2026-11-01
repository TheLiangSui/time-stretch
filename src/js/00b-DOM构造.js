/* =========================================================
   DOM 构造器
   ---------------------------------------------------------
   以前面板是「拼字符串 → innerHTML → getElementById 找回」。
   两条路都靠字符串里的 id 对齐，写错一个字就是 null，
   而且要拿一个子元素得再做一次全局查询。

   改成用函数直接建节点：节点在手里，绑定就地完成，
   不经过字符串，也不经过 id —— 名字改了、位置挪了都不会失联。

   属性约定：
     class / id / text / html / style / data / on / attrs
     value：直接写 property（input 的初值，不进 DOM 属性）
     其余键：当普通属性；值为 true 写空串，false / null / undefined 跳过
   ========================================================= */
const SVG_NS = 'http://www.w3.org/2000/svg';

function h(tag, props){
  const el = document.createElement(tag);
  applyProps(el, props);
  appendKids(el, Array.prototype.slice.call(arguments, 2));
  return el;
}

/* 建 SVG 节点必须用命名空间，否则只是个认不出来的 HTML 元素 */
function hs(tag, props){
  const el = document.createElementNS(SVG_NS, tag);
  applyProps(el, props);
  appendKids(el, Array.prototype.slice.call(arguments, 2));
  return el;
}

/* 图标：<svg class="..."><use href="#id"/></svg> */
function icon(id, cls){
  const s = hs('svg', cls ? { class: cls } : null);
  s.appendChild(hs('use', { href: '#' + id }));
  return s;
}

function applyProps(el, props){
  if (!props) return;
  for (const k in props){
    const v = props[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class')       el.setAttribute('class', v);   // SVG 的 className 只读，统一走属性
    else if (k === 'text')   el.textContent = v;
    else if (k === 'html')   el.innerHTML = v;
    else if (k === 'value')  el.value = v;
    else if (k === 'on'){ for (const ev in v) el.addEventListener(ev, v[ev]); }
    else if (k === 'data'){ for (const d in v) el.dataset[d] = v[d]; }
    else if (k === 'style'){
      /* 字符串原样写属性（不被 CSSOM 重新序列化成 "8px 0px 0px"），对象走逐条设置 */
      if (typeof v === 'string') el.setAttribute('style', v);
      else for (const p in v) el.style.setProperty(p, v[p]);
    } else if (k === 'attrs'){ for (const a in v) el.setAttribute(a, v[a]); }
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
}

function appendKids(el, kids){
  for (let i = 0; i < kids.length; i++){
    const k = kids[i];
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) appendKids(el, k);
    else if (k instanceof Node) el.appendChild(k);
    else el.appendChild(document.createTextNode(String(k)));
  }
}

/* 包一层 .cells：多个参数单元自动排成两列 */
function cells(){
  return h.apply(null, ['div', { class: 'cells' }].concat(Array.prototype.slice.call(arguments)));
}
/* 一行说明文字 */
function info(){
  return h.apply(null, ['div', { class: 'info' }].concat(Array.prototype.slice.call(arguments)));
}
/* 带标题的单控件行（下拉用） */
function stack(labelText, forId, ctrl){
  return h('div', { class: 'stack' },
    h('label', forId ? { for: forId } : null, labelText), ctrl);
}
