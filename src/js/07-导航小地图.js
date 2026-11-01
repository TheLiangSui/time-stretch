/* =========================================================
   导航小地图：显示整图 + 各图层轮廓 + 当前视口矩形，拖它即可平移
   ========================================================= */
const navEl = $('nav');
const navCv = $('navcv');
const navCtx = navCv.getContext('2d');
let navDrag = false;

function renderNav(){
  if (!S.src.canvas){ navEl.classList.remove('show'); return; }
  navEl.classList.add('show');
  const maxW = 178, maxH = 118;
  const k = Math.min(maxW / S.src.w, maxH / S.src.h);
  const w = Math.max(48, Math.round(S.src.w * k));
  const h = Math.max(34, Math.round(S.src.h * k));
  const dprN = Math.min(window.devicePixelRatio || 1, 2);
  if (navCv.width !== Math.round(w*dprN) || navCv.height !== Math.round(h*dprN)){
    navCv.width = Math.round(w*dprN); navCv.height = Math.round(h*dprN);
  }
  navCv.style.width = w + 'px';
  navCv.style.height = h + 'px';
  navCtx.setTransform(dprN,0,0,dprN,0,0);
  navCtx.clearRect(0, 0, w, h);
  navCtx.imageSmoothingEnabled = true;
  navCtx.drawImage(S.src.canvas, 0, 0, w, h);

  navCtx.lineWidth = 1;
  for (let i = 0; i < S.layers.length; i++){
    const L = S.layers[i];
    if (!L.visible) continue;
    navCtx.strokeStyle = isSel(L.id) ? PAL.sel : PAL.ref;
    navCtx.strokeRect(L.x/S.src.w*w + .5, L.y/S.src.h*h + .5,
                      Math.max(1, L.w/S.src.w*w), Math.max(1, L.h/S.src.h*h));
  }
  /* 当前视口在整图里的位置 */
  const a = scr2img(0, 0), b = scr2img(vp.clientWidth, vp.clientHeight);
  const ax = clamp(a.x, 0, S.src.w), ay = clamp(a.y, 0, S.src.h);
  const bx = clamp(b.x, 0, S.src.w), by = clamp(b.y, 0, S.src.h);
  navCtx.strokeStyle = PAL.line;
  navCtx.lineWidth = 1.5;
  navCtx.strokeRect(ax/S.src.w*w + .5, ay/S.src.h*h + .5,
                    Math.max(3, (bx-ax)/S.src.w*w), Math.max(3, (by-ay)/S.src.h*h));
}
function navPanTo(clientX, clientY){
  if (!S.src.canvas) return;
  const r = navCv.getBoundingClientRect();
  const fx = clamp((clientX - r.left) / r.width, 0, 1);
  const fy = clamp((clientY - r.top) / r.height, 0, 1);
  S.view.tx = vp.clientWidth/2  - fx * S.src.w * S.view.s;
  S.view.ty = vp.clientHeight/2 - fy * S.src.h * S.view.s;
  render(); renderStatus();
}
navCv.addEventListener('pointerdown', function(e){
  navDrag = true; navCv.classList.add('drag');
  try { navCv.setPointerCapture(e.pointerId); } catch(_){}
  navPanTo(e.clientX, e.clientY);
  e.preventDefault(); e.stopPropagation();
});
navCv.addEventListener('pointermove', function(e){
  if (navDrag){ navPanTo(e.clientX, e.clientY); e.preventDefault(); }
});
['pointerup','pointercancel'].forEach(function(ev){
  navCv.addEventListener(ev, function(){ navDrag = false; navCv.classList.remove('drag'); });
});
/* 右键拖拽平移，别弹系统菜单 */
vp.addEventListener('contextmenu', function(e){ e.preventDefault(); });

function drawOverlay(){
  if (!S.src.canvas) return;
  ctx.save();
  ctx.setTransform(dpr,0,0,dpr,0,0);

  const p0 = img2scr(0,0), p1 = img2scr(S.src.w, S.src.h);
  ctx.strokeStyle = PAL.frame; ctx.lineWidth = 1;
  ctx.strokeRect(p0.x+0.5, p0.y+0.5, p1.x-p0.x-1, p1.y-p0.y-1);

  for (let i = S.layers.length-1; i >= 0; i--){
    const L = S.layers[i];
    const a = img2scr(L.x, L.y), b = img2scr(L.x+L.w, L.y+L.h);
    const sel = isSel(L.id), hov = (L.id === S.hover);
    ctx.setLineDash(sel ? [] : [5,4]);
    ctx.lineWidth = sel ? 2 : (hov ? 1.5 : 1);
    ctx.strokeStyle = sel ? PAL.sel
                    : hov ? PAL.hov
                    : (L.visible ? PAL.ref : PAL.refOff);
    ctx.strokeRect(a.x+0.5, a.y+0.5, b.x-a.x-1, b.y-a.y-1);
    ctx.setLineDash([]);

    /* 每层都画出它的取样线：加了取样偏移之后，不画出来根本看不出它在取哪儿 */
    const sl = sampleLine(L, Math.round(L.x), Math.round(L.y), Math.max(1,Math.round(L.w)), Math.max(1,Math.round(L.h)));
    const s1 = img2scr(sl.dir === 'h' ? sl.sx + 0.5 : sl.sx,       sl.dir === 'h' ? sl.sy        : sl.sy + 0.5);
    const s2 = img2scr(sl.dir === 'h' ? sl.sx + 0.5 : sl.sx + sl.sw, sl.dir === 'h' ? sl.sy + sl.sh : sl.sy + 0.5);
    ctx.lineWidth = sel ? 2 : 1;
    ctx.strokeStyle = sel ? PAL.line : PAL.lineDim;
    ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();

    if (sel && !L.locked && selSet().length === 1) drawHandles(a, b);

    if (L.locked) drawLockBadge(a.x + 4, a.y + 4);   // 锁定标记：左上角一枚小锁
  }
  ctx.setLineDash([]);

  // 正在拖出的框
  if (mode === 'draw' && draft){
    const a = img2scr(draft.x, draft.y), b = img2scr(draft.x+draft.w, draft.y+draft.h);
    ctx.strokeStyle = PAL.line; ctx.lineWidth = 2;
    ctx.setLineDash([6,4]);
    ctx.strokeRect(a.x+0.5, a.y+0.5, b.x-a.x-1, b.y-a.y-1);
    ctx.setLineDash([]);
    /* 预告取样线：水平模式是竖线，垂直模式是横线 —— 一眼看出会怎么拉 */
    const dl = sampleLine({ dir: draftDir, sampleOff: 0 },
                          Math.round(draft.x), Math.round(draft.y),
                          Math.max(1, Math.round(draft.w)), Math.max(1, Math.round(draft.h)));
    const q1 = img2scr(dl.dir === 'h' ? dl.sx + 0.5 : dl.sx,        dl.dir === 'h' ? dl.sy         : dl.sy + 0.5);
    const q2 = img2scr(dl.dir === 'h' ? dl.sx + 0.5 : dl.sx + dl.sw, dl.dir === 'h' ? dl.sy + dl.sh : dl.sy + 0.5);
    ctx.strokeStyle = PAL.line; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(q1.x, q1.y); ctx.lineTo(q2.x, q2.y); ctx.stroke();
    drawDraftPreview(a, b);
  }
  ctx.restore();
}

