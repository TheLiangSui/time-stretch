/* Electron 主进程 —— 把 index.html 装进原生窗口 */
const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

app.setName('时间拉伸');
if (process.platform === 'win32') app.setAppUserModelId('com.theliangsui.timestretch');

/* 自检 / 冒烟模式跑在临时 userData 里：
   否则测试会往用户真实的 settings.json 写测试目录，跑一半失败还会把配置弄脏。 */
const IS_SELFTEST = process.argv.indexOf('selftest') >= 0;
const IS_SMOKE    = process.argv.indexOf('smoke') >= 0;
if (IS_SELFTEST || IS_SMOKE){
  const tmpUserData = path.join(require('os').tmpdir(),
    'timestretch-' + (IS_SELFTEST ? 'selftest' : 'smoke') + '-' + process.pid);
  try { fs.mkdirSync(tmpUserData, { recursive: true }); } catch (_) {}
  try { app.setPath('userData', tmpUserData); } catch (_) {}
}

let win = null;
/* smoke：跑完整正常路径（buildMenu + createWindow）但不开可见窗口，成功后写文件退出。
   用来验证自检模式没覆盖到的分支 —— 菜单和窗口创建。 */
const SMOKE = IS_SMOKE;

/* =========================================================
   设置持久化：userData/settings.json
   { importDir, exportDir, projectDir }
   ========================================================= */
function settingsPath(){ return path.join(app.getPath('userData'), 'settings.json'); }
function readSettings(){
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) || {}; }
  catch (_) { return {}; }
}
function writeSettings(s){
  const clean = {};
  for (const k of ['importDir', 'exportDir', 'projectDir']){
    if (s && typeof s[k] === 'string' && s[k].trim()) clean[k] = s[k].trim();
  }
  try { fs.writeFileSync(settingsPath(), JSON.stringify(clean, null, 2), 'utf8'); }
  catch (e) { console.error('写设置失败: ' + e.message); }
  return clean;
}
/* 目录不存在就退回系统默认，别让「另存为」弹到一个已经没了的路径 */
function validDir(p, fallback){
  if (!p) return fallback;
  try { return fs.statSync(p).isDirectory() ? p : fallback; }
  catch (_) { return fallback; }
}

const IMG_EXT = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'];

