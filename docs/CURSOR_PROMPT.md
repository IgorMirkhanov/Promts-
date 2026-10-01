# Задача для Cursor: один фон, Gemini, деплой на Vercel

Ты дорабатываешь проект «Генератор каруселей» (Node 20, TypeScript, ESM, `"type": "module"`). Прочитай весь репозиторий перед началом: `README.md`, `src/`, `prompts/`, `web/index.html`, `briefs/`.

Сейчас пайплайн такой: ТЗ → [0] разбор ТЗ (LLM) → [1] копирайтер (LLM) → [2] QA (правила + LLM, до 2 правок) → [3] арт-директор (LLM) → [4] фоны (OpenAI Images или процедурные градиенты) → [5] вёрстка HTML→PNG через Playwright. Результаты пишутся на диск в `output/`, веб-сервер `src/server.ts` держит задачи в памяти.

Нужно сделать три вещи. Делай по порядку, после каждой части прогоняй `npx tsc --noEmit`.

---

## Часть 1. Один фиксированный фон для всех слайдов

Фон уже лежит в репо: `assets/background.png` (1080×1350, рабочий) и `assets/background@2x.png` (2160×2700, исходник). Текста на нём нет, зерно уже «запечено».

1. Все слайды, включая CTA, используют `assets/background.png` как фон на всю площадь (cover).
2. Удали шаг арт-директора и генерацию картинок целиком:
   - `prompts/art-director.md`, `src/images.ts`, `ArtSchema` в `src/schema.ts`, файл шага `02_art.json`;
   - переменные `IMAGE_API_KEY`, `IMAGE_BASE_URL`, `IMAGE_MODEL` из `.env.example` и README;
   - функцию `proceduralBg` и её вызовы;
   - поле `visual_idea` из промпта копирайтера и из `CopySchema`.
3. Зона текста теперь задаётся интентом, а не арт-директором: `hook`, `bridge`, `cta` — по центру; `problem`, `story`, `value` — сверху.
4. Для читаемости поверх фона оставь затемнение (scrim): линейный градиент цвета `brand.colors[0]` от ~85% непрозрачности со стороны текста до 0% примерно на 70% высоты.
5. CTA-слайд отличается не фоном, а плашкой кодового слова: белая скруглённая плашка, текст акцентным цветом `brand.colors[1]`, жирный.
6. Всё остальное оформление остаётся как сейчас: Montserrat; полоска прогресса сверху; большой номер `01/02/03` у value-слайдов акцентным цветом; footer с названием бренда и «N/всего»; кнопка «листай →» на первом слайде; выделение `*слова*` акцентным цветом. Размеры шрифтов и отступы бери из текущего `src/render.ts`.

## Часть 2. Gemini вместо DeepSeek

Gemini подключаем через его OpenAI-совместимый эндпоинт, тогда пакет `openai` и `src/llm.ts` почти не меняются.

1. Переменные окружения:
   - `GEMINI_API_KEY` — обязательна;
   - `GEMINI_MODEL` — по умолчанию `gemini-2.5-flash`;
   - baseURL зашит в код: `https://generativelanguage.googleapis.com/v1beta/openai/`.
   Убери `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` из кода, `.env.example` и README.
2. Оставь `response_format: { type: 'json_object' }`. Если API отвечает 400 из-за `response_format`, повтори тот же запрос без него.
3. Перед `JSON.parse` убирай обёртку ```json … ``` и всё до первой `{` и после последней `}`: Gemini иногда добавляет markdown.
4. Таймаут на один вызов — 45 секунд (опция `timeout` клиента OpenAI), `maxRetries: 1`.
5. Существующая логика повтора при невалидном JSON (1 повтор с текстом ошибки) остаётся.
6. Ключ используется **только на сервере**. Он никогда не попадает в браузер, в ответы API и в логи.

## Часть 3. Подготовка к хостингу на Vercel

