/* DOM 结构快照：把面板渲染结果序列化成可比较的 JSON。
 * 用途：把「字符串拼 HTML」改写成 DOM 构造器时，证明结构逐节点等价。
 * 用法：node dev/dom-snapshot.js <输入html> <输出json> */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const url = require('url');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const src = path.resolve(process.argv[2] || 'index.html');
const out = path.resolve(process.argv[3] || 'dom-snapshot.json');

const INJECT = `
<script>
(function(){
  function normStyle(s){
    if (!s) return s;
    return s.split(';').map(function(x){ return x.trim().replace(/\\s*:\\s*/, ':'); })
            .filter(Boolean).sort().join(';');
  }
  function sig(n){
    if (n.nodeType === 3){
      var t = n.nodeValue.replace(/\\s+/g, ' ').trim();
      return t ? t : null;
    }
    if (n.nodeType !== 1) return null;
    var tag = n.tagName.toLowerCase();
    var at = {};
    for (var i = 0; i < n.attributes.length; i++){
      var a = n.attributes[i], k = a.name, v = a.value;
      if (k === 'value' || k === 'selected' || k === 'disabled' || k === 'open') continue;
      if (k === 'style'){ v = normStyle(v); if (!v) continue; }
      at[k] = v;
    }
    var o = { t: tag, a: at };
    if (n.hasAttribute('open')) o.open = 1;
    if (n.hasAttribute('disabled')) o.dis = 1;
    if (tag === 'input' || tag === 'select' || tag === 'textarea') o.v = n.value;
    if (tag === 'option') o.v = n.value;
    var kids = [];
    for (var j = 0; j < n.childNodes.length; j++){
      var s = sig(n.childNodes[j]);
      if (s !== null) kids.push(s);
    }
    o.k = kids;
    return o;
  }
  function snap(){
    var T = window.__tool;
    if (!T) return null;
    var P = document.getElementById('props'), LS = document.getElementById('layerlist');
    var out = {};
    var cases = window.__CASES;
    for (var i = 0; i < cases.length; i++){
      try { T.setSel([]); cases[i][1](T); T.render(); }
      catch(e){ out[cases[i][0]] = { error: String(e && e.message) }; continue; }
      out[cases[i][0]] = { props: sig(P), list: sig(LS) };
    }
    return out;
  }
  setTimeout(function(){
    var T = window.__tool;
    if (!T) { document.title = 'SNAP_NO_TOOL'; return; }
    var W = 320, H = 240;
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d');
    g.fillStyle = '#264'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e63'; g.fillRect(80, 40, 120, 150);
    T.loadDataURL(c.toDataURL('image/png'), 'snap.png');

    setTimeout(function(){
      var mk = function(r, cfg){
        var L = T.addLayer(r);
        for (var k in cfg) L[k] = cfg[k];
        L._col = null;
        return L;
      };
      var L0 = mk({ x: 10, y: 10, w: 60, h: 120 }, {});
      var L1 = mk({ x: 80, y: 20, w: 50, h: 100 }, { order:'shuffle', shufAmt: 70, shufBlock: 3, seed: 12345 });
      var L2 = mk({ x: 140, y: 30, w: 40, h: 90 }, { order:'interleave', interSeg: 5 });
      var L3 = mk({ x: 190, y: 40, w: 30, h: 80 }, { locked:true, sampleOff: -35, sat: 40, warm: -25, hue: 60, block: 4, dir:'v' });
      var L4 = mk({ x: 60, y: 150, w: 100, h: 60 }, { opacity: 0.6, blend: 'screen' });
      L4.parts = [{ x:0, y:0, w:60, h:30 }, { x:0, y:30, w:30, h:30 }];
      L4.name = '合并形状';
      var L5 = mk({ x: 10, y: 60, w: 40, h: 40 }, {});
      L5.kind = 'image'; L5.name = '图片 1';
      var ic = document.createElement('canvas'); ic.width = 40; ic.height = 40;
      ic.getContext('2d').fillRect(0, 0, 40, 40);
      L5.img = ic;

      T.setSel([L0.id, L1.id]);
      T.groupSelected();
      T.S.groups[T.S.layers[0].gid || Object.keys(T.S.groups)[0]].name = '示例合集';

      var gid = Object.keys(T.S.groups)[0];
      window.__CASES = [
        ['none',   function(){ T.setSel([]); }],
        ['plain',  function(){ T.setSel([L0.id], L0.id); }],
        ['shuffle',function(){ T.setSel([L1.id], L1.id); }],
        ['interleave', function(){ T.setSel([L2.id], L2.id); }],
        ['locked', function(){ T.setSel([L3.id], L3.id); }],
        ['merged', function(){ T.setSel([L4.id], L4.id); }],
        ['image',  function(){ T.setSel([L5.id], L5.id); }],
        ['grpOpen',   function(){ T.S.groups[gid].collapsed = false; T.setSel([L0.id], L0.id); }],
        ['grpClosed', function(){ T.S.groups[gid].collapsed = true;  T.setSel([L0.id], L0.id); }]
      ];

      var res = snap();
      if (!res){ document.title = 'SNAP_FAIL'; return; }
      var pre = document.createElement('pre');
      pre.id = 'SNAPDATA';
      pre.textContent = JSON.stringify(res);
      document.body.appendChild(pre);
      document.title = 'SNAP_OK';
    }, 700);
  }, 300);
})();
<\/script>`;

const html = fs.readFileSync(src, 'utf8');
const tmpFile = path.join(os.tmpdir(), 'domsnap-' + Date.now() + '.html');
fs.writeFileSync(tmpFile, html.replace('</body>', INJECT + '</body>'), 'utf8');

const r = spawnSync(EDGE, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--hide-scrollbars',
  '--virtual-time-budget=15000', '--window-size=1500,900',
  '--user-data-dir=' + path.join(os.tmpdir(), 'edge-dom-' + Date.now()),
  '--dump-dom', url.pathToFileURL(tmpFile).href
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 180000 });

const dom = (r.stdout || '') + '\n' + (r.stderr || '');
const m = dom.match(/<pre id="SNAPDATA">([\s\S]*?)<\/pre>/);
if (!m){
  console.log('未拿到快照。title=' + (dom.match(/<title>([^<]*)<\/title>/) || [])[1]);
  console.log(dom.slice(0, 1200));
  process.exit(1);
}
const json = m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
fs.writeFileSync(out, json, 'utf8');
const parsed = JSON.parse(json);
const names = Object.keys(parsed);
console.log('snapshot → ' + out);
console.log('  cases: ' + names.length + '  (' + names.join(', ') + ')');
names.forEach(function(n){
  const c = parsed[n];
  if (c.error) console.log('  ! ' + n + ': ' + c.error);
});
console.log('  bytes: ' + json.length);
