import { MAX_STORY_SCENES, newStoryScene, validateStoryboard, type StoryScene } from './projectStoryboardContract.ts';

export interface HookBrief { product: string; audience: string; problem: string; payoff: string }
export interface VideoHook { title: string; visual: string; spoken: string; onScreen: string; payoff: string }
function text(value: string, label: string, max: number) {
  if (typeof value !== 'string' || value.trim().length < 3 || value.trim().length > max || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || /[\u202a-\u202e\u2066-\u2069]|(?:sk-|ghp_|github_pat_)[a-zA-Z0-9_-]{16,}|-----BEGIN .*PRIVATE KEY/.test(value)) throw new Error(`${label}: от 3 до ${max} знаков, без служебных символов и секретов.`);
  return value.trim();
}
export function createVideoHooks(input: HookBrief): VideoHook[] {
  const product = text(input.product, 'Продукт', 80), audience = text(input.audience, 'Аудитория', 80);
  const problem = text(input.problem, 'Проблема', 100), payoff = text(input.payoff, 'Результат', 100);
  return [
    { title: 'Демонстрация: результат первым', visual: `Крупно покажите реальный результат: ${payoff}`, spoken: 'Вот что получилось. Сейчас покажу как.', onScreen: product },
    { title: 'Демонстрация: один шаг', visual: `Один непрерывный кадр действия в ${product}`, spoken: 'Смотрите на этот шаг.', onScreen: 'От задачи к результату' },
    { title: 'Проблема: знакомый момент', visual: `Покажите конкретный момент затруднения: ${problem}`, spoken: 'Знакомая ситуация? Разберём её.', onScreen: problem },
    { title: 'Проблема: контраст', visual: 'Слева исходная задача, справа подтверждённый результат; одинаковый масштаб.', spoken: 'Одна задача. Другой подход.', onScreen: payoff },
    { title: 'Вопрос: для своей аудитории', visual: `Покажите рабочую ситуацию аудитории: ${audience}`, spoken: 'А вы как решаете эту задачу?', onScreen: product },
    { title: 'Вопрос: проверяем вместе', visual: `Покажите ${product} до начала действия, без постановочного результата.`, spoken: 'Проверим, что получится?', onScreen: 'Один реальный тест' },
  ].map(hook => ({ ...hook, payoff }));
}
export function hookToScene(hook: VideoHook, reviewed: boolean): StoryScene {
  if (!reviewed) throw new Error('Подтвердите, что обещание соответствует ролику.');
  const title = text(hook.title, 'Название', 80), visual = text(hook.visual, 'Кадр', 240);
  const spoken = text(hook.spoken, 'Реплика', 120), onScreen = text(hook.onScreen, 'Текст на экране', 100), payoff = text(hook.payoff, 'Результат', 100);
  const scene = { ...newStoryScene(), title, duration: 3, camera: visual, music: `Реплика: ${spoken}`, action: `На экране: ${onScreen}\nВ продолжении показать: ${payoff}` };
  validateStoryboard({ scenes: [scene] }); return scene;
}
export function prependHook(scenes: StoryScene[], scene: StoryScene) {
  if (scenes.length >= MAX_STORY_SCENES) throw new Error('Достигнут лимит сцен. Освободите одно место.');
  const next = [scene, ...scenes]; validateStoryboard({ scenes: next }); return next;
}
export function canUndoHook(scenes: StoryScene[], expected: StoryScene) { return scenes.some(scene => scene.id === expected.id && JSON.stringify(scene) === JSON.stringify(expected)); }
export function undoHook(scenes: StoryScene[], expected: StoryScene) {
  if (!canUndoHook(scenes, expected)) throw new Error('Сцена уже изменена или удалена. Автоматическая отмена сохранит ваши правки и ничего не удалит.');
  return scenes.filter(scene => scene.id !== expected.id);
}
