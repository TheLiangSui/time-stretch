/* 把 src/ 拼回单文件 index.html。
   产品形态只有一个 HTML（合集 iframe、双击打开都靠它），开发时按文件分开放。 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

const tpl = fs.readFileSync(path.join(SRC, 'template.html'), 'utf8');
const css = fs.readFileSync(path.join(SRC, 'styles.css'), 'utf8');

const files = fs.readdirSync(path.join(SRC, 'js')).filter(f => f.endsWith('.js')).sort();
const js = files.map(f => fs.readFileSync(path.join(SRC, 'js', f), 'utf8')).join('\n').replace(/^\n+/, '');

const out = tpl
  .replace('<!-- @@CSS@@ -->', css.replace(/\n+$/, ''))
  .replace('<!-- @@JS@@ -->', js.replace(/\n+$/, ''));

fs.writeFileSync(path.join(ROOT, 'index.html'), out);
const kb = (out.length / 1024).toFixed(0);
console.log('built index.html  ' + kb + ' KB  (' + files.length + ' js 模块 + 1 css)');
