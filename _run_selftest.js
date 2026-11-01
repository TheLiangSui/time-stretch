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
const fileUrl = require('url').pathToFileURL(path.join(__dirname, target)).href;
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

const text = m[1].trim().replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
console.log(text);

/* ---- 闸门：这次跑出问题就别让它悄悄通过 ---- */
const failLines = text.split('\n').filter(function (l) { return l.indexOf('FAIL') === 0; });
const totalM = text.match(/TOTAL=(\d+)/);
const total = totalM ? parseInt(totalM[1], 10) : 0;

/* 1. 页面里的未捕获异常会以 EXCEPTION_B / EXCEPTION_C 出现在原始输出里 */
const crash = /EXCEPTION_[BC]/.test(payload);
if (crash) {
  const line = payload.split('\n').filter(function (l) { return l.indexOf('EXCEPTION_') >= 0; })[0] || '';
  console.log('\n[闸门] 测试中途异常中断 —— 后面的用例根本没跑。');
  console.log('        ' + line.slice(0, 400));
}

/* 2. 用例数掉到下限以下 = 某段被跳过（以前这种情况零 FAIL，最难查） */
const MIN = parseInt(process.env.MIN_TOTAL || '300', 10);
if (total < MIN) {
  console.log('\n[闸门] 只跑了 ' + total + ' 项，低于下限 ' + MIN + ' —— 有用例被跳过。');
}

if (crash || total < MIN) {
  console.log('VERDICT=TRUNCATED');
  process.exit(2);
}
if (failLines.length) process.exit(1);
