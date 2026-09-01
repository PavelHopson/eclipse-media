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

export interface DesktopUpdateInfo {
  version: string;
}

const UPDATE_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

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

export function parseDesktopUpdateInfo(value: unknown): DesktopUpdateInfo | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object') throw new Error('Некорректный ответ сервиса обновлений');
  const version = (value as { version?: unknown }).version;
  if (typeof version !== 'string' || !UPDATE_VERSION_PATTERN.test(version) || version.length > 64) {
    throw new Error('Некорректная версия обновления');
  }
  return { version };
}

export async function checkDesktopUpdate(): Promise<DesktopUpdateInfo | null> {
  const core = window.__TAURI__?.core;
  if (!core) return null;
  const result = await core.invoke<unknown>('check_desktop_update');
  return parseDesktopUpdateInfo(result);
}

export async function installDesktopUpdate(expectedVersion: string): Promise<void> {
  const core = window.__TAURI__?.core;
  if (!core) throw new Error('Обновления доступны только в desktop-приложении');
  if (!UPDATE_VERSION_PATTERN.test(expectedVersion) || expectedVersion.length > 64) {
    throw new Error('Некорректная версия обновления');
  }
  await core.invoke<void>('install_desktop_update', { expectedVersion });
}
