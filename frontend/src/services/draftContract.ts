import type { BeatMapProject } from './beatMapContract';
import type { LocalTranscript, ResearchNote } from './researchContract';
import type { Performer, SceneDirection } from './sceneDirectionContract';
import { EMOTIONS, INTENSITIES } from './sceneDirectionContract';

export type DraftKind = 'research' | 'beats';
export interface ResearchDraft {
  loaded: { transcript: LocalTranscript; sha256: string; fileName: string } | null;
  notes: ResearchNote[];
  videoUrl: string;
  page: number;
}
export interface DirectionDraft {
  activeId: string;
  edits: Record<string, SceneDirection>;
  performer: Performer;
}
export interface BeatDraft { project: BeatMapProject | null; direction: DirectionDraft }
export const emptyResearchDraft = (): ResearchDraft => ({ loaded: null, notes: [], videoUrl: '', page: 0 });
export const emptyDirectionDraft = (): DirectionDraft => ({ activeId: '', edits: {}, performer: { kind: 'original', consentReference: '' } });
export const emptyBeatDraft = (): BeatDraft => ({ project: null, direction: emptyDirectionDraft() });
export const MAX_DRAFT_BYTES = 2 * 1024 * 1024;
export const DRAFT_SCHEMA = 'eclipse.local-draft.v1';

function check(condition: unknown): asserts condition {
  if (!condition) throw new Error('Черновик повреждён или имеет неподдерживаемый формат.');
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  check(value && typeof value === 'object' && !Array.isArray(value));
  check(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  const result = value as Record<string, unknown>;
  check(Object.keys(result).length === keys.length && keys.every((key) => Object.hasOwn(result, key)));
  return result;
}
function text(value: unknown, max: number, min = 0): asserts value is string {
  check(typeof value === 'string' && value.length >= min && value.length <= max);
  check(![...value].some((char) => {
    const code = char.charCodeAt(0);
    return (code < 32 && ![9, 10, 13].includes(code)) || code === 127 ||
      (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069);
  }));
}
function number(value: unknown, min: number, max: number, integer = false): asserts value is number {
  check(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value)));
}
function array(value: unknown, min: number, max: number): unknown[] {
  check(Array.isArray(value) && value.length >= min && value.length <= max);
  return value;
}

// Drafts intentionally permit unfinished form fields. Export validation remains separate.
export function validateResearchDraft(value: unknown): asserts value is ResearchDraft {
  const draft = object(value, ['loaded', 'notes', 'videoUrl', 'page']);
  text(draft.videoUrl, 2048);
  const notes = array(draft.notes, 0, 24);
  const ids = new Set<string>();
  let cueCount = 0;
  if (draft.loaded !== null) {
    const loaded = object(draft.loaded, ['transcript', 'sha256', 'fileName']);
    text(loaded.sha256, 64, 64); check(/^[a-f0-9]{64}$/.test(loaded.sha256));
    text(loaded.fileName, 512, 1);
    const transcript = object(loaded.transcript, ['cues', 'overlapCount']);
    const cues = array(transcript.cues, 1, 2000);
    cueCount = cues.length;
    let lastStart = -1;
    for (const [index, item] of cues.entries()) {
      const cue = object(item, ['id', 'start', 'end', 'text']);
      check(cue.id === 'cue-' + (index + 1));
      number(cue.start, 0, 14400); number(cue.end, 0, 14400);
      check(cue.end > cue.start && cue.start >= lastStart);
      lastStart = cue.start;
      text(cue.text, 2000, 1);
      ids.add(cue.id as string);
    }
    number(transcript.overlapCount, 0, cues.length - 1, true);
  }
  number(draft.page, 0, Math.max(0, Math.ceil(cueCount / 40) - 1), true);
  const selected = new Set<string>();
  for (const item of notes) {
    const note = object(item, ['cueId', 'claim', 'status', 'evidenceUrl']);
    text(note.cueId, 16, 1); check(ids.has(note.cueId) && !selected.has(note.cueId));
    selected.add(note.cueId);
    text(note.claim, 300); text(note.evidenceUrl, 2048);
    check(['unverified', 'confirmed', 'disputed'].includes(note.status as string));
  }
}

