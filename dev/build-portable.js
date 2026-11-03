/*
 * 手工组装免安装版（和 Anton Repponen 工具同一套做法）
 *
 * 为什么不用 electron-packager：它要先把 157MB 的 electron zip 解压到临时目录，
 * 再拷一次产物 —— 两次几百 MB 的 I/O。而 node_modules/electron/dist 里已经有解压好的运行时，
 * 用 robocopy 直接拷过去几秒就完事。
 *
 * 运行时来源按顺序找：
 *   ① 本目录 node_modules/electron/dist
 *   ② 隔壁「Anton Repponen风格化工具」的 node_modules（同一台机器上已有，不重复下载）
 *
 * 产出：dist/TheLiangSui的风格化工具-win32-x64/
 *   ├── TheLiangSui的风格化工具.exe
 *   └── resources/app/{index.html, main.js, preload.js, package.json, tools.json, tools/}
 *
 * 幂等：重复运行不会报错，也不会删任何东西。
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const NAME = 'TheLiangSui的风格化工具';
const OUT = path.join(ROOT, 'dist', NAME + '-win32-x64');
const STAGE = path.join(ROOT, 'dist', '_stage_app');

function log(){ console.log.apply(console, arguments); }
function fail(msg){ console.error('BUILD FAILED: ' + msg); process.exit(1); }

/* ---------- 找 Electron 运行时 + resedit ---------- */
const CANDIDATES = [
  path.join(ROOT, 'node_modules'),
  path.join(ROOT, '..', 'Anton Repponen风格化工具', 'node_modules')
];
let MODULES = null;
for (const m of CANDIDATES){
  if (fs.existsSync(path.join(m, 'electron', 'dist', 'electron.exe'))) { MODULES = m; break; }
}
if (!MODULES) fail('找不到 Electron 运行时。先在任一工具目录里 npm i electron');
const SRC = path.join(MODULES, 'electron', 'dist');
log('运行时: ' + SRC);

/* ---------- 前置检查 ---------- */
const APP_FILES = ['index.html', 'main.js', 'preload.js', 'package.json', 'tools.json', 'icon.ico'];
for (const f of APP_FILES){
  if (!fs.existsSync(path.join(ROOT, f))) fail('缺少源文件 ' + f + '（先跑 node dev/make-icon.js 与 dev/sync-tools.js）');
}
if (!fs.existsSync(path.join(ROOT, 'tools'))) fail('缺少 tools/ 目录');

/* ---------- 1. 拷运行时 ---------- */
fs.mkdirSync(OUT, { recursive: true });
log('拷贝 Electron 运行时 (robocopy) ...');
const t0 = Date.now();
const rc = spawnSync('robocopy', [SRC, OUT, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/MT:16'],
                     { encoding: 'utf8', windowsHide: true });
if (rc.error) fail('robocopy 启动失败: ' + rc.error.message);
if (rc.status === null || rc.status > 7) {
  fail('robocopy 返回码 ' + rc.status + '\n' + (rc.stdout || '') + (rc.stderr || ''));
}
log('  ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');

/* ---------- 2. 改名 + 图标 + 版本信息 ---------- */
const ELECTRON_EXE = path.join(OUT, 'electron.exe');
const APP_EXE = path.join(OUT, NAME + '.exe');
if (fs.existsSync(ELECTRON_EXE)){
  if (fs.existsSync(APP_EXE)) fs.unlinkSync(APP_EXE);
  fs.renameSync(ELECTRON_EXE, APP_EXE);
}

/* resedit 是 ESM-only，打图标交给独立的异步脚本（见 patch-exe.js） */
if (fs.existsSync(APP_EXE)){
  const r = spawnSync(process.execPath, [path.join(__dirname, 'patch-exe.js'), APP_EXE],
                      { encoding: 'utf8', windowsHide: true });
  if (r.status === 0) log('  ' + (r.stdout || '').trim());
  else log('  ! 打图标失败（不影响运行）: ' + ((r.stderr || r.stdout || '')).trim().split('\n')[0]);
}

/* ---------- 3. 组装 app ---------- */
log('组装 resources/app ...');
const APP_OUT = path.join(OUT, 'resources', 'app');
fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
for (const f of APP_FILES){
  if (f === 'tools.json'){
    /* 清单里的 source 是构建期字段（指向本机工具源目录），产物里不该出现 */
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    d.tools = d.tools.map(function (t) { const c = Object.assign({}, t); delete c.source; return c; });
    fs.writeFileSync(path.join(STAGE, f), JSON.stringify(d, null, 2), 'utf8');
  } else {
    fs.copyFileSync(path.join(ROOT, f), path.join(STAGE, f));
  }
}

/* tools/ 可能有多个工具，用 robocopy 一次拷完 */
const rc2 = spawnSync('robocopy', [path.join(ROOT, 'tools'), path.join(STAGE, 'tools'),
  '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'],
  { encoding: 'utf8', windowsHide: true });
if (rc2.status === null || rc2.status > 7) fail('复制 tools/ 失败: ' + (rc2.stdout || ''));

/* 默认 resources/app 里有原来那份 app.asar（指向 electron 的默认应用），清掉 */
for (const junk of ['default_app.asar']){
  const p = path.join(OUT, 'resources', junk);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
fs.rmSync(APP_OUT, { recursive: true, force: true });
fs.mkdirSync(APP_OUT, { recursive: true });
const rc3 = spawnSync('robocopy', [STAGE, APP_OUT, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'],
  { encoding: 'utf8', windowsHide: true });
if (rc3.status === null || rc3.status > 7) fail('组装 app 失败: ' + (rc3.stdout || ''));
fs.rmSync(STAGE, { recursive: true, force: true });

/* ---------- 4. 校验 ---------- */
const checks = [
  [APP_EXE, '主程序'],
  [path.join(APP_OUT, 'index.html'), '外壳页面'],
  [path.join(APP_OUT, 'tools.json'), '工具清单'],
  [path.join(APP_OUT, 'tools', 'anton-repponen', 'index.html'), 'Anton Repponen 工具']
];
for (const [p, label] of checks){
  if (!fs.existsSync(p)) fail('产物缺失: ' + label + ' -> ' + p);
  if (fs.statSync(p).size < 512) fail('产物大小异常: ' + p);
}
const exeSize = (fs.statSync(APP_EXE).size / 1048576).toFixed(0);
log('');
log('✓ ' + OUT);
log('  ' + NAME + '.exe  ' + exeSize + ' MB');
log('  resources/app  ' + fs.readdirSync(APP_OUT).join(', '));
