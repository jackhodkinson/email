import { existsSync, mkdirSync, readFileSync, renameSync, watch, writeFileSync } from "fs";
import { homedir } from "os";
import { basename, join } from "path";

const CACHE_DIR = join(homedir(), ".cache", "cmail");
const NOTIFY_PATH = join(CACHE_DIR, "db.notify");
const TEMP_NOTIFY_PATH = join(CACHE_DIR, `db.notify.${process.pid}.tmp`);

export type StateChangeKind = "mail" | "labels" | "all";

export interface StateChangeEvent {
  version: 1;
  ts: number;
  kind: StateChangeKind;
}

function ensureNotifyDir() {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function readStateChange(): StateChangeEvent | null {
  try {
    const raw = readFileSync(NOTIFY_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<StateChangeEvent>;
    if (!parsed || typeof parsed.ts !== "number" || typeof parsed.kind !== "string") {
      return null;
    }
    if (parsed.kind !== "mail" && parsed.kind !== "labels" && parsed.kind !== "all") {
      return null;
    }
    return {
      version: 1,
      ts: parsed.ts,
      kind: parsed.kind,
    };
  } catch {
    return null;
  }
}

export function emitStateChange(kind: StateChangeKind = "all"): void {
  try {
    ensureNotifyDir();
    const payload: StateChangeEvent = {
      version: 1,
      ts: Date.now(),
      kind,
    };
    const json = JSON.stringify(payload);
    // Atomic replace keeps watchers consistent even under concurrent writers.
    writeFileSync(TEMP_NOTIFY_PATH, json, "utf8");
    renameSync(TEMP_NOTIFY_PATH, NOTIFY_PATH);
  } catch {
    // Fire-and-forget by design: data writes should never fail because notify failed.
  }
}

export function subscribeStateChanges(
  onChange: (event: StateChangeEvent) => void,
  options?: { fallbackPollMs?: number },
): () => void {
  ensureNotifyDir();
  if (!existsSync(NOTIFY_PATH)) {
    emitStateChange("all");
  }

  let lastRaw: string | null = null;
  let pending = false;
  const fallbackPollMs = options?.fallbackPollMs ?? 20_000;
  const notifyFileName = basename(NOTIFY_PATH);

  const publishLatest = () => {
    pending = false;
    try {
      const raw = readFileSync(NOTIFY_PATH, "utf8");
      if (raw === lastRaw) return;
      lastRaw = raw;
      const parsed = JSON.parse(raw) as Partial<StateChangeEvent>;
      if (
        !parsed
        || typeof parsed.ts !== "number"
        || (parsed.kind !== "mail" && parsed.kind !== "labels" && parsed.kind !== "all")
      ) {
        return;
      }
      onChange({ version: 1, ts: parsed.ts, kind: parsed.kind });
    } catch {
      // Ignore malformed reads and transient filesystem races.
    }
  };

  const queuePublish = () => {
    if (pending) return;
    pending = true;
    setTimeout(publishLatest, 50);
  };

  try {
    lastRaw = readFileSync(NOTIFY_PATH, "utf8");
  } catch {
    lastRaw = null;
  }

  const watcher = watch(CACHE_DIR, (_eventType, fileName) => {
    if (!fileName || fileName.toString() !== notifyFileName) return;
    queuePublish();
  });

  const pollId = setInterval(queuePublish, fallbackPollMs);

  return () => {
    watcher.close();
    clearInterval(pollId);
  };
}