export function validateBeatDraft(value: unknown): asserts value is BeatDraft {
  const draft = object(value, ['project', 'direction']);
  const ids = new Set<string>();
  if (draft.project !== null) {
    const project = object(draft.project, ['schemaVersion', 'source', 'analysis', 'beats', 'sections', 'scenes']);
    check(project.schemaVersion === 'eclipse.beat-map.v1');
    const source = object(project.source, ['fileName', 'bytes', 'duration', 'localOnly', 'rightsConfirmed']);
    text(source.fileName, 512, 1); number(source.bytes, 0, 60 * 1024 * 1024, true);
    number(source.duration, 0.001, 720); check(source.localOnly === true && source.rightsConfirmed === true);
    const analysis = object(project.analysis, ['bpm', 'confidence', 'beatCount', 'method']);
    number(analysis.bpm, 1, 400); number(analysis.confidence, 0, 1);
    const beats = array(project.beats, 0, 2400);
    check(analysis.method === 'local-energy-envelope' && analysis.beatCount === beats.length);
    let previous = -1;
    for (const item of beats) {
      const beat = object(item, ['time', 'strength', 'downbeat']);
      number(beat.time, 0, source.duration + 0.001); number(beat.strength, 0, 1);
      check(beat.time > previous && typeof beat.downbeat === 'boolean'); previous = beat.time;
    }
    for (const key of ['sections', 'scenes'] as const) {
      const items = array(project[key], 1, key === 'scenes' ? 12 : 5);
      previous = -1;
      for (const [index, item] of items.entries()) {
        const scene = object(item, key === 'scenes' ? ['id', 'title', 'start', 'end', 'energy', 'shot', 'transition', 'note'] : ['id', 'title', 'start', 'end', 'energy']);
        check(scene.id === (key === 'scenes' ? 'scene-' : 'section-') + (index + 1));
        text(scene.title, 80); number(scene.start, 0, source.duration + 0.001); number(scene.end, 0, source.duration + 0.001);
        check(scene.end >= scene.start && scene.start >= previous); previous = scene.end;
        number(scene.energy, 0, 1);
        if (key === 'scenes') {
          ids.add(scene.id as string); text(scene.note, 160);
          check(['Общий план', 'Средний план', 'Крупный план', 'Деталь', 'Типографика'].includes(scene.shot as string));
          check(['Склейка', 'По движению', 'Через затемнение', 'Световой импульс'].includes(scene.transition as string));
        }
      }
    }
  }
  const direction = object(draft.direction, ['activeId', 'edits', 'performer']);
  text(direction.activeId, 16); check(direction.activeId === '' || ids.has(direction.activeId));
  check(direction.edits && typeof direction.edits === 'object' && !Array.isArray(direction.edits));
  const edits = direction.edits as Record<string, unknown>;
  check(Object.keys(edits).length <= 12);
  for (const [id, value] of Object.entries(edits)) {
    check(ids.has(id));
    const edit = object(value, ['emotion', 'intensity', 'action', 'camera', 'invariants']);
    check(EMOTIONS.includes(edit.emotion as SceneDirection['emotion']) && INTENSITIES.includes(edit.intensity as SceneDirection['intensity']));
    for (const key of ['action', 'camera', 'invariants']) text(edit[key], 400);
  }
  const performer = object(direction.performer, ['kind', 'consentReference']);
  check(performer.kind === 'original' || performer.kind === 'consented'); text(performer.consentReference, 240);
}

export interface DraftRecord<T> { schema: typeof DRAFT_SCHEMA; kind: DraftKind; revision: string; updatedAt: number; enabled: boolean; data: T }
export function decodeDraft<T>(raw: string, kind: DraftKind, validate: (value: unknown) => void): DraftRecord<T> {
  check(raw.length <= MAX_DRAFT_BYTES && new TextEncoder().encode(raw).byteLength <= MAX_DRAFT_BYTES);
  const value: unknown = JSON.parse(raw);
  const record = object(value, ['schema', 'kind', 'revision', 'updatedAt', 'enabled', 'data']);
  check(record.schema === DRAFT_SCHEMA && record.kind === kind);
  text(record.revision, 36, 36); check(/^[a-f0-9-]{36}$/.test(record.revision));
  number(record.updatedAt, 0, 8640000000000000, true); check(typeof record.enabled === 'boolean');
  validate(record.data);
  return value as DraftRecord<T>;
}
