import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Brief, Copy, Intent } from './schema.js';

const W = 1080;
const H = 1350;

function getZone(intent: Intent): 'top' | 'center' | 'bottom' {
  if (['hook', 'bridge', 'cta'].includes(intent)) return 'center';
  return 'top';
}

function loadFont(name: string): ArrayBuffer {
  const path = join(process.cwd(), 'assets', 'fonts', name);
  return readFileSync(path) as any as ArrayBuffer;
}

const fonts = [
  { name: 'Montserrat', data: loadFont('montserrat-cyrillic-400-normal.woff'), weight: 400 as const },
  { name: 'Montserrat', data: loadFont('montserrat-latin-400-normal.woff'), weight: 400 as const },
  { name: 'Montserrat', data: loadFont('montserrat-cyrillic-600-normal.woff'), weight: 600 as const },
  { name: 'Montserrat', data: loadFont('montserrat-latin-600-normal.woff'), weight: 600 as const },
  { name: 'Montserrat', data: loadFont('montserrat-cyrillic-800-normal.woff'), weight: 800 as const },
  { name: 'Montserrat', data: loadFont('montserrat-latin-800-normal.woff'), weight: 800 as const },
  { name: 'Montserrat', data: loadFont('montserrat-cyrillic-900-normal.woff'), weight: 900 as const },
  { name: 'Montserrat', data: loadFont('montserrat-latin-900-normal.woff'), weight: 900 as const },
];

interface SlideView {
  slide: Copy['slides'][number];
  total: number;
  valueIndex?: number;
}

function renderHeadlineSpans(text: string, accent: string, isCta: boolean): any[] {
  const parts = text.split(/(\*[^*]+\*)/);
  return parts.map((part, i) => {
    if (part.startsWith('*')) {
      return {
        type: 'span',
        key: i,
        props: {
          style: { color: isCta ? '#0f172a' : accent, fontWeight: 800 },
          children: part.slice(1, -1),
        },
      };
    }
    return {
      type: 'span',
      key: i,
      props: { children: part || '' },
    };
  });
}

function renderBodySpans(text: string, keyword: string | undefined, accent: string): any[] {
  if (!keyword) {
    return [{ type: 'span', props: { children: text } }];
  }

  const parts = text.split(new RegExp(`(${keyword})`, 'i'));
  return parts.map((part, i) => {
    if (part.toLowerCase() === keyword.toLowerCase()) {
      return {
        type: 'div',
        key: i,
        props: {
          style: {
            display: 'block',
            background: '#fff',
            color: accent,
            fontWeight: 900,
            padding: '4px 22px',
            borderRadius: 18,
            margin: '6px 0',
          },
          children: part,
        },
      };
    }
    return { type: 'span', key: i, props: { children: part || '' } };
  });
}

