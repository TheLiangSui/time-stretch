/* 预加载脚本：把主进程的能力以最小接口暴露给页面
 * 注意 webPreferences.sandbox = true 时，preload 里只能 require electron 的
 * contextBridge / ipcRenderer，其它模块不可用 —— 这里正好只需要这两个。 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  getSettings:  ()    => ipcRenderer.invoke('settings:get'),
  setSettings:  (s)   => ipcRenderer.invoke('settings:set', s),
  pickFolder:   (t)   => ipcRenderer.invoke('settings:pickFolder', t),
  openImage:    ()    => ipcRenderer.invoke('file:openImage'),
  openProject:  ()    => ipcRenderer.invoke('file:openProject')
});
