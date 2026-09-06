import { useEffect, useSyncExternalStore } from 'react';
import { DraftController } from '../services/draftController';
import { emptyBeatDraft, emptyResearchDraft, validateBeatDraft, validateResearchDraft } from '../services/draftContract';
import { draftRepository } from '../services/draftStorage';

export const researchDraft = new DraftController('research', emptyResearchDraft, validateResearchDraft, draftRepository);
export const beatDraft = new DraftController('beats', emptyBeatDraft, validateBeatDraft, draftRepository);
const connections = new Map<object, { users: number; dispose: () => void }>();

export function useLocalDraft<T>(controller: DraftController<T>) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  useEffect(() => {
    void controller.init();
    const existing = connections.get(controller);
    if (existing) {
      existing.users++;
      return () => { if (--existing.users === 0) { existing.dispose(); connections.delete(controller); } };
    }
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel('eclipse-media-draft-changes');
      channel.onmessage = (event) => { if (event.data === controller.kind) void controller.checkExternal(); };
      controller.setNotifier(() => { try { channel?.postMessage(controller.kind); } catch { /* CAS still protects other tabs. */ } });
    } catch { /* BroadcastChannel is optional. Never transport draft content here. */ }
    const onFocus = () => { void controller.checkExternal(); };
    window.addEventListener('focus', onFocus);
    const entry = { users: 1, dispose: () => { channel?.close(); controller.setNotifier(() => {}); window.removeEventListener('focus', onFocus); } };
    connections.set(controller, entry);
    return () => { if (--entry.users === 0) { entry.dispose(); connections.delete(controller); } };
  }, [controller]);
  return snapshot;
}

// Keep the guard while a workspace is unmounted but its final transaction is pending.
window.addEventListener('beforeunload', (event) => {
  if (researchDraft.hasUnsaved() || beatDraft.hasUnsaved()) { event.preventDefault(); event.returnValue = ''; }
});
