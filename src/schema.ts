import { z } from 'zod';

export const INTENTS = ['hook', 'problem', 'story', 'value', 'bridge', 'cta'] as const;
export type Intent = (typeof INTENTS)[number];

/** Входное ТЗ из контент-плана. */
export const BriefSchema = z.object({
  topic: z.string().min(3),
  audience: z.string(),
  goal: z.string(),
  cta_mechanic: z.enum(['comment_keyword', 'link_in_bio']),
  cta_keyword: z.string().optional(),
  tone: z.string().default('дружеский, разговорный'),
  brand: z.object({
    name: z.string().optional(),
    colors: z.array(z.string()).min(2).describe('[фон, акцент, (доп.)]'),
    style: z.string().default('минимализм'),
  }),
  slides: z
    .array(
      z.object({
        n: z.number().int().positive(),
        intent: z.enum(INTENTS),
        idea: z.string(),
      }),
    )
    .min(2)
    .max(10),
});
export type Brief = z.infer<typeof BriefSchema>;

/** Шаг 1 — копирайтер. */
export const CopySchema = z.object({
  slides: z.array(
    z.object({
      n: z.number().int(),
      intent: z.enum(INTENTS),
      headline: z.string(),
      body: z.string().default(''),
      visual_idea: z.string(),
    }),
  ),
  caption: z.string(),
  hashtags: z.array(z.string()).default([]),
});
export type Copy = z.infer<typeof CopySchema>;

/** Шаг 2 — арт-директор. */
export const ArtSchema = z.object({
  style_anchor: z.string(),
  slides: z.array(
    z.object({
      n: z.number().int(),
      image_prompt: z.string(),
      negative_prompt: z.string(),
      text_zone: z.enum(['top', 'center', 'bottom']),
    }),
  ),
});
export type Art = z.infer<typeof ArtSchema>;

/** Шаг 5 — QA. */
export const QaSchema = z.object({
  pass: z.boolean(),
  issues: z.array(z.object({ n: z.number().int(), problem: z.string(), fix: z.string() })),
});
export type Qa = z.infer<typeof QaSchema>;
