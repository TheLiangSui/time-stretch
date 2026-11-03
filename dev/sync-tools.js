/*
 * 把各工具的源文件收进合集，并把清单内联进 index.html。
 *
 * 为什么要内联：合集要能「双击 index.html 直接用」。
 * file:// 下 fetch('tools.json') 会被 CORS 拦掉，清单必须提前写进页面。
 * 开发时用 http 服务器打开则仍会走 fetch，改 json 直接刷新即可。
 *
 * 幂等：重复运行不会重复替换（按 <script id="tools-data"> 整段替换）。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const MANIFEST = path.join(ROOT, 'tools.json');
const PAGE = path.join(ROOT, 'index.html');

function fail(msg){ console.error('SYNC FAILED: ' + msg); process.exit(1); }
function md5(buf){ return crypto.createHash('md5').update(buf).digest('hex'); }

if (!fs.existsSync(MANIFEST)) fail('找不到 tools.json');
if (!fs.existsSync(PAGE)) fail('找不到 index.html');

const data = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
if (!Array.isArray(data.tools)) fail('tools.json 缺少 tools 数组');

/* ---------- 1. 收工具文件 ---------- */
let copied = 0, skipped = 0;
for (const t of data.tools){
  if (!t.entry) { skipped++; continue; }
  if (!t.source) fail('工具 ' + t.id + ' 有 entry 但没有 source，不知道从哪复制');

  const src = path.resolve(ROOT, t.source);
  const dst = path.resolve(ROOT, t.entry);

  if (!fs.existsSync(src)) fail('源文件不存在: ' + src);
  const buf = fs.readFileSync(src);
  if (buf.length < 4096) fail('源文件太小，可能是空壳: ' + src + ' (' + buf.length + ' bytes)');

  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, buf);

  const back = fs.readFileSync(dst);
  if (md5(back) !== md5(buf)) fail('复制后校验不一致: ' + dst);

  console.log('  ✓ ' + t.id + '  ' + (buf.length / 1024).toFixed(0) + ' KB  ->  ' + t.entry);
  copied++;
}

/* ---------- 2. 内联清单 ---------- */
const pubTools = data.tools.map(function (t) {
  const c = Object.assign({}, t);
  delete c.source;
  return c;
});
const inline = JSON.stringify({ schema: data.schema, author: data.author, updated: data.updated, tools: pubTools });
let html = fs.readFileSync(PAGE, 'utf8');
const RE = /<script id="tools-data"[^>]*>[\s\S]*?<\/script>/;
if (!RE.test(html)) fail('index.html 里找不到 <script id="tools-data">');

const before = html;
html = html.replace(RE, '<script id="tools-data" type="application/json">' + inline + '</script>');
if (html === before) {
  /* 内容没变也算成功，但要说清楚 */
  console.log('  清单内容未变化');
} else {
  fs.writeFileSync(PAGE, html);
  console.log('  ✓ 清单已内联（' + (inline.length / 1024).toFixed(1) + ' KB）');
}

/* ---------- 3. 汇总 ---------- */
const pub = data.tools.filter(function(t){ return t.status === 'published'; });
console.log('\n合集：' + data.tools.length + ' 个工具（' + pub.length + ' 已发布 / ' +
            (data.tools.length - pub.length) + ' 开发中），本次收进 ' + copied + ' 个文件。');
