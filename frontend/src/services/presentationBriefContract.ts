export const PRESENTATION_BRIEF_SCHEMA = 'eclipse.media.presentation-brief.v1';
export const MAX_BRIEF_SOURCES = 12;
export const MAX_FORBIDDEN_CLAIMS = 12;

export type PresentationFormat = 'ppt-16-9' | 'ppt-4-3' | 'carousel-4-5';
export type SourceReview = 'unchecked' | 'checked';

export type BriefSource = {
  id: string;
  title: string;
  url: string;
  claim: string;
  review: SourceReview;
};

export type PresentationBrief = {
  schema: typeof PRESENTATION_BRIEF_SCHEMA;
  id: string;
  title: string;
  goal: string;
  audience: string;
  format: PresentationFormat;
  slideCount: number;
  visualDirection: string;
  sources: BriefSource[];
  forbiddenClaims: string[];
  rightsConfirmed: boolean;
  privateDataExcluded: boolean;
  status: 'draft';
  createdAt: string;
};

export type PresentationBriefInput = Omit<PresentationBrief, 'schema' | 'id' | 'status' | 'createdAt'>;

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

function safeUrl(value: string): string {
  const url = clean(value, 2048);
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('Источник должен быть корректным URL.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Источник должен быть публичным HTTP(S)-адресом без логина и пароля.');
  return parsed.href;
}

function makeId(prefix: string): string { return `${prefix}-${crypto.randomUUID()}`; }

export function createPresentationBrief(input: PresentationBriefInput): PresentationBrief {
  const brief: PresentationBrief = {
    schema: PRESENTATION_BRIEF_SCHEMA,
    id: makeId('brief'),
    title: clean(input.title, 140),
    goal: clean(input.goal, 600),
    audience: clean(input.audience, 240),
    format: input.format,
    slideCount: input.slideCount,
    visualDirection: clean(input.visualDirection, 300),
    sources: input.sources.map(source => ({ id: source.id || makeId('source'), title: clean(source.title, 140), url: safeUrl(source.url), claim: clean(source.claim, 500), review: source.review })),
    forbiddenClaims: input.forbiddenClaims.map(claim => clean(claim, 300)).filter(Boolean),
    rightsConfirmed: input.rightsConfirmed,
    privateDataExcluded: input.privateDataExcluded,
    status: 'draft',
    createdAt: new Date().toISOString(),
  };
  validatePresentationBrief(brief);
  return brief;
}

export function validatePresentationBrief(brief: PresentationBrief): void {
  if (brief.schema !== PRESENTATION_BRIEF_SCHEMA) throw new Error('Неизвестная схема presentation brief.');
  clean(brief.title, 140); clean(brief.goal, 600); clean(brief.audience, 240); clean(brief.visualDirection, 300);
  if (!['ppt-16-9', 'ppt-4-3', 'carousel-4-5'].includes(brief.format)) throw new Error('Неподдерживаемый формат презентации.');
  if (!Number.isInteger(brief.slideCount) || brief.slideCount < 3 || brief.slideCount > 300) throw new Error('Количество слайдов должно быть от 3 до 300.');
  if (!Array.isArray(brief.sources) || brief.sources.length < 1 || brief.sources.length > MAX_BRIEF_SOURCES) throw new Error('Добавьте от 1 до 12 источников.');
  const sourceIds = new Set<string>();
  for (const source of brief.sources) {
    if (sourceIds.has(source.id)) throw new Error('Источники должны иметь уникальные ID.');
    sourceIds.add(source.id); clean(source.title, 140); safeUrl(source.url); clean(source.claim, 500);
    if (!['unchecked', 'checked'].includes(source.review)) throw new Error('Неверный статус проверки источника.');
  }
  if (brief.forbiddenClaims.length > MAX_FORBIDDEN_CLAIMS) throw new Error('Слишком много запрещённых утверждений.');
  brief.forbiddenClaims.forEach(claim => clean(claim, 300));
  if (!brief.rightsConfirmed) throw new Error('Подтвердите права на материалы презентации.');
  if (!brief.privateDataExcluded) throw new Error('Приватные данные должны быть исключены до передачи в внешний сервис.');
}

export function serializePresentationBrief(brief: PresentationBrief): string {
  validatePresentationBrief(brief);
  return `${JSON.stringify(brief, null, 2)}\n`;
}

export function buildSnapdeckPrompt(brief: PresentationBrief): string {
  validatePresentationBrief(brief);
  const sources = brief.sources.map(source => `- ${source.title}: ${source.url}\n  Тезис: ${source.claim} [${source.review}]`).join('\n');
  const forbidden = brief.forbiddenClaims.length ? brief.forbiddenClaims.map(claim => `- ${claim}`).join('\n') : '- Не добавлять неподтверждённые цифры, отзывы и обещания.';
  return `Создай презентацию «${brief.title}» в формате ${brief.format}, ${brief.slideCount} слайдов.\nЦель: ${brief.goal}\nАудитория: ${brief.audience}\nВизуальное направление: ${brief.visualDirection}\n\nИсточники (используй только проверенные редактором):\n${sources}\n\nНе использовать:\n${forbidden}\nСначала покажи outline слайдов для ручного согласования, затем дизайн.`;
}
