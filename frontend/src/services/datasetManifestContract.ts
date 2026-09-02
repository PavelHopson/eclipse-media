export const DATASET_MANIFEST_SCHEMA = 'eclipse.dataset-manifest.v1' as const;
export const MAX_DATASET_FILES = 40;
export const MAX_DATASET_BYTES = 256 * 1024 * 1024;

export interface DatasetFileInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

export interface DatasetManifestInput {
  name: string;
  purpose: string;
  owner: string;
  rightsBasis: 'owned' | 'licensed' | 'permission' | 'public-domain';
  containsRealPeople: boolean;
  likenessConsentConfirmed: boolean;
  rightsConfirmed: boolean;
  files: DatasetFileInput[];
  baseModel: null | {
    id: string;
    revision: string;
    sha256: string;
    license: string;
  };
}

export interface DatasetManifest {
  schemaVersion: typeof DATASET_MANIFEST_SCHEMA;
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  purpose: string;
  owner: string;
  rights: {
    basis: DatasetManifestInput['rightsBasis'];
    confirmed: true;
    containsRealPeople: boolean;
    likenessConsentConfirmed: boolean;
  };
  files: DatasetFileInput[];
  totals: { files: number; bytes: number };
  baseModel: DatasetManifestInput['baseModel'];
  captionReview: {
    toolBoundary: 'taggui-separate-gpl-process';
    status: 'pending' | 'reviewed';
    reviewedBy: string | null;
    reviewedAt: string | null;
  };
  gpuHandoff: {
    toolBoundary: 'kohya-ss-isolated-gpu-worker';
    status: 'blocked' | 'approved_not_started';
    approvedBy: string | null;
    approvedAt: string | null;
  };
  policy: {
    network: false;
    hiddenDownloads: false;
    currentVpsAllowed: false;
    trainingStarted: false;
    autoPublish: false;
  };
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,96}$/;
const SAFE_FILE = /^[^\\/:*?"<>|]{1,180}$/;
const SHA256 = /^[a-f0-9]{64}$/;
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}


function text(value: string, field: string, min: number, max: number): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < min || normalized.length > max || hasControlCharacter(normalized)) {
    throw new Error(`${field}: нужно от ${min} до ${max} символов`);
  }
  return normalized;
}

function validateFiles(files: DatasetFileInput[]): DatasetFileInput[] {
  if (!files.length || files.length > MAX_DATASET_FILES) throw new Error(`Выберите от 1 до ${MAX_DATASET_FILES} изображений`);
  const seen = new Set<string>();
  let total = 0;
  return files.map((file) => {
    if (!SAFE_FILE.test(file.fileName) || hasControlCharacter(file.fileName) || file.fileName === '.' || file.fileName === '..') throw new Error('Имя изображения содержит путь или служебные символы');
    if (!file.mimeType.startsWith('image/') || !/\.(png|jpe?g|webp|avif)$/i.test(file.fileName)) throw new Error('Dataset Lab принимает PNG, JPEG, WEBP и AVIF');
    if (!Number.isInteger(file.sizeBytes) || file.sizeBytes <= 0) throw new Error('Размер изображения недопустим');
    total += file.sizeBytes;
    const hash = file.sha256.toLowerCase();
    if (!SHA256.test(hash)) throw new Error('У каждого изображения должен быть полный SHA-256');
    if (seen.has(hash)) throw new Error('В датасете есть одинаковые файлы');
    seen.add(hash);
    return { fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, sha256: hash };
  }).map((file) => {
    if (total > MAX_DATASET_BYTES) throw new Error('Общий размер датасета превышает 256 МБ');
    return file;
  });
}

function validateBaseModel(model: DatasetManifestInput['baseModel']): DatasetManifestInput['baseModel'] {
  if (!model) return null;
  const hash = model.sha256.toLowerCase();
  if (!SHA256.test(hash)) throw new Error('Для базовой модели нужен полный SHA-256');
  return {
    id: text(model.id, 'Базовая модель', 2, 160),
    revision: text(model.revision, 'Revision модели', 4, 160),
    sha256: hash,
    license: text(model.license, 'Лицензия модели', 2, 160),
  };
}

export function createDatasetManifest(
  input: DatasetManifestInput,
  now = new Date(),
  id = crypto.randomUUID(),
): DatasetManifest {
  if (!SAFE_ID.test(id)) throw new Error('ID manifest содержит недопустимые символы');
  if (!input.rightsConfirmed) throw new Error('Подтвердите права на все файлы датасета');
  if (input.containsRealPeople && !input.likenessConsentConfirmed) throw new Error('Для изображений реальных людей нужно явное согласие на обучение');
  const files = validateFiles(input.files);
  const timestamp = now.toISOString();
  return {
    schemaVersion: DATASET_MANIFEST_SCHEMA,
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
    name: text(input.name, 'Название датасета', 3, 120),
    purpose: text(input.purpose, 'Цель обучения', 20, 600),
    owner: text(input.owner, 'Владелец датасета', 2, 160),
    rights: {
      basis: input.rightsBasis,
      confirmed: true,
      containsRealPeople: input.containsRealPeople,
      likenessConsentConfirmed: input.containsRealPeople ? true : false,
    },
    files,
    totals: { files: files.length, bytes: files.reduce((sum, file) => sum + file.sizeBytes, 0) },
    baseModel: validateBaseModel(input.baseModel),
    captionReview: { toolBoundary: 'taggui-separate-gpl-process', status: 'pending', reviewedBy: null, reviewedAt: null },
    gpuHandoff: { toolBoundary: 'kohya-ss-isolated-gpu-worker', status: 'blocked', approvedBy: null, approvedAt: null },
    policy: { network: false, hiddenDownloads: false, currentVpsAllowed: false, trainingStarted: false, autoPublish: false },
  };
}

export function completeCaptionReview(manifest: DatasetManifest, reviewer: string, now = new Date()): DatasetManifest {
  if (manifest.captionReview.status === 'reviewed') throw new Error('Captions уже проверены');
  return {
    ...manifest,
    updatedAt: now.toISOString(),
    captionReview: { ...manifest.captionReview, status: 'reviewed', reviewedBy: text(reviewer, 'Проверяющий captions', 2, 120), reviewedAt: now.toISOString() },
  };
}

export function approveGpuHandoff(manifest: DatasetManifest, reviewer: string, now = new Date()): DatasetManifest {
  if (manifest.captionReview.status !== 'reviewed') throw new Error('Сначала проверьте все captions');
  if (!manifest.baseModel) throw new Error('Перед GPU handoff укажите pinned base model, revision, hash и лицензию');
  return {
    ...manifest,
    updatedAt: now.toISOString(),
    gpuHandoff: { ...manifest.gpuHandoff, status: 'approved_not_started', approvedBy: text(reviewer, 'Проверяющий GPU handoff', 2, 120), approvedAt: now.toISOString() },
  };
}

export function serializeDatasetManifest(manifest: DatasetManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
