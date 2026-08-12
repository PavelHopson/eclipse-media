export type StoryboardFormat = '16:9' | '9:16' | '1:1';

export interface StoryboardScene {
  id: string;
  start: number;
  duration: 3;
  eyebrow: string;
  headline: string;
  body: string;
}

export interface ReleaseStoryboard {
  schemaVersion: 'eclipse.release-storyboard.v1';
  title: string;
  format: StoryboardFormat;
  duration: 15;
  publishRequiresApproval: true;
  scenes: StoryboardScene[];
}

const SCENE_IDS = ['signal', 'problem', 'changes', 'proof', 'action'] as const;
const FORMATS = new Set<StoryboardFormat>(['16:9', '9:16', '1:1']);

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') throw new Error(`${field}: ожидается текст.`);
  const normalized = [...value]
    .map((character) => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127 ? ' ' : character)
    .join('')
    .trim();
  if (!normalized || normalized.length > max) throw new Error(`${field}: длина должна быть от 1 до ${max} символов.`);
  return normalized;
}

export function parseStoryboardJson(raw: string): ReleaseStoryboard {
  if (new Blob([raw]).size > 64 * 1024) throw new Error('Файл больше 64 KB. Это не storyboard-контракт Shotforge.');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('Не удалось прочитать JSON. Скачайте файл заново из Shotforge.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('В корне JSON должен быть объект.');

  const input = value as Record<string, unknown>;
  const allowed = new Set(['schemaVersion', 'title', 'format', 'duration', 'publishRequiresApproval', 'scenes']);
  const extra = Object.keys(input).filter((key) => !allowed.has(key));
  if (extra.length) throw new Error(`Неизвестные поля заблокированы: ${extra.join(', ')}.`);
  if (input.schemaVersion !== 'eclipse.release-storyboard.v1') throw new Error('Поддерживается только eclipse.release-storyboard.v1.');
  if (!FORMATS.has(input.format as StoryboardFormat)) throw new Error('Формат должен быть 16:9, 9:16 или 1:1.');
  if (input.duration !== 15 || input.publishRequiresApproval !== true) throw new Error('Контракт должен длиться 15 секунд и требовать ручное подтверждение публикации.');
  if (!Array.isArray(input.scenes) || input.scenes.length !== 5) throw new Error('Нужно ровно пять сцен Shotforge.');

  const scenes = input.scenes.map((sceneValue, index): StoryboardScene => {
    if (!sceneValue || typeof sceneValue !== 'object' || Array.isArray(sceneValue)) throw new Error(`Сцена ${index + 1}: ожидается объект.`);
    const scene = sceneValue as Record<string, unknown>;
    const sceneAllowed = new Set(['id', 'start', 'duration', 'eyebrow', 'headline', 'body']);
    const sceneExtra = Object.keys(scene).filter((key) => !sceneAllowed.has(key));
    if (sceneExtra.length) throw new Error(`Сцена ${index + 1}: неизвестные поля ${sceneExtra.join(', ')}.`);
    if (scene.id !== SCENE_IDS[index] || scene.start !== index * 3 || scene.duration !== 3) throw new Error(`Сцена ${index + 1}: нарушен фиксированный timeline.`);
    return {
      id: SCENE_IDS[index], start: index * 3, duration: 3,
      eyebrow: text(scene.eyebrow, `Сцена ${index + 1} / eyebrow`, 60),
      headline: text(scene.headline, `Сцена ${index + 1} / headline`, 110),
      body: text(scene.body, `Сцена ${index + 1} / body`, 260),
    };
  });

  return {
    schemaVersion: 'eclipse.release-storyboard.v1',
    title: text(input.title, 'Название', 90),
    format: input.format as StoryboardFormat,
    duration: 15,
    publishRequiresApproval: true,
    scenes,
  };
}
