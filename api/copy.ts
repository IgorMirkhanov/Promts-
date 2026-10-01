import { BriefSchema } from '../src/core/schema.js';
import { VariationSchema, writeCopy } from '../src/core/pipeline.js';
import { fail, guard, readBody } from '../src/core/http.js';
import { z } from 'zod';

export const config = { maxDuration: 60 };

const Body = z.object({
  brief: BriefSchema,
  variation: VariationSchema.optional(),
});

export async function POST(request: Request): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  try {
    const { brief, variation } = Body.parse(await readBody(request));
    const result = await writeCopy(brief, variation);
    return Response.json(result);
  } catch (err) {
    return fail(err);
  }
}
