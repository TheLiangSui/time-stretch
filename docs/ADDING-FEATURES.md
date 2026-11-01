# 加功能之前看这页

这个工具是「源码分模块 + 构建拼回单文件」。**只改 `src/` 下的文件，不要改 `index.html`** ——
那是产物，下次构建会被覆盖。

```bash
npm run check     # 静态检查 + CSS 变量扫描 + 构建 + 374 项自测
```

先跑一次确认基线是绿的，再动手。红灯状态下加功能，出问题时分不清是谁的锅。

---

## 一、加一个「图层参数」（最常见的需求）

只动两处，第三处看情况。**其余地方不用管** —— 它们现在都是自动的。

### 1. `src/js/08-图层数据.js` → `makeLayer()` 加默认值

```js
myNewParam: 0,          // 一行注释写清范围与含义
```

这一步同时解决**旧工程兼容**：读盘是
`Object.assign(makeLayer(几何), 存档里的字段)`，存档里没有的键自然取默认值。
所以加字段不需要写迁移代码。

### 2. `src/js/11b-属性面板视图.js` → 加控件

在对应分组里建单元，再绑回去：

```js
const pMy = cellNum('pMyV', '我的参数', L.myNewParam, { min:0, max:100, icon:'i-bolt' });
// …把它放进 nodes.push(...) 的某个 details 里…
bindNum(pMy._inp, function(v){ L.myNewParam = Math.round(v); });
```

`cellNum` 返回节点，数字框在 `._inp` 上 —— 不需要记 id，也不用 `getElementById`。

### 3. 如果它影响画面：`src/js/05-取样线.js`

- 影响**取样线上的像素**（如分组、洗牌、调色）→ 写进 `buildStripe()`
- 影响**整层的绘制方式**（混合、蒙版、滤镜）→ 写进 `drawStretchedLayer()`

### 不需要改的四件事（以前要，现在不用）

| 位置 | 为什么不用改 |
|---|---|
| 像素列缓存键 `stripeFor()` | 用 `stableStr(L)` 自动收录全部字段 |
| 渲染签名 `propsSig` / `layerListSig` | 同上，新字段自动进签名，不会「改了不刷新」 |
| 缩略图 `paintThumb()` | 走同一条 `stripeFor` |
| 导出 / 工程存档 | 导出走同一条绘制路径；存档直接序列化 layers |

有两条测试专门守着这个约定：`新字段自动纳入签名`、`新像素参数自动进缓存键`。

---

## 二、加一个按钮 / 命令

| 场景 | 改哪里 |
|---|---|
| 顶栏、左栏这类**静态**控件 | `src/template.html` 加标记 → `src/js/20-控件绑定.js` 里绑定 |
| 属性面板里的按钮 | 在 `11b-属性面板视图.js` 建节点时就地 `addEventListener` |
| 快捷键 | `src/js/14b-画布输入.js` 的 `keydown` |

静态元素的查询一律用 `$('id')`（`src/js/00-状态.js`）—— 它带缓存 + `isConnected` 失效检测，
比每次 `document.getElementById` 便宜，也不会拿到已被重建掉的旧节点。

---

## 三、加一个新的属性面板分组

在 `11b-属性面板视图.js` 里 push 一个：

```js
h('details', { class: 'grp', 'data-grp': 'mygrp', open: !!grpOpen.mygrp }, ...)
```

然后去 `src/js/12-自绘下拉.js` 的 `GRP_DEFAULT` 里登记它的默认展开状态。
不登记的话 `grpOpen.mygrp` 是 `undefined`，表现为永远折叠 —— 不算 bug，但容易让人以为是。

---

## 四、改样式

**不要随手写 `var(--xxx)`。** 变量名不存在时整条声明直接失效、控制台不报错，
表现是「某个状态下某个底色莫名消失」。踩过两次。

加完样式跑：

```bash
node dev/check-css-vars.js
```

`npm run check` 里也包含这一步。

---

## 五、加测试

测试写在 `_gen_selftest.js`（它本身是一个大模板字符串，**这点很关键**）：

- 不要写反引号和 `${`，会被外层模板吃掉
- 反斜杠会被二次解释，正则里的 `\d` 要写成 `\\d`
- **整段包 `try/catch`，异常要 push 成 FAIL**。不包的话表现是「这段静默不跑、
  一条 FAIL 都没有、TOTAL 腰斩」，这是本项目最难查的一类故障

跑：

```bash
npm run check     # 里面有闸门：用例数低于下限或页面抛异常 → VERDICT=TRUNCATED
```

---

## 六、动完 UI 结构之后

结构一改，最怕「看起来对、其实某块没刷新」。抓一份 DOM 快照对比：

```bash
node dev/dom-snapshot.js index.html before.json
# 改代码 …
node dev/build-single.js
node dev/dom-snapshot.js index.html after.json
# 用任意 JSON diff 看差异；随机种子（pSeed）每次都会变，属正常
```

它覆盖 9 种状态：无选中 / 普通层 / 乱序 / 间序 / 锁定 / 合并形状 / 图片层 / 组展开 / 组折叠。

---

## 七、还没做的那一层

`S` 仍是裸对象，业务代码直接 `S.x = v` 改，改完自己调 `renderAll()`。
`renderAll()` 会靠签名判断哪块要重建，所以「忘了刷新」的风险已经很小，
但**改完不调 `renderAll()` 仍然不会自动更新**。加功能时记住这一条即可。

要把这层也收掉（`S` → store + 订阅），是一项独立的重构，见
`docs/REFACTOR-2026-11-01.md` 的「还没做」一节。

---

## 附：这份文档是走过一遍的

写完之后按它实际加了一个「染色」参数（0..100，影响 `globalAlpha`），再原样撤回。
真实动到的地方：

| 文件 | 改动 | 行数 |
|---|---|---|
| `08-图层数据.js` | `makeLayer()` 加 `tint: 0` | 1 行 |
| `11b-属性面板视图.js` | `cellNum` + 放进 `cells(...)` + `bindNum` | 3 行 |
| `05-取样线.js` | 在绘制里用上它 | 1 行 |
| `_gen_selftest.js` | **原有断言写死了「色彩行有三个单元」，要改成 4** | 1 行 |

前三个是生产代码，第四个是必须留意的：**测试里凡是写死数量、写死字段清单的断言，加东西时会红。**
这不是测试太脆，是它确实在记录「面板长什么样」—— 改了样子就该改断言。
`npm run check` 会把它指出来（`got=4 want=3`），改完即可。

除此之外，缓存键、渲染签名、缩略图、导出、存档、工程兼容**一行都不用动**。

撤回后重新构建，`374/374` 全绿、lint 与 CSS 变量扫描均通过。
