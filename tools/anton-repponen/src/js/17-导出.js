/* =========================================================
   M7 导出
   输入：格式 / 质量 / 背景 / 倍率 / 是否含源图层
   处理：新建 (w*scale, h*scale) 离屏画布 -> 背景 -> 源图层 -> 逐层叠加
        （与屏幕预览共用 compositeInto，所见即所得）
   输出：Blob 下载 / 剪贴板
   ========================================================= */
function buildExportCanvas(scale, bg, includeSrc){
  const W = Math.max(1, Math.round(S.src.w*scale));
  const H = Math.max(1, Math.round(S.src.h*scale));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.save();
  if (bg !== 'transparent'){ g.fillStyle = bg; g.fillRect(0,0,W,H); }
  g.scale(scale, scale);
  if (includeSrc && S.src.canvas){
    g.globalAlpha = S.srcOpacity;
    g.drawImage(S.src.canvas, 0, 0);
    g.globalAlpha = 1;
  }
  compositeInto(g);
  g.restore();
  return c;
}
function doExport(){
  if (!S.src.canvas){ toast('先导入图片'); return; }
  const fmt   = $('exFmt').value;
  const q     = parseInt($('exQ').value)/100;
  const bg    = $('exBg').value;
  const scale = parseFloat($('exScale').value);
  const src   = $('exSrc').checked;

  const c = buildExportCanvas(scale, bg, src);
  const ext = fmt === 'image/png' ? 'png' : (fmt === 'image/jpeg' ? 'jpg' : 'webp');
  c.toBlob(function(blob){
    if (!blob){ toast('导出失败'); return; }
    const a = document.createElement('a');
    const base = (S.src.name || 'image').replace(/\.[^.]+$/, '');
    a.href = URL.createObjectURL(blob);
    a.download = base + '_时间拉伸.' + ext;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('已导出 ' + c.width + '×' + c.height + ' ' + ext.toUpperCase());
    $('modalExport').classList.remove('show');
  }, fmt, q);
}
function copyToClipboard(){
  if (!S.src.canvas){ toast('先导入图片'); return; }
  if (!navigator.clipboard || !window.ClipboardItem){ toast('当前环境不支持剪贴板写入，请用「导出」'); return; }
  const c = buildExportCanvas(parseFloat($('exScale').value),
                              $('exBg').value,
                              $('exSrc').checked);
  c.toBlob(function(blob){
    navigator.clipboard.write([ new ClipboardItem({ 'image/png': blob }) ])
      .then(function(){ toast('已复制到剪贴板'); })
      .catch(function(){ toast('复制失败，请用「导出」'); });
  }, 'image/png');
}
