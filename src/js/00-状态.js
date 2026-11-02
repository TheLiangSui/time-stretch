
"use strict";
(function(){

/* =========================================================
   状态
   ========================================================= */
const S = {
  src: { canvas:null, ctx:null, w:0, h:0, name:'', version:0 },
  layers: [],
  _sel: null,             // 真正的主选中；外部一律用 S.sel 访问
  selIds: [],             // 多选集合；sel 只是「主选中」，属性面板读它
  groups: {},             // 合集：{ gid: {id, name, collapsed, visible} }
  nextGid: 1,
  project: { id: null, name: '未命名工程' },
  hover: null,
  view: { s:1, tx:0, ty:0 },
  nextId: 1,
  showSrc: true,
  srcOpacity: 1,
  randStrength: 60,
  clipboard: null,        // 图层剪贴板（Ctrl+C / Ctrl+V）
  pasteCount: 0,          // 连续粘贴时用来逐次错开
  undoStack: [], redoStack: [],
  _dirtySeq: 0,           // 每次真实改动 +1，用来判断「有没有新东西要存」
  _savedSeq: -1,          // 最近一次落盘时的 _dirtySeq
  _autoSaves: 0           // 静默存盘次数（自测用）
};
const MAX_UNDO = 80;
/* S.sel 是对外的「主选中」。任何直接赋值都视为单选（自动收敛多选集合），
   要保留多选请走 setSel()。这样历史代码里那些 `S.sel = x` 不会留下脏的 selIds。 */
Object.defineProperty(S, 'sel', {
  enumerable: false, configurable: true,
  get: function(){ return S._sel; },
  set: function(v){ S._sel = v || null; S.selIds = v ? [v] : []; }
});
let newLayerDir = 'h';    // 新框的默认拉伸方向，由左侧「默认方向」控制，Shift 可临时反转

const vp   = document.getElementById('viewport');
const cvs  = document.getElementById('cv');
const ctx  = cvs.getContext('2d');
const hint = document.getElementById('hint');
const statusEl = document.getElementById('status');
const listEl   = document.getElementById('layerlist');
const propsEl  = document.getElementById('props');

/* 静态壳元素的查询缓存。
   按钮、开关这些 id 在页面生命周期里不变，每次重绘都去 getElementById 是白跑；
   面板里的控件会被整体重建，所以命中缓存前先确认节点还挂在文档上。 */
const _idCache = {};
function $(id){
  const hit = _idCache[id];
  if (hit && hit.isConnected) return hit;
  const el = document.getElementById(id);
  if (el) _idCache[id] = el;
  return el;
}
