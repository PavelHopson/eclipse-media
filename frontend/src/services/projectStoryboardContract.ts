import type { BeatDraft, ResearchDraft } from './draftContract';

export interface ThesisSnapshot {
  fileName: string; sha256: string; cueId: string; start: number; end: number; excerpt: string;
  claim: string; status: 'unverified' | 'confirmed' | 'disputed'; evidenceUrl: string; videoUrl: string;
}
export interface StoryScene {
  id: string; title: string; duration: number; music: string; action: string; camera: string; theses: ThesisSnapshot[];
}
export interface Storyboard { scenes: StoryScene[] }
export const MAX_STORY_SCENES = 24;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function check(value: unknown): asserts value { if (!value) throw new Error('Сценарий содержит неподдерживаемые данные.'); }
function obj(value: unknown, keys: string[]) {
  check(value && typeof value === 'object' && !Array.isArray(value));
  const o = value as Record<string, unknown>;
  check(Object.keys(o).length === keys.length && keys.every((k) => Object.hasOwn(o, k))); return o;
}
function text(value: unknown, max: number) {
  check(typeof value === 'string' && value.length <= max);
  check(![...value].some((c) => { const n = c.charCodeAt(0); return (n < 32 && ![9, 10, 13].includes(n)) || n === 127 || (n >= 0x202a && n <= 0x202e) || (n >= 0x2066 && n <= 0x2069); }));
}
export function validateStoryboard(value: unknown): asserts value is Storyboard {
  const board = obj(value, ['scenes']); check(Array.isArray(board.scenes) && board.scenes.length <= MAX_STORY_SCENES);
  const ids = new Set<string>();
  for (const value of board.scenes) {
    const scene = obj(value, ['id', 'title', 'duration', 'music', 'action', 'camera', 'theses']);
    check(typeof scene.id === 'string' && UUID.test(scene.id) && !ids.has(scene.id)); ids.add(scene.id);
    text(scene.title, 80); text(scene.music, 512); text(scene.action, 400); text(scene.camera, 400);
    check(typeof scene.duration === 'number' && Number.isFinite(scene.duration) && scene.duration >= 0 && scene.duration <= 60);
    check(Array.isArray(scene.theses) && scene.theses.length <= 4);
    const sources = new Set<string>();
    for (const value of scene.theses) {
      const t = obj(value, ['fileName', 'sha256', 'cueId', 'start', 'end', 'excerpt', 'claim', 'status', 'evidenceUrl', 'videoUrl']);
      text(t.fileName, 512); text(t.excerpt, 2000); text(t.claim, 300); text(t.evidenceUrl, 2048); text(t.videoUrl, 2048);
      check(typeof t.sha256 === 'string' && /^[a-f0-9]{64}$/.test(t.sha256));
      check(typeof t.cueId === 'string' && /^cue-[1-9]\d{0,3}$/.test(t.cueId));
      check(typeof t.start === 'number' && typeof t.end === 'number' && Number.isFinite(t.start) && Number.isFinite(t.end) && t.start >= 0 && t.end > t.start && t.end <= 14400);
      check(['unverified', 'confirmed', 'disputed'].includes(t.status as string));
      const key = t.sha256 + ':' + t.cueId; check(!sources.has(key)); sources.add(key);
    }
  }
}
export function thesisSnapshot(research: ResearchDraft, cueId: string): ThesisSnapshot {
  const loaded = research.loaded; const cue = loaded?.transcript.cues.find((c) => c.id === cueId);
  const note = research.notes.find((n) => n.cueId === cueId);
  if (!loaded || !cue || !note?.claim.trim()) throw new Error('Сначала напишите тезис своими словами.');
  return { fileName: loaded.fileName, sha256: loaded.sha256, cueId, start: cue.start, end: cue.end,
    excerpt: cue.text, claim: note.claim, status: note.status, evidenceUrl: note.evidenceUrl, videoUrl: research.videoUrl };
}
export function newStoryScene(thesis?: ThesisSnapshot): StoryScene {
  return { id: crypto.randomUUID(), title: thesis?.claim.slice(0, 80) ?? '', duration: thesis ? Math.min(60, thesis.end - thesis.start) : 5,
    music: '', action: '', camera: '', theses: thesis ? [thesis] : [] };
}
export function addThesisScene(beats: BeatDraft, research: ResearchDraft, cueId: string): BeatDraft {
  const thesis = thesisSnapshot(research, cueId); const scenes = beats.storyboard?.scenes ?? [];
  if (scenes.some((s) => s.theses.some((t) => t.sha256 === thesis.sha256 && t.cueId === cueId))) throw new Error('Этот фрагмент уже связан со сценой. Откройте сценарий.');
  if (scenes.length >= MAX_STORY_SCENES) throw new Error('В сценарии уже 24 сцены.');
  const storyboard = { scenes: [...scenes, newStoryScene(thesis)] }; validateStoryboard(storyboard); return { ...beats, storyboard };
}
export function thesisChanged(thesis: ThesisSnapshot, research: ResearchDraft) {
  try { return JSON.stringify(thesisSnapshot(research, thesis.cueId)) !== JSON.stringify(thesis); } catch { return true; }
}
export function missingSceneFields(scene: StoryScene) {
  return [!scene.title.trim() && 'название', scene.duration <= 0 && 'длительность', !scene.music.trim() && 'музыка или тишина',
    !scene.action.trim() && 'действие', !scene.camera.trim() && 'камера'].filter(Boolean) as string[];
}
