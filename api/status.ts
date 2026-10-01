import { llmAvailable } from '../src/core/llm.js';

export async function GET(): Promise<Response> {
  return new Response(
    JSON.stringify({
      llm: llmAvailable,
      auth: Boolean(process.env.APP_PASSWORD),
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

export const config = { maxDuration: 60 };
