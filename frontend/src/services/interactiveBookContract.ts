export const INTERACTIVE_BOOK_SCHEMA = 'eclipse.media.interactive-book.v1';
export const MAX_BOOK_TITLE = 120;
export const MAX_CHAPTERS = 12;
export const MAX_BEATS_PER_CHAPTER = 24;

export type BookBeat = {
  id: string;
  title: string;
  narration: string;
  visual: string;
  duration: number;
  quiz?: { question: string; options: string[]; answer: number };
};

export type BookChapter = {
  id: string;
  title: string;
  summary: string;
  beats: BookBeat[];
};

export type InteractiveBookProject = {
  schema: typeof INTERACTIVE_BOOK_SCHEMA;
  id: string;
  title: string;
  audience: string;
  style: {
    mood: string;
    palette: string;
    typography: string;
    voice: string;
  };
  source: {
    fileName: string;
    mimeType: string;
    bytes: number;
    sha256: string;
    rightsConfirmed: boolean;
    sourceKeptPrivate: true;
  };
  chapters: BookChapter[];
  createdAt: string;
  generation: {
    storyboard: 'local-template';
    narration: 'not-generated';
    animation: 'not-generated';
    quizzes: 'editable-draft';
  };
};

export type InteractiveBookInput = {
  title: string;
  audience: string;
  chapterTitle: string;
  source: InteractiveBookProject['source'];
  style?: Partial<InteractiveBookProject['style']>;
};

function clean(value: string, max: number): string {
  if (typeof value !== 'string') throw new Error('Текстовое поле заполнено неверно.');
  if ([...value].some(char => {
    const point = char.codePointAt(0)!;
    return point < 32 || point === 127 || (point >= 0x202a && point <= 0x202e) || (point >= 0x2066 && point <= 0x2069);
  })) throw new Error('Удалите управляющие символы из текста.');
  const result = value.trim().replace(/\s+/g, ' ');
  if (!result || result.length > max) throw new Error(`Текст должен быть от 1 до ${max} символов.`);
  return result;
}

function id(prefix: string): string { return `${prefix}-${crypto.randomUUID()}`; }

export function createInteractiveBookProject(input: InteractiveBookInput): InteractiveBookProject {
  const title = clean(input.title, MAX_BOOK_TITLE);
  const audience = clean(input.audience, 180);
  const chapterTitle = clean(input.chapterTitle, 120);
  if (!input.source || !input.source.fileName || input.source.bytes <= 0 || input.source.mimeType !== 'application/pdf') {
    throw new Error('Нужен локальный PDF-файл с корректными метаданными.');
  }
  if (!input.source.rightsConfirmed) throw new Error('Подтвердите право на обработку PDF.');
  const style = {
    mood: clean(input.style?.mood ?? 'Редакционный, спокойный, исследовательский', 140),
    palette: clean(input.style?.palette ?? 'Графит, молочный, один акцент', 140),
    typography: clean(input.style?.typography ?? 'Крупные тезисы + короткие подписи', 140),
    voice: clean(input.style?.voice ?? 'Нейтральная, ясная, без рекламных обещаний', 140),
  };
  const chapter: BookChapter = {
    id: id('chapter'),
    title: chapterTitle,
    summary: `Черновой маршрут для главы «${chapterTitle}». Проверьте тезисы по исходному PDF перед озвучкой.`,
    beats: [
      { id: id('beat'), title: 'Контекст', narration: `Зачем читателю нужна глава «${chapterTitle}».`, visual: 'Титульный экран и один проверенный тезис.', duration: 8 },
      { id: id('beat'), title: 'Главная идея', narration: 'Сформулируйте один тезис своими словами и добавьте ссылку на страницу PDF.', visual: 'Схема: тезис → источник → вывод.', duration: 14, quiz: { question: 'Что нужно проверить перед публикацией?', options: ['Источник и права', 'Только цвет фона', 'Количество анимаций'], answer: 0 } },
      { id: id('beat'), title: 'Практика', narration: 'Дайте читателю небольшое действие, которое можно выполнить и проверить.', visual: 'Пошаговая карточка задания с ожидаемым результатом.', duration: 18 },
      { id: id('beat'), title: 'Итог', narration: 'Подведите итог и покажите, где продолжить изучение материала.', visual: 'Чек-лист и следующий шаг без автопубликации.', duration: 10 },
    ],
  };
  const project: InteractiveBookProject = {
    schema: INTERACTIVE_BOOK_SCHEMA,
    id: id('book'), title, audience, style,
    source: { ...input.source, sourceKeptPrivate: true },
    chapters: [chapter],
    createdAt: new Date().toISOString(),
    generation: { storyboard: 'local-template', narration: 'not-generated', animation: 'not-generated', quizzes: 'editable-draft' },
  };
  validateInteractiveBookProject(project);
  return project;
}

export function validateInteractiveBookProject(project: InteractiveBookProject): void {
  if (project.schema !== INTERACTIVE_BOOK_SCHEMA) throw new Error('Неизвестная схема веб-книги.');
  clean(project.title, MAX_BOOK_TITLE); clean(project.audience, 180);
  if (!project.source.sourceKeptPrivate || project.source.mimeType !== 'application/pdf' || !project.source.rightsConfirmed) throw new Error('Источник PDF не прошёл проверку приватности или прав.');
  if (!Number.isSafeInteger(project.source.bytes) || project.source.bytes <= 0) throw new Error('Размер PDF указан неверно.');
  if (!/^[a-f0-9]{64}$/i.test(project.source.sha256)) throw new Error('Для PDF нужен SHA-256.');
  if (!Array.isArray(project.chapters) || project.chapters.length < 1 || project.chapters.length > MAX_CHAPTERS) throw new Error('Количество глав должно быть от 1 до 12.');
  for (const chapter of project.chapters) {
    clean(chapter.title, 120); clean(chapter.summary, 500);
    if (!Array.isArray(chapter.beats) || chapter.beats.length < 1 || chapter.beats.length > MAX_BEATS_PER_CHAPTER) throw new Error('В главе должно быть от 1 до 24 beats.');
    for (const beat of chapter.beats) {
      clean(beat.title, 120); clean(beat.narration, 600); clean(beat.visual, 600);
      if (!Number.isFinite(beat.duration) || beat.duration <= 0 || beat.duration > 600) throw new Error('Длительность beat должна быть от 0 до 600 секунд.');
      if (beat.quiz) {
        clean(beat.quiz.question, 300);
        if (beat.quiz.options.length < 2 || beat.quiz.options.length > 6 || beat.quiz.answer < 0 || beat.quiz.answer >= beat.quiz.options.length) throw new Error('Квиз должен содержать 2–6 вариантов и корректный ответ.');
        beat.quiz.options.forEach(option => clean(option, 180));
      }
    }
  }
}

export function serializeInteractiveBookProject(project: InteractiveBookProject): string {
  validateInteractiveBookProject(project);
  return `${JSON.stringify(project, null, 2)}\n`;
}

export function totalBookDuration(project: InteractiveBookProject): number {
  return project.chapters.reduce((total, chapter) => total + chapter.beats.reduce((chapterTotal, beat) => chapterTotal + beat.duration, 0), 0);
}
