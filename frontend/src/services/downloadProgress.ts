import type { DownloadPhase } from '../store/downloads';

export interface DownloadProgressInput {
  phase: DownloadPhase;
  progress: number;
  speed: string;
  eta: string;
  fragmentCurrent: number | null;
  fragmentTotal: number | null;
}

export interface DownloadPhaseStep {
  id: DownloadPhase;
  label: string;
}

export interface DownloadProgressView {
  activeStep: number;
  ariaValueNow?: number;
  ariaValueText: string;
  detail: string;
  label: string;
  metaLead: string;
  metaTail: string;
  progressScale: number;
}

export const DOWNLOAD_PHASE_STEPS: DownloadPhaseStep[] = [
  { id: 'preparing', label: 'Источник' },
  { id: 'downloading', label: 'Загрузка' },
  { id: 'processing', label: 'Обработка' },
  { id: 'finalizing', label: 'Файл' },
];

const PHASE_INDEX: Record<DownloadPhase, number> = {
  preparing: 0,
  downloading: 1,
  processing: 2,
  finalizing: 3,
};

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function getDownloadProgressView(input: DownloadProgressInput): DownloadProgressView {
  const progress = clampProgress(input.progress);
  const fragmentDetail = input.fragmentCurrent && input.fragmentTotal
    ? `Фрагмент ${input.fragmentCurrent} из ${input.fragmentTotal}`
    : 'Можно оставить приложение работать в фоне.';

  if (input.phase === 'preparing') {
    return {
      activeStep: PHASE_INDEX.preparing,
      ariaValueText: 'Проверяем источник и параметры файла',
      detail: 'Получаем свежие ссылки и параметры качества.',
      label: 'Проверяем источник',
      metaLead: 'Подготовка',
      metaTail: 'Выполняется локально',
      progressScale: 1,
    };
  }

  if (input.phase === 'processing') {
    return {
      activeStep: PHASE_INDEX.processing,
      ariaValueText: 'Загрузка завершена, собираем итоговый файл',
      detail: 'Для длинного ролика объединение может занять несколько минут.',
      label: 'Собираем итоговый файл',
      metaLead: 'Поток загружен',
      metaTail: 'Не закрывайте приложение',
      progressScale: 1,
    };
  }

  if (input.phase === 'finalizing') {
    return {
      activeStep: PHASE_INDEX.finalizing,
      ariaValueText: 'Проверяем результат и безопасное имя файла',
      detail: 'Остался последний локальный шаг.',
      label: 'Проверяем результат',
      metaLead: 'Финальная проверка',
      metaTail: 'Не закрывайте приложение',
      progressScale: 1,
    };
  }

  const formattedProgress = progress.toFixed(1);
  return {
    activeStep: PHASE_INDEX.downloading,
    ariaValueNow: progress,
    ariaValueText: `Загружено ${formattedProgress}%`,
    detail: fragmentDetail,
    label: 'Скачиваем медиапоток',
    metaLead: `${formattedProgress}%${input.speed ? ` · ${input.speed}` : ''}`,
    metaTail: input.eta ? `Осталось ≈ ${input.eta}` : 'Выполняется локально',
    progressScale: progress / 100,
  };
}
