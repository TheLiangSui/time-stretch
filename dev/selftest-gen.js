/*
 * 自测生成器 —— 把测试脚本注入 index.html 生成 _selftest.html
 * 用法：node _gen_selftest.js [broken]
 *   broken 模式把采样列强制改到矩形左边缘，用来验证测试本身能抓到错误
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..');
const broken = process.argv[2] === 'broken';
const dprBroken = process.argv[2] === 'dprbroken';

let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');

if (broken) {
  /* 反向对照：把取样列强制改到矩形左边缘（不再居中），预期整批取样位置断言失败 */
  const before = '    const cx = clamp(Math.round(x + w/2 + off * w/2), x, x + w - 1);';
  if (html.indexOf(before) < 0) { console.error('FAIL: 找不到待破坏的取样列代码'); process.exit(2); }
  html = html.replace(before, '    const cx = x; /* BROKEN CONTROLS */');
}

if (dprBroken) {
  /* 回归对照：把画布尺寸修复撤掉（还原成修复前的写法），
     预期在 dpr=1 时全过、dpr>1 时「画布显示宽==视口宽」必然 FAIL */
  const cssOld = '#cv{display:block; position:absolute; top:0; left:0; width:100%; height:100%}';
  const jsOld  = "  if (cvs.style.width  !== cw + 'px') cvs.style.width  = cw + 'px';\n" +
                 "  if (cvs.style.height !== ch + 'px') cvs.style.height = ch + 'px';\n";
  if (html.indexOf(cssOld) < 0 || html.indexOf(jsOld) < 0) {
    console.error('FAIL: 找不到待撤除的画布尺寸修复代码'); process.exit(2);
  }
  html = html.replace(cssOld, '#cv{display:block; position:absolute; inset:0}');
  html = html.replace(jsOld, '');
}

