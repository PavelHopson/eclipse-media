import { MAX_STORY_SCENES, validateStoryboard, type StoryScene, type StorySceneSourcePlan } from './projectStoryboardContract.ts';
import { parseVideoAdPlan, type VideoAdPlan } from './videoAdPlanContract.ts';

export const VIDEO_AD_SCENE_LABELS = { hook: 'Зацепка', proof: 'Доказательство', action: 'Следующий шаг' } as const;
const normalize = (plan: VideoAdPlan) => parseVideoAdPlan(JSON.stringify(plan));
function sceneFromPlan(plan: VideoAdPlan, index: number, id: string): StoryScene {
  const source = plan.plan.scenes[index];
  return { id, title: VIDEO_AD_SCENE_LABELS[source.purpose], duration: source.duration, music: '', action: source.copy, camera: '', theses: [],
    sourcePlan: { schemaVersion: plan.schemaVersion, planId: plan.plan.id, planTitle: plan.plan.title,
      referenceBoardId: plan.plan.referenceBoardId, sceneId: source.id, referenceIds: [...source.referenceIds], format: plan.plan.format,
      claimsRequireReview: true, publishRequiresApproval: true } };
}
function samePlan(a: StorySceneSourcePlan, b: StorySceneSourcePlan) {
  return a.planId === b.planId && a.referenceBoardId === b.referenceBoardId && a.format === b.format;
}
function importProblem(current: StoryScene[], plan: VideoAdPlan): string | null {
  if (current.some(scene => scene.sourcePlan && scene.sourcePlan.planId === plan.plan.id &&
    scene.sourcePlan.referenceBoardId === plan.plan.referenceBoardId && scene.sourcePlan.format === plan.plan.format)) {
    return 'Этот план уже добавлен. Отредактируйте его сцены или уберите все сцены этого плана перед повторным импортом.';
  }
  if (current.length + 3 > MAX_STORY_SCENES) return 'Для плана нужны три свободных места в сценарии.';
  return null;
}

export function createVideoAdStoryboard(plan: VideoAdPlan): StoryScene[] {
  const parsed = normalize(plan);
  const scenes = parsed.plan.scenes.map((_, index) => sceneFromPlan(parsed, index, crypto.randomUUID()));
  validateStoryboard({ scenes }); return scenes;
}

export function videoAdImportProblem(current: StoryScene[], plan: VideoAdPlan): string | null {
  validateStoryboard({ scenes: current }); return importProblem(current, normalize(plan));
}

export function appendVideoAdStoryboard(current: StoryScene[], plan: VideoAdPlan, batch: StoryScene[]): StoryScene[] {
  const parsed = normalize(plan); validateStoryboard({ scenes: current }); validateStoryboard({ scenes: batch });
  const problem = importProblem(current, parsed); if (problem) throw new Error(problem);
  if (batch.length !== 3 || batch.some((scene, index) => JSON.stringify(scene) !== JSON.stringify(sceneFromPlan(parsed, index, scene.id)))) {
    throw new Error('Сцены не соответствуют проверенному плану. Выберите файл ещё раз.');
  }
  const scenes = [...current, ...structuredClone(batch)]; validateStoryboard({ scenes }); return scenes;
}

export function canUndoVideoAdStoryboard(current: StoryScene[], batch: StoryScene[]): boolean {
  try { validateStoryboard({ scenes: current }); validateStoryboard({ scenes: batch }); } catch { return false; }
  const first = batch[0]?.sourcePlan;
  if (batch.length !== 3 || !first || new Set(batch.map(scene => scene.sourcePlan?.sceneId)).size !== 3 ||
    batch.some(scene => !scene.sourcePlan || !samePlan(scene.sourcePlan, first))) return false;
  return batch.every(scene => current.some(item => item.id === scene.id && JSON.stringify(item) === JSON.stringify(scene)));
}

export function undoVideoAdStoryboard(current: StoryScene[], batch: StoryScene[]): StoryScene[] {
  if (!canUndoVideoAdStoryboard(current, batch)) throw new Error('Сцены плана уже изменены или убраны. Сохраняем ваши правки; убрать сцены можно по одной.');
  const ids = new Set(batch.map(scene => scene.id));
  const scenes = current.filter(scene => !ids.has(scene.id)); validateStoryboard({ scenes }); return scenes;
}
