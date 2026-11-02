/* =========================================================
   设置：默认导入 / 导出 / 工程目录
   桌面版（Electron）走 IPC 存到 userData/settings.json，能真正影响系统对话框；
   浏览器版只能存 localStorage，作为占位。
   ========================================================= */
const SET_KEYS = ['importDir', 'exportDir', 'projectDir'];
const SET_LABEL = { importDir:'图片导入目录', exportDir:'导出图片目录', projectDir:'工程文件目录' };
/* 运行环境三选一：
   desktop = 独立桌面版（有 preload，window.desktop 在）
   hub     = 合集里的 iframe（没有 preload，靠 postMessage 找合集主进程要系统对话框）
   web     = 浏览器 */
const IN_HUB = /[?&]host=hub\b/.test(location.search);
function makeHubBridge(){
  let seq = 0;
  const waiting = new Map();
  window.addEventListener('message', function(e){
    const d = e.data;
    if (!d || d.__ts !== 1 || d.id == null) return;
    const w = waiting.get(d.id);
    if (!w) return;
    waiting.delete(d.id);
    if (d.err) w.reject(new Error(d.err)); else w.resolve(d.res);
  });
  const call = function(cmd, args){
    return new Promise(function(resolve, reject){
      const id = ++seq;
      waiting.set(id, { resolve: resolve, reject: reject });
      try { parent.postMessage({ __ts: 1, id: id, cmd: cmd, args: args || null }, '*'); }
      catch (err){ waiting.delete(id); reject(err); }
      setTimeout(function(){
        if (waiting.has(id)){ waiting.delete(id); reject(new Error('合集没有响应：' + cmd)); }
      }, 180000);
    });
  };
  /* 文件对话框：合集里没有 setSettings 的消费者，用页面内的文件选择顶上 */
  const pickFile = function(accept){
    return new Promise(function(resolve){
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = accept; inp.style.display = 'none';
      document.body.appendChild(inp);
      inp.onchange = function(){
        const f = inp.files && inp.files[0];
        inp.remove();
        if (!f){ resolve(null); return; }
        const fr = new FileReader();
        fr.onload = function(){ resolve({ data: fr.result, name: f.name }); };
        fr.onerror = function(){ resolve(null); };
        fr.readAsArrayBuffer(f);
      };
      inp.click();
    });
  };
  return {
    isDesktop: true, inHub: true,
    getSettings: function(){
      try { return Promise.resolve(JSON.parse(localStorage.getItem('ts.settings') || '{}')); }
      catch (_){ return Promise.resolve({}); }
    },
    setSettings: function(s){
      try { localStorage.setItem('ts.settings', JSON.stringify(s)); } catch (_){}
      return Promise.resolve(true);
    },
    pickFolder: function(title){ return call('pickFolder', title); },
    openImage: function(){ return pickFile('image/*'); },
    openProject: function(){ return pickFile('.json,application/json'); }
  };
}
const dsk = (window.desktop && dsk.isDesktop) ? window.desktop
          : (IN_HUB ? makeHubBridge() : null);
const hasDesktop = !!dsk;
/* autoSave 默认开：缺省即开，只有明确存过 false 才算关 */
let settings = { importDir:'', exportDir:'', projectDir:'', autoSave:true };

function renderSettings(){
  SET_KEYS.forEach(function(k){
    const el = $('set_' + k);
    if (el) el.value = settings[k] || '';
  });
  const sw = $('set_autoSave');
  if (sw) sw.checked = autoSaveOn();
  $('setNote').replaceChildren.apply($('setNote'), hasDesktop
    ? ['当前是', h('b', { text: '桌面版' }), '：可以把下面三项设成你常用的文件夹，之后导入 / 导出 / 存工程都会默认落到那里。']
    : ['当前是', h('b', { text: '网页版' }), '：受浏览器限制，下面三项无法影响系统对话框，建议用桌面版 ',
       h('code', { text: '时间拉伸.exe' }), '。']);
}
async function loadSettings(){
  try {
    if (hasDesktop){
      const s = await dsk.getSettings();
      if (s){
        SET_KEYS.forEach(function(k){ if (typeof s[k] === 'string') settings[k] = s[k]; });
        if (typeof s.autoSave === 'boolean') settings.autoSave = s.autoSave;
      }
    } else {
      const raw = localStorage.getItem('timeStretchSettings');
      const s = raw ? JSON.parse(raw) : null;
      if (s){
        SET_KEYS.forEach(function(k){ if (typeof s[k] === 'string') settings[k] = s[k]; });
        if (typeof s.autoSave === 'boolean') settings.autoSave = s.autoSave;
      }
    }
  } catch (_){}
  renderSettings();
}
async function persistSettings(){
  try {
    if (hasDesktop) await dsk.setSettings(settings);
    else localStorage.setItem('timeStretchSettings', JSON.stringify(settings));
  } catch (_){}
  renderSettings();
}
/* 自动保存开关：关掉的同时把已经排队的那次撤掉，避免「刚关就写了一次」 */
$('set_autoSave').onchange = async function(){
  settings.autoSave = !!this.checked;
  if (!settings.autoSave) autoSaveCancel();
  await persistSettings();
  toast(settings.autoSave ? '自动保存已开启' : '自动保存已关闭：之后不会自动写盘');
};

document.querySelectorAll('#modalSettings [data-pick]').forEach(function(btn){
  btn.onclick = async function(){
    if (!hasDesktop){ toast('浏览器里没有系统目录对话框，请用桌面版或从合集打开'); return; }
    const key = this.getAttribute('data-pick');
    try {
      const p = await dsk.pickFolder('选择「' + SET_LABEL[key] + '」');
      if (p){ settings[key] = p; await persistSettings(); toast('已设置 ' + SET_LABEL[key]); }
    } catch (err){ toast('选择失败：' + err.message); }
  };
});
document.querySelectorAll('#modalSettings [data-clear]').forEach(function(btn){
  btn.onclick = async function(){
    const key = this.getAttribute('data-clear');
    settings[key] = '';
    await persistSettings();
    toast('已清除 ' + SET_LABEL[key]);
  };
});
$('setReset').onclick = async function(){
  SET_KEYS.forEach(function(k){ settings[k] = ''; });
  await persistSettings();
  toast('已清除全部默认目录');
};
$('setClose').onclick = function(){
  $('modalSettings').classList.remove('show');
};
$('modalSettings').addEventListener('click', function(e){
  if (e.target === this) this.classList.remove('show');
});
$('btnSettings').onclick = function(){
  renderSettings();
  $('modalSettings').classList.add('show');
};

/* 桌面版：用 Electron 原生对话框打开图片 / 工程，才能带上默认目录 */
async function openImageDesktop(){
  try {
    const r = await dsk.openImage();
    if (!r || !r.data) return;
    const url = URL.createObjectURL(new Blob([r.data]));
    const img = new Image();
    img.onload = function(){ URL.revokeObjectURL(url); ingestImage(img, r.name); };
    img.onerror = function(){ URL.revokeObjectURL(url); toast('图片读取失败'); };
    img.src = url;
  } catch (err){ toast('打开失败：' + err.message); }
}
async function openProjectDesktop(){
  try {
    const r = await dsk.openProject();
    if (!r || !r.data) return;
    openProject(new Blob([r.data]));
  } catch (err){ toast('打开工程失败：' + err.message); }
}
if (hasDesktop){
  $('btnOpen').onclick = openImageDesktop;
  $('btnOpenProj').onclick = openProjectDesktop;
}
loadSettings();
