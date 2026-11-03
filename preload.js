/*
 * 预加载：只暴露极少量信息。
 * 外壳本身是纯前端，不需要文件系统能力；这里只给版本号，方便「关于」显示。
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hubDesktop', {
  isDesktop: true,
  platform: process.platform,
  info: function () { return ipcRenderer.invoke('app:info'); },
  /* 把界面当前的面板色 / 主题交给主进程，用于窗口底色与系统标题栏 */
  theme: function (p) { ipcRenderer.send('hub:theme', p || {}); },
  /* 标题栏文字（传空串回到首页标题） */
  title: function (t) { ipcRenderer.send('hub:title', t || ''); },
  /* 工具要的宿主能力（目前只有目录选择） */
  ts: {
    pickFolder: function (title) { return ipcRenderer.invoke('ts:pick-folder', title); }
  }
});
