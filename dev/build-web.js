/*
 * 生成可直接托管的网站版本：dist-web/
 *
 * 只收网站真正需要的文件（外壳页面 + 工具 + 清单 + 图标），
 * 不带 dev/、dist/、node_modules。
 *
 * dist-web 是构建产物，每次重建都清空 —— 里面不会有任何手工改过的东西。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist-web');

function fail(msg){ console.error('WEB BUILD FAILED: ' + msg); process.exit(1); }

for (const f of ['index.html', 'tools.json', 'icon-preview.png']){
  if (!fs.existsSync(path.join(ROOT, f))) fail('缺少 ' + f + '（先跑 dev/make-icon.js 和 dev/sync-tools.js）');
}
if (!fs.existsSync(path.join(ROOT, 'tools'))) fail('缺少 tools/');

/* 清空构建产物目录 */
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

/* 1. 外壳与清单 */
fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(OUT, 'index.html'));
const mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools.json'), 'utf8'));
mf.tools = mf.tools.map(function (t) { const c = Object.assign({}, t); delete c.source; return c; });
fs.writeFileSync(path.join(OUT, 'tools.json'), JSON.stringify(mf, null, 2), 'utf8');
fs.copyFileSync(path.join(ROOT, 'icon-preview.png'), path.join(OUT, 'favicon.png'));

/* 2. 工具（递归拷贝） */
const SKIP_DIRS = new Set(['src', 'dev', 'docs', 'dist', 'node_modules', '.git']);
/* 工具目录里同时躺着源码工程（src/ dev/）和 Electron 外壳（main.js / preload.js），
   网站只需要构建出来的单文件 index.html 与图标 —— 白名单之外的一律不进网页包。 */
const KEEP_FILE = /^(index\.html|icon\.(ico|png|svg))$/i;
function copyDir(src, dst){
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)){
    if (SKIP_DIRS.has(name) || name.charAt(0) === '_') continue;
    const s = path.join(src, name), d = path.join(dst, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDir(s, d);
    else if (KEEP_FILE.test(name)) fs.copyFileSync(s, d);
  }
}
copyDir(path.join(ROOT, 'tools'), path.join(OUT, 'tools'));

/* 3. 一份简短说明，托管后能直接看懂这是什么 */
fs.writeFileSync(path.join(OUT, 'README.txt'),
  'TheLiangSui 的风格化工具 —— 网站版\n' +
  '把整个目录原样上传到任意静态托管（GitHub Pages / Netlify / 自己的服务器）即可。\n' +
  '本地预览：在这个目录里跑 `npx serve .` 或 `python -m http.server`，\n' +
  '然后用 http:// 打开 —— 不要用 file:// 双击，浏览器会拦住 iframe。\n',
  'utf8');

/* 4. 统计 */
let files = 0, bytes = 0;
(function walk(d){
  for (const n of fs.readdirSync(d)){
    const p = path.join(d, n), st = fs.statSync(p);
    if (st.isDirectory()) walk(p); else { files++; bytes += st.size; }
  }
})(OUT);

console.log('✓ ' + OUT);
console.log('  ' + files + ' 个文件，' + (bytes / 1024 / 1024).toFixed(1) + ' MB');
console.log('  上传整个目录即可；本地预览请用 http 服务器（file:// 会被拦 iframe）');