Ограничения Vercel, под которые проектируем:
- функции бессерверные, диск только для чтения (кроме `/tmp`) и не сохраняется между запросами, поэтому состояние в памяти и `output/` не работают;
- лимит ответа функции — 4,5 МБ, а один слайд PNG весит ~1–1,6 МБ, поэтому рендерим **по одному слайду на запрос**;
- Playwright/Chromium в функции тяжёлый и медленный, поэтому вёрстку переводим на **satori + @resvg/resvg-js**.

### 3.1. Структура

```
api/                 Vercel Functions (Node runtime, Web-сигнатура Request → Response)
  status.ts          GET  → { llm: boolean, auth: boolean }   (без пароля)
  brief.ts           POST { text }            → Brief
  copy.ts            POST { brief }           → { copy, qa }
  check.ts           POST { brief, copy }     → Qa (только правила, без LLM)
  render.ts          POST { brief, copy, n }  → image/png (один слайд)
src/core/            общая логика для api/, локального сервера и CLI
  schema.ts, llm.ts, qa.ts, pipeline.ts (parseBrief, writeCopy), render.ts (renderSlide → Buffer), assets.ts, auth.ts
src/cli.ts           пакетный режим: пишет в output/ (локально)
src/dev-server.ts    локальный сервер: отдаёт public/ и проксирует /api/* в те же обработчики
public/index.html    интерфейс
assets/              background.png, fonts/*.woff
prompts/             промпты
vercel.json
```

Функции в `api/*.ts` экспортируют методы в Web-формате:
```ts
export async function POST(request: Request): Promise<Response> { … }
export const config = { maxDuration: 60 };
```
Каждая функция — тонкая обёртка над `src/core`. Пути к файлам строй от `process.cwd()` (`join(process.cwd(), 'assets', …)`), а не от `import.meta.dirname`.

### 3.2. `vercel.json`

```json
{
  "functions": {
    "api/**/*.ts": { "maxDuration": 60, "includeFiles": "{assets,prompts}/**" }
  }
}
```
Framework Preset — Other, build command не нужен, статика из `public/`.

### 3.3. Рендер на satori

1. Зависимости: `satori`, `@resvg/resvg-js`. Удали `playwright-core`.
2. Satori **не умеет woff2**. Скопируй из `@fontsource/montserrat/files/` файлы `montserrat-cyrillic-{400,600,800,900}-normal.woff` и `montserrat-latin-{400,600,800,900}-normal.woff` в `assets/fonts/` и закоммить их. Передай их в satori как один family `Montserrat` с соответствующими weight.
3. Шрифты и фон читай один раз на холодном старте (кэш в переменной модуля).
4. Фон — абсолютный `<img>` (data URL из `assets/background.png`) на 1080×1350, поверх него scrim, поверх него контент.
5. В satori у каждого `div` с несколькими детьми должен быть `display: flex`. Выделение `*слова*`: разбей headline на слова, каждое слово — отдельный `span` в контейнере `display:flex; flexWrap:wrap; columnGap: ~0.25em`, выделенные слова — акцентным цветом. Так же сделай body, если в нём есть кодовое слово для плашки.
6. `text-wrap: balance` в satori нет — это нормально.
7. Вывод: `new Resvg(svg, { fitTo: { mode: 'width', value: 1080 } }).render().asPng()`. Проверь, что каждый PNG < 4 МБ.
8. Результат должен визуально совпадать с текущими слайдами из `output/example/slides/` (кроме фона). Сравни вручную на примере `briefs/example.json`.

### 3.4. Пароль на приложение

Ключ Gemini платный, а адрес Vercel публичный.
1. Переменная `APP_PASSWORD`. Все `/api/*`, кроме `status`, проверяют заголовок `x-app-password`. Сравнение через `crypto.timingSafeEqual` (с выравниванием длины). При несовпадении — `401 { error }`.
2. Если `APP_PASSWORD` не задан, приложение работает без пароля, а `status` возвращает `auth: false`. В README напиши, что на Vercel пароль обязателен.
3. В UI при первом 401 показывай поле ввода пароля и сохраняй пароль в `localStorage`.

### 3.5. Интерфейс `public/index.html`

