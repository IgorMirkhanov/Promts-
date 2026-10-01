import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Font } from 'satori';

const FILES: { file: string; weight: 400 | 600 | 800 | 900 }[] = [
  { file: 'Montserrat-Regular.ttf', weight: 400 },
  { file: 'Montserrat-SemiBold.ttf', weight: 600 },
  { file: 'Montserrat-ExtraBold.ttf', weight: 800 },
  { file: 'Montserrat-Black.ttf', weight: 900 },
];

let fonts: Font[] | undefined;
let backgroundDataUrl: string | undefined;

function asset(...parts: string[]): string {
  return join(process.cwd(), 'assets', ...parts);
}

/** Полные TTF: subset-woff не содержат цифры и пунктуацию вместе с кириллицей. */
export function loadFonts(): Font[] {
  if (fonts) return fonts;
  fonts = FILES.map(({ file, weight }) => ({
    name: 'Montserrat',
    data: readFileSync(asset('fonts', file)),
    weight,
    style: 'normal' as const,
  }));
  return fonts;
}

export function loadBackgroundDataUrl(): string {
  if (backgroundDataUrl) return backgroundDataUrl;
  const buf = readFileSync(asset('background.png'));
  backgroundDataUrl = `data:image/png;base64,${buf.toString('base64')}`;
  return backgroundDataUrl;
}
