export const MEDIA_LIBRARY_SCHEMA = 'eclipse.media-library-item.v1' as const;
export const MAX_LIBRARY_FILE_BYTES = 512 * 1024 * 1024;

export type MediaKind = 'video' | 'audio' | 'image';
export type RightsBasis = 'owned' | 'licensed' | 'permission' | 'public-domain';
export type AllowedChannel = 'internal' | 'web' | 'social' | 'client' | 'broadcast';
export type MediaWorkflowStage = 'registered' | 'rights-reviewed' | 'in-edit' | 'ready';

export interface MediaLibraryInput {
  title: string;
  project: string;
  file: {
    name: string;
    sizeBytes: number;
    mimeType: string;
    sha256: string;
  };
  rights: {
    basis: RightsBasis;
    owner: string;
    sourceUrl: string;
    sourceAssetId: string;
    licenseName: string;
    licenseUrl: string;
    acquiredAt: string;
    expiresAt: string;
    clientScope: string;
    allowedChannels: AllowedChannel[];
    certificateFileName: string;
    trainingAllowed: boolean;
    confirmed: boolean;
  };
}

export interface MediaLibraryItem {
  schemaVersion: typeof MEDIA_LIBRARY_SCHEMA;
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  project: string;
  kind: MediaKind;
  file: {
    name: string;
    sizeBytes: number;
    mimeType: string;
    sha256: string;
    storedByEclipse: false;
  };
  rightsReceipt: {
    basis: RightsBasis;
    owner: string;
    sourceUrl: string | null;
    sourceAssetId: string | null;
    licenseName: string;
    licenseUrl: string | null;
    acquiredAt: string;
    expiresAt: string | null;
    clientScope: string | null;
    allowedChannels: AllowedChannel[];
    certificateFileName: string | null;
    trainingAllowed: boolean;
    confirmedAt: string;
  };
  workflow: {
    stage: MediaWorkflowStage;
    progress: 25 | 50 | 75 | 100;
    canResume: true;
    nextAction: string | null;
    transformations: string[];
    outputs: string[];
  };
  policy: {
    torrentAcquisition: false;
    scraperAcquisition: false;
    drmBypass: false;
    remoteFetch: false;
    autoPublish: false;
  };
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,96}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_FILE = /^[^\\/:*?"<>|]{1,180}$/;
const ALLOWED_CHANNELS = new Set<AllowedChannel>(['internal', 'web', 'social', 'client', 'broadcast']);
const BLOCKED_SOURCE_HOSTS = [
  'kemono.cr',
  'playtorrio.pages.dev',
];
function hasUnsafeCharacters(value: string, blockBidiControls = false): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
    if (blockBidiControls && (
      (codePoint >= 0x202a && codePoint <= 0x202e)
      || (codePoint >= 0x2066 && codePoint <= 0x2069)
    )) return true;
  }
  return false;
}


function cleanText(value: string, field: string, min: number, max: number): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < min || normalized.length > max || hasUnsafeCharacters(normalized, true)) {
    throw new Error(`${field}: нужно от ${min} до ${max} безопасных символов`);
  }
  return normalized;
}

function optionalText(value: string, field: string, max: number): string | null {
  if (!value.trim()) return null;
  return cleanText(value, field, 1, max);
}

function safeUrl(value: string, required: boolean, field: string): string | null {
  if (!value.trim() && !required) return null;
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new Error(`${field}: укажите корректную HTTPS-ссылку`); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`${field}: разрешена HTTPS-ссылка без логина и пароля`);
  const host = url.hostname.toLowerCase();
  if (BLOCKED_SOURCE_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) {
    throw new Error(`${field}: этот источник запрещён политикой прав Eclipse Media`);
  }
  url.hash = '';
  return url.toString();
}

function parseDate(value: string, field: string, required: boolean): string | null {
  if (!value.trim() && !required) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error(`${field}: укажите корректную дату`);
  return date.toISOString();
}

function mediaKind(mimeType: string, fileName: string): MediaKind {
  if (mimeType.startsWith('video/') || /\.(mp4|mov|mkv|webm|m4v)$/i.test(fileName)) return 'video';
  if (mimeType.startsWith('audio/') || /\.(mp3|wav|flac|m4a|aac|ogg|opus)$/i.test(fileName)) return 'audio';
  if (mimeType.startsWith('image/') || /\.(png|jpe?g|webp|avif)$/i.test(fileName)) return 'image';
  throw new Error('Поддерживаются локальные видео, аудио и изображения');
}

