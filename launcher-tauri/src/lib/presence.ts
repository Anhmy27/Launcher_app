import { tauriCommands } from "./tauri";

// Tracks launcher-controlled apps currently running on this machine, keyed by
// app id -> OS process id (PID). Persisted to localStorage so a launcher reload
// keeps tracking already-running apps.

export interface RunningAppEntry {
  app_id: string;
  pid: number;
}

const STORAGE_KEY = "runningApps";

function load(): RunningAppEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e) => e && typeof e.app_id === "string" && typeof e.pid === "number",
    );
  } catch {
    return [];
  }
}

function save(entries: RunningAppEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore storage errors
  }
}

/**
 * Record that an app was launched with the given PID. If the app already has a
 * tracked PID it is replaced with the latest launch.
 */
export function trackRunningApp(appId: string, pid: number): void {
  if (!appId || !pid) return;
  const entries = load().filter((e) => e.app_id !== appId);
  entries.push({ app_id: appId, pid });
  save(entries);
}

/**
 * Return apps that are still running, pruning any whose process has exited.
 * The pruned list is persisted back to storage.
 */
export async function getActiveRunningApps(): Promise<RunningAppEntry[]> {
  const entries = load();
  const alive: RunningAppEntry[] = [];
  for (const entry of entries) {
    try {
      const running = await tauriCommands.isProcessRunning(entry.pid);
      if (running) alive.push(entry);
    } catch {
      // If the check fails, keep the entry to avoid ending sessions early.
      alive.push(entry);
    }
  }
  if (alive.length !== entries.length) {
    save(alive);
  }
  return alive;
}

/** Clear all tracked apps (e.g. on logout). */
export function clearRunningApps(): void {
  save([]);
}
