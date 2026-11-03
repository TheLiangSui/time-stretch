/*
 * 网站形态的验证：起一个本地 http 服务器，用无头浏览器把两件事验证掉。
 *
 *   1. 合集首页点开卡片后，iframe 里真的渲染出了工具（读 iframe 正文长度）
 *   2. 工具直链（/tools/<id>/）能独立打开 —— GitHub Pages 会补 index.html，
 *      这里的服务器也要补，否则本机验证和线上行为不一致
 *
 * 用法：node dev/verify-web.js
 *
 * ⚠️ 必须用异步 spawn：spawnSync 会阻塞 Node 事件循环，而 http 服务器就在同一个
 *    进程里 —— 浏览器发来的请求永远等不到处理，表现是 ERR_CONNECTION_REFUSED，
 *    看起来像「服务器没起来」，实际是自己把自己锁死了。这个坑踩过一次。
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, 'dist-web');
const TMP = path.join(os.tmpdir(), 'tshub-web');
fs.mkdirSync(TMP, { recursive: true });

const MIME = { '.html':'text/html; charset=utf-8', '.json':'application/json; charset=utf-8',
               '.png':'image/png', '.txt':'text/plain; charset=utf-8', '.js':'text/javascript' };

/* 目录请求补 index.html —— 和 GitHub Pages 的行为对齐 */
function resolveFile(urlPath){
  let p = decodeURIComponent(urlPath.split('?')[0]);
  let f = path.join(WEB, p);
  if (!f.startsWith(WEB)) return null;
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return null;
  return f;
}

const server = http.createServer(function (req, res) {
  const f = resolveFile(req.url);
  if (!f) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

/* Edge 的一次无头调用；resolve 出 stdout（--dump-dom 时是整份 DOM） */
function runEdge(args, shotPath){
  return new Promise(function (resolve){
    const full = ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars'].concat(args);
    if (shotPath) full.push('--screenshot=' + shotPath);
    let out = '';
    const p = spawn(EDGE, full, { windowsHide: true });
    p.stdout.on('data', function (d){ out += d; });
    p.stderr.on('data', function (){});
    p.on('close', function (){ resolve(out); });
    p.on('error', function (){ resolve(''); });
  });
}

const PROBE = `<script>
  /* 卡片是运行时构建的 article.card（容器 id 不固定），按 data-status 挑已发布的那张 */
  setTimeout(function(){
    var c = document.querySelector('.card[data-status="published"]') || document.querySelector('.card');
    var f = document.getElementById('frame');
    function report(tag){
      var info = 'no-frame';
      try {
        var d = f.contentDocument;
        info = d && d.body ? ('text=' + d.body.innerText.trim().length) : 'null-doc';
      } catch(e){ info = 'CROSS-ORIGIN'; }
      document.title = 'PROBE ' + info + ' ' + tag + ' stage=' +
        document.getElementById('stage').classList.contains('show');
    }
    /* 等 iframe 真的 load 完再读，别用固定延时赌 */
    f.addEventListener('load', function(){ setTimeout(function(){ report('afterLoad'); }, 700); });
    if (!c) { report('noCard'); return; }
    c.click();
    setTimeout(function(){
      if (document.title.indexOf('PROBE') !== 0) report('fallback');
    }, 4000);
  }, 300);
</script>`;

function titleOf(dom){
  const m = (dom || '').match(/<title>([^<]*)<\/title>/);
  return m ? m[1] : '(none)';
}

server.listen(0, '127.0.0.1', async function () {
  const port = server.address().port;
  const base = 'http://127.0.0.1:' + port + '/';
  console.log('server ' + base);

  /* 1. 合集首页：探针页写进 web root，点卡片后把 iframe 状态写进 title */
  const probeFile = path.join(WEB, '__probe.html');
  fs.writeFileSync(probeFile, fs.readFileSync(path.join(WEB, 'index.html'), 'utf8')
    .replace('</body>', PROBE + '</body>'));

  const hubDom = await runEdge(['--virtual-time-budget=15000', '--window-size=1440,900',
    '--user-data-dir=' + path.join(TMP, 'prof-hub'), '--dump-dom', base + '__probe.html']);
  const hubTitle = titleOf(hubDom);

  /* 2. 工具直链：目录索引进 index.html，独立打开应当就是完整工具 */
  const toolDom = await runEdge(['--virtual-time-budget=8000', '--window-size=1440,900',
    '--user-data-dir=' + path.join(TMP, 'prof-tool'), '--dump-dom', base + 'tools/anton-repponen/']);
  const toolTitle = titleOf(toolDom);

  /* 3. 截一张首页整屏图（screenshot 模式拿不到 DOM，所以单独跑一趟） */
  const shot = path.join(TMP, 'web.png');
  await runEdge(['--virtual-time-budget=6000', '--window-size=1440,900',
    '--force-device-scale-factor=1.5', '--user-data-dir=' + path.join(TMP, 'prof-shot'), base], shot);

  console.log('hub   : ' + hubTitle);
  console.log('tool  : ' + toolTitle);
  console.log('shot  : ' + shot + '  exists=' + fs.existsSync(shot));

  try { fs.unlinkSync(probeFile); } catch (_) {}

  const hubOk = /PROBE text=(\d+)/.test(hubTitle) && parseInt(RegExp.$1, 10) > 50;
  const toolOk = /时间拉伸/.test(toolTitle) && /id="layerlist"/.test(toolDom);

  console.log(hubOk && toolOk ? 'VERDICT=OK' : 'VERDICT=FAIL');
  server.close();
  process.exit(hubOk && toolOk ? 0 : 1);
});
