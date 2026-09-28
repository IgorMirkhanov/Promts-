# Генератор каруселей

ТЗ из контент-плана (JSON) → готовые PNG-слайды 1080×1350 + подпись к посту.

```
briefs/<тз>.json
   │
   ├─[1] Копирайтер      prompts/copywriter.md   → output/<тз>/01_copy.json
   ├─[2] QA + правки     src/steps/qa.ts (правила) + prompts/qa.md + prompts/revise.md → 03_qa.json
   ├─[3] Арт-директор    prompts/art-director.md → 02_art.json
   ├─[4] Фоны            src/images.ts (API генерации; без ключа — процедурный фон в цветах бренда)
   └─[5] Вёрстка         src/render.ts (HTML → PNG через Chromium) → slides/*.png, caption.txt
```

Текст на картинку **не** рисует нейросеть: она генерирует только фон, а текст накладывается шаблоном. Так кириллица без ошибок, а стиль одинаковый на всех слайдах.

## Запуск

```bash
npm install
cp .env.example .env        # вписать LLM_API_KEY (DeepSeek/OpenAI/...), по желанию IMAGE_API_KEY
npx playwright install chromium   # если Chromium ещё не установлен (или укажи CHROMIUM_PATH)
npm run carousel -- briefs/example.json
```

Каждый шаг кэшируется в `output/<тз>/`. Если файл шага уже есть, шаг пропускается: можно поправить текст руками в `01_copy.json` и перерендерить без вызовов LLM. `--force` пересчитывает всё заново.

## Формат ТЗ

См. `briefs/example.json`. Интенты слайдов: `hook`, `problem`, `story`, `value`, `bridge`, `cta`.
Механика CTA:
- `comment_keyword` — «Напиши в комментах СЛОВО — пришлю в директ» (ссылку отдаёт автоответ в директ);
- `link_in_bio` — «Полная версия — по ссылке в шапке профиля».

QA-правила запрещают URL, @-упоминания и слова «телеграм/тг/t.me» в слайдах и подписи.

## Пример

`output/example/` — результат прогона `briefs/example.json`. Шаги копирайтера и арт-директора для этого примера написаны вручную по промптам (в среде прогона не было API-ключа LLM). QA, фоны и вёрстку выполнил пайплайн.
