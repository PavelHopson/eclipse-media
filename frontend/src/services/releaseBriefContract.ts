import type { ReleaseStoryboard, StoryboardFormat } from './storyboardContract';

export type ReleaseBriefFormat = StoryboardFormat;
export type ReleaseBriefSceneId = 'signal' | 'inputs' | 'pipeline' | 'quality' | 'close';

export interface ReleaseBriefScene {
  id: ReleaseBriefSceneId;
  start: number;
  duration: 3;
  eyebrow: string;
  headline: string;
  body: string;
}

export interface ReleaseBriefDraft {
  schemaVersion: 'eclipse.release-brief.v1';
  templateId: 'eclipse-release-signal';
  title: string;
  format: ReleaseBriefFormat;
  duration: 15;
  renderRequiresApproval: true;
  publishRequiresApproval: true;
  scenes: ReleaseBriefScene[];
}

export interface ReleaseVariables {
  schemaVersion: 'eclipse.release-variables.v1';
  sourceBriefSchemaVersion: 'eclipse.release-brief.v1';
  templateId: 'eclipse-release-signal';
  title: string;
  format: ReleaseBriefFormat;
  duration: 15;
  renderRequiresApproval: true;
  publishRequiresApproval: true;
  execution: {
    network: false;
    shell: false;
    render: false;
    publish: false;
  };
  scenes: ReleaseBriefScene[];
}

export interface ReleaseBriefIssue {
  path: string;
  message: string;
}

export interface ReleaseBriefReview {
  claimsReviewed: boolean;
  noSensitiveData: boolean;
}

const MAX_JSON_BYTES = 32 * 1024;
const FORMATS = new Set<ReleaseBriefFormat>(['16:9', '9:16', '1:1']);
const SCENE_IDS: readonly ReleaseBriefSceneId[] = ['signal', 'inputs', 'pipeline', 'quality', 'close'];
const ROOT_KEYS = new Set([
  'schemaVersion', 'templateId', 'title', 'format', 'duration',
  'renderRequiresApproval', 'publishRequiresApproval', 'scenes',
]);
const SCENE_KEYS = new Set(['id', 'start', 'duration', 'eyebrow', 'headline', 'body']);
const SENSITIVE_TEXT_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*\S{8,}/i,
  /\b(?:sk-|gh[pousr]_)[A-Za-z0-9_-]{20,}\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
];

const DEFAULT_SCENES: readonly Omit<ReleaseBriefScene, 'start' | 'duration'>[] = [
  {
    id: 'signal',
    eyebrow: 'Eclipse Forge / Сигнал релиза',
    headline: 'Изменения должны быть видны.',
    body: 'Коротко покажите, что команда уже может использовать.',
  },
  {
    id: 'inputs',
    eyebrow: '01 / Проверенные входные данные',
    headline: 'Берём только то, что можно проверить.',
    body: 'Факты, демонстрация и подтверждённые результаты без неподкреплённых обещаний.',
  },
  {
    id: 'pipeline',
    eyebrow: '02 / Рабочий процесс',
    headline: 'Сигнал проходит понятный pipeline.',
    body: 'Сборка, проверка и ручное решение о запуске остаются видимыми.',
  },
  {
    id: 'quality',
    eyebrow: '03 / Контроль качества',
    headline: 'Креатив не отменяет контроль.',
    body: 'Перед рендером проверьте смысл, данные и соответствие реальному продукту.',
  },
  {
    id: 'close',
    eyebrow: 'Eclipse Media',
    headline: 'Собрать. Проверить. Выпустить.',
    body: 'Рендер и публикация запускаются только после отдельного подтверждения.',
  },
];

function cloneScenes(scenes: readonly ReleaseBriefScene[]): ReleaseBriefScene[] {
  return scenes.map((scene) => ({ ...scene }));
}

