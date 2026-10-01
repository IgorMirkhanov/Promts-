import { z } from 'zod';
import { BriefSchema, CopySchema } from '../src/core/schema.js';
import { ruleQa } from '../src/core/qa.js';
import { fail, guard, readBody } from '../src/core/http.js';

export const config = { maxDuration: 60 };

const Body = z.object({ brief: BriefSchema, copy: CopySchema });

export async function POST(request: Request): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  try {
    const { brief, copy } = Body.parse(await readBody(request));
    return Response.json(ruleQa(brief, copy));
  } catch (err) {
    return fail(err);
  }
}
