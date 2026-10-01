import { z } from 'zod';
import { BriefSchema, CopySchema } from '../src/core/schema.js';
import { renderSlide } from '../src/core/render.js';
import { fail, guard, readBody } from '../src/core/http.js';

export const config = { maxDuration: 60 };

const Body = z.object({
  brief: BriefSchema,
  copy: CopySchema,
  n: z.number().int().positive(),
});

export async function POST(request: Request): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  try {
    const { brief, copy, n } = Body.parse(await readBody(request));
    const png = await renderSlide(brief, copy, n);
    return new Response(Uint8Array.from(png), {
      headers: {
        'content-type': 'image/png',
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    return fail(err);
  }
}