export function createMediaLibraryItem(
  input: MediaLibraryInput,
  now = new Date(),
  id = crypto.randomUUID(),
): MediaLibraryItem {
  if (!SAFE_ID.test(id)) throw new Error('ID карточки содержит недопустимые символы');
  if (!SAFE_FILE.test(input.file.name) || hasUnsafeCharacters(input.file.name) || input.file.name === '.' || input.file.name === '..') {
    throw new Error('Имя файла не должно содержать путь или служебные символы');
  }
  if (!Number.isInteger(input.file.sizeBytes) || input.file.sizeBytes <= 0 || input.file.sizeBytes > MAX_LIBRARY_FILE_BYTES) {
    throw new Error('Размер файла должен быть от 1 байта до 512 МБ');
  }
  const sha256 = input.file.sha256.toLowerCase();
  if (!SHA256.test(sha256)) throw new Error('Нужен полный SHA-256 локального файла');
  if (!['owned', 'licensed', 'permission', 'public-domain'].includes(input.rights.basis)) throw new Error('Выберите основание прав');
  if (!input.rights.confirmed) throw new Error('Подтвердите право хранить и обрабатывать этот материал');

  const channels = [...new Set(input.rights.allowedChannels)];
  if (!channels.length || channels.some((channel) => !ALLOWED_CHANNELS.has(channel))) throw new Error('Выберите хотя бы один разрешённый канал');
  const externalRights = input.rights.basis !== 'owned';
  const sourceUrl = safeUrl(input.rights.sourceUrl, externalRights, 'Источник');
  const licenseUrl = safeUrl(input.rights.licenseUrl, input.rights.basis === 'licensed', 'Лицензия');
  const sourceAssetId = optionalText(input.rights.sourceAssetId, 'ID ассета', 160);
  const certificateFileName = optionalText(input.rights.certificateFileName, 'Сертификат', 180);
  if (externalRights && !sourceAssetId) throw new Error('Для внешнего материала нужен официальный asset ID');
  if (input.rights.basis === 'licensed' && !certificateFileName) throw new Error('Для лицензированного материала укажите файл сертификата');
  const acquiredAt = parseDate(input.rights.acquiredAt, 'Дата получения', true)!;
  const expiresAt = parseDate(input.rights.expiresAt, 'Срок действия', false);
  if (expiresAt && new Date(expiresAt) <= new Date(acquiredAt)) throw new Error('Срок действия должен быть позже даты получения');
  const clientScope = optionalText(input.rights.clientScope, 'Клиентский scope', 240);
  if (channels.includes('client') && !clientScope) throw new Error('Для клиентского канала укажите клиента или договор');

  const timestamp = now.toISOString();
  return {
    schemaVersion: MEDIA_LIBRARY_SCHEMA,
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
    title: cleanText(input.title, 'Название', 2, 120),
    project: cleanText(input.project, 'Проект', 2, 120),
    kind: mediaKind(input.file.mimeType, input.file.name),
    file: {
      name: input.file.name,
      sizeBytes: input.file.sizeBytes,
      mimeType: cleanText(input.file.mimeType || 'application/octet-stream', 'MIME type', 3, 120),
      sha256,
      storedByEclipse: false,
    },
    rightsReceipt: {
      basis: input.rights.basis,
      owner: cleanText(input.rights.owner, 'Владелец прав', 2, 160),
      sourceUrl,
      sourceAssetId,
      licenseName: cleanText(input.rights.licenseName, 'Лицензия', 2, 160),
      licenseUrl,
      acquiredAt,
      expiresAt,
      clientScope,
      allowedChannels: channels,
      certificateFileName,
      trainingAllowed: input.rights.trainingAllowed,
      confirmedAt: timestamp,
    },
    workflow: {
      stage: 'registered',
      progress: 25,
      canResume: true,
      nextAction: 'Проверить права и сертификат',
      transformations: [],
      outputs: [],
    },
    policy: {
      torrentAcquisition: false,
      scraperAcquisition: false,
      drmBypass: false,
      remoteFetch: false,
      autoPublish: false,
    },
  };
}

const NEXT_STAGE: Record<Exclude<MediaWorkflowStage, 'ready'>, { stage: MediaWorkflowStage; progress: 50 | 75 | 100; nextAction: string | null }> = {
  registered: { stage: 'rights-reviewed', progress: 50, nextAction: 'Выбрать монтажный проект' },
  'rights-reviewed': { stage: 'in-edit', progress: 75, nextAction: 'Завершить монтаж и проверить экспорт' },
  'in-edit': { stage: 'ready', progress: 100, nextAction: null },
};

export function advanceMediaLibraryItem(item: MediaLibraryItem, note: string, now = new Date()): MediaLibraryItem {
  if (item.workflow.stage === 'ready') throw new Error('Карточка уже готова');
  const normalizedNote = cleanText(note, 'Комментарий этапа', 3, 240);
  const next = NEXT_STAGE[item.workflow.stage];
  return {
    ...item,
    updatedAt: now.toISOString(),
    workflow: {
      ...item.workflow,
      ...next,
      transformations: [...item.workflow.transformations, normalizedNote].slice(-20),
    },
  };
}

export function serializeMediaLibraryItem(item: MediaLibraryItem): string {
  return `${JSON.stringify(item, null, 2)}\n`;
}
