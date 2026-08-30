export const LOCAL_EDIT_SCHEMA = 'eclipse.local-edit-plan.v1' as const;
export const LOCAL_EDIT_PROFILE = 'mp4-h264-aac-720p-v1' as const;
export const LOCAL_EDIT_MAX_SOURCE_MS = 5 * 60 * 1_000;
export const LOCAL_EDIT_MAX_CLIP_MS = 60 * 1_000;

export type LocalEditPlan = Readonly<{
  schemaVersion: typeof LOCAL_EDIT_SCHEMA;
  source: Readonly<{ assetId: string; sha256: string }>;
  trim: Readonly<{ startMs: number; endMs: number }>;
  outputProfile: typeof LOCAL_EDIT_PROFILE;
}>;

type LocalEditInput = {
  assetId: string;
  sourceSha256: string;
  sourceDurationMs: number;
  startMs: number;
  endMs: number;
};

function isIntegerInRange(value: number, minimum: number, maximum: number) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

export function createLocalEditPlan(input: LocalEditInput): LocalEditPlan {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.assetId)) {
    throw new Error('Некорректный идентификатор исходника');
  }
  if (!/^[0-9a-f]{64}$/.test(input.sourceSha256)) {
    throw new Error('Некорректная контрольная сумма исходника');
  }
  if (!isIntegerInRange(input.sourceDurationMs, 1, LOCAL_EDIT_MAX_SOURCE_MS)) {
    throw new Error('Длительность исходника выходит за безопасный предел');
  }
  if (!isIntegerInRange(input.startMs, 0, input.sourceDurationMs - 1)
      || !isIntegerInRange(input.endMs, 1, input.sourceDurationMs)) {
    throw new Error('Границы клипа выходят за исходник');
  }
  if (input.endMs <= input.startMs || input.endMs - input.startMs > LOCAL_EDIT_MAX_CLIP_MS) {
    throw new Error('Клип должен быть длиннее 0 и не больше 60 секунд');
  }

  return Object.freeze({
    schemaVersion: LOCAL_EDIT_SCHEMA,
    source: Object.freeze({ assetId: input.assetId, sha256: input.sourceSha256 }),
    trim: Object.freeze({ startMs: input.startMs, endMs: input.endMs }),
    outputProfile: LOCAL_EDIT_PROFILE,
  });
}

export function serializeLocalEditPlan(plan: LocalEditPlan) {
  return JSON.stringify({
    outputProfile: plan.outputProfile,
    schemaVersion: plan.schemaVersion,
    source: { assetId: plan.source.assetId, sha256: plan.source.sha256 },
    trim: { endMs: plan.trim.endMs, startMs: plan.trim.startMs },
  });
}

export async function digestLocalEditPlan(plan: LocalEditPlan) {
  const bytes = new TextEncoder().encode(serializeLocalEditPlan(plan));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function formatEditTime(milliseconds: number) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '00:00.000';
  const bounded = Math.floor(milliseconds);
  const minutes = Math.floor(bounded / 60_000);
  const seconds = Math.floor((bounded % 60_000) / 1_000);
  const fraction = bounded % 1_000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(fraction).padStart(3, '0')}`;
}