function hasForbiddenControl(value: string): boolean {
  return [...value].some((character) => {
    const point = character.codePointAt(0) ?? 0;
    return point <= 8
      || point === 11
      || point === 12
      || (point >= 14 && point <= 31)
      || (point >= 127 && point <= 159)
      || (point >= 0x202a && point <= 0x202e)
      || (point >= 0x2066 && point <= 0x2069);
  });
}

function normalizeText(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
}

function looksSensitive(value: string): boolean {
  return SENSITIVE_TEXT_PATTERNS.some((pattern) => pattern.test(value));
}

function validateText(
  value: unknown,
  path: string,
  label: string,
  max: number,
  issues: ReleaseBriefIssue[],
): string {
  if (typeof value !== 'string') {
    issues.push({ path, message: `${label}: ожидается текст.` });
    return '';
  }
  if (hasForbiddenControl(value)) {
    issues.push({ path, message: `${label}: управляющие и скрывающие направление символы запрещены.` });
  }
  if (looksSensitive(value)) {
    issues.push({ path, message: `${label}: строка похожа на секрет или ключ доступа.` });
  }
  if (/(?:https?:\/\/|www\.)/i.test(value)) {
    issues.push({ path, message: `${label}: ссылки в тексте релизного ролика запрещены.` });
  }
  const normalized = normalizeText(value);
  if (!normalized) issues.push({ path, message: `${label}: заполните поле.` });
  if (normalized.length > max) issues.push({ path, message: `${label}: максимум ${max} символов.` });
  return normalized;
}

function reportUnknownKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  issues: ReleaseBriefIssue[],
): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) {
    issues.push({ path, message: `Неизвестные поля заблокированы: ${unknown.join(', ')}.` });
  }
}

export function createDefaultReleaseBrief(format: ReleaseBriefFormat = '16:9'): ReleaseBriefDraft {
  return {
    schemaVersion: 'eclipse.release-brief.v1',
    templateId: 'eclipse-release-signal',
    title: 'Сигнал релиза Eclipse',
    format,
    duration: 15,
    renderRequiresApproval: true,
    publishRequiresApproval: true,
    scenes: DEFAULT_SCENES.map((scene, index) => ({
      ...scene,
      start: index * 3,
      duration: 3,
    })),
  };
}

export function createReleaseBriefFromStoryboard(storyboard: ReleaseStoryboard): ReleaseBriefDraft {
  const draft = createDefaultReleaseBrief(storyboard.format);
  return {
    ...draft,
    title: storyboard.title,
    scenes: draft.scenes.map((scene, index) => ({
      ...scene,
      eyebrow: storyboard.scenes[index].eyebrow,
      headline: storyboard.scenes[index].headline,
      body: storyboard.scenes[index].body,
    })),
  };
}

