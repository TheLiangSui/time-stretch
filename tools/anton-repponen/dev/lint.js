/* 静态检查：把 src/js 按构建顺序拼成一份，用 ESLint 的「查错」规则跑一遍。
 *
 * 为什么不是逐文件跑：这些文件是同一个 IIFE 的片段（大括号跨文件），
 * 单文件根本解析不出来。拼起来才是它们的真实形态。
 *
 * 只开「一定是 bug」的规则，不掺风格。风格争论没有产出；
 * 而 no-undef 能直接抓住「调了个不存在的函数」这类错误 ——
 * 它曾经的表现是「整段测试静默不跑、零 FAIL」，排查代价极高。
 *
 * 用法：
 *   node dev/lint.js            有问题 exit 1
 *   node dev/lint.js --selftest 先验证检查器本身抓得住错误，再检查代码
 */
const fs = require('fs');
const path = require('path');
const { Linter } = require(path.join(__dirname, '..', 'node_modules', 'eslint'));
const globals = require(path.join(__dirname, '..', 'node_modules', 'globals'));

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'src', 'js');

const CONFIG = {
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'script',
    globals: Object.assign({}, globals.browser, globals.es2021)
  },
  rules: {
    'no-undef': 'error',
    'no-redeclare': 'error',
    'no-dupe-keys': 'error',
    'no-dupe-args': 'error',
    'no-dupe-class-members': 'error',
    'no-unreachable': 'error',
    'no-func-assign': 'error',
    'no-const-assign': 'error',
    'no-self-assign': 'error',
    'no-self-compare': 'error',
    'no-cond-assign': 'error',
    'no-unsafe-negation': 'error',
    'no-fallthrough': 'error',
    'no-sparse-arrays': 'error',
    'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' }]
  }
};

const linter = new Linter();

/* ---- 先证明这套规则抓得住错误，再拿它检查代码 ---- */
function selftest(){
  const cases = [
    ['function f(){ notDefinedAnywhere(); }', 'no-undef'],
    ['var o = { a:1, a:2 };', 'no-dupe-keys']
  ];
  let ok = true;
  for (const [src, want] of cases){
    const got = linter.verify(src, CONFIG).map(function (m) { return m.ruleId; });
    const hit = got.indexOf(want) >= 0;
    console.log((hit ? 'PASS' : 'FAIL') + '  自检 ' + want + '（人造错误）');
    if (!hit) ok = false;
  }
  return ok;
}

if (process.argv.indexOf('--selftest') >= 0 && !selftest()){
  console.log('\n检查器本身失效，结果不可信。');
  process.exit(1);
}

const files = fs.readdirSync(DIR).filter(function (f) { return f.endsWith('.js'); }).sort();

/* 拼之前先记行号映射，报错才能指回「哪个文件第几行」 */
const offsets = [];
let code = '';
for (const f of files){
  const text = fs.readFileSync(path.join(DIR, f), 'utf8');
  offsets.push({ file: f, start: code.split('\n').length, lines: text.split('\n').length });
  code += text + '\n';
}

function where(line){
  let hit = offsets[0];
  for (const o of offsets) if (line >= o.start) hit = o;
  return hit.file + ':' + (line - hit.start + 1);
}

const messages = linter.verify(code, CONFIG);

if (!messages.length){
  console.log('lint OK  (' + files.length + ' 个模块，' + code.split('\n').length + ' 行)');
  process.exit(0);
}

let errs = 0;
for (const m of messages){
  if (m.severity === 2) errs++;
  console.log((m.severity === 2 ? 'ERROR ' : 'WARN  ') + where(m.line) + '  ' + (m.ruleId || 'parse') + '  ' + m.message);
}
console.log('\n' + messages.length + ' 条（error ' + errs + '）');
process.exit(errs ? 1 : 0);