async function renderSlideToSvg(brief: Brief, v: SlideView): Promise<string> {
  const [bg = '#0f172a', accent = '#f97316'] = brief.brand.colors;
  const { slide, total } = v;
  const isCta = slide.intent === 'cta';
  const isHook = slide.intent === 'hook';
  const zone = getZone(slide.intent);
  const justify = { top: 'flex-start', center: 'center', bottom: 'flex-end' }[zone];
  const bgFile = readFileSync(join(process.cwd(), 'assets', 'background.png')).toString('base64');
  const keyword = isCta && brief.cta_mechanic === 'comment_keyword' ? brief.cta_keyword : undefined;

  const vnode: any = {
    type: 'div',
    props: {
      style: {
        width: W,
        height: H,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: justify,
        padding: '120px 96px 150px',
        gap: 40,
        backgroundImage: `url(data:image/png;base64,${bgFile})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        overflow: 'hidden',
        position: 'relative',
      },
      children: [
        // Scrim gradient
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: isCta
                ? 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0) 70%)'
                : `linear-gradient(to bottom, ${bg}e6 0%, ${bg}00 70%)`,
            },
          },
        },
        // Progress bar
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: 56,
              left: 96,
              right: 96,
              display: 'flex',
              gap: 10,
            },
            children: Array.from({ length: total }).map((_, idx) => ({
              type: 'div',
              key: idx,
              props: {
                style: {
                  width: `${100 / total}%`,
                  height: 6,
                  borderRadius: 3,
                  background: idx < slide.n ? '#fff' : 'rgba(255,255,255,0.25)',
                },
              },
            })),
          },
        },
        // Content container
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: 40,
              position: 'relative',
            },
            children: [
              ...(v.valueIndex ? [{
                type: 'div',
                props: {
                  style: {
                    fontSize: 220,
                    fontWeight: 900,
                    lineHeight: 0.8,
                    color: accent,
                    opacity: 0.9,
                    letterSpacing: -8,
                    margin: 0,
                    fontFamily: 'Montserrat',
                  },
                  children: String(v.valueIndex).padStart(2, '0'),
                },
              }] : []),
              {
                type: 'h1',
                props: {
                  style: {
                    fontSize: isHook ? 104 : 76,
                    fontWeight: isHook ? 900 : 800,
                    lineHeight: 1.05,
                    letterSpacing: -2,
                    color: '#fff',
                    fontFamily: 'Montserrat',
                    display: 'flex',
                    flexWrap: 'wrap',
                    margin: 0,
                  },
                  children: renderHeadlineSpans(slide.headline, accent, isCta),
                },
              },
              ...(slide.body ? [{
                type: 'p',
                props: {
                  style: {
                    fontSize: 42,
                    fontWeight: isCta ? 600 : 400,
                    lineHeight: 1.35,
                    opacity: 0.92,
                    color: '#fff',
                    fontFamily: 'Montserrat',
                    margin: 0,
                    display: 'flex',
                    flexWrap: 'wrap',
                  },
                  children: renderBodySpans(slide.body, keyword, accent),
                },
              }] : []),
            ],
          },
        },
        // Footer
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              left: 96,
              right: 96,
              bottom: 64,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontWeight: 600,
              fontSize: 30,
              opacity: 0.85,
              color: '#fff',
              fontFamily: 'Montserrat',
            },
            children: [
              { type: 'span', props: { children: brief.brand.name ?? '' } },
              isHook ? {
                type: 'div',
                props: {
                  style: { display: 'flex', alignItems: 'center', gap: 14 },
                  children: [{
                    type: 'span',
                    props: {
                      style: {
                        display: 'block',
                        background: accent,
                        color: '#fff',
                        borderRadius: 40,
                        padding: '10px 28px',
                        fontWeight: 600,
                      },
                      children: 'листай →',
                    },
                  }],
                },
              } : {
                type: 'span',
                props: { children: `${slide.n}/${total}` },
              },
            ],
          },
        },
      ],
    },
  };

  return await satori(vnode, { width: W, height: H, fonts });
}

export async function renderSlide(brief: Brief, copy: Copy, slideNum: number): Promise<Buffer> {
  const slide = copy.slides.find(s => s.n === slideNum);
  if (!slide) throw new Error(`Слайд ${slideNum} не найден`);

  let valueIndex: number | undefined;
  if (slide.intent === 'value') {
    let count = 0;
    for (const s of copy.slides) {
      if (s.n > slideNum) break;
      if (s.intent === 'value') count++;
    }
    valueIndex = count;
  }

  const svg = await renderSlideToSvg(brief, { slide, total: copy.slides.length, valueIndex });
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: W } });
  return Buffer.from(resvg.render().asPng());
}

export async function renderSlides(
  brief: Brief,
  copy: Copy,
  outFile: (n: number) => string,
): Promise<void> {
  const fs = await import('node:fs/promises');
  for (const slide of copy.slides) {
    const png = await renderSlide(brief, copy, slide.n);
    await fs.writeFile(outFile(slide.n), png);
  }
}
