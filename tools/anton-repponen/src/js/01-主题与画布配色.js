/* =========================================================
   UI 主题 / 画布配色
   chrome 保持中性，让画面颜色不被 UI 干扰；
   画布上的叠加层必须跟随主题 —— 浅色主题下白色选中框会直接消失。
   ========================================================= */
let PAL = null;
function buildPal(){
  const light = document.documentElement.getAttribute('data-theme') === 'light';
  return light
    ? { light:true, canvasBg:'#f2f2f5', frame:'rgba(20,20,40,.18)',
        sel:'#2f74d8', hov:'#b07600',
        ref:'rgba(47,116,216,.55)', refOff:'rgba(120,120,145,.34)',
        line:'#c07f00', lineDim:'rgba(180,120,10,.34)',
        hFill:'#ffffff', hStroke:'#2f74d8',
        lockBg:'#b47d0a', lockFg:'#ffffff' }
    : { light:false, canvasBg:'#0c0c10', frame:'rgba(255,255,255,.20)',
        sel:'#5b9cf6', hov:'#efb44a',
        ref:'rgba(140,205,255,.45)', refOff:'rgba(140,140,150,.22)',
        line:'#efb44a', lineDim:'rgba(239,180,74,.30)',
        hFill:'#ffffff', hStroke:'#3d7fe0',
        lockBg:'#efb44a', lockFg:'#231a06' };
}
function applyTheme(t, silent){
  document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
  PAL = buildPal();
  const u = document.querySelector('#btnTheme use');
  if (u) u.setAttribute('href', PAL.light ? '#i-sun' : '#i-moon');
  const b = $('btnTheme');
  if (b) b.title = PAL.light ? '切换到深色主题' : '切换到浅色主题';
  if (!silent){ try { localStorage.setItem('ts.theme', PAL.light ? 'light' : 'dark'); } catch(_){} }
  render(); renderStatus();
}

/* 滑杆已填充段：一条规则同时覆盖普通滑杆与以 0 为原点的双向滑杆 */
function fillRange(el){
  const mn = parseFloat(el.min) || 0, mx = parseFloat(el.max);
  const v = parseFloat(el.value);
  if (!isFinite(v) || !isFinite(mx)) return;
  const p = (v - mn) / ((mx - mn) || 1) * 100;
  if (el.hasAttribute('data-bip')){
    el.style.setProperty('--pa', Math.min(p, 50) + '%');
    el.style.setProperty('--pb', Math.max(p, 50) + '%');
  } else {
    el.style.setProperty('--pa', '0%');
    el.style.setProperty('--pb', p + '%');
  }
}
function fillAllRanges(root){
  const list = (root || document).querySelectorAll('input[type=range]');
  for (let i = 0; i < list.length; i++) fillRange(list[i]);
}
