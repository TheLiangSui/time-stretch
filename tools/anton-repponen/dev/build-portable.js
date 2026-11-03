/*
 * 手工组装免安装版（替代 electron-packager）
 *
 * 为什么不用 electron-packager：它要先把 157MB 的 electron zip 解压到临时目录
 * （本机实测只有 ~100KB/s，估时 47 分钟），再拷一次到产物目录 —— 两次 368MB 的 I/O。
 * 而 node_modules/electron/dist 里已经有解压好的运行时，用 robocopy 直接拷过去几秒就完事。
 *
 * 为什么不用 fs.cpSync：本机沙箱会在批量写文件时静默杀掉 node 进程（EXIT=127，无任何报错）。
 * robocopy 是单个外部进程，一次跑完 368MB 没问题。
 *
 * 产出：dist/时间拉伸-win32-x64/
 *   ├── 时间拉伸.exe                  （electron.exe 改名 + 打图标 + 写版本信息）
 *   └── resources/app/{index.html, main.js, package.json, _selftest_inject.js}
 *
 * 脚本是幂等的：重复运行不会报错，也不会删任何东西。
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ResEdit = require('resedit');

const ROOT = path.join(__dirname, '..');
const SRC  = path.join(ROOT, 'node_modules', 'electron', 'dist');
const OUT  = path.join(ROOT, 'dist', '时间拉伸-win32-x64');
const NAME = '时间拉伸';

function log(){ console.log.apply(console, arguments); }
function fail(msg){ console.error('BUILD FAILED: ' + msg); process.exit(1); }

/* ---------- 前置检查 ---------- */
if (!fs.existsSync(path.join(SRC, 'electron.exe'))) {
  fail('找不到 ' + SRC + '\\electron.exe —— 先跑 node node_modules/electron/install.js');
}
if (!fs.existsSync(path.join(ROOT, 'icon.ico'))) {
  fail('找不到 icon.ico —— 先跑 node _make_icon.js');
}
for (const f of ['index.html', 'main.js', 'preload.js', 'package.json']) {
  if (!fs.existsSync(path.join(ROOT, f))) fail('缺少源文件 ' + f);
}

