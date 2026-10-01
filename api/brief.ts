import { callJson } from '../src/core/llm.js';
import { BriefSchema, type Brief } from '../src/core/schema.js';
import { DEFAULT_BRAND } from '../src/core/pipeline.js';
import { requireAuth } from '../src/core/auth.js';

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!requireAuth(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const body = await request.json() as { text: string };
  try {
    const asJson = tryJson(body.text);
    let brief: Brief;

    if (asJson) {
      brief = BriefSchema.parse(asJson);
    } else {
      brief = await callJson('brief-parser', { DEFAULT_BRAND, brief_text: body.text }, BriefSchema);
    }

    return new Response(JSON.stringify(brief), {
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
