/**
 * Local dev server — no Vercel CLI needed.
 *
 *   node dev-server.mjs      (or: npm run dev)   →  http://localhost:3000
 *
 * Serves public/ and routes /api/* to the SAME handler files Vercel uses,
 * emulating Vercel's (req.body / res.status().json()) contract. Loads .env.local.
 * Zero dependencies (Node 18+ has global fetch).
 *
 * This file is dev-only — Vercel ignores it and uses public/ + api/ directly.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = process.env.PORT || 3000;

// ── load .env.local into process.env (tiny parser, no dotenv dep) ──
const envPath = join(ROOT, '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2',
};

function decorateRes(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => {
    if (!res.headersSent) res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(obj));
    return res;
  };
  return res;
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return undefined;
  const raw = Buffer.concat(chunks).toString();
  const ct = req.headers['content-type'] || '';
  if (ct.includes('application/json')) { try { return JSON.parse(raw); } catch { return undefined; } }
  return raw;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // ── /api/* → ./api/<path>.js ──
  if (pathname.startsWith('/api/')) {
    const rel = normalize(pathname.replace(/^\/api\//, '')).replace(/^(\.\.(\/|\\|$))+/, '');
    const file = join(ROOT, 'api', rel + '.js');
    if (!file.startsWith(join(ROOT, 'api')) || !existsSync(file)) {
      return decorateRes(res).status(404).json({ error: 'No such API route: ' + pathname });
    }
    try {
      req.body = await readBody(req);
      const mod = await import(pathToFileURL(file).href);
      await mod.default(req, decorateRes(res));
    } catch (e) {
      console.error('[api error]', pathname, e);
      if (!res.headersSent) decorateRes(res).status(500).json({ error: String((e && e.message) || e) });
    }
    return;
  }

  // ── static from public/ ──
  const rel = normalize(pathname === '/' ? '/index.html' : pathname);
  const file = join(ROOT, 'public', rel);
  if (!file.startsWith(join(ROOT, 'public')) || !existsSync(file)) {
    res.statusCode = 404; res.end('Not found'); return;
  }
  try {
    const data = await readFile(file);
    res.setHeader('content-type', MIME[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch {
    res.statusCode = 500; res.end('Server error');
  }
});

server.listen(PORT, () => {
  console.log(`\n  Lumi AI dev  →  http://localhost:${PORT}\n`);
  const missing = ['ANTHROPIC_API_KEY', 'LIVEAVATAR_API_KEY', 'LIVEAVATAR_AVATAR_ID']
    .filter((k) => !process.env[k]);
  if (missing.length) console.warn('  ⚠ missing env vars:', missing.join(', '), '— check .env.local\n');
});
