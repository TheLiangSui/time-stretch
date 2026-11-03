/*
 * TheLiangSui 的风格化工具 —— Electron 主进程
 *
 * 页面就是根目录那个 index.html，和网站形态共用同一份。
 * 这里只负责：窗口、菜单（去掉）、外链、单实例。
 */
const { app, BrowserWindow, shell, Menu, ipcMain, nativeTheme, desktopCapturer, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const APP_ID = 'com.theliangsui.toolkit';
app.setAppUserModelId(APP_ID);

/* selftest / smoke 模式用临时 userData，别污染用户的主题与项目库 */
const argv = process.argv.slice(1);
const IS_TEST = argv.some(function (a) { return a === 'selftest' || a === 'smoke'; });
if (IS_TEST) {
  app.setPath('userData', path.join(require('os').tmpdir(), 'tshub-test-' + process.pid));
}

let win = null;
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

/* 标题栏与窗口底色跟着界面主题走（渲染进程每次换主题都会把当前面板色发过来）。
   用的是系统标题栏 —— 就是 PS / AE 那种：一条独立的深色栏，标题在左，系统按钮在右，
   它不占用页面内容，所以工具自己的顶栏永远不会被窗口按钮压住。 */
const BAR = { bg: '#212121', fg: '#b8b8b8', mode: 'dark' };

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    show: false,
    /* 和面板同色：窗口刚起来、页面还没画完的那一帧不会是白的 */
    backgroundColor: BAR.bg,
    title: '风格化工具合集',
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'index.html'));

  /* 页面加载完会用自己的 <title> 覆盖窗口标题（Electron 的默认行为）。
     网页版需要那个标题，桌面壳不需要 —— 这里改回来。 */
  win.webContents.on('did-finish-load', function () {
    if (win && !win.isDestroyed()) win.setTitle('风格化工具合集');
  });

  win.once('ready-to-show', function () {
    win.show();
    if (argv.indexOf('smoke') >= 0) runSmoke();
    else if (argv.indexOf('shot') >= 0) runShot();
  });

  /* 外链走系统浏览器，别在应用里开新窗口 */
  win.webContents.setWindowOpenHandler(function (info) {
    const url = info.url || '';
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', function (e, url) {
    if (/^https?:/i.test(url)) { e.preventDefault(); shell.openExternal(url); }
  });

  win.on('closed', function () { win = null; });
}

