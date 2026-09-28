import OpenAI from 'openai';

/**
 * Генерация фонов. Сейчас подключён OpenAI Images API (gpt-image-1 и совместимые).
 * Без IMAGE_API_KEY пайплайн рисует процедурный фон в фирменных цветах (см. render.ts).
 * Чтобы подключить Flux/Replicate/fal/Midjourney-прокси — добавь ещё одну ветку в generateBackground.
 */
const apiKey = process.env.IMAGE_API_KEY;
export const imagesAvailable = Boolean(apiKey);

const client = apiKey ? new OpenAI({ apiKey, baseURL: process.env.IMAGE_BASE_URL || undefined }) : null;

export async function generateBackground(prompt: string, negative: string): Promise<Buffer | null> {
  if (!client) return null;
  const res = await client.images.generate({
    model: process.env.IMAGE_MODEL || 'gpt-image-1',
    // У gpt-image-1 нет negative_prompt — дописываем запрет прямо в промпт.
    prompt: `${prompt}\n\nAvoid: ${negative}.`,
    size: '1024x1536',
    n: 1,
  });
  const b64 = res.data?.[0]?.b64_json;
  return b64 ? Buffer.from(b64, 'base64') : null;
}
