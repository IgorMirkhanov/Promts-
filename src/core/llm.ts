import OpenAI from 'openai';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { z } from 'zod';

/**
 * Gemini через OpenAI-совместимый эндпоинт.
 * GEMINI_API_KEY обязателен, GEMINI_MODEL опционально (по умолчанию gemini-2.5-flash).
 */
const apiKey = process.env.GEMINI_API_KEY;
export const llmAvailable = Boolean(apiKey);

const client = apiKey
  ? new OpenAI({
      apiKey,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      timeout: 45000,
      maxRetries: 1,
    })
  : null;
const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

export function loadPrompt(name: string): string {
  return readFileSync(join(import.meta.dirname, '..', 'prompts', `${name}.md`), 'utf8');
}

function cleanJson(text: string): string {
  return text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').replace(/^[^{]*/,'').replace(/[^}]*$/, '');
}

/** Вызов LLM с system-промптом из prompts/<name>.md и валидацией JSON по схеме (1 повтор при невалидном ответе). */
export async function callJson<T>(promptName: string, input: unknown, schema: z.ZodType<T>): Promise<T> {
  if (!client) throw new Error('GEMINI_API_KEY не задан');
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: loadPrompt(promptName) },
    { role: 'user', content: JSON.stringify(input, null, 2) },
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    let response_format: { type: 'json_object' } | undefined = { type: 'json_object' };
    try {
      const res = await client.chat.completions.create({
        model,
        messages,
        temperature: promptName === 'qa' ? 0 : 0.8,
        response_format,
      });
      const text = res.choices[0]?.message?.content ?? '';
      try {
        return schema.parse(JSON.parse(cleanJson(text)));
      } catch (err) {
        messages.push({ role: 'assistant', content: text });
        messages.push({ role: 'user', content: `Ответ невалиден: ${String(err)}. Верни исправленный JSON строго по формату.` });
      }
    } catch (err) {
      if ((err as { status?: number }).status === 400 && response_format) {
        response_format = undefined;
        attempt--;
      } else throw err;
    }
  }
  throw new Error(`LLM вернул невалидный JSON на шаге ${promptName}`);
}
