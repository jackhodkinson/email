import { mkdir } from "fs/promises";
import { dirname } from "path";
import { SQL } from "bun";

// Ensure data directory exists
const dbPath = "data/email.db";
await mkdir(dirname(dbPath), { recursive: true });

const db = new SQL(`sqlite://${dbPath}`);
await db`PRAGMA journal_mode = WAL`;
await db`PRAGMA foreign_keys = ON`;

type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>;

export { db };
export type { SqlTag };