/* ---------- 1. 拷贝运行时（robocopy /E 幂等） ---------- */
fs.mkdirSync(OUT, { recursive: true });
log('拷贝 Electron 运行时 (robocopy) ...');
const t0 = Date.now();
const rc = spawnSync('robocopy', [SRC, OUT, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/MT:16'],
                     { encoding: 'utf8', windowsHide: true });
if (rc.error) fail('robocopy 启动失败: ' + rc.error.message);
if (rc.status === null || rc.status > 7) {
  fail('robocopy 返回码 ' + rc.status + '\n' + (rc.stdout || '') + (rc.stderr || ''));
}
log('  完成，用时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's (robocopy code ' + rc.status + ')');

/* ---------- 2. 放置应用代码 ---------- */
const resDir = path.join(OUT, 'resources');
const appDir = path.join(resDir, 'app');
fs.mkdirSync(appDir, { recursive: true });
/* _selftest_inject.js 由 dev/selftest-gen.js 生成；存在就打进包里（selftest 模式要用），
   不存在也能正常出包 —— 只是 selftest 位置参数会在运行时提示缺文件。 */
const APP_FILES = ['index.html', 'main.js', 'preload.js'];
if (fs.existsSync(path.join(ROOT, '_selftest_inject.js'))) APP_FILES.push('_selftest_inject.js');
for (const f of APP_FILES) {
  fs.copyFileSync(path.join(ROOT, f), path.join(appDir, f));
}
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({
  name: pkg.name, productName: pkg.productName, version: pkg.version,
  description: pkg.description, main: 'main.js', author: pkg.author, license: pkg.license
}, null, 2));
log('应用代码已放入 resources/app/');

/* electron 自带的 default_app.asar 用不上了；删不掉也不影响（Electron 优先用 resources/app/） */
try { fs.unlinkSync(path.join(resDir, 'default_app.asar')); }
catch (_) { log('  (default_app.asar 保留，不影响运行)'); }

/* ---------- 3. exe 改名（幂等） ----------
   Windows 上 rename 不能覆盖已存在的目标，而且刚写完的 234MB exe
   常被杀软/索引器短暂占用 —— 直接 rename 会 EPERM。
   所以先删目标、再重试几次。 */
function sleepSync(ms){
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
  catch (_) { const t = Date.now(); while (Date.now() - t < ms) {} }
}
function unlinkRetry(p){
  for (let i = 0; i < 8; i++){
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
    if (!fs.existsSync(p)) return true;
    sleepSync(200);
  }
  return !fs.existsSync(p);
}
const oldExe = path.join(OUT, 'electron.exe');
const newExe = path.join(OUT, NAME + '.exe');
if (fs.existsSync(oldExe)){
  if (!unlinkRetry(newExe)) fail('旧 exe 无法删除（可能正被占用）：' + newExe);
  let moved = false;
  for (let i = 0; i < 8 && !moved; i++){
    try { fs.renameSync(oldExe, newExe); moved = true; }
    catch (e){
      if (i === 7) fail('exe 改名失败：' + e.message);
      unlinkRetry(newExe);
      sleepSync(250);
    }
  }
}
if (!fs.existsSync(newExe)) fail('exe 不存在：' + newExe);

/* ---------- 4. 写图标 + 版本信息 ---------- */
log('写入图标与版本信息 ...');
const exe = ResEdit.NtExecutable.from(fs.readFileSync(newExe), { ignoreCert: true });
const res = ResEdit.NtExecutableResource.from(exe);

const vis = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
if (vis.length) {
  const vi = vis[0];
  const langs = vi.getAllLanguagesForStringValues();
  const lang = (langs && langs[0]) || vi.getDefaultVersionLang() || { lang: 1033, codepage: 1200 };
  vi.setStringValues(lang, {
    ProductName:      NAME,
    FileDescription:  'Anton Repponen 风格化工具',
    CompanyName:      'TheLiangSui',
    LegalCopyright:   'MIT License',
    OriginalFilename: NAME + '.exe',
    InternalName:     NAME,
    FileVersion:      pkg.version,
    ProductVersion:   pkg.version
  });
  const parts = pkg.version.split('.').map(Number);
  vi.setFileVersion(parts[0], parts[1], parts[2] || 0, 0);
  vi.setProductVersion(parts[0], parts[1], parts[2] || 0, 0);
  vi.outputToResourceEntries(res.entries);
  log('  版本信息 OK (lang=' + lang.lang + ')');
} else {
  log('  ! exe 内没有版本信息资源，跳过');
}

const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(ROOT, 'icon.ico')));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
if (!groups.length) fail('exe 内找不到图标资源组');
for (const g of groups) {
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries, g.id, g.lang, iconFile.icons.map(function(i){ return i.data; }));
}
log('  图标 OK：替换 ' + groups.length + ' 个图标组，注入 ' + iconFile.icons.length + ' 个尺寸');

res.outputResource(exe);
fs.writeFileSync(newExe, Buffer.from(exe.generate()));

/* ---------- 5. 汇总 ---------- */
function dirSize(p){
  let total = 0;
  (function walk(d){
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const fp = path.join(d, e.name);
      if (e.isDirectory()) walk(fp);
      else { try { total += fs.statSync(fp).size; } catch (_) {} }
    }
  })(p);
  return total;
}
log('');
log('产物: ' + path.relative(ROOT, newExe));
log('大小: ' + (dirSize(OUT) / 1024 / 1024).toFixed(1) + ' MB  (exe 本体 ' +
    (fs.statSync(newExe).size / 1024 / 1024).toFixed(2) + ' MB)');
log('BUILD OK');