ipcMain.handle('settings:get', () => readSettings());
ipcMain.handle('settings:set', (e, s) => writeSettings(s));
ipcMain.handle('settings:pickFolder', async (e, title) => {
  const r = await dialog.showOpenDialog(win, {
    title: title || '选择文件夹',
    properties: ['openDirectory', 'createDirectory']
  });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('file:openImage', async () => {
  const s = readSettings();
  const r = await dialog.showOpenDialog(win, {
    title: '导入图片',
    defaultPath: validDir(s.importDir, app.getPath('pictures')),
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: IMG_EXT }, { name: '所有文件', extensions: ['*'] }]
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0];
  return { name: path.basename(p), data: fs.readFileSync(p) };
});
ipcMain.handle('file:openProject', async () => {
  const s = readSettings();
  const r = await dialog.showOpenDialog(win, {
    title: '打开工程',
    defaultPath: validDir(s.projectDir, app.getPath('documents')),
    properties: ['openFile'],
    filters: [{ name: '时间拉伸工程', extensions: ['json'] }, { name: '所有文件', extensions: ['*'] }]
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0];
  return { name: path.basename(p), data: fs.readFileSync(p) };
});

/* ------------------------------------------------------------------
 * 自检模式：把 _selftest_inject.js 注入页面跑完整自检，结果写文件后退出。
 * 用来验证「打包后的 exe 真的能跑」，而不只是浏览器里能跑。
 *
 * ⚠️ 必须用位置参数 `selftest`，不能用 `--selftest` ——
 *    打包版 Electron 的 Chromium 命令行解析器会对未知的 `--xxx` 开关直接
 *    "bad option" 秒退，`app.commandLine` 来不及介入。
 * ------------------------------------------------------------------ */
async function runSelfTest(){
  const injectPath = path.join(__dirname, '_selftest_inject.js');
  const outPath = path.join(require('os').tmpdir(), 'timestretch-selftest.txt');
  if (!fs.existsSync(injectPath)){
    console.error('SELFTEST_MISSING: ' + injectPath);
    app.exit(2);
    return;
  }
  const w = new BrowserWindow({
    show: false, width: 1560, height: 900,
    /* ⚠️ 这里必须和正式窗口保持一致的 webPreferences，否则测出来的不是真实环境。
       之前漏了 preload，导致打包版里 window.desktop 不存在却没人发现。 */
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  await w.loadFile(path.join(__dirname, 'index.html'));
  await w.webContents.executeJavaScript(fs.readFileSync(injectPath, 'utf8'));

  const deadline = Date.now() + 60000;
  let text = '';
  while (Date.now() < deadline){
    await new Promise(function(r){ setTimeout(r, 400); });
    text = await w.webContents.executeJavaScript(
      "(function(){var p=document.querySelector('pre');return p?p.textContent:'';})()");
    if (text && text.indexOf('[END]') >= 0) break;
  }
  const head = 'electron ' + process.versions.electron + ' / chrome ' + process.versions.chrome +
               ' / dpr ' + (await w.webContents.executeJavaScript('window.devicePixelRatio'));
  const full = head + '\n' + (text || '(未拿到结果)');
  try { fs.writeFileSync(outPath, full, 'utf8'); } catch (e) { console.error('写结果失败: ' + e.message); }
  console.log('=== 打包版 Electron 自检 ===');
  console.log(full);
  console.log('SELFTEST_OUT=' + outPath);

  const m = /TOTAL=(\d+) FAILS=(\d+)/.exec(text || '');
  app.exit(m && m[2] === '0' ? 0 : 1);
}

function createWindow(){
  win = new BrowserWindow({
    width: 1520, height: 960,
    minWidth: 1080, minHeight: 660,
    backgroundColor: '#16161a',
    title: '时间拉伸 · Anton Repponen 风格化工具',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });
  win.once('ready-to-show', () => {
    if (SMOKE){
      const p = path.join(require('os').tmpdir(), 'timestretch-smoke.txt');
      const info = 'WINDOW_OK title="' + win.getTitle() + '" size=' + JSON.stringify(win.getSize()) +
                   ' menu=' + (Menu.getApplicationMenu() ? 'yes' : 'no') +
                   ' appDir=' + __dirname;
      try { fs.writeFileSync(p, info, 'utf8'); } catch (_) {}
      console.log(info);
      console.log('SMOKE_OUT=' + p);
      setTimeout(() => app.exit(0), 300);
      return;
    }
    win.show();
  });
  win.loadFile(path.join(__dirname, 'index.html'));

  /* 导出图片 / 保存工程时弹原生「另存为」。
     起始目录取设置里的 exportDir / projectDir（按扩展名区分），没设或已失效就退回系统默认。 */
  win.webContents.session.on('will-download', (event, item) => {
    const ext = path.extname(item.getFilename()).toLowerCase();
    const s = readSettings();
    const filters = {
      '.png':  [{ name: 'PNG 图片',      extensions: ['png'] }],
      '.jpg':  [{ name: 'JPEG 图片',     extensions: ['jpg', 'jpeg'] }],
      '.webp': [{ name: 'WebP 图片',     extensions: ['webp'] }],
      '.json': [{ name: '时间拉伸工程',   extensions: ['json'] }]
    }[ext] || [{ name: '所有文件', extensions: ['*'] }];

    const isProject = (ext === '.json');
    const defDir = isProject
      ? validDir(s.projectDir, app.getPath('documents'))
      : validDir(s.exportDir, app.getPath('pictures'));

    const res = dialog.showSaveDialogSync(win, {
      title: isProject ? '保存工程' : '导出图片',
      defaultPath: path.join(defDir, item.getFilename()),
      filters: filters
    });
    if (!res) { item.cancel(); return; }
    item.setSavePath(res);
  });

  /* 外链交给系统浏览器，不在应用内乱跳 */
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function buildMenu(){
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '文件', submenu: [
      { label: '导入图片…', click: () => win && win.webContents.executeJavaScript(
          "document.getElementById('btnOpen').click()") },
      { label: '导出合并图…', click: () => win && win.webContents.executeJavaScript(
          "document.getElementById('btnExport').click()") },
      { type: 'separator' },
      { label: '打开工程…', click: () => win && win.webContents.executeJavaScript(
          "document.getElementById('btnOpenProj').click()") },
      { label: '保存工程…', click: () => win && win.webContents.executeJavaScript(
          "document.getElementById('btnSaveProj').click()") },
      { type: 'separator' },
      { label: '设置（默认目录）…', accelerator: 'Ctrl+,', click: () => win && win.webContents.executeJavaScript(
          "document.getElementById('btnSettings').click()") },
      { type: 'separator' },
      { label: '退出', role: 'quit' }
    ]},
    { label: '视图', submenu: [
      { label: '重新加载（会丢失未保存的编辑）', role: 'reload' },
      { label: '实际大小', role: 'resetZoom' },
      { type: 'separator' },
      { label: '全屏', role: 'togglefullscreen' },
      { label: '开发者工具', accelerator: 'F12', role: 'toggleDevTools' }
    ]},
    { label: '帮助', submenu: [
      { label: '关于', click: () => dialog.showMessageBox(win, {
          type: 'info',
          title: '关于',
          message: '时间拉伸 · Anton Repponen 风格化工具',
          detail: '把图片框选区域的居中像素列横向拉伸铺满整个矩形。\n' +
                  '灵感来自 Anton Repponen 的概念摄影系列《时间拉伸》(Time Stretch)。\n\n' +
                  '用法：导入图片 → 在画面上拖拽框选矩形 → 调参数 → 导出。'
        })}
    ]}
  ]));
}

app.whenReady().then(() => {
  if (process.argv.indexOf('selftest') >= 0){ runSelfTest(); return; }
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
