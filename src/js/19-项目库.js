/* =========================================================
   项目库 + 启动页
   工程存在 IndexedDB 里（含缩略图与完整数据），file:// 下若无权限则退化为内存，
   功能不报错、只是关掉软件就不保留。
   ========================================================= */
const Store = (function(){
  const DB = 'ts-projects', ST = 'projects';
  let db = null, memMode = false, mem = new Map();

  function open(){
    return new Promise(function(resolve){
      let req;
      try { req = indexedDB.open(DB, 1); }
      catch (e){ memMode = true; resolve(); return; }
      req.onupgradeneeded = function(){
        const d = req.result;
        if (!d.objectStoreNames.contains(ST)) d.createObjectStore(ST, { keyPath:'id' });
      };
      req.onsuccess = function(){ db = req.result; resolve(); };
      req.onerror = function(){ memMode = true; resolve(); };
      req.onblocked = function(){ memMode = true; resolve(); };
    });
  }

  function merge(list){
    const byId = new Map();
    list.forEach(function(r){ byId.set(r.id, r); });
    mem.forEach(function(r, id){ byId.set(id, r); });
    return Array.from(byId.values());
  }

  /* 等事务提交，而不是等单条 request。挂 3 秒兜底，坏了也不会卡住界面。 */
  function commit(tx, onDone){
    let done = false;
    const finish = function(){ if (done) return; done = true; onDone(); };
    tx.oncomplete = finish;
    tx.onerror = function(){ memMode = true; finish(); };
    tx.onabort = function(){ memMode = true; finish(); };
    setTimeout(finish, 3000);
  }

  function put(rec){
    /* 写穿：内存里也留一份，刚存完马上读不会因为提交时序而读不到 */
    mem.set(rec.id, rec);
    return new Promise(function(resolve){
      if (memMode || !db){ resolve(rec); return; }
      let tx;
      try {
        tx = db.transaction(ST, 'readwrite');
        tx.objectStore(ST).put(rec);
      } catch (e){ resolve(rec); return; }
      commit(tx, function(){ resolve(rec); });
    });
  }

  function all(){
    return new Promise(function(resolve){
      if (memMode || !db){ resolve(Array.from(mem.values())); return; }
      let tx, out = [];
      try { tx = db.transaction(ST, 'readonly'); }
      catch (e){ resolve(Array.from(mem.values())); return; }
      try {
        tx.objectStore(ST).openCursor().onsuccess = function(ev){
          const c = ev.target.result;
          if (c){ out.push(c.value); c.continue(); }
        };
      } catch (e){ resolve(Array.from(mem.values())); return; }
      commit(tx, function(){ resolve(merge(out)); });
    });
  }

  function del(id){
    mem.delete(id);
    return new Promise(function(resolve){
      if (memMode || !db){ resolve(); return; }
      let tx;
      try {
        tx = db.transaction(ST, 'readwrite');
        tx.objectStore(ST).delete(id);
      } catch (e){ resolve(); return; }
      commit(tx, function(){ resolve(); });
    });
  }

  return { open:open, put:put, all:all, del:del, isMem:function(){ return memMode; } };
})();

function fmtTime(ts){
  const d = new Date(ts || Date.now());
  const p = function(n){ return (n < 10 ? '0' : '') + n; };
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) +
         ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

async function saveToLibrary(silent){
  if (!S.src.canvas){ if (!silent) toast('先导入图片'); return false; }
  if (!S.project.id) S.project.id = uid();
  const name = (S.project.name && S.project.name !== '未命名工程')
    ? S.project.name
    : (S.src.name || '未命名工程').replace(/\.[^.]+$/, '');
  S.project.name = name;
  const rec = {
    id: S.project.id, name: name,
    thumb: makeThumbDataURL(),
    data: JSON.stringify(projectData()),
    updatedAt: Date.now()
  };
  try { await Store.put(rec); }
  catch (e){ if (!silent) toast('保存失败：' + (e.message || e)); return false; }
  if (!silent) toast('已保存到项目库：' + name);
  return true;
}

function makeProjectCard(rec){
  const el = document.createElement('div');
  el.className = 'pcard';
  el.setAttribute('data-id', rec.id);
  const thumb = rec.thumb
    ? '<div class="pthumb" style="background-image:url(&quot;' + rec.thumb + '&quot;)"></div>'
    : '<div class="pthumb"></div>';
  el.innerHTML = thumb +
    '<div class="pname">' + escapeHtml(rec.name || '未命名') + '</div>' +
    '<div class="ptime">' + fmtTime(rec.updatedAt) + '</div>' +
    '<button class="pdel" title="从项目库删除">✕</button>';
  el.addEventListener('click', function(e){
    if (e.target.closest('.pdel')) return;
    openFromLibrary(rec.id);
  });
  el.querySelector('.pdel').addEventListener('click', async function(e){
    e.stopPropagation();
    if (!confirm('从项目库删除「' + (rec.name || '未命名') + '」？')) return;
    await Store.del(rec.id);
    if (S.project.id === rec.id) S.project.id = null;
    renderHome();
  });
  return el;
}

async function renderHome(){
  const grid = $('homeGrid');
  const empty = $('homeEmpty');
  if (!grid) return;
  let list = [];
  try { list = await Store.all(); } catch (e){ list = []; }
  list.sort(function(a, b){ return (b.updatedAt || 0) - (a.updatedAt || 0); });
  grid.innerHTML = '';
  if (!list.length){ empty.style.display = ''; return; }
  empty.style.display = 'none';
  list.forEach(function(rec){ grid.appendChild(makeProjectCard(rec)); });
}

async function openFromLibrary(id){
  let list = [];
  try { list = await Store.all(); } catch (e){ list = []; }
  const rec = list.find(function(r){ return r.id === id; });
  if (!rec){ toast('工程已不存在'); return; }
  let d;
  try { d = JSON.parse(rec.data); } catch (e){ toast('工程数据损坏'); return; }
  applyProjectData(d, { id: rec.id, name: rec.name });
  enterEditor();
}

function enterEditor(){
  const h = $('home');
  if (h) h.classList.remove('show');
  renderAll();
}
function goHome(){
  if (S.src.canvas) saveToLibrary(true);
  const h = $('home');
  if (h) h.classList.add('show');
  renderHome();
}
function newProject(){
  S.project = { id: uid(), name: '未命名工程' };
  S.layers = []; setSel([]); S.groups = {}; S.nextGid = 1;
  S.undoStack = []; S.redoStack = [];
  S.src = { canvas:null, ctx:null, w:0, h:0, name:'', version: S.src.version + 1 };
  hint.classList.remove('hide');
  ['btnExport','btnGrid','btnGridRe','btnRandBox','btnRandAll','btnRandOrder'].forEach(function(id){
    const el = $(id);
    if (el) el.disabled = true;
  });
  $('srcInfo').innerHTML = '未载入图片';
  enterEditor();
  $('filePick').click();
}

function openProject(file){
  const fr = new FileReader();
  fr.onload = function(){
    let d;
    try { d = JSON.parse(fr.result); } catch(err){ toast('工程文件损坏'); return; }
    applyProjectData(d, { name: (file.name || '').replace(/_工程\.json$/i, '') });
  };
  fr.readAsText(file);
}
