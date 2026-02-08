/**
 * Production server entrypoint for Tauri sidecar.
 *
 * Wraps the TanStack Start build output in Bun.serve() and serves
 * static client assets alongside SSR responses.
 *
 * Expected env vars (set by Rust):
 *   PORT             – port to listen on
 *   EMAIL_DATA_DIR   – directory for SQLite data (CWD is changed here)
 *   DIST_SERVER_DIR  – absolute path to dist/server/
 *   DIST_CLIENT_DIR  – absolute path to dist/client/
 */

import { readdir } from "fs/promises";
import { join, extname } from "path";

// ── Env / paths ──────────────────────────────────────────────────────────────

const port = Number(process.env.PORT) || 3001;
const emailDataDir = process.env.EMAIL_DATA_DIR;
const distServerDir = process.env.DIST_SERVER_DIR ?? join(import.meta.dir, "dist", "server");
const distClientDir = process.env.DIST_CLIENT_DIR ?? join(import.meta.dir, "dist", "client");

// Change CWD so SQLite's relative "data/email.db" resolves into the app‑data dir.
if (emailDataDir) {
  const { mkdirSync } = await import("fs");
  mkdirSync(emailDataDir, { recursive: true });
  process.chdir(emailDataDir);
}

// ── Static asset index ───────────────────────────────────────────────────────

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".wasm": "application/wasm",
};

/** Recursively collect all files under `dir`, returning paths relative to `dir`. */
async function walkDir(dir: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      paths.push(...(await walkDir(join(dir, entry.name), rel)));
    } else {
      paths.push(rel);
    }
  }
  return paths;
}

// Build a Set of known static files for O(1) lookup.
const staticFiles = new Set(await walkDir(distClientDir));

// ── TanStack Start handler ───────────────────────────────────────────────────

const serverModule = await import(join(distServerDir, "server.js"));
const appHandler = serverModule.default;

// ── Server ───────────────────────────────────────────────────────────────────

Bun.serve({
  port,
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Strip leading slash to get the relative file path.
    const relPath = pathname.startsWith("/") ? pathname.slice(1) : pathname;

    // Serve static client assets.
    if (relPath && staticFiles.has(relPath)) {
      const filePath = join(distClientDir, relPath);
      const file = Bun.file(filePath);
      const ext = extname(relPath);
      const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

      // Hashed assets get long cache; everything else gets short cache.
      const isHashed = relPath.startsWith("assets/");
      const cacheControl = isHashed
        ? "public, max-age=31536000, immutable"
        : "public, max-age=3600";

      return new Response(file, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": cacheControl,
        },
      });
    }

    // Delegate to TanStack Start SSR handler.
    return appHandler.fetch(req);
  },
});

console.log(`SERVER_READY:${port}`);
