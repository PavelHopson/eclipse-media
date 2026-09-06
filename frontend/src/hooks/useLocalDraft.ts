import { useEffect, useSyncExternalStore } from 'react';
import { DraftController } from '../services/draftController';
import { draftRepository } from '../services/draftStorage';
import { LocalProjects } from '../services/localProjects';

let tabSelection: Storage | undefined;
try { tabSelection = window.sessionStorage; } catch { /* Optional tab selection. */ }
export const localProjects = new LocalProjects(draftRepository, tabSelection);
export function useProjects(enabled = true) {
  const snapshot = useSyncExternalStore(localProjects.subscribe, localProjects.getSnapshot);
  useEffect(() => { if (enabled) void localProjects.init(); }, [enabled]);
  return snapshot;
}
export function useProjectDrafts() { useProjects(); return localProjects.getSession(); }
let catalogChannel: BroadcastChannel | undefined;
try {
  catalogChannel = new BroadcastChannel('eclipse-media-project-catalog');
  catalogChannel.onmessage = () => { void localProjects.refresh(); };
  localProjects.setNotifier(() => { try { catalogChannel?.postMessage('changed'); } catch { /* CAS remains authoritative. */ } });
} catch { /* Optional, contains no project names or content. */ }
window.addEventListener('focus', () => { void localProjects.refresh(); });
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
      channel.onmessage = (event) => { if (event.data === controller.storageKey) void controller.checkExternal(); };
      controller.setNotifier(() => { try { channel?.postMessage(controller.storageKey); } catch { /* CAS still protects other tabs. */ } });
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
  if (localProjects.hasUnsaved()) { event.preventDefault(); event.returnValue = ''; }
});
