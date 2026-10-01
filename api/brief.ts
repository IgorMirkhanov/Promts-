import { z } from 'zod';
import { parseBrief, VariationSchema } from '../src/core/pipeline.js';
import { fail, guard, readBody } from '../src/core/http.js';

export const config = { maxDuration: 60 };

const Body = z.object({
  text: z.string().min(10, 'Вставь ТЗ'),
  variation: VariationSchema.optional(),
});

export async function POST(request: Request): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  try {
    const { text, variation } = Body.parse(await readBody(request));
    const brief = await parseBrief(text, variation);
    return Response.json(brief);
  } catch (err) {
    return fail(err);
  }
}
