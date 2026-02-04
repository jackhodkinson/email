import { SQL } from "bun";
import { mkdir } from "fs/promises";
import { dirname } from "path";

// Ensure data directory exists
const dbPath = "data/email.db";
await mkdir(dirname(dbPath), { recursive: true });

// Create/open database
const db = new SQL(`sqlite://${dbPath}`);

// Configure for performance and safety
// WAL mode for better concurrent reads
await db`PRAGMA journal_mode = WAL`;
// Enable foreign key constraints
await db`PRAGMA foreign_keys = ON`;

export { db };