export function validateReleaseBriefDraft(value: unknown): ReleaseBriefIssue[] {
  const issues: ReleaseBriefIssue[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [{ path: 'root', message: 'В корне брифа должен быть объект.' }];
  }

  const draft = value as Record<string, unknown>;
  reportUnknownKeys(draft, ROOT_KEYS, 'root', issues);
  if (draft.schemaVersion !== 'eclipse.release-brief.v1') {
    issues.push({ path: 'schemaVersion', message: 'Поддерживается только eclipse.release-brief.v1.' });
  }
  if (draft.templateId !== 'eclipse-release-signal') {
    issues.push({ path: 'templateId', message: 'Разрешён только шаблон eclipse-release-signal.' });
  }
  validateText(draft.title, 'title', 'Название', 80, issues);
  if (!FORMATS.has(draft.format as ReleaseBriefFormat)) {
    issues.push({ path: 'format', message: 'Формат должен быть 16:9, 9:16 или 1:1.' });
  }
  if (draft.duration !== 15) issues.push({ path: 'duration', message: 'Длительность фиксирована: 15 секунд.' });
  if (draft.renderRequiresApproval !== true) {
    issues.push({ path: 'renderRequiresApproval', message: 'Рендер должен требовать ручное подтверждение.' });
  }
  if (draft.publishRequiresApproval !== true) {
    issues.push({ path: 'publishRequiresApproval', message: 'Публикация должна требовать ручное подтверждение.' });
  }
  if (!Array.isArray(draft.scenes) || draft.scenes.length !== 5) {
    issues.push({ path: 'scenes', message: 'Нужно ровно пять сцен по три секунды.' });
    return issues;
  }

  draft.scenes.forEach((sceneValue, index) => {
    const path = `scenes.${index}`;
    if (!sceneValue || typeof sceneValue !== 'object' || Array.isArray(sceneValue)) {
      issues.push({ path, message: `Сцена ${index + 1}: ожидается объект.` });
      return;
    }
    const scene = sceneValue as Record<string, unknown>;
    reportUnknownKeys(scene, SCENE_KEYS, path, issues);
    if (scene.id !== SCENE_IDS[index] || scene.start !== index * 3 || scene.duration !== 3) {
      issues.push({ path, message: `Сцена ${index + 1}: нарушен фиксированный timeline.` });
    }
    validateText(scene.eyebrow, `${path}.eyebrow`, `Сцена ${index + 1} / надпись`, 48, issues);
    validateText(scene.headline, `${path}.headline`, `Сцена ${index + 1} / заголовок`, 96, issues);
    validateText(scene.body, `${path}.body`, `Сцена ${index + 1} / описание`, 220, issues);
  });

  return issues;
}

function canonicalDraft(value: ReleaseBriefDraft): ReleaseBriefDraft {
  return {
    schemaVersion: 'eclipse.release-brief.v1',
    templateId: 'eclipse-release-signal',
    title: normalizeText(value.title),
    format: value.format,
    duration: 15,
    renderRequiresApproval: true,
    publishRequiresApproval: true,
    scenes: value.scenes.map((scene, index) => ({
      id: SCENE_IDS[index],
      start: index * 3,
      duration: 3,
      eyebrow: normalizeText(scene.eyebrow),
      headline: normalizeText(scene.headline),
      body: normalizeText(scene.body),
    })),
  };
}

export function parseReleaseBriefJson(raw: string): ReleaseBriefDraft {
  if (new TextEncoder().encode(raw).byteLength > MAX_JSON_BYTES) {
    throw new Error('Файл больше 32 KB. Бриф отклонён.');
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Не удалось прочитать JSON-бриф.');
  }
  const issues = validateReleaseBriefDraft(value);
  if (issues.length) throw new Error(issues[0].message);
  return canonicalDraft(value as ReleaseBriefDraft);
}

export function serializeReleaseBriefDraft(draft: ReleaseBriefDraft): string {
  const issues = validateReleaseBriefDraft(draft);
  if (issues.length) throw new Error(issues[0].message);
  return JSON.stringify(canonicalDraft(draft), null, 2);
}

export function buildReleaseVariables(
  draft: ReleaseBriefDraft,
  review: ReleaseBriefReview,
): ReleaseVariables {
  const issues = validateReleaseBriefDraft(draft);
  if (issues.length) throw new Error(issues[0].message);
  if (!review.claimsReviewed || !review.noSensitiveData) {
    throw new Error('Перед экспортом подтвердите факты и отсутствие секретов или персональных данных.');
  }
  const canonical = canonicalDraft(draft);
  return {
    schemaVersion: 'eclipse.release-variables.v1',
    sourceBriefSchemaVersion: 'eclipse.release-brief.v1',
    templateId: canonical.templateId,
    title: canonical.title,
    format: canonical.format,
    duration: 15,
    renderRequiresApproval: true,
    publishRequiresApproval: true,
    execution: {
      network: false,
      shell: false,
      render: false,
      publish: false,
    },
    scenes: cloneScenes(canonical.scenes),
  };
}

export function serializeReleaseVariables(
  draft: ReleaseBriefDraft,
  review: ReleaseBriefReview,
): string {
  return JSON.stringify(buildReleaseVariables(draft, review), null, 2);
}
