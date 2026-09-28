import OpenAI from 'openai';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { z } from 'zod';

/**
 * Любой OpenAI-совместимый провайдер: DeepSeek (по умолчанию), OpenAI, OpenRouter и т.д.
 * LLM_API_KEY, LLM_BASE_URL, LLM_MODEL — в .env.
 */
const apiKey = process.env.LLM_API_KEY;
export const llmAvailable = Boolean(apiKey);

const client = apiKey
  ? new OpenAI({ apiKey, baseURL: process.env.LLM_BASE_URL ?? 'https://api.deepseek.com' })
  : null;
const model = process.env.LLM_MODEL ?? 'deepseek-chat';

export function loadPrompt(name: string): string {
  return readFileSync(join(import.meta.dirname, '..', 'prompts', `${name}.md`), 'utf8');
}

/** Вызов LLM с system-промптом из prompts/<name>.md и валидацией JSON по схеме (1 повтор при невалидном ответе). */
export async function callJson<T>(promptName: string, input: unknown, schema: z.ZodType<T>): Promise<T> {
  if (!client) throw new Error('LLM_API_KEY не задан');
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: loadPrompt(promptName) },
    { role: 'user', content: JSON.stringify(input, null, 2) },
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await client.chat.completions.create({
      model,
      messages,
      temperature: promptName === 'qa' ? 0 : 0.8,
      response_format: { type: 'json_object' },
    });
    const text = res.choices[0]?.message?.content ?? '';
    try {
      return schema.parse(JSON.parse(text));
    } catch (err) {
      messages.push({ role: 'assistant', content: text });
      messages.push({ role: 'user', content: `Ответ невалиден: ${String(err)}. Верни исправленный JSON строго по формату.` });
    }
  }
  throw new Error(`LLM вернул невалидный JSON на шаге ${promptName}`);
}