Перенеси текущий `web/index.html` и переделай под бессерверную схему. Шаги оркестрирует клиент:
1. «Разбор ТЗ» → `POST /api/brief`.
2. «Тексты и проверка» → `POST /api/copy`.
3. «Вёрстка слайдов N/всего» → `POST /api/render` по каждому слайду, параллельно не больше 3 запросов. Картинки показывай через `URL.createObjectURL(blob)`.

Под каждым шагом — понятный статус и текст ошибки, если шаг упал. Кнопка «Повторить» продолжает с упавшего шага.

Состояние:
- проекты (`name`, `brief`, `copy`, `qa`, дата) храни в `localStorage`; список слева, как сейчас;
- PNG в `localStorage` не храни: при открытии проекта перерендеривай слайды запросами к `/api/render`.

Правка текста: поля headline/body/caption → «Сохранить и перерисовать» → `POST /api/check` (показать замечания) → `POST /api/render` по всем слайдам. LLM при этом не вызывается.

«Скачать все» — ZIP через JSZip (`https://cdn.jsdelivr.net/npm/jszip@3/dist/jszip.min.js`), файлы `slide_01.png…` + `caption.txt`. Также оставь скачивание по одному и копирование подписи.

Удали `web/`, `src/server.ts`, `src/images.ts`, `src/render.ts` (старый) после переноса.

### 3.6. Локальный запуск и CLI

- `src/dev-server.ts` на `node:http`: отдаёт `public/`, а `/api/<name>` конвертирует в `Request` и вызывает экспорт нужного метода из `api/<name>.ts`. Так локально работает тот же код, что на Vercel. Загружает `.env` через `dotenv`.
- `package.json`: `"dev": "tsx src/dev-server.ts"`, `"carousel": "tsx src/cli.ts"`, `"typecheck": "tsc --noEmit"`. `start.cmd` и `start.sh` запускают `npm run dev`.
- CLI (`npm run carousel -- briefs/…`) остаётся: использует `src/core`, пишет `output/<имя>/00_brief.json`, `01_copy.json`, `03_qa.json`, `slides/*.png`, `caption.txt`, кэш шагов как сейчас.
- `tsconfig.json` должен включать `api` и `src`.

### 3.7. README

Перепиши разделы «Быстрый старт», «Ключи», «Как устроено» и добавь «Деплой на Vercel»:
1. Запушить репо на GitHub.
2. vercel.com → Add New → Project → Import репо → Framework Preset: Other.
3. Environment Variables: `GEMINI_API_KEY`, `APP_PASSWORD`, при желании `GEMINI_MODEL`, `BRAND_NAME`, `BRAND_COLORS`.
4. Deploy. Открыть URL, ввести пароль.

Где взять ключ: aistudio.google.com → Get API key. Подписка Gemini (Google AI Pro) в приложении — это не доступ к API: у API свой бесплатный лимит и своя оплата в Google Cloud.

---

## Критерии готовности

- [ ] `npx tsc --noEmit` без ошибок.
- [ ] Локально `npm run dev` → вставить `briefs/example-text.txt` → получить 7 слайдов на фоне `assets/background.png`, подпись, результат проверки.
- [ ] Правка текста перерисовывает слайды без вызова Gemini (проверь по логам).
- [ ] `npm run carousel -- briefs/example.json` работает без ключа (тексты из кэша `output/example/01_copy.json`) и выдаёт PNG через satori.
- [ ] Каждый ответ `/api/render` — один PNG меньше 4 МБ.
- [ ] Без `x-app-password` (при заданном `APP_PASSWORD`) все `/api/*`, кроме `status`, отвечают 401.
- [ ] В `api/` и `src/core/` нет записи на диск и нет состояния между запросами.
- [ ] `GEMINI_API_KEY` нигде не уходит на клиент; `grep -r "GEMINI_API_KEY" public/` пусто.
- [ ] Нигде не осталось `deepseek`, `playwright`, `IMAGE_API_KEY`, `art-director` (`grep -ri`).
- [ ] Ссылки и слова «телеграм/тг/t.me» по-прежнему блокируются проверкой (не трогай `BANNED` в QA).
- [ ] `.env` в `.gitignore`, `.env.example` обновлён.
