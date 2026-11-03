/*
 * 在桌面建快捷方式。
 *
 * 这台机器上只有一条路能走通：Electron 的 shell.writeShortcutLink。
 *   - WScript.Shell COM 对象      → 工具链静态拦截（COM object instantiation）
 *   - New-Item -ItemType SymbolicLink → 要管理员权限
 *   - 手搓 .lnk 二进制            → 缺 HasLinkTargetIDList，shell 不认
 *
 * 用法（必须用 Electron 跑，不能用 node）：
 *   "<Anton 工具>\node_modules\electron\dist\electron.exe" dev/make-shortcut.js
 */
const { app, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const NAME = 'TheLiangSui的风格化工具';
const TARGET = path.join(ROOT, 'dist', NAME + '-win32-x64', NAME + '.exe');
const LNK = path.join('G:\\Users\\u1521\\Desktop', NAME + '.lnk');

app.disableHardwareAcceleration();

app.whenReady().then(function () {
  const out = [];
  if (!fs.existsSync(TARGET)){
    fs.writeFileSync(path.join(ROOT, '_lnk.txt'), 'FAILED: 目标不存在 ' + TARGET, 'utf8');
    app.quit();
    return;
  }
  out.push('target = ' + TARGET);

  const ok = shell.writeShortcutLink(LNK, 'create', {
    target: TARGET,
    cwd: path.dirname(TARGET),
    description: '艺术风格化工具合集',
    icon: TARGET,
    iconIndex: 0,
    appUserModelId: 'com.theliangsui.toolkit'
  });
  out.push('writeShortcutLink = ' + ok);

  if (fs.existsSync(LNK)){
    const r = shell.readShortcutLink(LNK);
    out.push('回读 target = ' + r.target);
    out.push('回读 AUMID  = ' + (r.appUserModelId || '(无)'));
    out.push('大小 = ' + fs.statSync(LNK).size + ' bytes');
  } else {
    out.push('LNK 未生成');
  }
  fs.writeFileSync(path.join(ROOT, '_lnk.txt'), out.join('\n'), 'utf8');
  app.quit();
}).catch(function (e){
  fs.writeFileSync(path.join(ROOT, '_lnk.txt'), 'ERROR ' + (e && e.stack || e), 'utf8');
  app.quit();
});
