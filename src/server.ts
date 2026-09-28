import 'dotenv/config';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { imagesAvailable } from './images.js';
import { llmAvailable } from './llm.js';
import { OUTPUT_DIR, ROOT, runPipeline } from './pipeline.js';
import { CopySchema } from './schema.js';

/** Веб-интерфейс: вставил ТЗ → получил слайды, поправил текст → перерендерил. */
const PORT = Number(process.env.PORT || 3000);
const BRIEFS_DIR = join(ROOT, 'briefs');

interface Job {
  status: 'running' | 'done' | 'error';
  name: string;
  log: string[];
  error?: string;
}
const jobs = new Map<string, Job>();
const busy = new Set<string>();

function startJob(name: string, run: (log: (s: string, m: string) => void) => Promise<unknown>): string {
  if (busy.has(name)) throw new HttpError(409, `Пост «${name}» уже генерируется`);
  const id = randomUUID();
  const job: Job = { status: 'running', name, log: [] };
  jobs.set(id, job);
  busy.add(name);
  run((step, msg) => job.log.push(`[${step}] ${msg}`))
    .then(() => (job.status = 'done'))
    .catch((err: unknown) => {
      job.status = 'error';
      job.error = err instanceof Error ? err.message : String(err);
    })
    .finally(() => busy.delete(name));
  return id;
}

class HttpError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
  }
}

/** Имя проекта → безопасное имя папки. */
function slug(raw: unknown): string {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-яё0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  if (!s) throw new HttpError(400, 'Укажи название поста');
  return s;
}

const readJson = (p: string) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);

function project(name: string) {
  const dir = join(OUTPUT_DIR, name);
  if (!existsSync(dir)) throw new HttpError(404, 'Пост не найден');
  const slidesDir = join(dir, 'slides');
  const slides = existsSync(slidesDir)
    ? readdirSync(slidesDir)
        .filter((f) => f.endsWith('.png'))
        .sort()
        .map((f) => `/files/${encodeURIComponent(name)}/slides/${f}?v=${statSync(join(slidesDir, f)).mtimeMs}`)
    : [];
  const captionFile = join(dir, 'caption.txt');
  return {
    name,
    brief: readJson(join(dir, '00_brief.json')),
    copy: readJson(join(dir, '01_copy.json')),
    qa: readJson(join(dir, '03_qa.json')),
    caption: existsSync(captionFile) ? readFileSync(captionFile, 'utf8') : '',
    slides,
  };
}

function listProjects() {
  if (!existsSync(OUTPUT_DIR)) return [];
  return readdirSync(OUTPUT_DIR)
    .filter((n) => statSync(join(OUTPUT_DIR, n)).isDirectory())
    .map((n) => ({
      name: n,
      topic: readJson(join(OUTPUT_DIR, n, '00_brief.json'))?.topic ?? n,
      updated: statSync(join(OUTPUT_DIR, n)).mtimeMs,
    }))
    .sort((a, b) => b.updated - a.updated);
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 2_000_000) throw new HttpError(413, 'Слишком большой запрос');
  }
  try {
    return JSON.parse(data || '{}');
  } catch {
    throw new HttpError(400, 'Невалидный JSON');
  }
}

const MIME: Record<string, string> = { '.png': 'image/png', '.html': 'text/html; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

function send(res: ServerResponse, code: number, payload: unknown) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x');
  const path = decodeURIComponent(url.pathname);
  const parts = path.split('/').filter(Boolean);

  if (req.method === 'GET' && path === '/') {
    res.writeHead(200, { 'content-type': MIME['.html']! });
    return res.end(readFileSync(join(ROOT, 'web', 'index.html')));
  }
  if (req.method === 'GET' && parts[0] === 'files') {
    const file = normalize(join(OUTPUT_DIR, ...parts.slice(1)));
    if (!file.startsWith(OUTPUT_DIR + sep) || !existsSync(file)) throw new HttpError(404, 'Нет файла');
    const headers: Record<string, string> = { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' };
    if (url.searchParams.has('download')) headers['content-disposition'] = `attachment; filename="${parts.at(-1)}"`;
    res.writeHead(200, headers);
    return res.end(readFileSync(file));
  }
  if (parts[0] !== 'api') throw new HttpError(404, 'Не найдено');

  // GET /api/status
  if (req.method === 'GET' && parts[1] === 'status') return send(res, 200, { llm: llmAvailable, images: imagesAvailable });
  // GET /api/projects
  if (req.method === 'GET' && parts[1] === 'projects' && !parts[2]) return send(res, 200, listProjects());
  // GET /api/projects/:name
  if (req.method === 'GET' && parts[1] === 'projects' && parts[2]) return send(res, 200, project(slug(parts[2])));
  // GET /api/jobs/:id
  if (req.method === 'GET' && parts[1] === 'jobs' && parts[2]) {
    const job = jobs.get(parts[2]);
    if (!job) throw new HttpError(404, 'Задача не найдена');
    return send(res, 200, job);
  }
  // POST /api/run  { name, text, force }
  if (req.method === 'POST' && parts[1] === 'run') {
    const b = await body(req);
    const name = slug(b.name);
    const text = String(b.text ?? '').trim();
    if (text.length < 10) throw new HttpError(400, 'Вставь ТЗ');
    const isJson = /^\s*\{/.test(text);
    mkdirSync(BRIEFS_DIR, { recursive: true });
    const briefFile = join(BRIEFS_DIR, `${name}.${isJson ? 'json' : 'txt'}`);
    // ТЗ изменилось → старые тексты и фоны этого поста уже не подходят, генерируем заново.
    const changed = !existsSync(briefFile) || readFileSync(briefFile, 'utf8') !== text;
    writeFileSync(briefFile, text);
    const force = Boolean(b.force) || (changed && existsSync(join(OUTPUT_DIR, name)));
    return send(res, 202, { jobId: startJob(name, (log) => runPipeline(name, text, { force, log })), name });
  }
  // POST /api/projects/:name/copy  { copy } — ручная правка текста и перерендер без LLM-правок
  if (req.method === 'POST' && parts[1] === 'projects' && parts[2] && parts[3] === 'copy') {
    const name = slug(parts[2]);
    const { brief } = project(name);
    if (!brief) throw new HttpError(400, 'У поста нет ТЗ');
    const copy = CopySchema.parse((await body(req)).copy);
    writeFileSync(join(OUTPUT_DIR, name, '01_copy.json'), JSON.stringify(copy, null, 2));
    const text = JSON.stringify(brief);
    return send(res, 202, { jobId: startJob(name, (log) => runPipeline(name, text, { llmQa: false, log })), name });
  }
  throw new HttpError(404, 'Не найдено');
}

createServer((req, res) => {
  handle(req, res).catch((err: unknown) => {
    const code = err instanceof HttpError ? err.code : 500;
    const msg = err instanceof Error ? err.message : String(err);
    if (!res.headersSent) send(res, code, { error: msg });
    else res.end();
  });
}).listen(PORT, () => {
  console.log(`Генератор каруселей: http://localhost:${PORT}`);
  console.log(`LLM: ${llmAvailable ? 'подключен' : 'НЕТ КЛЮЧА (LLM_API_KEY)'} · Картинки: ${imagesAvailable ? 'подключены' : 'процедурные фоны'}`);
});
