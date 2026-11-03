const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const tmp = path.join(os.tmpdir(), 'tshub-shots');
fs.mkdirSync(tmp, { recursive: true });

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function shot(name, code, w, h, dpr){
  const KILL = "var __st=document.createElement('style');" +
    "__st.textContent='.card{animation:none!important}';"; +
    "document.head.appendChild(__st);";
  const page = html.replace('</body>', '<script>' + KILL + (code || '') + '</script></body>');
  const f = path.join(ROOT, '_shot_' + name + '.html');
  fs.writeFileSync(f, page);
  const out = path.join(tmp, name + '.png');
  spawnSync(EDGE, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--hide-scrollbars',
    '--virtual-time-budget=6000',
    '--window-size=' + (w || 1440) + ',' + (h || 900),
    '--force-device-scale-factor=' + (dpr || 1.5),
    '--screenshot=' + out,
    '--user-data-dir=' + path.join(tmp, 'prof-' + name),
    require('url').pathToFileURL(f).href
  ], { encoding: 'utf8', timeout: 120000 });
  try { fs.unlinkSync(f); } catch(_){}
  console.log(name + ': ' + fs.existsSync(out) + '  ' + out);
}

shot('hub-dark', "applyTheme('dark');", 1440, 900, 1.5);
shot('hub-light', "applyTheme('light');", 1440, 900, 1.5);
shot('hub-tool', "setTimeout(function(){ var c=document.querySelector('#gridPub .card'); if(c) c.click(); }, 120);", 1440, 900, 1.5);

console.log(JSON.stringify(process.argv));
