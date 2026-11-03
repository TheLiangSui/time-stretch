/* 本地静态服务器（只给 dist-web 用），端口固定 8731 */
const fs = require('fs');
const http = require('http');
const path = require('path');

const WEB = path.join(__dirname, '..', 'dist-web');
const PORT = 8731;
const MIME = { '.html':'text/html; charset=utf-8', '.json':'application/json; charset=utf-8',
               '.png':'image/png', '.txt':'text/plain; charset=utf-8', '.js':'text/javascript' };

http.createServer(function (req, res) {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(WEB, p);
  if (!f.startsWith(WEB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT, '127.0.0.1', function () {
  console.log('serving ' + WEB + ' at http://127.0.0.1:' + PORT + '/');
});
