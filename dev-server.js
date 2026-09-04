'use strict';

/**
 * 本地开发服务器 — 不需要 Vercel 就能完整跑通前后端
 * 用法：node dev-server.js  （默认 http://localhost:3000）
 * 叙事层 key 通过环境变量注入，例如：
 *   DEEPSEEK_API_KEY=sk-xxx node dev-server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const handler = require('./api/analyze.js');

const PORT = process.env.PORT || 3000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };

const server = http.createServer(async (req, res) => {
  const url = (req.url || '/').split('?')[0];

  if (url === '/api/analyze') {
    let body = '';
    for await (const chunk of req) body += chunk;
    req.body = body;
    req.startTime = Date.now();
    // 适配 Vercel 风格的 res.status().json() 链式接口
    // 注意：不能用 Object.create(res) 委托——Node 22 下 end() 会静默失效（响应永远不发出）
    res.status = function (code) { this.statusCode = code; return this; };
    res.json = function (data) {
      this.setHeader('Content-Type', 'application/json; charset=utf-8');
      this.end(JSON.stringify(data));
    };
    return handler(req, res);
  }

  let file = url === '/' ? '/index.html' : url;
  const filePath = path.join(__dirname, 'public', file);
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`能量图谱本地开发服务器已启动: http://localhost:${PORT}`);
  console.log('叙事供应商 key（可选，按需注入）: DEEPSEEK_API_KEY / DASHSCOPE_API_KEY / ZHIPU_API_KEY / MOONSHOT_API_KEY / ANTHROPIC_API_KEY');
});