/* 圆角矩形路径（不依赖 roundRect，老内核也能画） */
function roundRectPath(g, x, y, w, h, r){
  r = Math.min(r, w/2, h/2);
  g.beginPath();
  g.moveTo(x+r, y);
  g.lineTo(x+w-r, y); g.quadraticCurveTo(x+w, y, x+w, y+r);
  g.lineTo(x+w, y+h-r); g.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  g.lineTo(x+r, y+h); g.quadraticCurveTo(x, y+h, x, y+h-r);
  g.lineTo(x, y+r); g.quadraticCurveTo(x, y, x+r, y);
  g.closePath();
}
/* 画布上的「已锁定」徽标：画出锁形，不用 emoji（emoji 在浅色底下会发灰） */
function drawLockBadge(x, y){
  const S0 = 17;
  ctx.fillStyle = PAL.lockBg;
  roundRectPath(ctx, x, y, S0, S0, 4); ctx.fill();
  ctx.strokeStyle = PAL.lockFg; ctx.fillStyle = PAL.lockFg;
  ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  const bx = x + 4.5, by = y + 8, bw = 8, bh = 6;
  ctx.beginPath(); ctx.arc(x + S0/2, y + 8, 2.9, Math.PI, 0); ctx.stroke();
  roundRectPath(ctx, bx, by, bw, bh, 1.6); ctx.fill();
  ctx.lineCap = 'butt';
}

function drawDraftPreview(a, b){
  if (!S.src.canvas) return;
  const x = Math.round(draft.x), y = Math.round(draft.y);
  const w = Math.max(1, Math.round(draft.w)), h = Math.max(1, Math.round(draft.h));
  const sl = sampleLine({ dir: draftDir, sampleOff: 0 }, x, y, w, h);
  ctx.save();
  ctx.beginPath(); ctx.rect(a.x, a.y, b.x-a.x, b.y-a.y); ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = .85;
  ctx.drawImage(S.src.canvas, sl.sx, sl.sy, sl.sw, sl.sh, a.x, a.y, b.x-a.x, b.y-a.y);
  ctx.restore();
}

/* ---- 控制点 ---- */
const HS = 5;
function handlePositions(a, b){
  const cx = (a.x+b.x)/2, cy = (a.y+b.y)/2;
  return {
    nw:{x:a.x,y:a.y}, n:{x:cx,y:a.y},  ne:{x:b.x,y:a.y},
    e :{x:b.x,y:cy},  se:{x:b.x,y:b.y}, s:{x:cx,y:b.y},
    sw:{x:a.x,y:b.y}, w:{x:a.x,y:cy}
  };
}
function drawHandles(a, b){
  const P = handlePositions(a, b);
  for (const k in P){
    const p = P[k];
    ctx.fillStyle = PAL.hFill; ctx.strokeStyle = PAL.hStroke; ctx.lineWidth = 1;
    ctx.fillRect(p.x-HS, p.y-HS, HS*2, HS*2);
    ctx.strokeRect(p.x-HS+.5, p.y-HS+.5, HS*2-1, HS*2-1);
  }
}
function hitHandle(mx, my){
  const L = getSel(); if (!L || L.locked) return null;   // 锁定的层不显示也不响应控制点
  const a = img2scr(L.x, L.y), b = img2scr(L.x+L.w, L.y+L.h);
  const P = handlePositions(a, b);
  for (const k in P){
    const p = P[k];
    if (Math.abs(mx-p.x) <= HS+3 && Math.abs(my-p.y) <= HS+3) return k;
  }
  return null;
}
function cursorForHandle(h){
  return { nw:'nwse-resize', se:'nwse-resize', ne:'nesw-resize', sw:'nesw-resize',
           n:'ns-resize', s:'ns-resize', e:'ew-resize', w:'ew-resize' }[h] || 'default';
}
