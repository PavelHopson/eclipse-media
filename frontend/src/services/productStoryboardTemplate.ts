import { MAX_STORY_SCENES, newStoryScene, validateStoryboard, type StoryScene } from './projectStoryboardContract.ts';

export function createProductStoryboard(name: string): StoryScene[] {
  if (typeof name !== 'string' || [...name].some(char => {
    const point = char.codePointAt(0)!;
    return point < 32 || point === 127 || (point >= 0x202a && point <= 0x202e) || (point >= 0x2066 && point <= 0x2069);
  })) throw new Error('Введите название продукта без управляющих символов.');
  const product = name.trim().replace(/\s+/g, ' ');
  if (product.length < 3 || product.length > 80) throw new Error('Название продукта: от 3 до 80 символов.');
  const parts = [
    { title: 'Зацепка', duration: 5, action: `Покажите одну реальную задачу пользователя ${product}. Титр: «Знакомая ситуация?» Без личных данных и выдуманных результатов.`, camera: 'Общий план. Спокойный фон и свободная область для титра.' },
    { title: 'Задача', duration: 7, action: `Покажите, что мешает решить задачу без ${product}. Один наглядный пример; неподтверждённые утверждения не используйте.`, camera: 'Крупнее на проблемном шаге. Титр не перекрывает действие.' },
    { title: 'Решение', duration: 11, action: `Покажите одну существующую функцию ${product} и её проверенный результат. Если это макет, явно подпишите «Концепт».`, camera: 'Читаемая запись реального интерфейса. Без личных вкладок и служебных данных.' },
    { title: 'Следующий шаг', duration: 7, action: `Завершите названием ${product} и одним действием: «Попробовать». Добавьте только проверенный адрес и разрешённые материалы.`, camera: 'Статичный финальный кадр. Проверьте читаемость отдельно в 16:9 и 9:16.' },
  ];
  const scenes = parts.map(part => ({ ...newStoryScene(), ...part, title: `${part.title} · ${product}`.slice(0, 80), music: 'Тишина' }));
  validateStoryboard({ scenes }); return scenes;
}

export function appendStoryboardBatch(current: StoryScene[], batch: StoryScene[]): StoryScene[] {
  if (current.length + batch.length > MAX_STORY_SCENES) throw new Error('Для шаблона нужны четыре свободных места в сценарии.');
  const scenes = [...current, ...structuredClone(batch)]; validateStoryboard({ scenes }); return scenes;
}

export function canUndoStoryboardBatch(current: StoryScene[], batch: StoryScene[]): boolean {
  return batch.length === 4 && batch.every(scene => {
    const matches = current.filter(item => item.id === scene.id);
    return matches.length === 1 && JSON.stringify(matches[0]) === JSON.stringify(scene);
  });
}

export function undoStoryboardBatch(current: StoryScene[], batch: StoryScene[]): StoryScene[] {
  if (!canUndoStoryboardBatch(current, batch)) throw new Error('Сцены уже изменены. Сохраняем ваши правки; убрать их можно по одной.');
  const ids = new Set(batch.map(scene => scene.id));
  const scenes = current.filter(scene => !ids.has(scene.id)); validateStoryboard({ scenes }); return scenes;
}
