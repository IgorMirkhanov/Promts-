import { chromium, type Browser } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Brief, Copy } from './schema.js';

const W = 1080;
const H = 1350;
const require = createRequire(import.meta.url);

function font(weight: number): string {
  const file = require.resolve(`@fontsource/montserrat/files/montserrat-cyrillic-${weight}-normal.woff2`);
  const latin = require.resolve(`@fontsource/montserrat/files/montserrat-latin-${weight}-normal.woff2`);
  return [file, latin]
    .map(
      (f) => `@font-face{font-family:M;font-weight:${weight};src:url(data:font/woff2;base64,${readFileSync(f).toString('base64')}) format('woff2');}`,
    )
    .join('\n');
}
const FONTS = [400, 600, 800, 900].map(font).join('\n');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** *слово* → акцентный цвет. */
const rich = (s: string) => esc(s).replace(/\*(.+?)\*/g, '<em>$1</em>');

/** Детерминированный псевдорандом, чтобы фон одного слайда не менялся между прогонами. */
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

/** Процедурный фон, если нет API генерации картинок: мягкие цветовые пятна + зерно. */
function proceduralBg(n: number, intent: string, colors: string[]): string {
  const [bg = '#0f172a', accent = '#f97316', extra = accent] = colors;
  const r = rng(n * 7919 + 13);
  const blob = (color: string, size: number, alpha: number) =>
    `radial-gradient(circle at ${Math.round(r() * 100)}% ${Math.round(r() * 100)}%, ${color}${Math.round(alpha * 255)
      .toString(16)
      .padStart(2, '0')} 0%, transparent ${size}%)`;
  if (intent === 'cta') {
    return `${blob(extra, 40, 0.3)}, linear-gradient(165deg, ${accent} 0%, ${accent} 55%, ${bg} 115%)`;
  }
  const strong = intent === 'hook' ? 0.75 : 0.35;
  return `${blob(accent, 55, strong)}, ${blob(extra, 45, strong * 0.6)}, ${blob(accent, 35, strong * 0.4)}, ${bg}`;
}

const GRAIN = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='f'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .07 0'/></filter><rect width='100%' height='100%' filter='url(#f)'/></svg>`,
)}")`;

interface SlideView {
  slide: Copy['slides'][number];
  total: number;
  zone: 'top' | 'center' | 'bottom';
  bgFile?: string;
  valueIndex?: number;
}

function slideHtml(brief: Brief, v: SlideView): string {
  const [bg = '#0f172a', accent = '#f97316'] = brief.brand.colors;
  const { slide, total, zone } = v;
  const isCta = slide.intent === 'cta';
  const isHook = slide.intent === 'hook';
  const background = v.bgFile
    ? `url(data:image/png;base64,${readFileSync(v.bgFile).toString('base64')}) center/cover`
    : proceduralBg(slide.n, slide.intent, brief.brand.colors);
  const justify = { top: 'flex-start', center: 'center', bottom: 'flex-end' }[zone];
  const scrim = { top: 'to bottom', center: 'to bottom', bottom: 'to top' }[zone];
  const keyword = isCta && brief.cta_mechanic === 'comment_keyword' ? brief.cta_keyword : undefined;
  const bodyHtml = keyword
    ? rich(slide.body).replace(new RegExp(esc(keyword), 'i'), `<span class="kw">${esc(keyword)}</span>`)
    : rich(slide.body);

  return `<!doctype html><html><head><meta charset="utf-8"><style>
${FONTS}
*{margin:0;padding:0;box-sizing:border-box}
body{width:${W}px;height:${H}px;font-family:M,sans-serif;color:#fff;overflow:hidden}
.bg{position:absolute;inset:0;background:${background}}
.grain{position:absolute;inset:0;background:${GRAIN}}
.scrim{position:absolute;inset:0;background:linear-gradient(${scrim}, ${isCta ? 'transparent' : bg + 'e6'} 0%, ${bg}00 ${v.bgFile ? 70 : 0}%)}
.wrap{position:absolute;inset:0;padding:120px 96px 150px;display:flex;flex-direction:column;justify-content:${justify};gap:40px}
.num{font-weight:900;font-size:220px;line-height:.8;color:${accent};opacity:.9;letter-spacing:-8px}
h1{font-weight:${isHook ? 900 : 800};font-size:${isHook ? 104 : 76}px;line-height:1.05;letter-spacing:-2px;text-wrap:balance}
h1 em{font-style:normal;color:${isCta ? bg : accent}}
p{font-weight:${isCta ? 600 : 400};font-size:${isHook ? 44 : 42}px;line-height:1.35;opacity:.92;text-wrap:pretty}
.kw{display:inline-block;background:#fff;color:${accent};font-weight:900;padding:4px 22px;border-radius:18px;margin:6px 0}
.footer{position:absolute;left:96px;right:96px;bottom:64px;display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:30px;opacity:.85}
.swipe{display:flex;align-items:center;gap:14px}
.swipe b{display:inline-block;background:${isCta ? '#fff' : accent};color:${isCta ? accent : '#fff'};border-radius:40px;padding:10px 28px}
.bar{position:absolute;top:56px;left:96px;right:96px;display:flex;gap:10px}
.bar i{flex:1;height:6px;border-radius:3px;background:#ffffff40}
.bar i.on{background:#fff}
</style></head><body>
<div class="bg"></div><div class="grain"></div><div class="scrim"></div>
<div class="bar">${Array.from({ length: total }, (_, i) => `<i class="${i < slide.n ? 'on' : ''}"></i>`).join('')}</div>
<div class="wrap">
  ${v.valueIndex ? `<div class="num">${String(v.valueIndex).padStart(2, '0')}</div>` : ''}
  <h1>${rich(slide.headline)}</h1>
  ${slide.body ? `<p>${bodyHtml}</p>` : ''}
</div>
<div class="footer"><span>${esc(brief.brand.name ?? '')}</span>
${isHook ? '<span class="swipe"><b>листай →</b></span>' : `<span>${slide.n}/${total}</span>`}</div>
</body></html>`;
}

export async function renderSlides(
  brief: Brief,
  copy: Copy,
  views: Omit<SlideView, 'total' | 'slide'>[],
  outFile: (n: number) => string,
): Promise<void> {
  const executablePath = process.env.CHROMIUM_PATH ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
  const browser: Browser = await chromium.launch({ executablePath });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    for (const [i, slide] of copy.slides.entries()) {
      await page.setContent(slideHtml(brief, { ...views[i]!, slide, total: copy.slides.length }), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: outFile(slide.n), type: 'png' });
    }
  } finally {
    await browser.close();
  }
}
