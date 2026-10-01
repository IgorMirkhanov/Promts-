import { callJson } from '../src/core/llm.js';
import { BriefSchema, CopySchema, type Brief, type Copy } from '../src/core/schema.js';
import { requireAuth } from '../src/core/auth.js';

export async function POST(request: Request): Promise<Response> {
  if (!requireAuth(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const body = await request.json() as { brief: Brief };
  try {
    BriefSchema.parse(body.brief);
    const copy = await callJson('copywriter', body.brief, CopySchema);

    return new Response(JSON.stringify(copy), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export const config = { maxDuration: 60 };
