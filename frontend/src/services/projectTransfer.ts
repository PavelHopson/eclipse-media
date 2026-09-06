import type { DraftController } from './draftController';
import type { BeatDraft, ResearchDraft } from './draftContract';
import { DraftConflict, type DraftWrite, type ProjectRepository } from './draftStorage';
import { parseProjectFile, type MediaProjectFile } from './projectFileContract';

export interface ProjectVersions { research: number; beats: number }
export function projectVersions(research: DraftController<ResearchDraft>, beats: DraftController<BeatDraft>): ProjectVersions {
  return { research: research.getVersion(), beats: beats.getVersion() };
}

export async function restoreProject(file: MediaProjectFile, versions: ProjectVersions,
  research: DraftController<ResearchDraft>, beats: DraftController<BeatDraft>, repository: ProjectRepository): Promise<void> {
  // Copy and revalidate at the trust boundary. No imported object can mutate a committed snapshot later.
  const project = parseProjectFile(JSON.stringify(file));
  const reservations: ReturnType<DraftController<ResearchDraft | BeatDraft>['reserveReplacement']>[] = [];
  try {
    reservations.push(research.reserveReplacement(project.research, versions.research));
    reservations.push(beats.reserveReplacement(project.beats, versions.beats));
    const writes = reservations.map((item) => item.write).filter((write): write is DraftWrite => write !== null);
    await repository.compareAndWriteBatch(writes);
    for (const item of reservations) item.commit();
    for (const item of reservations) item.publish();
  } catch (caught) {
    if (caught instanceof DraftConflict) throw new Error('Другая вкладка изменила черновик. Проект не открыт. Отмените открытие и разрешите конфликт в изменённом разделе.', { cause: caught });
    throw caught;
  } finally { for (const item of reservations) item.release(); }
}
