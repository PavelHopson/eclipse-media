import { DRAFT_SCHEMA, decodeDraft, emptyBeatDraft, emptyResearchDraft, validateBeatDraft, validateResearchDraft,
  type BeatDraft, type ResearchDraft } from './draftContract';

export const PROJECT_SCHEMA = 'eclipse.media-project.v1';
export const MAX_PROJECT_BYTES = 4 * 1024 * 1024;
export interface MediaProjectFile { schema: typeof PROJECT_SCHEMA | 'eclipse.media-project.v2'; exportedAt: string; research: ResearchDraft; beats: BeatDraft }
const invalid = () => new Error('Файл проекта повреждён или содержит неподдерживаемые данные. Текущая работа не изменена.');

export function validateProjectFile(value: unknown): asserts value is MediaProjectFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const item = value as Record<string, unknown>;
  if (Object.keys(item).length !== 4 || !['schema', 'exportedAt', 'research', 'beats'].every((key) => Object.hasOwn(item, key))) throw invalid();
  if (item.schema !== PROJECT_SCHEMA && item.schema !== 'eclipse.media-project.v2') throw new Error('Это не поддерживаемый файл проекта. Выберите JSON, скачанный кнопкой «Скачать проект», а не экспорт отдельного разбора или сцен.');
  if (item.schema === PROJECT_SCHEMA && item.beats && typeof item.beats === 'object' && Object.hasOwn(item.beats, 'storyboard')) throw invalid();
  if (typeof item.exportedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(item.exportedAt) ||
    !Number.isFinite(Date.parse(item.exportedAt)) || new Date(item.exportedAt).toISOString() !== item.exportedAt) throw invalid();
  // Reuse strict draft validation, including record byte limits, while allowing unfinished fields.
  try {
    for (const kind of ['research', 'beats'] as const) {
      decodeDraft(JSON.stringify({ schema: DRAFT_SCHEMA, kind, revision: '00000000-0000-4000-8000-000000000000',
        updatedAt: 1, enabled: true, data: item[kind] }), kind, kind === 'research' ? validateResearchDraft : validateBeatDraft);
    }
  } catch { throw invalid(); }
}

export function parseProjectFile(raw: string): MediaProjectFile {
  if (!raw.length || new TextEncoder().encode(raw).byteLength > MAX_PROJECT_BYTES) throw new Error('Размер файла проекта должен быть от 1 байта до 4 МБ.');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw invalid(); }
  validateProjectFile(value);
  return value;
}

export function serializeProjectFile(research: ResearchDraft, beats: BeatDraft): string {
  const raw = JSON.stringify({ schema: beats.storyboard ? 'eclipse.media-project.v2' : PROJECT_SCHEMA, exportedAt: new Date().toISOString(), research, beats });
  parseProjectFile(raw);
  return raw;
}

export function hasProjectContent(research: ResearchDraft, beats: BeatDraft): boolean {
  return JSON.stringify(research) !== JSON.stringify(emptyResearchDraft()) || JSON.stringify(beats) !== JSON.stringify(emptyBeatDraft());
}

export async function readProjectFile(file: File): Promise<MediaProjectFile> {
  if (!/\.json$/i.test(file.name)) throw new Error('Выберите файл проекта Eclipse Media с расширением .json.');
  if (!file.size || file.size > MAX_PROJECT_BYTES) throw new Error('Размер файла проекта должен быть от 1 байта до 4 МБ.');
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_PROJECT_BYTES) throw new Error('Файл проекта больше 4 МБ.');
  let raw: string;
  try { raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new Error('Не удалось прочитать проект. Нужен JSON в кодировке UTF-8.'); }
  return parseProjectFile(raw);
}
