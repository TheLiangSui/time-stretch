/* 用本机 Edge 无头模式跑自测页，提取结果
 * 用法：node _run_selftest.js [目标html] [deviceScaleFactor]
 *   第二个参数用于模拟 Windows 显示缩放（1.25 / 1.5 / 2），
 *   这是复现「框选位置不跟鼠标」那个 bug 的关键环境。 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const target = process.argv[2] || '_selftest.html';
const scale  = process.argv[3] || '1';
const fileUrl = require('url').pathToFileURL(path.join(__dirname, '..', target)).href;
const profile = path.join(os.tmpdir(), 'edge-selftest-' + Date.now());

const args = [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--no-first-run',
  '--disable-extensions',
  '--hide-scrollbars',
  '--force-device-scale-factor=' + scale,
  '--window-size=1560,900',
  '--virtual-time-budget=20000',
  '--user-data-dir=' + profile,
  '--dump-dom',
  fileUrl
];

const r = spawnSync(EDGE, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 180000 });
const dom = (r.stdout || '') + '\n' + (r.stderr || '');

// 取最后一次出现：脚本源码里也含标记字符串，渲染出的 <pre> 在 DOM 中位于其后
const payload = dom.slice(dom.lastIndexOf('[TESTOUT]'));
const m = payload.match(/\[TESTOUT\]([\s\S]*?)\[END\]/);
console.log('=== ' + target + '  @deviceScaleFactor=' + scale + ' ===');
if (!m) {
  console.log('未拿到测试结果块。');
  console.log('exit=' + r.status + ' error=' + (r.error ? r.error.message : 'none'));
  console.log('--- 原始输出片段 ---');
  console.log(dom.slice(0, 3000));
  process.exit(1);
}
console.log(m[1].trim().replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
