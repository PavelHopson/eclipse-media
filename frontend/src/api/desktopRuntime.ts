interface TauriCore {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

declare global {
  interface Window {
    __TAURI__?: { core: TauriCore };
  }
}

export interface DesktopRuntime {
  baseUrl: string;
  sessionToken: string;
}

export interface NativeSaveReceipt {
  saved: boolean;
  filename: string | null;
}

let runtimePromise: Promise<DesktopRuntime> | null = null;

export function isDesktopApp(): boolean {
  return Boolean(window.__TAURI__?.core);
}

export async function getDesktopRuntime(): Promise<DesktopRuntime | null> {
  if (!window.__TAURI__?.core) return null;
  runtimePromise ??= window.__TAURI__.core
    .invoke<DesktopRuntime>('desktop_runtime')
    .catch((error: unknown) => {
      runtimePromise = null;
      throw error;
    });
  return runtimePromise;
}

export async function saveCompletedFile(
  jobId: string,
  suggestedName: string,
): Promise<NativeSaveReceipt> {
  const core = window.__TAURI__?.core;
  if (!core) throw new Error('Native save dialog is unavailable');
  return core.invoke<NativeSaveReceipt>('save_completed_file', {
    jobId,
    suggestedName,
  });
}
