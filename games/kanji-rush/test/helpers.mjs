import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * 启动一个临时静态服务器（ES module 必须走 http://，file:// 会被 CORS 拦截）。
 * @param {string} root
 */
export function startServer(root) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      let rel = decodeURIComponent(url.pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      const safe = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
      const filePath = path.join(root, safe);
      if (!filePath.startsWith(root)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('forbidden');
        return;
      }
      const data = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
    }
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

/**
 * 解析 Playwright 安装位置。优先本地依赖，其次全局安装。
 * @returns {Promise<import('playwright').chromium|null>}
 */
export async function loadChromium() {
  const require = createRequire(import.meta.url);
  const candidates = ['playwright', 'playwright-core', '/usr/local/lib/node_modules/playwright'];
  for (const candidate of candidates) {
    try {
      const mod = require(candidate);
      if (mod && mod.chromium) return mod.chromium;
    } catch {
      /* 尝试下一个 */
    }
  }
  return null;
}

/**
 * 等待某个条件成立。
 * @param {() => boolean|Promise<boolean>} predicate
 * @param {number} timeoutMs
 */
export async function waitFor(predicate, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}
