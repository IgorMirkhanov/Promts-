import { llmAvailable } from '../src/core/llm.js';
import { passwordRequired } from '../src/core/auth.js';

export const config = { maxDuration: 60 };

export async function GET(): Promise<Response> {
  return Response.json({ llm: llmAvailable, auth: passwordRequired() });
}
