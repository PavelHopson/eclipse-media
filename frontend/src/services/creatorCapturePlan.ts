export const CREATOR_CAPTURE_PLAN_VERSION = 'eclipse.creator-capture-plan.v1' as const;

export type CaptureRecorder = 'sharex' | 'focusee';
export type CaptureContentClass = 'public-demo' | 'internal';

export type CreatorCapturePlanInput = {
  recorder: CaptureRecorder;
  contentClass: CaptureContentClass;
  rightsConfirmed: boolean;
  secretsExcluded: boolean;
  clientDataExcluded: boolean;
};

export type CreatorCapturePlan = {
  schemaVersion: typeof CREATOR_CAPTURE_PLAN_VERSION;
  source: 'eclipse-media' | 'shotforge';
  createdAt: string;
  recorder: CaptureRecorder;
  contentClass: CaptureContentClass;
  tools: Array<{
    id: 'sharex' | 'focusee' | 'quicklook' | 'everything';
    purpose: string;
    mode: 'local-only' | 'public-demo-benchmark';
  }>;
  controls: {
    rightsConfirmed: true;
    secretsExcluded: true;
    clientDataExcluded: true;
    automaticUpload: false;
    pluginsEnabled: false;
    networkServerEnabled: false;
    historyEnabled: false;
    publicationRequiresApproval: true;
  };
};

export function createCreatorCapturePlan(input: CreatorCapturePlanInput): CreatorCapturePlan {
  if (!input.rightsConfirmed || !input.secretsExcluded || !input.clientDataExcluded) {
    throw new Error('Capture plan requires rights confirmation and excludes secrets and client data.');
  }
  if (input.recorder === 'focusee' && input.contentClass !== 'public-demo') {
    throw new Error('FocuSee is restricted to public demo content.');
  }

  const recorder = input.recorder === 'sharex'
    ? { id: 'sharex' as const, purpose: 'Local screen capture and annotations', mode: 'local-only' as const }
    : { id: 'focusee' as const, purpose: 'Public demo benchmark only', mode: 'public-demo-benchmark' as const };

  return {
    schemaVersion: CREATOR_CAPTURE_PLAN_VERSION,
    source: 'eclipse-media',
    createdAt: new Date().toISOString(),
    recorder: input.recorder,
    contentClass: input.contentClass,
    tools: [
      recorder,
      { id: 'quicklook', purpose: 'Local file preview without plugins', mode: 'local-only' },
      { id: 'everything', purpose: 'Allowlisted local folder search', mode: 'local-only' },
    ],
    controls: {
      rightsConfirmed: true,
      secretsExcluded: true,
      clientDataExcluded: true,
      automaticUpload: false,
      pluginsEnabled: false,
      networkServerEnabled: false,
      historyEnabled: false,
      publicationRequiresApproval: true,
    },
  };
}

export function parseCreatorCapturePlan(value: unknown): CreatorCapturePlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Capture plan должен быть JSON object.');
  const plan = value as Record<string, unknown>;
  const allowedKeys = ['schemaVersion', 'source', 'createdAt', 'recorder', 'contentClass', 'tools', 'controls'];
  if (Object.keys(plan).some((key) => !allowedKeys.includes(key))) throw new Error('Capture plan содержит неизвестные поля.');
  if (plan.schemaVersion !== CREATOR_CAPTURE_PLAN_VERSION) throw new Error('Неподдерживаемая версия capture plan.');
  if (plan.source !== 'shotforge' && plan.source !== 'eclipse-media') throw new Error('Неизвестный источник capture plan.');
  if (plan.recorder !== 'sharex' && plan.recorder !== 'focusee') throw new Error('Неизвестный recorder.');
  if (plan.contentClass !== 'public-demo' && plan.contentClass !== 'internal') throw new Error('Неизвестный content class.');
  if (plan.recorder === 'focusee' && plan.contentClass !== 'public-demo') throw new Error('FocuSee разрешён только для public demo.');
  if (typeof plan.createdAt !== 'string' || !Number.isFinite(Date.parse(plan.createdAt))) throw new Error('Некорректная дата capture plan.');
  if (!Array.isArray(plan.tools) || plan.tools.length !== 3) throw new Error('Capture plan должен содержать ровно три разрешённых инструмента.');
  const toolIds = plan.tools.map((tool) => tool && typeof tool === 'object' ? (tool as { id?: unknown }).id : null);
  const expectedIds = plan.recorder === 'sharex' ? ['sharex', 'quicklook', 'everything'] : ['focusee', 'quicklook', 'everything'];
  if (expectedIds.some((id) => !toolIds.includes(id)) || new Set(toolIds).size !== 3) throw new Error('Tool allowlist capture plan нарушен.');
  if (!plan.controls || typeof plan.controls !== 'object' || Array.isArray(plan.controls)) throw new Error('Controls capture plan отсутствуют.');
  const controls = plan.controls as Record<string, unknown>;
  const expectedControls: Record<string, boolean> = {
    rightsConfirmed: true,
    secretsExcluded: true,
    clientDataExcluded: true,
    automaticUpload: false,
    pluginsEnabled: false,
    networkServerEnabled: false,
    historyEnabled: false,
    publicationRequiresApproval: true,
  };
  if (Object.keys(controls).length !== Object.keys(expectedControls).length || Object.entries(expectedControls).some(([key, expected]) => controls[key] !== expected)) {
    throw new Error('Fail-closed controls capture plan изменены.');
  }
  return value as CreatorCapturePlan;
}
