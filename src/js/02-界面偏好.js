/* =========================================================
   界面偏好：数值调整方式 + UI 尺寸
   - num: 'icon' 仅小图标 / 'bar' 仅数据条 / 'both' 两者都有
   - ui : 1 / 1.15 / 1.3，只缩放字号与控件尺寸，不碰画布渲染
   ========================================================= */
const UI_PREF = { num:'icon', ui:1 };
function loadUiPrefs(){
  try {
    const d = JSON.parse(localStorage.getItem('ts.ui') || 'null');
    if (d && (d.num === 'icon' || d.num === 'bar' || d.num === 'both')) UI_PREF.num = d.num;
    if (d && isFinite(d.ui)) UI_PREF.ui = clamp(d.ui, 1, 1.3);
  } catch (_) {}
}
function applyUiPrefs(silent){
  document.body.setAttribute('data-num', UI_PREF.num);
  document.documentElement.style.setProperty('--ui', String(UI_PREF.ui));
  syncUiSegs();
  if (!silent){ try { localStorage.setItem('ts.ui', JSON.stringify(UI_PREF)); } catch (_) {} }
  render();
}
function syncUiSegs(){
  const sn = $('segNumMode');
  if (sn) Array.prototype.forEach.call(sn.children, function(b){
    b.classList.toggle('on', b.getAttribute('data-num') === UI_PREF.num);
  });
  const su = $('segUiScale');
  if (su) Array.prototype.forEach.call(su.children, function(b){
    b.classList.toggle('on', parseFloat(b.getAttribute('data-ui')) === UI_PREF.ui);
  });
}
document.addEventListener('input', function(e){
  if (e.target && e.target.type === 'range') fillRange(e.target);
}, true);

/* =========================================================
   工具函数
   ========================================================= */
function toast(msg){
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(function(){ t.classList.remove('show'); }, 1900);
}
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function uid(){ return S.nextId++; }
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, function(c){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
  });
}
/* 确定性伪随机：同一个 seed 每次渲染结果一致，乱序才不会闪 */
function mulberry32(a){
  return function(){
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randSeed(){ return (Math.random() * 0x7fffffff) | 0; }

/* 图像坐标 <-> 屏幕坐标（相对视口左上角，单位 = CSS 像素） */
function img2scr(x,y){ return { x: x*S.view.s + S.view.tx, y: y*S.view.s + S.view.ty }; }
function scr2img(x,y){ return { x: (x - S.view.tx)/S.view.s, y: (y - S.view.ty)/S.view.s }; }
