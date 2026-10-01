import { renderSlide } from '../src/core/render.js';
import { BriefSchema, CopySchema, type Brief, type Copy } from '../src/core/schema.js';
import { requireAuth } from '../src/core/auth.js';

export async function POST(request: Request): Promise<Response> {
  if (!requireAuth(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const body = await request.json() as { brief: Brief; copy: Copy; n: number };
  try {
    BriefSchema.parse(body.brief);
    CopySchema.parse(body.copy);

    const png = await renderSlide(body.brief, body.copy, body.n);

    return new Response(Buffer.from(png) as any, {
      headers: { 'Content-Type': 'image/png' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export const config = { maxDuration: 60 };
