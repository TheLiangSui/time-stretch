/* 扫描未定义的 CSS 变量。
 *
 * 为什么需要：`background: var(--line-3)` 里如果 `--line-3` 不存在，
 * 整条声明会被判为无效 —— 不是「用默认值」，是直接不生效，而且控制台不报错。
 * 表现是「鼠标一悬停底色就没了」这种诡异现象，肉眼几乎查不出来。
 *
 * 用法：node dev/check-css-vars.js
 *   exit 1 = 有未定义的引用
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const files = ['styles.css', 'template.html'].map(function (f) { return path.join(SRC, f); });

const declared = new Set();
const used = new Map();          // 变量名 -> 首次出现的文件

for (const f of files){
  const text = fs.readFileSync(f, 'utf8');
  const base = path.basename(f);
  /* 声明：--x: value  /  --x : value（含 JS 里的 setProperty('--x', …)） */
  let m;
  const declRe = /(--[a-z0-9-]+)\s*:/g;
  while ((m = declRe.exec(text))) declared.add(m[1]);
  const setRe = /setProperty\(\s*['"](--[a-z0-9-]+)['"]/g;
  while ((m = setRe.exec(text))) declared.add(m[1]);

  const useRe = /var\(\s*(--[a-z0-9-]+)/g;
  while ((m = useRe.exec(text))) if (!used.has(m[1])) used.set(m[1], base);
}

/* JS 里也会 setProperty 定义变量（--pa/--pb/--p 之类），一起收进来 */
const jsDir = path.join(SRC, 'js');
for (const f of fs.readdirSync(jsDir).filter(function (x) { return x.endsWith('.js'); })){
  const text = fs.readFileSync(path.join(jsDir, f), 'utf8');
  let m;
  const setRe = /setProperty\(\s*['"](--[a-z0-9-]+)['"]/g;
  while ((m = setRe.exec(text))) declared.add(m[1]);
  const styleRe = /(--[a-z0-9-]+)\s*:\s*['"`]?[\d.]/g;   // style 对象里的字面量键
  while ((m = styleRe.exec(text))) declared.add(m[1]);
}

const missing = [];
used.forEach(function (file, name) {
  if (!declared.has(name)) missing.push(name + '   （' + file + '）');
});

if (!missing.length){
  console.log('CSS 变量 OK  （声明 ' + declared.size + ' 个，引用 ' + used.size + ' 个）');
  process.exit(0);
}
console.log('未定义但被引用：');
missing.forEach(function (s) { console.log('  ' + s); });
process.exit(1);