const BODY = `
(function(){
  var out = [];
  var R = [];
  function log(k, v){ out.push(k + '=' + JSON.stringify(v)); }
  function chk(name, got, want){
    R.push((String(got) === String(want) ? 'PASS' : 'FAIL') + ' ' + name + ' got=' + got + ' want=' + want);
  }
  function chkNear(name, got, want, tol){
    var ok = Math.abs(got - want) <= tol;
    R.push((ok ? 'PASS' : 'FAIL') + ' ' + name + ' got=' + got + ' want~' + want + '(+-' + tol + ')');
  }
  function finish(){
    var pre = document.createElement('pre');
    pre.textContent = '[TESTOUT]\\n' + out.join('\\n') + '\\n[END]';
    document.body.appendChild(pre);
  }

  /* ---------- 两张诊断图 ----------
     列渐变图：第 x 列纯色 rgb(2x,0,255-2x) —— 验证「采了哪一列」
     行渐变图：第 y 行纯色 rgb(4y,0,255-4y) —— 验证「哪一行盖住了哪一行」 */
  function makeColImg(){
    var c = document.createElement('canvas'); c.width = 100; c.height = 60;
    var g = c.getContext('2d');
    for (var x = 0; x < 100; x++){ g.fillStyle = 'rgb(' + (x*2) + ',0,' + (255-x*2) + ')'; g.fillRect(x,0,1,60); }
    return c;
  }
  function makeRowImg(){
    var c = document.createElement('canvas'); c.width = 100; c.height = 60;
    var g = c.getContext('2d');
    for (var y = 0; y < 60; y++){ g.fillStyle = 'rgb(' + (y*4) + ',0,' + (255-y*4) + ')'; g.fillRect(0,y,100,1); }
    return c;
  }
  function colColor(x){ return (x*2) + ',0,' + (255-x*2); }
  function rowColor(y){ return (y*4) + ',0,' + (255-y*4); }

  var T = window.__tool;
  if (!T){ log('FATAL', 'window.__tool 未暴露'); finish(); return; }
  var VP = document.getElementById('viewport');
  var CV = document.getElementById('cv');

  function toScreen(ix, iy){ var v = T.S.view; return { x: ix*v.s + v.tx, y: iy*v.s + v.ty }; }
  function fire(name, ix, iy, opt){
    var p = toScreen(ix, iy);
    var r = VP.getBoundingClientRect();
    CV.dispatchEvent(new PointerEvent(name, Object.assign({
      bubbles:true, cancelable:true,
      clientX: r.left + p.x, clientY: r.top + p.y,
      button: 0, buttons: name === 'pointerup' ? 0 : 1,
      pointerId: 1, pointerType: 'mouse', isPrimary: true
    }, opt || {})));
  }
  function pick(ex, x, y){
    var d = ex.getContext('2d').getImageData(x, y, 1, 1).data;
    return d[0] + ',' + d[1] + ',' + d[2];
  }
  function rgba(ex, x, y){ return ex.getContext('2d').getImageData(x, y, 1, 1).data; }

  T.loadDataURL(makeColImg().toDataURL('image/png'), 'col.png');

  setTimeout(function(){
   var finished = false;
   function doneOnce(){ if (finished) return; finished = true; done(); }
   function done(){
     log('', '');
     out = out.concat(R);
     var fails = R.filter(function(s){ return s.indexOf('FAIL') === 0; }).length;
     out.push('');
     out.push('TOTAL=' + R.length + ' FAILS=' + fails + ' VERDICT=' + (fails === 0 ? 'ALL_PASS' : 'HAS_FAILURE'));
     finish();
   }
   try {
    /* =====================================================
       A. 画布尺寸与坐标对齐 —— dpr 缩放下「鼠标位置 == 内容位置」的前提
       ===================================================== */
    var dpr = window.devicePixelRatio || 1;
    var vr = VP.getBoundingClientRect();
    var cr = CV.getBoundingClientRect();
    log('devicePixelRatio', dpr);
    log('viewport CSS', Math.round(vr.width) + 'x' + Math.round(vr.height));
    log('canvas  CSS', Math.round(cr.width) + 'x' + Math.round(cr.height));
    log('canvas 位图', CV.width + 'x' + CV.height);

    /* 关键不变量：① 画布要铺满视口 ② 画布位图 = 画布自身显示尺寸 × dpr
       这两条同时成立，才保证「1 个绘制单位 == 1 个 CSS 像素 == 鼠标坐标单位」。
       注意用画布自己的 rect（而不是视口的 clientHeight），后者是取整值，
       非整数倍 dpr 下会差 1px，那是测试精度问题不是代码问题。 */
    chkNear('画布显示宽 ≈ 视口宽', cr.width, vr.width, 1);
    chkNear('画布显示高 ≈ 视口高', cr.height, vr.height, 1);
    chk('画布位图宽 == 画布显示宽xdpr', CV.width, Math.round(cr.width * dpr));
    chk('画布位图高 == 画布显示高xdpr', CV.height, Math.round(cr.height * dpr));
    chk('画布 left/top 贴视口', Math.round(cr.left - vr.left) + ',' + Math.round(cr.top - vr.top), '0,0');

    /* 内容落位：图像左上角应画在 img2scr(0,0)*dpr 的位图坐标上 */
    var sc0 = toScreen(0, 0);
    var cg = CV.getContext('2d');
    var px0 = cg.getImageData(Math.round(sc0.x*dpr) + 3, Math.round(sc0.y*dpr) + 3, 1, 1).data;
    log('图像左上角在位图处', sc0.x.toFixed(1) + ',' + sc0.y.toFixed(1) + ' -> rgb(' + px0[0] + ',' + px0[1] + ',' + px0[2] + ')');
    chk('图像坐标系与画布变换一致', px0[0] + ',' + px0[1] + ',' + px0[2], '0,0,255');

    /* =====================================================
       B. 横向拉伸核心（列渐变图）
       ===================================================== */
    chk('源图尺寸', T.S.src.w + 'x' + T.S.src.h, '100x60');

    /* A 覆盖 10..49，B 覆盖 20..69 —— B 的取样列 45 落在 A 矩形内，
       这样「B 到底读的是源图层还是合成结果」才有判别力 */
    var A = T.addLayer({ x:10, y:10, w:40, h:30 });
    var B = T.addLayer({ x:20, y:10, w:50, h:30 });
    chk('图层数', T.S.layers.length, 2);

    /* 取样列 = round(x + w/2) 的几何中心 */
    var colA = Math.round(10 + 40/2);   // 30
    var colB = Math.round(20 + 50/2);   // 45
    log('expectColA', colA); log('expectColB', colB);

    var ex = T.buildExportCanvas(1, 'transparent', true);
    chk('A 独有区 = A 居中列', pick(ex,15,10), colColor(colA));
    chk('A 独有区 底部行一致', pick(ex,15,38), colColor(colA));
    chk('重叠区归 B（后建在上）', pick(ex,35,10), colColor(colB));
    chk('重叠区右端仍归 B', pick(ex,48,38), colColor(colB));
    chk('B 独有区 = B 居中列', pick(ex,60,10), colColor(colB));
    chk('矩形外保留原图 x=5', pick(ex,5,5), colColor(5));
    chk('矩形外保留原图 x=75', pick(ex,75,50), colColor(75));
    /* B 的取样列 x=45 落在 A 内：若 B 读的是合成结果就会拿到 A 的拉伸色，本项必 FAIL */
    chk('B 采样自源图层（非合成）', pick(ex,60,10), colColor(colB));

    T.S.layers.splice(T.S.layers.indexOf(A), 1);
    T.S.layers.push(A);
    T.render();
    chk('重排后重叠区翻转为 A', pick(T.buildExportCanvas(1,'transparent',true), 35, 10), colColor(colA));
    B.visible = false;
    chk('隐藏 B 后重叠区 = A', pick(T.buildExportCanvas(1,'transparent',true), 35, 10), colColor(colA));
    B.visible = true;

    var noSrc = T.buildExportCanvas(1, 'transparent', false);
    chk('不含源图层时矩形外透明', rgba(noSrc,5,5)[3], 0);
    chk('不含源图层时矩形内不透明', rgba(noSrc,65,10)[3], 255);
    var ex2x = T.buildExportCanvas(2, '#ffffff', true);
    chk('2x 导出尺寸', ex2x.width + 'x' + ex2x.height, '200x120');

    /* =====================================================
       B2. 水平取样偏移（列渐变图，第 x 列纯色 rgb(2x,0,255-2x)）
       矩形 (10,10,40,30)：半宽 20，取样列 = 30 + off*20，钳在 [10,49]
       ===================================================== */
    T.S.layers = [];
    var OL = T.addLayer({ x:10, y:10, w:40, h:30 });
    OL.dir = 'h'; OL.block = 1; OL.order = 'none'; OL.sat = 0; OL.warm = 0;
    function hOff(off){
      OL.sampleOff = off; OL._col = null;
      return pick(T.buildExportCanvas(1,'transparent',true), 25, 20);
    }
    chk('偏移 0 → 居中列 x=30',   hOff(0),    colColor(30));
    chk('偏移 −100 → 左边缘 x=10', hOff(-100), colColor(10));
    chk('偏移 +100 → 右边缘 x=49', hOff(100),  colColor(49));
    chk('偏移 −50 → x=20',        hOff(-50),  colColor(20));
    chk('偏移 +50 → x=40',        hOff(50),   colColor(40));
    chk('取样线位置读数', T.sampleLine(OL, 10, 10, 40, 30).pos, 40);

    /* =====================================================
       B3. 垂直方向 + 方块感（列渐变图纵向均匀，正好能验证「取横行上下拉」）
       ===================================================== */
    T.S.layers = [];
    var VV = T.addLayer({ x:10, y:10, w:40, h:30 });
    VV.dir = 'v'; VV.block = 1; VV.sampleOff = 0; VV.order = 'none'; VV.sat = 0; VV.warm = 0; VV._col = null;
    chk('垂直·取样线是横行 y=25', T.sampleLine(VV, 10, 10, 40, 30).pos, 25);
    chk('垂直·逐列原样 x=25', pick(T.buildExportCanvas(1,'transparent',true), 25, 20), colColor(25));
    chk('垂直·逐列原样 x=10', pick(T.buildExportCanvas(1,'transparent',true), 10, 38), colColor(10));
    chk('垂直·纵向均匀', pick(T.buildExportCanvas(1,'transparent',true), 10, 11), colColor(10));
    VV.block = 10; VV._col = null;
    chk('垂直·block=10 第1-10列同色',  pick(T.buildExportCanvas(1,'transparent',true), 15, 20), colColor(10));
    chk('垂直·block=10 第11-20列同色', pick(T.buildExportCanvas(1,'transparent',true), 25, 20), colColor(20));
    chk('垂直·block=10 第21-30列同色', pick(T.buildExportCanvas(1,'transparent',true), 35, 20), colColor(30));
    chk('垂直·block=10 组间不同色', pick(T.buildExportCanvas(1,'transparent',true), 45, 20), colColor(40));

    /* =====================================================
       C 之后都跑在行渐变图上
       ===================================================== */
    T.loadDataURL(makeRowImg().toDataURL('image/png'), 'row.png');

    setTimeout(function(){
     try {
      chk('行渐变图载入', T.S.src.w + 'x' + T.S.src.h, '100x60');
      var L = T.addLayer({ x:10, y:10, w:40, h:30 });

      /* ---------- C. 方块感 ---------- */
      L.block = 1; L._col = null;
      var e1 = T.buildExportCanvas(1,'transparent',true);
      chk('block=1 逐行原样 y=10', pick(e1,25,10), rowColor(10));
      chk('block=1 逐行原样 y=11', pick(e1,25,11), rowColor(11));
      R.push((pick(e1,25,10) !== pick(e1,25,11) ? 'PASS' : 'FAIL') + ' block=1 相邻行应不同');

      L.block = 2; L._col = null;
      var e2 = T.buildExportCanvas(1,'transparent',true);
      chk('block=2 第1行=源行10', pick(e2,25,10), rowColor(10));
      chk('block=2 第2行被第1行覆盖', pick(e2,25,11), rowColor(10));
      chk('block=2 第3行=源行12', pick(e2,25,12), rowColor(12));
      chk('block=2 第4行被第3行覆盖', pick(e2,25,13), rowColor(12));
      chk('block=2 第5行=源行14', pick(e2,25,14), rowColor(14));
      R.push((pick(e2,25,11) !== pick(e2,25,13) ? 'PASS' : 'FAIL') + ' block=2 不同组之间应不同');

      L.block = 5; L._col = null;
      var e5 = T.buildExportCanvas(1,'transparent',true);
      var same5 = true;
      for (var k = 10; k <= 14; k++) if (pick(e5,25,k) !== rowColor(10)) same5 = false;
      R.push((same5 ? 'PASS' : 'FAIL') + ' block=5 第1..5行同为源行10');
      var same5b = true;
      for (var k2 = 15; k2 <= 19; k2++) if (pick(e5,25,k2) !== rowColor(15)) same5b = false;
      R.push((same5b ? 'PASS' : 'FAIL') + ' block=5 第6..10行同为源行15');
      chk('block=5 第11行=源行20', pick(e5,25,20), rowColor(20));

      /* ---------- D. 乱序 ---------- */
      function seqOf(hh, opts){
        var L2 = { order:'none', shufAmt:60, shufBlock:1, seed:12345, interSeg:4, block:1 };
        Object.assign(L2, opts || {});
        return Array.prototype.slice.call(T.buildSeq(hh, L2));
      }
      function isPerm(s, hh){
        var c = s.slice().sort(function(a,b){ return a-b; });
        for (var i = 0; i < hh; i++) if (c[i] !== i) return false;
        return true;
      }
      function identity(s){ return s.every(function(v,i){ return v === i; }); }

      chk('order=none 为恒等', identity(seqOf(30, { order:'none' })), true);
      chk('乱序 强度0 为恒等', identity(seqOf(30, { order:'shuffle', shufAmt:0 })), true);
      chk('乱序 强度100 非恒等', identity(seqOf(30, { order:'shuffle', shufAmt:100 })), false);
      chk('乱序 是完整置换', isPerm(seqOf(30, { order:'shuffle', shufAmt:100 }), 30), true);
      var s1 = seqOf(30, { order:'shuffle', shufAmt:100, seed:777 }).join(',');
      var s2 = seqOf(30, { order:'shuffle', shufAmt:100, seed:777 }).join(',');
      var s3 = seqOf(30, { order:'shuffle', shufAmt:100, seed:778 }).join(',');
      chk('同 seed 结果可复现', s1, s2);
      R.push((s1 !== s3 ? 'PASS' : 'FAIL') + ' 换 seed 结果应不同');
      var sb = seqOf(30, { order:'shuffle', shufAmt:100, shufBlock:2, seed:42 });
      var paired = true;
      for (var i = 0; i < 30; i += 2) if (sb[i+1] !== sb[i] + 1) paired = false;
      R.push((paired ? 'PASS' : 'FAIL') + ' 乱序 块大小=2 时两行成对搬家');
      R.push((isPerm(sb, 30) ? 'PASS' : 'FAIL') + ' 乱序 块大小=2 仍是完整置换');
      R.push((isPerm(seqOf(30, { order:'shuffle', shufAmt:25, seed:9 }), 30) ? 'PASS' : 'FAIL') +
             ' 乱序 低强度仍是完整置换');

      /* ---------- E. 间序 ---------- */
      var it = seqOf(30, { order:'interleave', interSeg:3 });
      chk('间序 h30 段3 前6项', it.slice(0,6).join(','), '0,10,20,1,11,21');
      chk('间序 h30 段3 末3项', it.slice(-3).join(','), '9,19,29');
      chk('间序 是完整置换', isPerm(it, 30), true);
      chk('间序 h30 段4 前4项', seqOf(30, { order:'interleave', interSeg:4 }).slice(0,4).join(','), '0,8,16,24');
      chk('间序 h30 段4 是完整置换', isPerm(seqOf(30, { order:'interleave', interSeg:4 }), 30), true);

      /* ---------- F. 色彩（源行 10 = rgb(40,0,215)） ---------- */
      L.block = 1; L.sat = 0; L.warm = 0; L._col = null;
      chk('色彩基线 = rgb(40,0,215)', pick(T.buildExportCanvas(1,'transparent',true), 25, 10), '40,0,215');

      L.sat = -100; L._col = null;
      var d = rgba(T.buildExportCanvas(1,'transparent',true), 25, 10);
      R.push((d[0] === d[1] && d[1] === d[2] ? 'PASS' : 'FAIL') +
             ' 饱和度-100 -> 灰阶 got=' + d[0] + ',' + d[1] + ',' + d[2]);
      chkNear('饱和度-100 灰度值', d[0], 24, 1);

      L.sat = 100; L._col = null;
      var d2 = rgba(T.buildExportCanvas(1,'transparent',true), 25, 10);
      chkNear('饱和度+100 R', d2[0], 56, 1);
      chk('饱和度+100 G 压到0', d2[1], 0);
      chk('饱和度+100 B 溢出钳到255', d2[2], 255);

      L.sat = 0; L.warm = 100; L._col = null;
      var d3 = rgba(T.buildExportCanvas(1,'transparent',true), 25, 10);
      chkNear('暖+100 R 升高', d3[0], 52, 1);
      chkNear('暖+100 B 降低', d3[2], 150, 1);
      R.push((d3[0] > 40 && d3[2] < 215 ? 'PASS' : 'FAIL') + ' 暖色方向正确（R升B降）');

      L.warm = -100; L._col = null;
      var d4 = rgba(T.buildExportCanvas(1,'transparent',true), 25, 10);
      R.push((d4[0] < 40 && d4[2] > 215 ? 'PASS' : 'FAIL') +
             ' 冷色方向正确（R降B升） got=' + d4[0] + ',' + d4[1] + ',' + d4[2]);

      L.warm = 0; L.sat = 100; L.warm = 100; L._col = null;
      chk('色彩不影响框外', pick(T.buildExportCanvas(1,'transparent',true), 5, 5), rowColor(5));
      L.sat = 0; L.warm = 0; L._col = null;

      L.block = 3;
      var c3a = pick(T.buildExportCanvas(1,'transparent',true), 25, 12);
      L.block = 1;
      var c1a = pick(T.buildExportCanvas(1,'transparent',true), 25, 12);
      R.push((c3a !== c1a ? 'PASS' : 'FAIL') + ' 改 block 后缓存正确失效 ' + c3a + ' vs ' + c1a);

      /* ---------- G. 交互链路 ---------- */
      var n0 = T.S.layers.length;
      fire('pointerdown', 4, 4);
      fire('pointermove', 24, 17);
      fire('pointermove', 44, 33);
      fire('pointerup',   44, 33);
      chk('拖拽新建图层数', T.S.layers.length - n0, 1);
      var NL = T.S.layers[T.S.layers.length-1];
      chk('拖拽建层几何', [NL.x,NL.y,NL.w,NL.h].map(Math.round).join(','), '4,4,40,29');
      chk('新建后自动选中', T.S.sel === NL.id, true);

      fire('pointerdown', 24, 17);
      fire('pointermove', 37, 26);
      fire('pointerup',   37, 26);
      chk('拖动已有矩形移位', [NL.x,NL.y].map(Math.round).join(','), '17,13');

      var under1 = T.S.layers.filter(function(x){ return x !== NL; })[T.S.layers.length - 2];
      under1 = T.S.layers[0];

      fire('pointerdown', 96, 57);
      fire('pointerup',   96, 57);
      chk('空白处点击取消选中', T.S.sel, 'null');

      /* 撤销 / 重做（这一段之前不能插入会 pushUndo 的操作，否则断言会错位） */
      var nid = NL.id;
      window.dispatchEvent(new KeyboardEvent('keydown', { key:'z', ctrlKey:true, bubbles:true }));
      var back = T.S.layers.filter(function(x){ return x.id === nid; })[0];
      chkNear('Ctrl+Z 撤销移位 x', back ? back.x : -999, 4, 3);
      var cnt = T.S.layers.length;
      window.dispatchEvent(new KeyboardEvent('keydown', { key:'z', ctrlKey:true, bubbles:true }));
      chk('再撤销一次删掉新建层', T.S.layers.length, cnt - 1);
      window.dispatchEvent(new KeyboardEvent('keydown', { key:'z', ctrlKey:true, shiftKey:true, bubbles:true }));
      chk('Ctrl+Shift+Z 重做', T.S.layers.length, cnt);
      var rback = T.S.layers.filter(function(x){ return x.id === nid; })[0];
      chkNear('重做后回到 4,4', rback ? rback.x : -999, 4, 3);
      window.dispatchEvent(new KeyboardEvent('keydown', { key:'z', ctrlKey:true, shiftKey:true, bubbles:true }));
      var rback2 = T.S.layers.filter(function(x){ return x.id === nid; })[0];
      chkNear('再重做回到 17,13', rback2 ? rback2.x : -999, 17, 3);
      for (var u = 0; u < 15; u++)
        window.dispatchEvent(new KeyboardEvent('keydown', { key:'z', ctrlKey:true, bubbles:true }));
      for (var rr = 0; rr < 15; rr++)
        window.dispatchEvent(new KeyboardEvent('keydown', { key:'z', ctrlKey:true, shiftKey:true, bubbles:true }));
      chk('连撤到底再连重做到顶', T.S.layers.length, cnt);

      /* Alt 点击穿透（放在撤销测试之后，因为它本身会产生一个撤销点） */
      var beforeSel = T.S.sel;
      fire('pointerdown', 24, 17, { altKey:true });
      fire('pointerup',   24, 17, { altKey:true });
      R.push((T.S.sel !== beforeSel ? 'PASS' : 'FAIL') +
             ' Alt 点击穿透到下一层 ' + beforeSel + ' -> ' + T.S.sel);
      var underCnt = T.S.layers.filter(function(x){
        return 24 >= x.x && 24 <= x.x + x.w && 17 >= x.y && 17 <= x.y + x.h;
      }).length;
      R.push((underCnt >= 2 ? 'PASS' : 'FAIL') + ' 该点确有 ' + underCnt + ' 层重叠（穿透才有意义）');

      /* ---------- 随机 ---------- */
      T.S.layers.forEach(function(x){ x.sat = 0; x.warm = 0; x._col = null; });
      document.getElementById('randStr').value = 40;
      T.S.randStrength = 40;
      document.getElementById('btnRandAll').click();
      R.push((T.S.layers.every(function(x){ return Math.abs(x.sat) <= 40 && Math.abs(x.warm) <= 40; })
              ? 'PASS' : 'FAIL') + ' 随机强度限制在 +-40 内');
      R.push((T.S.layers.some(function(x){ return x.sat !== 0 || x.warm !== 0; }) ? 'PASS' : 'FAIL') +
             ' 随机确实改变了数值');

      T.S.layers.forEach(function(x){ x.order = 'shuffle'; x._col = null; });
      var seedsBefore = T.S.layers.map(function(x){ return x.seed; }).join(',');
      document.getElementById('btnRandOrder').click();
      R.push((seedsBefore !== T.S.layers.map(function(x){ return x.seed; }).join(',') ? 'PASS' : 'FAIL') +
             ' 全部重掷乱序种子生效');

      /* ---------- H. UI ---------- */
      T.S.sel = T.S.layers[0].id;
      T.S.layers[0].order = 'none';
      T.render();
      var ph = document.getElementById('props').innerHTML;
      chk('属性面板含方块感控件', ph.indexOf('id="pBlockV"') >= 0, true);
      chk('属性面板含顺序模式', ph.indexOf('id="pOrder"') >= 0, true);
      chk('属性面板含饱和度', ph.indexOf('id="pSatV"') >= 0, true);
      chk('属性面板含冷暖度', ph.indexOf('id="pWarmV"') >= 0, true);
      chk('属性面板含本层随机按钮', ph.indexOf('id="pRand"') >= 0, true);
      T.S.layers[0].order = 'shuffle'; T.render();
      chk('切乱序后出现强度控件', document.getElementById('props').innerHTML.indexOf('id="pShufAmtV"') >= 0, true);
      T.S.layers[0].order = 'interleave'; T.render();
      chk('切间序后出现段数控件', document.getElementById('props').innerHTML.indexOf('id="pSegV"') >= 0, true);
      chk('图层列表行数（含源图层）', document.querySelectorAll('#layerlist .li').length, T.S.layers.length + 1);

      /* ---------- I. 方块感扩到 100 ---------- */
      /* ⚠️ 撤销/重做会把 S.layers 从 JSON 快照整体重建，之前持有的图层引用已经失效。
         这里必须按当前数组重新取，并把上一节测试留下的参数清零。 */
      L = T.S.layers[0];
      T.S.layers = [L];                       // 只留这一层：否则上面压着的 NL 会盖住采样点
      T.S.sel = L.id;
      L.order = 'none'; L.sat = 0; L.warm = 0; L.interSeg = 4; L.block = 1; L._col = null;
      T.render();
      chk('方块感测试前参数已复位',
          [L.order, L.sat, L.warm].join(','), 'none,0,0');
      chk('方块感测试只留单层', T.S.layers.length, 1);
      chk('矩形范围', [L.x,L.y,L.w,L.h].join(','), '10,10,40,30');

      L.block = 10; L._col = null;
      var e10 = T.buildExportCanvas(1,'transparent',true);
      var g10 = true;
      for (var q1 = 10; q1 <= 19; q1++) if (pick(e10,25,q1) !== rowColor(10)) g10 = false;
      R.push((g10 ? 'PASS' : 'FAIL') + ' block=10 第1..10行同为源行10');
      chk('block=10 第11行=源行20', pick(e10,25,20), rowColor(20));
      chk('block=10 第21行=源行30', pick(e10,25,30), rowColor(30));

      L.block = 100; L._col = null;       // h=30 < 100 → 整块一组
      var e100 = T.buildExportCanvas(1,'transparent',true);
      var g100 = true;
      for (var q2 = 10; q2 <= 39; q2++) if (pick(e100,25,q2) !== rowColor(10)) g100 = false;
      R.push((g100 ? 'PASS' : 'FAIL') + ' block=100 高度不足时整块统一取首行');

      L.block = 50; L._col = null;
      var e50 = T.buildExportCanvas(1,'transparent',true);
      var g50 = true;
      for (var q4 = 10; q4 <= 39; q4++) if (pick(e50,25,q4) !== rowColor(10)) g50 = false;
      R.push((g50 ? 'PASS' : 'FAIL') + ' block=50 同样整块取首行');
      L.block = 1; L._col = null;

      /* ---------- I2. 随机切点 / 网格 ---------- */
      var c0 = T.randomCuts(1000, 5, 0);
      chk('随机度0 = 完全等分', c0.join(','), '0,200,400,600,800,1000');
      chk('单个 = [0,total]', T.randomCuts(1000, 1, 1).join(','), '0,1000');
      var cj = T.randomCuts(1000, 8, 1);
      var segLens = [];
      for (var q3 = 0; q3 < 8; q3++) segLens.push(cj[q3+1] - cj[q3]);
      chk('随机切点首尾锚定', cj[0] + ',' + cj[8], '0,1000');
      R.push((cj.every(function(v,i){ return i === 0 || v > cj[i-1]; }) ? 'PASS' : 'FAIL') +
             ' 随机切点严格递增');
      var mn = Math.min.apply(null, segLens), mx = Math.max.apply(null, segLens);
      R.push((mx - mn > 40 ? 'PASS' : 'FAIL') + ' 随机度100 段长确实不均 got ' + mn + '~' + mx);
      var se = T.cutsToSegs([0,100,200], 200, 0);
      chk('重叠0 相邻不重叠', se[0].join(',') + ' | ' + se[1].join(','), '0,100 | 100,200');
      var so = T.cutsToSegs([0,100,200], 200, 1);
      chk('重叠100% 各向外扩半格', so[0].join(',') + ' | ' + so[1].join(','), '0,150 | 50,200');

      /* ---------- I3. 随机框 ---------- */
      /* 图是 100×60：宽 20~30% -> 20~30px，高 50~60% -> 30~36px */
      document.getElementById('rbWMin').value = '20';
      document.getElementById('rbWMax').value = '30';
      document.getElementById('rbHMin').value = '50';
      document.getElementById('rbHMax').value = '60';
      var rbs = T.randomBoxes(60);
      var inRange = rbs.every(function(r){
        return r.w >= 20 && r.w <= 30 && r.h >= 30 && r.h <= 36 &&
               r.x >= 0 && r.y >= 0 && r.x + r.w <= 100 && r.y + r.h <= 60;
      });
      R.push((inRange ? 'PASS' : 'FAIL') + ' 随机框尺寸/位置全部落在设定范围内');
      R.push((rbs.length === 60 ? 'PASS' : 'FAIL') + ' 随机框个数 got=' + rbs.length + ' want=60');
      var uniq = {}; rbs.forEach(function(r){ uniq[r.x + '_' + r.y] = 1; });
      R.push((Object.keys(uniq).length > 30 ? 'PASS' : 'FAIL') + ' 随机框位置确有分散 got=' + Object.keys(uniq).length + '/60');
      /* 宽高范围写反了要能自动纠正 */
      document.getElementById('rbWMin').value = '60';
      document.getElementById('rbWMax').value = '20';
      var fixed = T.randomBoxes(60);
      R.push((fixed.every(function(r){ return r.w >= 20 && r.w <= 60; }) ? 'PASS' : 'FAIL') +
             ' 最小>最大时自动交换 got 例=' + fixed[0].w);
      document.getElementById('rbWMin').value = '8';
      document.getElementById('rbWMax').value = '40';
      document.getElementById('rbHMin').value = '20';
      document.getElementById('rbHMax').value = '100';

      /* ---------- J. 垂直方向取样偏移（行渐变图，第 y 行纯色 rgb(4y,0,255-4y)） ---------- */
      T.S.layers = [];
      var VL = T.addLayer({ x:10, y:10, w:40, h:30 });
      VL.dir = 'v'; VL.block = 1; VL.order = 'none'; VL.sat = 0; VL.warm = 0;
      function vOff(off){
        VL.sampleOff = off; VL._col = null;
        return pick(T.buildExportCanvas(1,'transparent',true), 25, 20);
      }
      chk('垂直·偏移 0 → 居中行 y=25',    vOff(0),    rowColor(25));
      chk('垂直·偏移 −100 → 上边缘 y=10', vOff(-100), rowColor(10));
      chk('垂直·偏移 +100 → 下边缘 y=39', vOff(100),  rowColor(39));
      chk('垂直·偏移 −50 → y=18',         vOff(-50),  rowColor(18));
      VL.sampleOff = 0; VL._col = null;
      chk('垂直·整块纵向均匀', pick(T.buildExportCanvas(1,'transparent',true), 15, 39), rowColor(25));

      /* ---------- J2. 图层位置锁定 ---------- */
      var lk = T.addLayer({ x:40, y:5, w:30, h:30 });
      T.S.sel = lk.id; T.render();
      fire('pointerdown', 50, 15);
      fire('pointermove', 70, 25);
      fire('pointerup',   70, 25);
      R.push((Math.round(lk.x) !== 40 || Math.round(lk.y) !== 5 ? 'PASS' : 'FAIL') +
             ' 未锁定时可拖动 got=' + Math.round(lk.x) + ',' + Math.round(lk.y));
      lk.locked = true; lk.x = 40; lk.y = 5;
      fire('pointerdown', 50, 15);
      fire('pointermove', 75, 28);
      fire('pointerup',   75, 28);
      chk('锁定后拖不动', lk.x + ',' + lk.y, '40,5');
      R.push((T.S.sel !== lk.id ? 'PASS' : 'FAIL') + ' 锁定的层不能被点选中');
      T.S.sel = lk.id; T.render();
      chk('锁定后属性面板出现「解锁位置」', document.getElementById('props').innerHTML.indexOf('解锁位置') >= 0, true);
      chk('锁定后 X 输入框被禁用', document.getElementById('pX').disabled, true);
      fire('pointerdown', 96, 57); fire('pointerup', 96, 57);
      T.S.sel = lk.id;
      var kx = lk.x;
      window.dispatchEvent(new KeyboardEvent('keydown', { key:'ArrowRight', bubbles:true }));
      chk('锁定后方向键也不移动', lk.x, kx);
      lk.locked = false;

      /* ---------- J3. 图层复制 / 剪切 / 粘贴 ---------- */
      T.S.layers = [];
      var srcL = T.addLayer({ x:10, y:10, w:40, h:30 });
      srcL.dir = 'v'; srcL.block = 7; srcL.sat = 30; srcL.warm = -20;
      T.S.sel = srcL.id; T.render();
      T.copyLayer();
      chk('复制后剪贴板有内容', !!T.S.clipboard, true);
      var n0p = T.S.layers.length;
      T.pasteLayer();
      chk('粘贴后图层 +1', T.S.layers.length, n0p + 1);
      var pst = T.S.layers[T.S.layers.length - 1];
      chk('粘贴层是新对象', pst.id !== srcL.id, true);
      chk('粘贴层保留 dir', pst.dir, 'v');
      chk('粘贴层保留 block', pst.block, 7);
      chk('粘贴层保留 sat/warm', pst.sat + ',' + pst.warm, '30,-20');
      R.push((pst.x !== srcL.x || pst.y !== srcL.y ? 'PASS' : 'FAIL') +
             ' 粘贴位置有错开 got=' + pst.x + ',' + pst.y + ' 原始=' + srcL.x + ',' + srcL.y);
      T.pasteLayer();
      var pst2 = T.S.layers[T.S.layers.length - 1];
      R.push((pst2.x > pst.x ? 'PASS' : 'FAIL') + ' 连续粘贴逐次错开 got ' + pst.x + ' -> ' + pst2.x);
      chk('粘贴后自动选中新层', T.S.sel === pst2.id, true);
      var nCut = T.S.layers.length;
      T.S.sel = srcL.id;
      T.cutLayer();
      chk('剪切后图层 −1', T.S.layers.length, nCut - 1);
      T.pasteLayer();
      chk('剪切的内容能粘回来', T.S.layers.length, nCut);

      /* 走一遍真实键盘链路 */
      T.S.layers = [];
      var kbL = T.addLayer({ x:5, y:5, w:20, h:20 });
      T.S.sel = kbL.id;
      T.S.clipboard = null;
      window.dispatchEvent(new KeyboardEvent('keydown', { key:'c', ctrlKey:true, bubbles:true }));
      chk('Ctrl+C 生效', !!T.S.clipboard, true);
      window.dispatchEvent(new KeyboardEvent('keydown', { key:'v', ctrlKey:true, bubbles:true }));
      chk('Ctrl+V 生效', T.S.layers.length, 2);
      window.dispatchEvent(new KeyboardEvent('keydown', { key:'x', ctrlKey:true, bubbles:true }));
      chk('Ctrl+X 生效', T.S.layers.length, 1);
      window.dispatchEvent(new KeyboardEvent('keydown', { key:'v', ctrlKey:true, bubbles:true }));
      chk('Ctrl+X 后 Ctrl+V 复原数量', T.S.layers.length, 2);

      /* ---------- J4. 数值参数都能键盘输入 ---------- */
      T.S.layers = [];
      var nl = T.addLayer({ x:10, y:10, w:40, h:30 });
      nl.order = 'shuffle'; nl.block = 5;
      T.S.sel = nl.id; T.render();
      var numIds = ['pBlock','pOff','pSat','pWarm','pOp','pShufAmt','pShufBlk'];
      var allNum = true;
      numIds.forEach(function(id){
        var el = document.getElementById(id + 'V');
        if (!el || el.tagName !== 'INPUT' || el.type !== 'number') allNum = false;
      });
      R.push((allNum ? 'PASS' : 'FAIL') + ' 方块感/取样偏移/色彩/不透明度/乱序参数都有数字输入框');
      chk('饱和度数字框下限', document.getElementById('pSatV').min, '-100');
      chk('冷暖度数字框上限', document.getElementById('pWarmV').max, '100');
      chk('不透明度数字框上限', document.getElementById('pOpV').max, '100');
      chk('方块感数字框上限', document.getElementById('pBlockV').max, '100');
      var satBox = document.getElementById('pSatV');
      satBox.value = '55';
      satBox.dispatchEvent(new Event('change', { bubbles: true }));
      chk('直接改饱和度数字框写回图层', nl.sat, 55);
      var offBox = document.getElementById('pOffV');
      offBox.value = '-40';
      offBox.dispatchEvent(new Event('change', { bubbles: true }));
      chk('直接改取样偏移数字框写回图层', nl.sampleOff, -40);
      var opBox = document.getElementById('pOpV');
      opBox.value = '42';
      opBox.dispatchEvent(new Event('change', { bubbles: true }));
      R.push((Math.abs(nl.opacity - 0.42) < 0.001 ? 'PASS' : 'FAIL') +
             ' 直接改不透明度数字框写回图层 got=' + nl.opacity);

      /* ---------- J5. 默认方向 / Shift 反转 ---------- */
      chk('默认方向下拉存在', !!document.getElementById('newDir'), true);
      var nd = document.getElementById('newDir');
      nd.value = 'v'; nd.onchange.call(nd);
      T.S.layers = []; T.S.sel = null;
      fire('pointerdown', 10, 10);
      fire('pointermove', 50, 40);
      fire('pointerup',   50, 40);
      chk('新框采用默认方向 v', T.S.layers[T.S.layers.length-1].dir, 'v');
      /* ⚠️ 起点要避开刚建的那层，否则会命中它变成拖动而不是画新框 */
      fire('pointerdown', 55, 5, { shiftKey:true });
      fire('pointermove', 95, 50, { shiftKey:true });
      fire('pointerup',   95, 50, { shiftKey:true });
      chk('Shift 临时反转成 h', T.S.layers[T.S.layers.length-1].dir, 'h');
      nd.value = 'h'; nd.onchange.call(nd);

      /* ---------- J6. 小地图 ---------- */
      chk('小地图容器存在', !!document.getElementById('nav'), true);
      T.render();
      chk('小地图已显示', document.getElementById('nav').classList.contains('show'), true);
      R.push((document.getElementById('navcv').width > 0 ? 'PASS' : 'FAIL') +
             ' 小地图画布有尺寸 got=' + document.getElementById('navcv').width);
      var navCvEl = document.getElementById('navcv');
      T.S.view.tx = 0; T.S.view.ty = 0;
      var navR = navCvEl.getBoundingClientRect();
      navCvEl.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles:true, cancelable:true, pointerId:9,
        clientX: navR.left + navR.width * 0.85, clientY: navR.top + navR.height * 0.8
      }));
      navCvEl.dispatchEvent(new PointerEvent('pointerup', { bubbles:true, pointerId:9 }));
      R.push((T.S.view.tx !== 0 ? 'PASS' : 'FAIL') +
             ' 拖小地图能平移画布 tx=0 -> ' + T.S.view.tx.toFixed(1));
      /* 右键拖拽平移 */
      T.S.view.tx = 0; T.S.view.ty = 0;
      var pv0 = toScreen(50, 30);
      var vpR = VP.getBoundingClientRect();
      VP.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, cancelable:true,
        pointerId:11, button:2, buttons:2, clientX: vpR.left+pv0.x, clientY: vpR.top+pv0.y }));
      VP.dispatchEvent(new PointerEvent('pointermove', { bubbles:true, cancelable:true,
        pointerId:11, button:2, buttons:2, clientX: vpR.left+pv0.x-60, clientY: vpR.top+pv0.y-40 }));
      VP.dispatchEvent(new PointerEvent('pointerup', { bubbles:true, cancelable:true,
        pointerId:11, button:2, buttons:0, clientX: vpR.left+pv0.x-60, clientY: vpR.top+pv0.y-40 }));
      R.push((Math.round(T.S.view.tx) === -60 && Math.round(T.S.view.ty) === -40 ? 'PASS' : 'FAIL') +
             ' 右键拖拽平移画布 got=' + Math.round(T.S.view.tx) + ',' + Math.round(T.S.view.ty) + ' want=-60,-40');

      /* ---------- J7. 设置面板 ---------- */
      chk('设置按钮存在', !!document.getElementById('btnSettings'), true);
      chk('设置弹层存在', !!document.getElementById('modalSettings'), true);
      chk('设置里五行（2 界面偏好 + 3 目录）', document.querySelectorAll('#modalSettings .setrow').length, 5);
      var st = T.settings();
      chk('设置对象含三个目录键',
          ['importDir','exportDir','projectDir'].every(function(k){ return k in st; }), true);
      /* 浏览器版 isDesktop=false；打包版有 preload 注入的 window.desktop=true。
         这里断言两者一致，同一份测试就能同时跑在浏览器和 exe 里。 */
      var hasBridge = !!(window.desktop && window.desktop.isDesktop);
      chk('isDesktop 与 preload 注入一致', T.isDesktop, hasBridge);
      if (hasBridge){
        R.push((typeof window.desktop.openImage === 'function' &&
                typeof window.desktop.openProject === 'function' &&
                typeof window.desktop.pickFolder === 'function' ? 'PASS' : 'FAIL') +
               ' 桌面版 IPC 接口齐全');
      } else {
        R.push('PASS 浏览器版无需 IPC 接口');
      }

      /* ---------- J8. 智能框选确实已被移除 ---------- */
      chk('智能框选按钮已删除', document.getElementById('btnSmartBox'), 'null');
      chk('随机框选按钮仍在', !!document.getElementById('btnRandBox'), true);
      R.push((typeof T.smartBoxes === 'undefined' && typeof T.getSaliency === 'undefined'
              ? 'PASS' : 'FAIL') + ' 显著性检测相关接口已彻底移除');

      /* ---------- K. UI 重构：主题 / 缩略图 / 分段控件 / 滑杆 / 折叠分组 / 列宽 ---------- */
      var rootEl = document.documentElement;
      if (!T.S.layers.length) T.addLayer({ x:10, y:10, w:40, h:30 });
      T.S.sel = T.S.layers[0].id;
      T.render();

      /* K1 主题：token 必须真的变，且画布配色跟着走 */
      var theme0 = rootEl.getAttribute('data-theme');
      var bg0 = getComputedStyle(document.querySelector('aside.left')).backgroundColor;
      document.getElementById('btnTheme').click();
      var theme1 = rootEl.getAttribute('data-theme');
      var bg1 = getComputedStyle(document.querySelector('aside.left')).backgroundColor;
      R.push((theme0 !== theme1 ? 'PASS' : 'FAIL') + ' 主题切换改写 data-theme ' + theme0 + ' -> ' + theme1);
      R.push((bg0 !== bg1 ? 'PASS' : 'FAIL') + ' 主题切换改变面板底色 ' + bg0 + ' -> ' + bg1);
      chk('主题图标跟随', document.querySelector('#btnTheme use').getAttribute('href'),
          theme1 === 'light' ? '#i-sun' : '#i-moon');
      document.getElementById('btnTheme').click();
      chk('主题可切回', rootEl.getAttribute('data-theme'), theme0);

      /* K2 图层缩略图：每行一张，且真的画了东西 */
      var thumbs = document.querySelectorAll('#layerlist .li .th canvas');
      chk('每个图层行都有缩略图', thumbs.length, T.S.layers.length + 1);
      R.push((thumbs.length > 1 && thumbs[1].width > 0 ? 'PASS' : 'FAIL') +
             ' 缩略图尺寸 ' + (thumbs[1] ? thumbs[1].width + 'x' + thumbs[1].height : 'none'));
      var thPx = thumbs[1] ? thumbs[1].getContext('2d').getImageData(
        Math.floor(thumbs[1].width/2), Math.floor(thumbs[1].height/2), 1, 1).data : [0,0,0,0];
      R.push((thPx[3] > 0 ? 'PASS' : 'FAIL') + ' 缩略图不是空白 alpha=' + thPx[3]);

      /* K3 左侧分段控件 */
      document.querySelector('#autoSeg button[data-pane="rand"]').click();
      chk('切到随机框选面板', getComputedStyle(document.getElementById('paneRand')).display, 'block');
      chk('网格面板被隐藏', getComputedStyle(document.getElementById('paneGrid')).display, 'none');
      document.querySelector('#autoSeg button[data-pane="grid"]').click();
      chk('切回网格面板', getComputedStyle(document.getElementById('paneGrid')).display, 'block');

      /* K4 方向分段控件（门面是按钮，真值仍在 select 里） */
      document.querySelector('#dirSeg button[data-dir="v"]').click();
      chk('方向分段写入 newDir', document.getElementById('newDir').value, 'v');
      chk('方向分段同步高亮',
          document.querySelector('#dirSeg button[data-dir="v"]').classList.contains('on'), true);
      document.querySelector('#dirSeg button[data-dir="h"]').click();
      chk('方向分段可切回', document.getElementById('newDir').value, 'h');

      /* K5 属性面板不再有滑杆，只剩「小图标拖拽 + 数字框」 */
      chk('属性面板里没有滑杆', document.querySelectorAll('#props input[type=range]').length, 0);
      var icoFor = document.querySelectorAll('#props [data-scrub]');
      R.push((icoFor.length >= 6 ? 'PASS' : 'FAIL') + ' 参数小图标数量 ' + icoFor.length + '（应 >= 6）');
      var satIco = document.querySelector('#props [data-scrub="pSatV"]');
      chk('图标指向自己的数字框',
          satIco ? satIco.getAttribute('data-scrub') : 'none', 'pSatV');
      chk('图标是 svg', satIco ? satIco.tagName.toLowerCase() : 'none', 'svg');
      R.push((getComputedStyle(document.querySelector('#props .cell>label')).cursor !== 'ew-resize'
              ? 'PASS' : 'FAIL') + ' 文字标签不再当拖拽热区');

      /* K6 折叠分组 */
      var grps = document.querySelectorAll('#props details[data-grp]');
      chk('属性面板 6 个分组', grps.length, 6);
      var gc = document.querySelector('#props details[data-grp="color"]');
      chk('色彩组默认展开', gc.open, true);
      gc.open = false;
      gc.dispatchEvent(new Event('toggle'));
      T.render();
      chk('折叠状态在重渲染后保持',
          document.querySelector('#props details[data-grp="color"]').open, false);
      document.querySelector('#props details[data-grp="color"]').open = true;
      document.querySelector('#props details[data-grp="color"]').dispatchEvent(new Event('toggle'));

      /* K7 侧栏列宽拖拽 + 双击复位 */
      var rz = document.getElementById('rzL');
      var w0 = parseInt(getComputedStyle(rootEl).getPropertyValue('--w-left-base'), 10);
      var rzr = rz.getBoundingClientRect();
      rz.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, cancelable:true,
        pointerId:21, clientX: rzr.left + 3, clientY: 300 }));
      rz.dispatchEvent(new PointerEvent('pointermove', { bubbles:true,
        pointerId:21, clientX: rzr.left + 43, clientY: 300 }));
      rz.dispatchEvent(new PointerEvent('pointerup', { bubbles:true,
        pointerId:21, clientX: rzr.left + 43, clientY: 300 }));
      var w1 = parseInt(getComputedStyle(rootEl).getPropertyValue('--w-left-base'), 10);
      R.push((w1 === w0 + 40 ? 'PASS' : 'FAIL') + ' 拖拽把手改变列宽 ' + w0 + ' -> ' + w1);
      rz.dispatchEvent(new MouseEvent('dblclick', { bubbles:true }));
      chk('双击复位列宽', parseInt(getComputedStyle(rootEl).getPropertyValue('--w-left-base'), 10), 250);

      /* K8 源图层的眼睛是真开关 */
      T.render();
      var srcEye = document.querySelector('#layerlist .li .eye');
      var showBefore = T.S.showSrc;
      srcEye.click();
      chk('源图层眼睛切换原图显示', T.S.showSrc, !showBefore);
      chk('右侧「显示原图」勾选同步', document.getElementById('srcVisible').checked, !showBefore);
      document.querySelector('#layerlist .li .eye').click();
      chk('再点一次切回来', T.S.showSrc, showBefore);

      /* K9 数值框：干掉原生 spinner、单位做成后缀 */
      var numEl = document.getElementById('pBlockV');
      var appr = getComputedStyle(numEl).appearance || getComputedStyle(numEl).webkitAppearance;
      chk('数字框隐藏原生 spinner', appr, 'textfield');
      chk('数字框无边框（靠填充分层）', getComputedStyle(numEl).borderTopWidth, '0px');
      var sfxEl = numEl.parentNode.querySelector('.sfx');
      chk('数值框右侧有单位后缀', sfxEl ? sfxEl.textContent : 'none', 'px');
      chk('后缀不吃鼠标事件', getComputedStyle(sfxEl).pointerEvents, 'none');

      /* K10 拖标签改数值（Figma scrub） + 双击复位 */
      var lab = document.querySelector('#props [data-scrub="pBlockV"]');
      var boxP = document.getElementById('pBlockV');
      var defV = parseFloat(lab.getAttribute('data-def'));
      chk('图标带默认值', isFinite(defV), true);
      boxP.value = '20'; boxP.dispatchEvent(new Event('change', { bubbles:true }));
      chk('键盘输入写回图层', T.S.layers[0].block, 20);
      lab.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, cancelable:true,
        pointerId:31, button:0, clientX:300, clientY:400 }));
      lab.dispatchEvent(new PointerEvent('pointermove', { bubbles:true,
        pointerId:31, clientX:310, clientY:400 }));
      chk('拖动中图标高亮', lab.classList.contains('scrubbing'), true);
      lab.dispatchEvent(new PointerEvent('pointerup', { bubbles:true,
        pointerId:31, clientX:310, clientY:400 }));
      chk('拖图标 +10px 后数值 +10', T.S.layers[0].block, 30);
      chk('松手后高亮消失', lab.classList.contains('scrubbing'), false);
      lab.dispatchEvent(new MouseEvent('dblclick', { bubbles:true }));
      chk('双击图标回到默认值', T.S.layers[0].block, defV);

      /* K11 静态参数行：只剩一个数字框，可直接键盘输入 */
      chk('网格参数不再有孪生数字框', document.querySelectorAll('#gridJitV').length, 0);
      var gj = document.getElementById('gridJit');
      gj.value = '70'; gj.dispatchEvent(new Event('change', { bubbles:true }));
      chk('网格参数可直接键盘输入', gj.value, '70');
      gj.value = '45'; gj.dispatchEvent(new Event('change', { bubbles:true }));

      /* K12 撤销：改完参数、焦点还留在控件里时，Ctrl+Z 仍必须生效。
         这是用户报的「撤回不了饱和度」的回归测试 —— 根因是 keydown 里
         的 if (inField) return 排在了 Ctrl+Z 之前，把整条快捷键吞掉了。 */
      T.S.layers = [];
      var L3 = T.addLayer({ x:14, y:14, w:40, h:30 });
      T.S.sel = L3.id; T.render();
      var satB = document.getElementById('pSatV');
      satB.value = '70';
      satB.dispatchEvent(new Event('change', { bubbles:true }));
      satB.focus();
      chk('改饱和度写回图层', T.S.layers[0].sat, 70);
      chk('焦点确实在数字框里', document.activeElement === satB, true);
      window.dispatchEvent(new KeyboardEvent('keydown', { key:'z', ctrlKey:true, bubbles:true }));
      chk('控件有焦点时 Ctrl+Z 仍能撤销', T.S.layers[0].sat, 0);

      /* 拖拽标签产生的改动同样要能撤销 */
      var labW = document.querySelector('#props [data-scrub="pWarmV"]');
      var warmB = document.getElementById('pWarmV');
      warmB.value = '10'; warmB.dispatchEvent(new Event('change', { bubbles:true }));
      chk('先把冷暖度设为 10', T.S.layers[0].warm, 10);
      labW.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, cancelable:true,
        pointerId:41, button:0, clientX:400, clientY:400 }));
      labW.dispatchEvent(new PointerEvent('pointermove', { bubbles:true,
        pointerId:41, clientX:425, clientY:400 }));
      labW.dispatchEvent(new PointerEvent('pointerup', { bubbles:true,
        pointerId:41, clientX:425, clientY:400 }));
      chk('拖动标签把冷暖度改到 35', T.S.layers[0].warm, 35);
      window.dispatchEvent(new KeyboardEvent('keydown', { key:'z', ctrlKey:true, bubbles:true }));
      chk('拖动标签的改动可撤销（回到拖动前）', T.S.layers[0].warm, 10);

      /* K13 滚轮：普通滚 = 平移画布，Ctrl+滚 = 缩放（Figma 行为） */
      var vpEl = document.getElementById('viewport');
      var s0 = T.S.view.s, ty0 = T.S.view.ty;
      vpEl.dispatchEvent(new WheelEvent('wheel', { bubbles:true, cancelable:true,
        deltaY:120, deltaX:0, clientX:200, clientY:200 }));
      chk('普通滚轮不改缩放', T.S.view.s, s0);
      R.push((Math.abs(T.S.view.ty - (ty0 - 120)) < 1.5 ? 'PASS' : 'FAIL') +
             ' 普通滚轮纵向平移画布 Δ=' + Math.round(T.S.view.ty - ty0));
      vpEl.dispatchEvent(new WheelEvent('wheel', { bubbles:true, cancelable:true,
        deltaY:-120, deltaX:0, ctrlKey:true, clientX:200, clientY:200 }));
      R.push((T.S.view.s > s0 ? 'PASS' : 'FAIL') +
             ' Ctrl+滚轮放大 ' + s0.toFixed(3) + ' -> ' + T.S.view.s.toFixed(3));

      /* K14 Ctrl+\ 隐藏 / 恢复面板。
         反斜杠在生成器的模板字符串里会被吃掉一层转义，直接用码点拼。 */
      var BS = String.fromCharCode(92);
      chk('初始未隐藏面板', document.body.classList.contains('hide-ui'), false);
      window.dispatchEvent(new KeyboardEvent('keydown', { key:BS, code:'Backslash',
        ctrlKey:true, bubbles:true }));
      chk('Ctrl+\\ 隐藏面板', document.body.classList.contains('hide-ui'), true);
      chk('隐藏后侧栏不可见',
          getComputedStyle(document.querySelector('aside.left')).display, 'none');
      window.dispatchEvent(new KeyboardEvent('keydown', { key:BS, code:'Backslash',
        ctrlKey:true, bubbles:true }));
      chk('再按一次恢复', document.body.classList.contains('hide-ui'), false);

      /* K15 两列参数布局：短标签一行两个 */
      T.S.sel = T.S.layers[0].id; T.render();
      var twoCol = 0;
      Array.prototype.forEach.call(document.querySelectorAll('#props .cells'), function(c){
        if (c.querySelectorAll('.cell').length === 2) twoCol++;
      });
      R.push((twoCol >= 2 ? 'PASS' : 'FAIL') + ' 两列参数行 ' + twoCol + ' 组（应 >= 2）');
      var satCells = document.getElementById('pSatV').closest('.cells');
      var warmCells = document.getElementById('pWarmV').closest('.cells');
      chk('饱和度与冷暖度同一行', satCells === warmCells, true);
      chk('色温行有两个单元', satCells.querySelectorAll('.cell').length, 2);
      var xyCells = document.getElementById('pX').closest('.cells');
      chk('X 与 Y 同一行', xyCells === document.getElementById('pY').closest('.cells'), true);

      /* K16 几何参数也能拖标签改值 */
      var xLab = document.querySelector('#props [data-scrub="pX"]');
      var xBox = document.getElementById('pX');
      var x0v = parseFloat(xBox.value);
      xLab.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, cancelable:true,
        pointerId:51, button:0, clientX:200, clientY:300 }));
      xLab.dispatchEvent(new PointerEvent('pointermove', { bubbles:true,
        pointerId:51, clientX:212, clientY:300 }));
      xLab.dispatchEvent(new PointerEvent('pointerup', { bubbles:true,
        pointerId:51, clientX:212, clientY:300 }));
      chk('拖 X 图标使 x +12', T.S.layers[0].x, x0v + 12);
      chk('X 输入框同步', parseFloat(xBox.value), x0v + 12);

      /* K17 图层行放大（仅图层列表） */
      var liH = document.querySelector('#layerlist .li').getBoundingClientRect().height;
      R.push((liH >= 44 ? 'PASS' : 'FAIL') + ' 图层行高度 ' + Math.round(liH) + 'px（应 >= 44）');

      /* K18 展开动画依赖的能力 */
      chk('支持 details 高度过渡', CSS.supports('interpolate-size', 'allow-keywords'), true);

      /* ---------- L. 多选 / 合集 / 锁定层对指针透明 ---------- */
      T.S.layers = []; T.render();
      var a1 = T.addLayer({ x:10, y:10, w:20, h:20 });
      var a2 = T.addLayer({ x:40, y:10, w:20, h:20 });
      var a3 = T.addLayer({ x:70, y:10, w:20, h:20 });
      var bx = function(id){ return T.S.layers.filter(function(L){ return L.id === id; })[0]; };

      /* L1 多选与成组 */
      T.setSel([a1.id, a2.id], a2.id);
      chk('多选集合长度', T.selSet().length, 2);
      chk('主选中是最后点的那个', T.S.sel, a2.id);
      T.groupSelected();
      chk('成组后共用同一个 gid', !!a1.gid && a1.gid === a2.gid, true);
      chk('没选中的层不进组', a3.gid, null);
      chk('合集记录已创建', !!T.S.groups[a1.gid], true);
      chk('组内成员在数组里连续', Math.abs(T.S.layers.indexOf(a1) - T.S.layers.indexOf(a2)), 1);
      chk('列表出现组头', document.querySelectorAll('#layerlist .grp-row').length, 1);
      chk('组内行带缩进', document.querySelectorAll('#layerlist .li.in-grp').length, 2);
      R.push((document.querySelector('#layerlist .grp-row .meta').textContent.indexOf('2') >= 0
              ? 'PASS' : 'FAIL') + ' 组头显示层数');

      /* L2 折叠只留组头 */
      T.S.groups[a1.gid].collapsed = true; T.render();
      chk('折叠后组内行隐藏', document.querySelectorAll('#layerlist .li.in-grp').length, 0);
      chk('折叠后组头还在', document.querySelectorAll('#layerlist .grp-row').length, 1);
      T.S.groups[a1.gid].collapsed = false; T.render();

      /* L3 多选整体拖动：拖其中一个，选中的都跟着走，没选的不动 */
      var pa1 = a1.x, pa2 = a2.x, pa3 = a3.x;
      fire('pointerdown', a1.x + 10, a1.y + 10);
      fire('pointermove', a1.x + 10 + 12, a1.y + 10);
      fire('pointerup',   a1.x + 10 + 12, a1.y + 10);
      chk('被拖的层右移 12', bx(a1.id).x, pa1 + 12);
      chk('同组另一层同步右移', bx(a2.id).x, pa2 + 12);
      chk('没选中的层不动', bx(a3.id).x, pa3);

      /* L4 解散合集 */
      T.setSel([bx(a1.id).id, bx(a2.id).id]);
      T.ungroupSelected();
      chk('解散后 gid 清空', bx(a1.id).gid, null);
      chk('合集记录被删除', Object.keys(T.S.groups).length, 0);
      chk('组头消失', document.querySelectorAll('#layerlist .grp-row').length, 0);

      /* L5 锁定层对指针透明：点不中、但能从它上面起画新框 */
      var lk1 = bx(a1.id);
      lk1.locked = true;
      T.setSel([]); T.render();
      fire('pointerdown', lk1.x + 10, lk1.y + 10);
      fire('pointerup',   lk1.x + 10, lk1.y + 10);
      chk('点击锁定层不会选中它', T.S.sel, 'null');
      var cnt0 = T.S.layers.length;
      fire('pointerdown', lk1.x + 2, lk1.y + 2);
      fire('pointermove', lk1.x + 17, lk1.y + 17);
      fire('pointerup',   lk1.x + 17, lk1.y + 17);
      chk('可以从锁定层上开始拖新框', T.S.layers.length, cnt0 + 1);
      bx(a1.id).locked = false;

      /* ---------- N. 数值调整方式 / UI 缩放 / 锁定按钮 / 合并形状 ---------- */
      T.S.layers = [];
      var n1 = T.addLayer({ x:10, y:10, w:20, h:20 });
      T.S.sel = n1.id; T.render();

      /* N1 三种数值调整方式 */
      chk('默认拖图标模式', document.body.getAttribute('data-num'), 'icon');
      var anyBar = document.querySelector('#props .cell .sbar');
      chk('数值单元里有数据条', !!anyBar, true);
      chk('图标模式隐藏数据条', getComputedStyle(anyBar).display, 'none');
      document.querySelector('#segNumMode button[data-num="bar"]').click();
      chk('切到数据条模式', document.body.getAttribute('data-num'), 'bar');
      chk('数据条显示', getComputedStyle(document.querySelector('#props .cell .sbar')).display, 'block');
      chk('图标隐藏', getComputedStyle(document.querySelector('#props .cell .cell-ico')).display, 'none');

      /* 锚点：仅数据条模式常驻；两者都有时只在悬停 / 拖动时浮现 */
      var knobEl = document.querySelector('#props .sbar[data-scrub="pBlockV"]>b');
      chk('数据条有锚点', !!knobEl, true);
      knobEl.style.transition = 'none';           // 关掉过渡，读到的才是终值
      chk('仅数据条模式锚点常驻', getComputedStyle(knobEl).opacity, '1');

      document.querySelector('#segNumMode button[data-num="both"]').click();
      R.push((getComputedStyle(document.querySelector('#props .cell .cell-ico')).display !== 'none'
              ? 'PASS' : 'FAIL') + ' 两者都有：图标可见');
      R.push((getComputedStyle(document.querySelector('#props .cell .sbar')).display !== 'none'
              ? 'PASS' : 'FAIL') + ' 两者都有：数据条可见');
      chk('两者都有时锚点默认隐藏', getComputedStyle(knobEl).opacity, '0');
      var barTmp = document.querySelector('#props .sbar[data-scrub="pBlockV"]');
      barTmp.classList.add('scrubbing');
      chk('拖动时锚点浮现', getComputedStyle(knobEl).opacity, '1');
      barTmp.classList.remove('scrubbing');

      /* N2 拖数据条改数值 */
      var barEl = barTmp;
      var bv0 = T.S.layers[0].block;
      barEl.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true, cancelable:true,
        pointerId:61, button:0, clientX:300, clientY:500 }));
      barEl.dispatchEvent(new PointerEvent('pointermove', { bubbles:true,
        pointerId:61, clientX:308, clientY:500 }));
      barEl.dispatchEvent(new PointerEvent('pointerup', { bubbles:true,
        pointerId:61, clientX:308, clientY:500 }));
      chk('拖数据条 +8px 后数值 +8', T.S.layers[0].block, bv0 + 8);
      var fillW = parseInt(document.querySelector('#props .sbar[data-scrub="pBlockV"]>i').style.width, 10);
      R.push((fillW > 0 ? 'PASS' : 'FAIL') + ' 数据条填充跟随数值 ' + fillW + '%');
      var pv = parseFloat(document.querySelector('#props .sbar[data-scrub="pBlockV"]').style.getPropertyValue('--p'));
      R.push((Math.abs(pv - fillW) < 1.5 ? 'PASS' : 'FAIL') +
             ' 锚点位置跟着数值走 got=' + pv.toFixed(1) + '%');

      /* 数据条只是拖拽区，不改鼠标形状；也不应该在悬停时把底槽弄丢 */
      var barCss = getComputedStyle(document.querySelector('#props .sbar[data-scrub="pBlockV"]'));
      R.push((barCss.cursor !== 'ew-resize' ? 'PASS' : 'FAIL') + ' 数据条不改鼠标形状 got=' + barCss.cursor);
      var barBg = barCss.backgroundColor;
      R.push((barBg && barBg !== 'rgba(0, 0, 0, 0)' && barBg !== 'transparent'
              ? 'PASS' : 'FAIL') + ' 数据条底槽有颜色 got=' + barBg);
      var icoCss = getComputedStyle(document.querySelector('#props .cell .cell-ico'));
      chk('小图标仍然是左右拖光标', icoCss.cursor, 'ew-resize');

      document.querySelector('#segNumMode button[data-num="icon"]').click();
      chk('切回图标模式', document.body.getAttribute('data-num'), 'icon');

      /* N3 UI 缩放两档 */
      var wBefore = document.querySelector('aside.left').getBoundingClientRect().width;
      document.querySelector('#segUiScale button[data-ui="1.3"]').click();
      var wBig = document.querySelector('aside.left').getBoundingClientRect().width;
      chk('--ui 已生效',
          getComputedStyle(document.documentElement).getPropertyValue('--ui').trim(), '1.3');
      R.push((Math.abs(wBig - wBefore * 1.3) < 2 ? 'PASS' : 'FAIL') +
             ' 放大后侧栏宽度 ' + Math.round(wBefore) + ' -> ' + Math.round(wBig));
      chk('放大后字号也变大',
          parseFloat(getComputedStyle(document.querySelector('#props label')).fontSize) > 12, true);
      document.querySelector('#segUiScale button[data-ui="1"]').click();
      R.push((Math.abs(document.querySelector('aside.left').getBoundingClientRect().width - wBefore) < 2
              ? 'PASS' : 'FAIL') + ' 恢复标准尺寸');

      /* N4 图层行的锁定按钮 */
      var rows = document.querySelectorAll('#layerlist .li');
      var lkBtn = document.querySelector('#layerlist .li .lk');
      chk('图层行有常驻锁定按钮', !!lkBtn, true);
      chk('锁定按钮在眼睛左边',
          lkBtn.nextElementSibling.classList.contains('eye'), true);
      var lockedBefore = T.S.layers[0].locked;
      lkBtn.click();
      chk('点击切换锁定', T.S.layers[0].locked, !lockedBefore);
      document.querySelector('#layerlist .li .lk').click();
      chk('再点一次解锁', T.S.layers[0].locked, lockedBefore);

      /* N5 合并形状：拼一个 L 形，右下角应该是空的 */
      T.S.layers = [];
      var s1 = T.addLayer({ x:10, y:10, w:20, h:40 });    // 竖条
      var s2 = T.addLayer({ x:10, y:40, w:40, h:20 });    // 横条（右下延伸）
      T.setSel([s1.id, s2.id], s2.id);
      T.mergeSelectedShapes();
      chk('合并后只剩 1 层', T.S.layers.length, 1);
      var mg = T.S.layers[0];
      chk('合并层包围盒宽', Math.round(mg.w), 40);
      chk('合并层包围盒高', Math.round(mg.h), 50);
      chk('合并层有 2 块', mg.parts ? mg.parts.length : 0, 2);
      chk('合并层名字', mg.name, '合并形状');
      R.push((Array.prototype.some.call(document.querySelectorAll('#layerlist .li .meta'),
              function(e){ return e.textContent.indexOf('合并 2 块') >= 0; })
              ? 'PASS' : 'FAIL') + ' 图层行标出合并块数');
      var exM = T.buildExportCanvas(1, 'transparent', false);
      var gM = exM.getContext('2d');
      chk('L 形竖条内有像素', gM.getImageData(15, 15, 1, 1).data[3], 255);
      chk('L 形横条内有像素', gM.getImageData(45, 55, 1, 1).data[3], 255);
      chk('L 形右下角被裁掉', gM.getImageData(35, 15, 1, 1).data[3], 0);
      chk('L 形外接框之外也是空的', gM.getImageData(5, 5, 1, 1).data[3], 0);

      /* ---------- P. 浮层控件 / 动效 ---------- */
      /* P1 左下角缩放条：以前点不动，因为 pointerdown 冒泡到视口抢了指针捕获 */
      var sBak = T.S.view.s;
      document.getElementById('zIn').click();
      R.push((T.S.view.s > sBak ? 'PASS' : 'FAIL') +
             ' 缩放条「+」生效 ' + sBak.toFixed(2) + ' -> ' + T.S.view.s.toFixed(2));
      document.getElementById('zOut').click();
      R.push((Math.abs(T.S.view.s - sBak) < 1e-6 ? 'PASS' : 'FAIL') +
             ' 缩放条「−」回到原值 got=' + T.S.view.s.toFixed(3));
      document.getElementById('zFit').click();
      chk('缩放条「适应」可用', T.S.view.s > 0, true);
      var zVal = document.getElementById('zVal').textContent;
      R.push((/%$/.test(zVal) ? 'PASS' : 'FAIL') + ' 缩放读数已更新 ' + zVal);

      /* P2 自绘下拉 */
      T.S.layers = [];
      var d1 = T.addLayer({ x:12, y:12, w:40, h:30 });
      T.S.sel = d1.id; T.render();
      var ddEl = document.querySelector('#props .dd');
      chk('属性面板有自绘下拉', !!ddEl, true);
      var selDir2 = document.getElementById('pDir');
      chk('原生 select 仍作数据源', !!selDir2, true);
      chk('下拉默认收起', ddEl.classList.contains('open'), false);
      ddEl.querySelector('.dd-btn').click();
      chk('点击后展开', document.querySelector('#props .dd').classList.contains('open'), true);
      /* 展开后列表被搬到 body 上了，按 .dd-list.open 取 */
      var opts = document.querySelectorAll('.dd-list.open .dd-opt');
      chk('选项数与原 select 一致', opts.length, selDir2.options.length);
      var wantVal = selDir2.options[1].value, wantTxt = selDir2.options[1].textContent;
      opts[1].click();
      chk('选第二项后 select 值变了', selDir2.value, wantVal);
      chk('选完自动收起', document.querySelector('#props .dd').classList.contains('open'), false);
      chk('按钮文字跟随选中项',
          document.querySelector('#props .dd .dd-btn span').textContent, wantTxt);
      chk('方向切换真的写回图层', T.S.layers[0].dir, wantVal);

      /* P3 弹窗动效 */
      document.getElementById('btnSettings').click();
      chk('设置弹窗有弹出动画',
          getComputedStyle(document.querySelector('#modalSettings .cardm')).animationName, 'pop');
      chk('遮罩有淡入动画',
          getComputedStyle(document.getElementById('modalSettings')).animationName, 'scrim');
      document.getElementById('setClose').click();

      /* P4 弹窗好关：叉 / Esc / 底部按钮不在滚动区 */
      var helpX = document.querySelector('#modalHelp .modal-x');
      chk('快捷键弹窗右上角有叉', !!helpX, true);
      chk('内容区独立滚动',
          getComputedStyle(document.querySelector('#modalHelp .cardm-body')).overflowY, 'auto');
      chk('「知道了」不在滚动区里',
          document.getElementById('helpOk').closest('.cardm-body'), null);
      document.getElementById('btnHelp').click();
      chk('快捷键弹窗已打开',
          document.getElementById('modalHelp').classList.contains('show'), true);
      window.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true }));
      chk('Esc 能关掉快捷键弹窗',
          document.getElementById('modalHelp').classList.contains('show'), false);
      document.getElementById('btnSettings').click();
      document.querySelector('#modalSettings .modal-x').click();
      chk('右上角叉能关设置',
          document.getElementById('modalSettings').classList.contains('show'), false);

      /* P5 分段控件用滑动的色块，不是各自换底色 */
      var segU = document.getElementById('segUiScale');
      var thumb = segU.querySelector('.seg-thumb');
      chk('分段控件有滑块', !!thumb, true);
      chk('滑块按按钮数分列', segU.style.getPropertyValue('--n'), '3');
      chk('滑块默认停在第一个', segU.style.getPropertyValue('--i'), '0');
      document.querySelector('#segUiScale button[data-ui="1.15"]').click();
      chk('选中第二项后滑块跟过去', segU.style.getPropertyValue('--i'), '1');
      document.querySelector('#segUiScale button[data-ui="1"]').click();
      chk('回到第一个', segU.style.getPropertyValue('--i'), '0');

      /* ---------- M. 启动页 / 项目库 ---------- */
      chk('启动页存在', !!document.getElementById('home'), true);
      chk('新建按钮存在', !!document.getElementById('homeNew'), true);
      chk('打开工程文件按钮存在', !!document.getElementById('homeOpenFile'), true);
      chk('最近工程网格存在', !!document.getElementById('homeGrid'), true);
      T.home.go();
      chk('回首页后可见', document.getElementById('home').classList.contains('show'), true);
      chk('回首页会顺手存一次工程', T.S.project.id !== null, true);
      T.home.enter();
      chk('进编辑器后隐藏', document.getElementById('home').classList.contains('show'), false);

      /* M2 项目库往返。go() 已经写过一条，这里换个新 id 再存一条，验完删掉。 */
      T.S.project.id = null;
      var libBefore = -1;
      var homeP = T.home.all().then(function(list){
        libBefore = list.length;
        return T.home.save(true);
      }).then(function(){
        return T.home.all();
      }).then(function(list){
        R.push((list.length === libBefore + 1 ? 'PASS' : 'FAIL') +
               ' 保存后项目库 +1 条 got=' + list.length + ' before=' + libBefore);
        var rec = list.filter(function(r){ return r.id === T.S.project.id; })[0];
        chk('记录带缩略图', !!rec && rec.thumb.indexOf('data:image') === 0, true);
        chk('记录带完整工程数据', !!rec && rec.data.length > 100, true);
        return rec ? T.home.del(rec.id) : null;
      }).then(function(){
        return T.home.all();
      }).then(function(list){
        R.push((list.length === libBefore ? 'PASS' : 'FAIL') +
               ' 删除后恢复原条数 got=' + list.length + ' want=' + libBefore);
      }).catch(function(e){
        R.push('FAIL 项目库往返异常: ' + (e && e.message ? e.message : e));
      });

      /* ---------- J9. 桌面版设置 IPC 往返（浏览器版跳过）---------- */
      if (!hasBridge){ homeP.then(doneOnce); return; }
      var origSettings = JSON.parse(JSON.stringify(T.settings()));
      /* 用正斜杠路径，避免在生成器的模板字符串里被转义吃掉 */
      var TESTDIR_A = 'D:/__ts_test_dir_a__', TESTDIR_B = 'D:/__ts_test_dir_b__';
      window.desktop.setSettings({ exportDir: TESTDIR_A, importDir: TESTDIR_B })
        .then(function(){ return window.desktop.getSettings(); })
        .then(function(s){
          R.push((s.exportDir === TESTDIR_A && s.importDir === TESTDIR_B ? 'PASS' : 'FAIL') +
                 ' 设置经 IPC 写入并读回 got=' + JSON.stringify(s));
          return window.desktop.setSettings(origSettings);
        })
        .then(function(){ return window.desktop.getSettings(); })
        .then(function(s2){
          /* 必须跟「测试前的快照」比，不能假定用户没设过目录 ——
             早先写成断言为空，用户一旦配了自己的导出目录这条就会假失败。 */
          var same = ['importDir','exportDir','projectDir'].every(function(k){
            return (s2[k] || '') === (origSettings[k] || '');
          });
          R.push((same ? 'PASS' : 'FAIL') + ' 设置能恢复原状 got=' + JSON.stringify(s2));
          homeP.then(doneOnce);
        })
        .catch(function(err){
          R.push('FAIL 桌面版设置 IPC 异常: ' + err.message);
          homeP.then(doneOnce);
        });

     } catch (e2){ log('EXCEPTION_C', String(e2 && e2.stack || e2)); done(); }
    }, 350);

   } catch (e1){ log('EXCEPTION_B', String(e1 && e1.stack || e1)); done(); }
  }, 400);
})();
`;

const TEST = '<script>' + BODY + '<' + '/script>';

html = html.replace('</body>', TEST + '</body>');
const outFile = broken ? '_selftest_broken.html'
              : dprBroken ? '_selftest_dprbroken.html'
              : '_selftest.html';
fs.writeFileSync(path.join(dir, outFile), html);

/* 同一份测试体也单独落一份，供打包后的 Electron 用 --selftest 注入自检 */
fs.writeFileSync(path.join(dir, '_selftest_inject.js'), BODY);

console.log('WROTE ' + outFile +
  (broken ? '  [BROKEN CONTROLS]' : dprBroken ? '  [画布尺寸修复已撤除]' : '') +
  '  + _selftest_inject.js');
