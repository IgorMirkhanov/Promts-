import { z } from 'zod';
import { unauthorized } from './auth.js';

export function guard(request: Request): Response | null {
  return unauthorized(request);
}

export async function readBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error('Невалидный JSON');
  }
}

export function fail(err: unknown): Response {
  if (err instanceof z.ZodError) {
    return Response.json({ error: err.issues.map((i) => i.message).join('; ') }, { status: 400 });
  }
  const msg = err instanceof Error ? err.message : String(err);
  const status = /ключ|не задан|Невалидн|нет слайда|Укажи|Вставь|ТЗ/i.test(msg) ? 400 : 500;
  return Response.json({ error: msg }, { status });
}
