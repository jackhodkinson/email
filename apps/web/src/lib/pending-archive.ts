const PENDING_ARCHIVE_THREAD_IDS_KEY = "cmail.pendingArchiveThreadIds";

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function getPendingArchiveThreadIds(): string[] {
  const storage = getStorage();
  if (!storage) return [];

  try {
    const parsed = JSON.parse(storage.getItem(PENDING_ARCHIVE_THREAD_IDS_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

export function addPendingArchiveThreadIds(threadIds: string[]): void {
  const storage = getStorage();
  if (!storage || threadIds.length === 0) return;

  const next = new Set(getPendingArchiveThreadIds());
  for (const threadId of threadIds) {
    next.add(threadId);
  }
  storage.setItem(PENDING_ARCHIVE_THREAD_IDS_KEY, JSON.stringify([...next]));
}

export function removePendingArchiveThreadIds(threadIds: string[]): void {
  const storage = getStorage();
  if (!storage || threadIds.length === 0) return;

  const next = new Set(getPendingArchiveThreadIds());
  for (const threadId of threadIds) {
    next.delete(threadId);
  }

  if (next.size === 0) {
    storage.removeItem(PENDING_ARCHIVE_THREAD_IDS_KEY);
    return;
  }
  storage.setItem(PENDING_ARCHIVE_THREAD_IDS_KEY, JSON.stringify([...next]));
}