app.on('second-instance', function () {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.whenReady().then(function () {
  ipcMain.handle('app:info', function () {
    return { version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome };
  });

  /* 主题同步：系统标题栏用沉浸式深色，和 PS / AE 一样 ——
     深色主题下标题栏是 #1f1f1f，和面板 #212121 基本同色，不会有一条亮色栏 */
  ipcMain.on('hub:theme', function (_e, p) {
    if (!p) return;
    if (p.bg) BAR.bg = p.bg;
    if (p.mode) BAR.mode = p.mode === 'light' ? 'light' : 'dark';

    if (nativeTheme.themeSource !== BAR.mode) nativeTheme.themeSource = BAR.mode;

    if (!win || win.isDestroyed()) return;
    try { win.setBackgroundColor(BAR.bg); } catch (_) {}
  });

  /* 工具（iframe）要的目录对话框：由外壳代开，选完把路径回给工具 */
  ipcMain.handle('ts:pick-folder', async function (_e, title) {
    if (!win || win.isDestroyed()) return null;
    const r = await dialog.showOpenDialog(win, {
      title: title || '选择目录',
      properties: ['openDirectory', 'createDirectory']
    });
    return r.canceled ? null : r.filePaths[0];
  });

  /* 标题栏文字跟着当前页面走。PS 的标题栏显示的是文档名，不是一个固定的应用名 ——
     这里同理：首页显示「风格化工具合集」，进了工具就是工具名。品牌名已经在页头里，
     标题栏再重复一遍只是噪音。 */
  ipcMain.on('hub:title', function (_e, t) {
    if (!win || win.isDestroyed()) return;
    const base = '风格化工具合集';
    win.setTitle(t ? String(t) + ' — ' + base : base);
  });

  createWindow();
  app.on('activate', function () { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

/* ---------- 截图（开发用）----------
   抓整块屏幕而不是 webContents：系统绘制的最小化/最大化/关闭按钮
   不在页面里，只有截屏才看得到它们和页头的相对位置。 */
async function runShot() {
  const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  try {
    await sleep(1400);
    /* 主题显式指定，顺便把偏好写回去（截图不该把用户默认主题改掉） */
    if (argv.indexOf('light') >= 0 || argv.indexOf('dark') >= 0) {
      const want = argv.indexOf('light') >= 0 ? 'light' : 'dark';
      await win.webContents.executeJavaScript(
        "(function(){ if (window.applyTheme) applyTheme('" + want + "');" +
        " else document.getElementById('btnTheme').click(); })()");
      await sleep(500);
    }
    if (argv.indexOf('hover') >= 0) {
      const rc = await win.webContents.executeJavaScript(
        "(function(){var r=document.querySelector('.card[data-status=published]').getBoundingClientRect();" +
        "return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)}})()");
      win.webContents.sendInputEvent({ type: 'mouseMove', x: rc.x, y: rc.y });
      await sleep(450);
    }
    if (argv.indexOf('tool') >= 0) {
      await win.webContents.executeJavaScript(
        "document.querySelector('#grid .card[data-status=published]').click(); 'ok'");
      await sleep(2200);
    }
    const d = screen.getPrimaryDisplay();
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) }
    });
    const out = path.join(os.tmpdir(), 'tshub-window.png');
    fs.writeFileSync(out, sources[0].thumbnail.toPNG());
    console.log('SHOT ' + out);
    console.log('SHOT_BOUNDS ' + JSON.stringify(win.getBounds()) + ' scale=' + d.scaleFactor);
  } catch (e) {
    console.log('SHOT_ERR ' + e.message);
  }
  app.quit();
}

/* ---------- 冒烟测试 ----------
   不只是「窗口开了」：还要点开一张工具卡，
   枚举子 frame 读它的正文长度 —— 证明 iframe 里真的渲染出了工具，
   而不是一个空白框。 */
async function runSmoke() {
  const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  const out = [];
  try {
    console.log('SMOKE_OK title=' + win.getTitle());

    /* 标题栏：内容区应该整体下移一条系统标题栏（30~42px）。
       差 0~2px 说明没有独立标题栏 —— 那正是工具自己的顶栏被窗口按钮压住的状态。 */
    const b = win.getBounds(), cb = win.getContentBounds();
    out.push('frameTop=' + (b.height - cb.height) + 'px');
    out.push('titleBar=native');

    /* 入场动画跑完后卡片不该留着 transform（fill 用错的话会一直按着 translateY） */
    await sleep(700);
    const ct = await win.webContents.executeJavaScript(
      "(function(){var c=document.querySelector('.card[data-status=published]');" +
      "return c?getComputedStyle(c).transform:'none'})()");
    out.push('cardTransform=' + ct);

    /* 自适应回归：页头品牌、页面标题、卡片网格必须左对齐，且没有横向溢出。
       两种窗口宽度各测一次 —— 以前窄窗口下页头会比内容靠左 12px。 */
    const probe = "(function(){var de=document.documentElement;" +
      "var b=document.querySelector('.brand').getBoundingClientRect();" +
      "var h=document.querySelector('.hero h1').getBoundingClientRect();" +
      "var g=document.querySelector('#grid').getBoundingClientRect();" +
      "return 'brandX='+Math.round(b.left)+' heroX='+Math.round(h.left)+" +
      "' gridX='+Math.round(g.left)+' overflowX='+(de.scrollWidth-de.clientWidth)})()";
    out.push('wide ' + await win.webContents.executeJavaScript(probe));
    const saved = win.getBounds();
    win.setBounds({ width: 940, height: saved.height });
    await sleep(320);
    out.push('narrow ' + await win.webContents.executeJavaScript(probe));
    win.setBounds(saved);
    await sleep(320);
    const verInMeta = await win.webContents.executeJavaScript(
      "(function(){var v=document.querySelector('.card .meta .ver');" +
      "return v?v.textContent:'none'})()");
    out.push('verInMeta=' + verInMeta);

    /* 真把指针移到卡片上，读 :hover 之后的位移与投影 —— 只有真实输入事件才会触发 :hover */
    const rc = await win.webContents.executeJavaScript(
      "(function(){var r=document.querySelector('.card[data-status=published]').getBoundingClientRect();" +
      "return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)}})()");
    win.webContents.sendInputEvent({ type: 'mouseMove', x: rc.x, y: rc.y });
    await sleep(400);
    const hv = await win.webContents.executeJavaScript(
      "(function(){var c=document.querySelector('.card[data-status=published]');var s=getComputedStyle(c);" +
      "return (c.matches(':hover')?'hover ':'nohover ') + s.transform + ' sh=' + (s.boxShadow.length>4)})()");
    out.push('cardHover=' + hv.replace(/\s+/g, ' '));

    const cards = await win.webContents.executeJavaScript(
      "document.querySelectorAll('.card').length");
    const pub = await win.webContents.executeJavaScript(
      "document.querySelectorAll('#grid .card[data-status=published]').length");
    out.push('cards=' + cards + ' published=' + pub);

    await win.webContents.executeJavaScript(
      "document.querySelector('#grid .card[data-status=published]').click(); 'clicked'");
    await sleep(1800);

    let frames = [];
    try { frames = win.webContents.mainFrame.frames; } catch (_) { frames = []; }
    out.push('subframes=' + frames.length);

    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      let len = -1, tag = '';
      try {
        len = await f.executeJavaScript(
          "document.body ? document.body.innerText.trim().length : -1");
        tag = await f.executeJavaScript(
          "(function(){var t=document.querySelector('.mark')||document.body.firstElementChild; return t?t.tagName:''})()");
      } catch (e) { len = -2; }
      out.push('frame' + i + ' url=' + String(f.url).split('/').slice(-2).join('/') +
               ' textLen=' + len + ' first=' + tag);
    }

    const stageOn = await win.webContents.executeJavaScript(
      "document.getElementById('stage').classList.contains('show')");
    out.push('stageVisible=' + stageOn);
  } catch (e) {
    out.push('ERROR ' + e.message);
  }
  console.log('SMOKE_DETAIL ' + out.join(' | '));
  app.quit();
}
