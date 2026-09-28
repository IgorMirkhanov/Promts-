import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { callJson, llmAvailable } from './llm.js';
import { generateBackground, imagesAvailable } from './images.js';
import { renderSlides } from './render.js';
import { ruleQa } from './steps/qa.js';
import { ArtSchema, BriefSchema, CopySchema, QaSchema, type Art, type Brief, type Copy, type Qa } from './schema.js';

export const ROOT = join(import.meta.dirname, '..');
export const OUTPUT_DIR = join(ROOT, 'output');

export const DEFAULT_BRAND: Brief['brand'] = {
  name: process.env.BRAND_NAME || '',
  colors: (process.env.BRAND_COLORS || '#0F172A,#F97316,#6366F1').split(',').map((c) => c.trim()),
  style: process.env.BRAND_STYLE || 'минимализм, мягкий свет',
};

export interface RunOptions {
  /** Пересчитать все шаги, игнорируя кэш. */
  force?: boolean;
  /** Прогонять LLM-редактора и правки. false — только правила (для ручных правок текста). */
  llmQa?: boolean;
  log?: (step: string, msg: string) => void;
}

export interface RunResult {
  name: string;
  dir: string;
  slides: string[];
  caption: string;
  qa: Qa;
}

/**
 * ТЗ → [0] разбор ТЗ → [1] копирайтер → [2] QA (+ до 2 правок) → [3] арт-директор → [4] фоны → [5] вёрстка PNG.
 *
 * Каждый шаг сохраняет результат в output/<name>/. Если файл шага уже есть, шаг пропускается —
 * так можно поправить текст в 01_copy.json и перерендерить без повторных вызовов LLM.
 */
export async function runPipeline(name: string, briefText: string, opts: RunOptions = {}): Promise<RunResult> {
  const { force = false, llmQa = true } = opts;
  const log = opts.log ?? ((step, msg) => console.log(`[${step}] ${msg}`));
  const outDir = join(OUTPUT_DIR, name);
  const dirs = { bg: join(outDir, 'backgrounds'), slides: join(outDir, 'slides') };
  Object.values(dirs).forEach((d) => mkdirSync(d, { recursive: true }));

  async function step<T>(file: string, stepName: string, schema: { parse(x: unknown): T }, run: () => Promise<T>): Promise<T> {
    const path = join(outDir, file);
    if (!force && existsSync(path)) {
      log(stepName, `взят из ${file}`);
      return schema.parse(JSON.parse(readFileSync(path, 'utf8')));
    }
    if (!llmAvailable) throw new Error(`[${stepName}] нет ${file} и не задан LLM_API_KEY — нечем сгенерировать`);
    log(stepName, 'генерация…');
    const result = await run();
    writeFileSync(path, JSON.stringify(result, null, 2));
    return result;
  }

  // [0] ТЗ: JSON берём как есть, свободный текст разбирает LLM.
  let brief: Brief;
  const asJson = tryJson(briefText);
  if (asJson) {
    brief = BriefSchema.parse(asJson);
    writeFileSync(join(outDir, '00_brief.json'), JSON.stringify(brief, null, 2));
  } else {
    brief = await step('00_brief.json', 'brief', BriefSchema, () =>
      callJson('brief-parser', { DEFAULT_BRAND, brief_text: briefText }, BriefSchema),
    );
  }
  log('brief', `${brief.topic} — ${brief.slides.length} слайдов`);

  // [1] Копирайтер
  let copy: Copy = await step('01_copy.json', 'copywriter', CopySchema, () => callJson('copywriter', brief, CopySchema));

  // [2] QA: жёсткие правила, затем LLM-редактор. До 2 раундов правок.
  let qa: Qa = ruleQa(brief, copy);
  for (let round = 1; llmAvailable && llmQa && round <= 2; round++) {
    if (qa.pass) {
      log('qa', 'проверка редактором…');
      const llm = await callJson('qa', { brief, carousel: copy }, QaSchema);
      qa = { pass: llm.pass && llm.issues.length === 0, issues: llm.issues };
    }
    if (qa.pass) break;
    log('qa', `раунд ${round}: ${qa.issues.length} замечаний → правка`);
    copy = await callJson('revise', { brief, carousel: copy, issues: qa.issues }, CopySchema);
    writeFileSync(join(outDir, '01_copy.json'), JSON.stringify(copy, null, 2));
    qa = ruleQa(brief, copy);
  }
  writeFileSync(join(outDir, '03_qa.json'), JSON.stringify(qa, null, 2));
  log('qa', qa.pass ? 'OK' : `есть замечания: ${qa.issues.map((i) => `#${i.n} ${i.problem}`).join('; ')}`);

  // [3] Арт-директор
  const art: Art = await step('02_art.json', 'art-director', ArtSchema, () =>
    callJson('art-director', { brand: brief.brand, slides: copy.slides }, ArtSchema),
  );

  // [4] Фоны
  const bgFiles: (string | undefined)[] = [];
  for (const s of copy.slides) {
    const file = join(dirs.bg, `bg_${pad(s.n)}.png`);
    const a = art.slides.find((x) => x.n === s.n);
    if (!force && existsSync(file)) bgFiles.push(file);
    else if (imagesAvailable && a) {
      log('images', `фон слайда ${s.n}…`);
      // Сбой генерации одного фона не должен ронять весь пост — ставим процедурный фон и идём дальше.
      const png = await generateBackground(`${a.image_prompt}\nStyle: ${art.style_anchor}`, a.negative_prompt).catch(
        (err: unknown) => {
          log('images', `⚠ слайд ${s.n}: ${err instanceof Error ? err.message : err}`);
          return null;
        },
      );
      if (png) writeFileSync(file, png);
      else log('images', `⚠ слайд ${s.n}: фон не получен, использую процедурный`);
      bgFiles.push(png ? file : undefined);
    } else bgFiles.push(undefined);
  }
  if (!imagesAvailable) log('images', 'IMAGE_API_KEY не задан → процедурные фоны в фирменных цветах');

  // [5] Вёрстка
  log('render', 'вёрстка слайдов…');
  let valueIdx = 0;
  const slideFile = (n: number) => join(dirs.slides, `slide_${pad(n)}.png`);
  await renderSlides(
    brief,
    copy,
    copy.slides.map((s, i) => ({
      zone: art.slides.find((x) => x.n === s.n)?.text_zone ?? 'center',
      bgFile: bgFiles[i],
      valueIndex: s.intent === 'value' ? ++valueIdx : undefined,
    })),
    slideFile,
  );
  const caption = `${copy.caption}\n\n${copy.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')}\n`;
  writeFileSync(join(outDir, 'caption.txt'), caption);
  log('done', `${copy.slides.length} слайдов готово`);
  return { name, dir: outDir, slides: copy.slides.map((s) => slideFile(s.n)), caption, qa };
}

/** Имя проекта из имени файла ТЗ. */
export const projectName = (file: string) => basename(file, extname(file));

const pad = (n: number) => String(n).padStart(2, '0');

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
