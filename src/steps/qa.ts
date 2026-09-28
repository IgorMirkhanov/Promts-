import type { Brief, Copy, Qa } from '../schema.js';

const WORD_LIMITS: Record<string, number> = { hook: 18, problem: 25, story: 25, value: 35, bridge: 25, cta: 25 };
const BANNED = [
  /https?:\/\//i,
  /\bwww\./i,
  /t\.me/i,
  /@[a-z0-9_]{3,}/i,
  /telegram|телеграм|\bтг\b/i,
  /перейд\S* по ссылке|переходи по ссылке/i,
  /гарантирован\S*/i,
];

const words = (s: string) => s.replace(/\*/g, '').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** Детерминированные проверки — работают всегда, даже без LLM. */
export function ruleQa(brief: Brief, copy: Copy): Qa {
  const issues: Qa['issues'] = [];
  if (copy.slides.length !== brief.slides.length) {
    issues.push({ n: 0, problem: `слайдов ${copy.slides.length}, в ТЗ ${brief.slides.length}`, fix: 'привести к ТЗ' });
  }
  for (const s of copy.slides) {
    const total = words(s.headline) + words(s.body);
    const limit = WORD_LIMITS[s.intent] ?? 35;
    if (s.intent === 'hook' && words(s.headline) > 8) {
      issues.push({ n: s.n, problem: `hook headline ${words(s.headline)} слов (> 8)`, fix: 'сократить' });
    }
    if (total > limit) issues.push({ n: s.n, problem: `${total} слов (> ${limit})`, fix: 'сократить' });
    for (const re of BANNED) {
      if (re.test(`${s.headline} ${s.body}`)) issues.push({ n: s.n, problem: `запрещённый паттерн ${re}`, fix: 'убрать' });
    }
  }
  for (const re of BANNED) {
    if (re.test(copy.caption)) issues.push({ n: 0, problem: `в caption запрещённый паттерн ${re}`, fix: 'убрать' });
  }
  if (brief.cta_mechanic === 'comment_keyword' && brief.cta_keyword) {
    const kw = brief.cta_keyword.toLowerCase();
    const last = copy.slides.at(-1);
    if (!last || !`${last.headline} ${last.body}`.toLowerCase().includes(kw)) {
      issues.push({ n: last?.n ?? 0, problem: `на CTA-слайде нет слова ${brief.cta_keyword}`, fix: 'добавить' });
    }
    if (!copy.caption.toLowerCase().includes(kw)) {
      issues.push({ n: 0, problem: `в caption нет слова ${brief.cta_keyword}`, fix: 'добавить' });
    }
  }
  return { pass: issues.length === 0, issues };
}
