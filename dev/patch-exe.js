/*
 * 给 exe 打图标 + 写版本信息。
 *
 * 单独成一个脚本是因为 resedit 是 ESM-only：
 * package.json 里 type:module、没有 main，CJS 的 require 直接 MODULE_NOT_FOUND。
 * 它留了个 cjs 懒加载入口：`require('resedit/cjs').load()` 返回 Promise。
 * 所以这里用异步，再由 build-portable.js 以子进程方式调用。
 *
 * 用法：node dev/patch-exe.js <exe 路径>
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EXE = process.argv[2];
if (!EXE || !fs.existsSync(EXE)) { console.error('缺少 exe 路径或文件不存在'); process.exit(1); }

const CANDIDATES = [
  path.join(ROOT, 'node_modules'),
  path.join(ROOT, '..', 'Anton Repponen风格化工具', 'node_modules')
];
let MODULES = null;
for (const m of CANDIDATES){
  if (fs.existsSync(path.join(m, 'resedit'))) { MODULES = m; break; }
}
if (!MODULES) { console.error('找不到 resedit'); process.exit(1); }

(async function main(){
  const { load } = require(path.join(MODULES, 'resedit', 'cjs.cjs'));
  const R = await load();

  const exe = R.NtExecutable.from(fs.readFileSync(EXE), { ignoreCert: true });
  const res = R.NtExecutableResource.from(exe);

  const ico = R.Data.IconFile.from(fs.readFileSync(path.join(ROOT, 'icon.ico')));
  R.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries, 1, 1033, ico.icons.map(function (i) { return i.data; })
  );

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const vi = R.Resource.VersionInfo.createEmpty();
  vi.setFileVersion(1, 0, 0, 0);
  vi.setProductVersion(1, 0, 0, 0);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    ProductName: pkg.productName,
    FileDescription: pkg.productName,
    CompanyName: 'TheLiangSui',
    LegalCopyright: '© 2026 TheLiangSui',
    OriginalFilename: path.basename(EXE),
    InternalName: pkg.productName
  });
  vi.outputToResourceEntries(res.entries);

  res.outputResource(exe);
  fs.writeFileSync(EXE, Buffer.from(exe.generate()));

  console.log('图标 + 版本信息已写入 (' + (fs.statSync(EXE).size / 1048576).toFixed(0) + ' MB)');
})().catch(function (e){
  console.error('PATCH FAILED: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
