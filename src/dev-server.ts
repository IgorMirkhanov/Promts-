import 'dotenv/config';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PORT = Number(process.env.PORT || 3000);

async function loadApiFunction(name: string, method: string) {
  const mod = await import(`../api/${name}.js`);
  return mod[method];
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Serve static files
  if (pathname === '/' || pathname === '') {
    const file = join(process.cwd(), 'public', 'index.html');
    if (existsSync(file)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(readFileSync(file));
    }
  }

  const publicFile = join(process.cwd(), 'public', pathname.slice(1));
  if (existsSync(publicFile) && publicFile.startsWith(join(process.cwd(), 'public'))) {
    const ext = publicFile.split('.').pop() || '';
    const mimes: Record<string, string> = {
      js: 'application/javascript',
      css: 'text/css',
      html: 'text/html',
      json: 'application/json',
      png: 'image/png',
      svg: 'image/svg+xml',
    };
    res.writeHead(200, { 'Content-Type': mimes[ext] || 'application/octet-stream' });
    return res.end(readFileSync(publicFile));
  }

  // Proxy API calls
  if (pathname.startsWith('/api/')) {
    const [_, api, func] = pathname.split('/');
    if (!api || !func) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Not found' }));
    }

    const method = req.method || 'GET';
    try {
      const handler = await loadApiFunction(api, method);
      if (!handler) {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Method not allowed' }));
      }

      // Build Request object
      let body = '';
      if (method !== 'GET') {
        body = await new Promise<string>((resolve, reject) => {
          let data = '';
          req.on('data', chunk => data += chunk);
          req.on('end', () => resolve(data));
          req.on('error', reject);
        });
      }

      const request = new Request(url, {
        method,
        headers: req.headers as any,
        body: body || undefined,
      });

      const response = await handler(request);
      const responseBody = await response.text();

      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(responseBody);
    } catch (err) {
      console.error('API error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }));
    }

    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`Генератор каруселей: http://localhost:${PORT}`);
});
