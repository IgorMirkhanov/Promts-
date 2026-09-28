import 'dotenv/config';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { projectName, runPipeline } from './pipeline.js';

/**
 * npm run carousel -- briefs/post.json            один пост
 * npm run carousel -- briefs/post.txt             ТЗ свободным текстом
 * npm run carousel -- briefs/                     все ТЗ в папке
 * --force                                         пересчитать всё заново
 */
const args = process.argv.slice(2);
const force = args.includes('--force');
const targets = args.filter((a) => !a.startsWith('--'));
if (!targets.length) {
  console.error('Использование: npm run carousel -- briefs/<тз>.json|.txt|папка [--force]');
  process.exit(1);
}

const files = targets.flatMap((t) =>
  statSync(t).isDirectory()
    ? readdirSync(t)
        .filter((f) => /\.(json|txt|md)$/i.test(f))
        .map((f) => join(t, f))
    : [t],
);

let failed = 0;
for (const file of files) {
  console.log(`\n=== ${file}`);
  try {
    const res = await runPipeline(projectName(file), readFileSync(file, 'utf8'), { force });
    console.log(`→ ${res.dir}`);
  } catch (err) {
    failed++;
    console.error(`✗ ${file}: ${err instanceof Error ? err.message : err}`);
  }
}
process.exit(failed ? 1 : 0);
