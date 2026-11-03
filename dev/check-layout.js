/* 多宽度自适应体检：左右对齐、横向溢出、卡片列数、页头垂直居中 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const TMP = path.join(os.tmpdir(), 'tshub-resp');

const CODE = `
(function(){
  var LB='[TESTOUT]', LE='[END]';
  setTimeout(function(){
    var out=[];
    var de=document.documentElement;
    function box(sel){
      var e=document.querySelector(sel); if(!e) return null;
      return e.getBoundingClientRect();
    }
    var pxe=getComputedStyle(de).getPropertyValue('--pad-x').trim();
    out.push('clientW=' + de.clientWidth + ' scrollW=' + de.scrollWidth +
             ' overflowX=' + (de.scrollWidth - de.clientWidth) + ' padX=' + pxe);
    var h=box('header'), b=box('.brand'), s=box('.search'), hi=box('.hero h1');
    var g=box('#grid');
    if(b) out.push('brandX=' + Math.round(b.left));
    if(hi) out.push('heroX=' + Math.round(hi.left));
    if(g) out.push('gridX=' + Math.round(g.left) + ' gridW=' + Math.round(g.width));
    if(s) out.push('search x=' + Math.round(s.left) + ' w=' + Math.round(s.width) +
                   ' centerY=' + Math.round(s.top + s.height/2));
    if(h) out.push('headerCenterY=' + Math.round(h.top + h.height/2));
    var cards=document.querySelectorAll('.card');
    if(cards.length){
      var r0=cards[0].getBoundingClientRect();
      var top=Math.round(r0.top), cols=0;
      for (var i=0;i<cards.length;i++) if (Math.round(cards[i].getBoundingClientRect().top)===top) cols++;
      out.push('card0 w=' + Math.round(r0.width) + ' colsInRow=' + cols);
      var last=cards[cards.length-1].getBoundingClientRect();
      out.push('lastCardRight=' + Math.round(last.right) + ' ok=' + (last.right <= de.clientWidth));
    }
    var bad=[];
    document.querySelectorAll('body *').forEach(function(e){
      var r=e.getBoundingClientRect();
      if (r.width>0 && r.right > de.clientWidth + 1) bad.push((e.id||e.className||e.tagName)+':'+Math.round(r.right));
    });
    out.push('beyondRight=' + (bad.length ? bad.slice(0,4).join(', ') : 'none'));
    var pre=document.createElement('pre');
    pre.textContent=LB+String.fromCharCode(10)+out.join(String.fromCharCode(10))+String.fromCharCode(10)+LE;
    document.body.appendChild(pre);
  }, 700);
})();`;

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const f = path.join(ROOT, '_resp.html');
fs.writeFileSync(f, html.replace('</body>', '<script>' + CODE + '</script></body>'));

const sizes = process.argv.slice(2).map(Number).filter(Boolean);
const list = sizes.length ? sizes : [500, 700, 900, 1024, 1180, 1362, 1440, 1920, 2560];

for (const w of list) {
  const r = spawnSync(EDGE, ['--headless=new','--disable-gpu','--no-sandbox','--hide-scrollbars',
    '--virtual-time-budget=5000','--window-size=' + w + ',900','--force-device-scale-factor=' + (process.env.DPR||1),
    '--user-data-dir=' + path.join(TMP, 'p' + w),'--dump-dom',
    require('url').pathToFileURL(f).href], { encoding:'utf8', maxBuffer: 32*1024*1024, timeout: 90000 });
  const dom = (r.stdout||'') + '';
  const tail = dom.slice(dom.lastIndexOf('[TESTOUT]'));
  const m = tail.match(/\[TESTOUT\]([\s\S]*?)\[END\]/);
  console.log('===== ' + w + 'px dpr=' + (process.env.DPR||1) + ' =====');
  console.log(m ? m[1].trim() : 'NO_OUTPUT');
}
try { fs.unlinkSync(f); } catch(_){}
