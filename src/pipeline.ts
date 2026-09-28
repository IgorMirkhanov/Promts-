import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { callJson, llmAvailable } from './llm.js';
import { generateBackground, imagesAvailable } from './images.js';
import { renderSlides } from './render.js';
import { ruleQa } from './steps/qa.js';
import { ArtSchema, BriefSchema, CopySchema, QaSchema, type Art, type Brief, type Copy, type Qa } from './schema.js';

/**
 * ТЗ → [1] копирайтер → [2] арт-директор → [3] QA (+ до 2 правок) → [4] фоны → [5] вёрстка PNG.
 *
 * Каждый шаг сохраняет результат в output/<имя ТЗ>/. Если файл шага уже есть, шаг пропускается —
 * так можно руками поправить текст в 01_copy.json и перерендерить без повторных вызовов LLM.
 * --force  — пересчитать всё заново.
 */
const args = process.argv.slice(2);
const force = args.includes('--force');
const briefPath = args.find((a) => !a.startsWith('--'));
if (!briefPath) {
  console.error('Использование: npm run carousel -- briefs/<тз>.json [--force]');
  process.exit(1);
}

const brief: Brief = BriefSchema.parse(JSON.parse(readFileSync(briefPath, 'utf8')));
const outDir = join('output', basename(briefPath, '.json'));
const dirs = { root: outDir, bg: join(outDir, 'backgrounds'), slides: join(outDir, 'slides') };
Object.values(dirs).forEach((d) => mkdirSync(d, { recursive: true }));

const log = (step: string, msg: string) => console.log(`[${step}] ${msg}`);

async function step<T>(file: string, name: string, schema: { parse(x: unknown): T }, run: () => Promise<T>): Promise<T> {
  const path = join(outDir, file);
  if (!force && existsSync(path)) {
    log(name, `взят из ${path}`);
    return schema.parse(JSON.parse(readFileSync(path, 'utf8')));
  }
  if (!llmAvailable) throw new Error(`[${name}] нет ${path} и не задан LLM_API_KEY — нечем сгенерировать`);
  log(name, 'генерация…');
  const result = await run();
  writeFileSync(path, JSON.stringify(result, null, 2));
  return result;
}

// [1] Копирайтер
let copy: Copy = await step('01_copy.json', 'copywriter', CopySchema, () => callJson('copywriter', brief, CopySchema));

// [3] QA: сначала жёсткие правила, затем LLM-редактор. До 2 итераций правок.
let qa: Qa = ruleQa(brief, copy);
for (let round = 1; llmAvailable && round <= 2; round++) {
  if (qa.pass) {
    const llmQa = await callJson('qa', { brief, carousel: copy }, QaSchema);
    qa = { pass: llmQa.pass && llmQa.issues.length === 0, issues: llmQa.issues };
  }
  if (qa.pass) break;
  log('qa', `раунд ${round}: ${qa.issues.length} замечаний → правка`);
  copy = await callJson('revise', { carousel: copy, issues: qa.issues }, CopySchema);
  writeFileSync(join(outDir, '01_copy.json'), JSON.stringify(copy, null, 2));
  qa = ruleQa(brief, copy);
}
writeFileSync(join(outDir, '03_qa.json'), JSON.stringify(qa, null, 2));
log('qa', qa.pass ? 'OK' : `ЕСТЬ ЗАМЕЧАНИЯ:\n${qa.issues.map((i) => `  #${i.n}: ${i.problem}`).join('\n')}`);

// [2] Арт-директор
const art: Art = await step('02_art.json', 'art-director', ArtSchema, () =>
  callJson('art-director', { brand: brief.brand, slides: copy.slides }, ArtSchema),
);

// [4] Фоны
const bgFiles: (string | undefined)[] = [];
for (const s of copy.slides) {
  const file = join(dirs.bg, `bg_${String(s.n).padStart(2, '0')}.png`);
  const a = art.slides.find((x) => x.n === s.n);
  if (!force && existsSync(file)) bgFiles.push(file);
  else if (imagesAvailable && a) {
    log('images', `слайд ${s.n}…`);
    const png = await generateBackground(`${a.image_prompt}\nStyle: ${art.style_anchor}`, a.negative_prompt);
    if (png) writeFileSync(file, png);
    bgFiles.push(png ? file : undefined);
  } else bgFiles.push(undefined);
}
if (!imagesAvailable) log('images', 'IMAGE_API_KEY не задан → процедурные фоны в фирменных цветах');

// [5] Вёрстка
let valueIdx = 0;
await renderSlides(
  brief,
  copy,
  copy.slides.map((s, i) => ({
    zone: art.slides.find((x) => x.n === s.n)?.text_zone ?? 'center',
    bgFile: bgFiles[i],
    valueIndex: s.intent === 'value' ? ++valueIdx : undefined,
  })),
  (n) => join(dirs.slides, `slide_${String(n).padStart(2, '0')}.png`),
);
writeFileSync(
  join(outDir, 'caption.txt'),
  `${copy.caption}\n\n${copy.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')}\n`,
);
log('done', `${copy.slides.length} слайдов → ${dirs.slides}, подпись → ${join(outDir, 'caption.txt')}`);
