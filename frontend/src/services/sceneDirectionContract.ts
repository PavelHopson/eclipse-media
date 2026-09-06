import type { BeatMapProject } from './beatMapContract';

export const EMOTIONS = ['Спокойствие', 'Радость', 'Тревога', 'Злость', 'Облегчение', 'Грусть', 'Удивление'] as const;
export const INTENSITIES = ['Лёгкая', 'Средняя', 'Сильная'] as const;
export interface SceneDirection {
  emotion: typeof EMOTIONS[number];
  intensity: typeof INTENSITIES[number];
  action: string;
  camera: string;
  invariants: string;
}
export interface Performer { kind: 'original' | 'consented'; consentReference: string }

const ACTIONS: Record<typeof EMOTIONS[number], string> = {
  'Спокойствие': 'Смотрит на собеседника, держит плечи свободно и дышит ровно.',
  'Радость': 'Замечает собеседника, приподнимает брови и улыбается, не отводя взгляда.',
  'Тревога': 'Переводит взгляд к двери, задерживает вдох и медленно сжимает пальцы.',
  'Злость': 'На мгновение замирает, сжимает губы и поворачивается к собеседнику.',
  'Облегчение': 'Дочитывает сообщение, опускает плечи, выдыхает и слегка улыбается.',
  'Грусть': 'Опускает взгляд на предмет в руках, делает паузу и медленно выдыхает.',
  'Удивление': 'Останавливает движение, поднимает брови и возвращает взгляд к источнику звука.',
};

export function defaultDirection(emotion: SceneDirection['emotion'] = 'Спокойствие'): SceneDirection {
  return { emotion, intensity: 'Лёгкая', action: ACTIONS[emotion],
    camera: 'Неподвижная камера, без смены ракурса.',
    invariants: 'Сохранить лицо, одежду, форму рук и предметы.' };
}

export function directionPrompt(direction: SceneDirection, start: number, end: number): string {
  const amplitude = { 'Лёгкая': 'Небольшие движения, сдержанная мимика.',
    'Средняя': 'Заметная мимика и один ясный жест, без резких движений.',
    'Сильная': 'Выраженная реакция и движение корпуса, без деформации лица и рук.' };
  return 'Интервал ' + start.toFixed(2) + '-' + end.toFixed(2) + ' с. Эмоция: ' + direction.emotion +
    '. ' + amplitude[direction.intensity] + ' ' + direction.action + ' ' + direction.camera + ' ' + direction.invariants;
}

export function buildDirectionExport(project: BeatMapProject, edits: Record<string, SceneDirection>, performer: Performer) {
  if (!project.source.rightsConfirmed || !project.scenes.length || project.scenes.length > 12) throw new Error('Нужен разрешённый план из 1-12 сцен.');
  if (!['original', 'consented'].includes(performer.kind)) throw new Error('Укажите происхождение персонажа.');
  if (performer.kind === 'consented' && !performer.consentReference.trim()) throw new Error('Укажите ссылку или номер согласия актёра.');
  if (performer.consentReference.length > 240) throw new Error('Ссылка на согласие слишком длинная.');
  const scenes = project.scenes.map((scene) => {
    if (!Number.isFinite(scene.start) || !Number.isFinite(scene.end) || scene.start < 0 || scene.end <= scene.start || scene.end > project.source.duration) {
      throw new Error('Неверный интервал сцены.');
    }
    const direction = edits[scene.id] ?? defaultDirection();
    if (!EMOTIONS.includes(direction.emotion) || !INTENSITIES.includes(direction.intensity)) throw new Error('Неизвестная эмоция или интенсивность.');
    for (const value of [direction.action, direction.camera, direction.invariants]) {
      if (!value.trim() || value.length > 400) throw new Error('Заполните действие, камеру и постоянные детали (до 400 символов).');
    }
    return { sceneId: scene.id, title: scene.title, start: scene.start, end: scene.end, shot: scene.shot,
      transition: scene.transition, direction: { emotion: direction.emotion, intensity: direction.intensity,
        action: direction.action.trim(), camera: direction.camera.trim(), invariants: direction.invariants.trim() },
      prompt: directionPrompt(direction, scene.start, scene.end) };
  });
  return { schemaVersion: 'eclipse.scene-direction.v1',
    source: { beatMapSchema: project.schemaVersion, fileName: project.source.fileName, duration: project.source.duration, rightsConfirmed: project.source.rightsConfirmed, originalAudioIncluded: false },
    performer: { kind: performer.kind, consentReference: performer.kind === 'consented' ? performer.consentReference.trim() : null },
    policy: { inputTrust: 'untrusted-data', provider: null, generationStarted: false, consentVerified: false, manualReview: true, manualPublish: true },
    scenes };
}
