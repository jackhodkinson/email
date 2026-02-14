# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

This is a Bun workspace monorepo for email-related applications and packages.

## Monorepo Structure

```
email/
├── apps/
│   ├── cli/              # cmail — CLI Gmail client
│   │   ├── index.ts      # Entry point (bin: cmail)
│   │   ├── lib/          # CLI-specific modules + re-exports from core
│   │   └── package.json
│   └── web/              # email-app — TanStack Start web/desktop client
│       ├── src/
│       │   ├── routes/        # File-based routing
│       │   ├── components/    # Shared React components
│       │   ├── lib/           # Utilities, hooks, commands
│       │   └── server/        # Server functions
│       ├── src-tauri/         # Tauri desktop wrapper
│       ├── server.ts
│       ├── vite.config.ts
│       └── package.json
├── packages/
│   └── core/             # @jack/mail-core — shared core package
│       ├── src/
│       │   ├── index.ts       # Main exports
│       │   ├── auth.ts        # Gmail OAuth
│       │   ├── db.ts          # SQLite database
│       │   ├── gmail.ts       # Gmail API client
│       │   ├── query.ts       # Query utilities
│       │   └── sync.ts        # Email sync logic
│       └── package.json
├── package.json           # Workspace root
└── bun.lock
```

## Tech Stack

- **Runtime/Package Manager**: Bun (workspace monorepo)
- **Shared Core**: `@jack/mail-core` — auth, db, gmail, query, sync
- **Web App**: TanStack Start, TanStack Router, React 19, Vite, Tailwind CSS
- **CLI**: Bun CLI with `@jack/mail-core` re-exports
- **Desktop**: Tauri (wraps web app)
- **Language**: TypeScript

## Development Commands

```bash
# Install all workspace dependencies
bun install

# Web app
cd apps/web
bun --bun run dev          # Dev server on port 3001
bun --bun run build        # Production build
bun --bun run test         # Run tests

# CLI
cd apps/cli
bun run index.ts --help    # Run CLI

# Core package
cd packages/core
bunx tsc --noEmit          # Type-check
```

## Workspace Dependencies

- Both `apps/cli` and `apps/web` depend on `@jack/mail-core` via `"workspace:*"`
- Core package exports sub-paths: `@jack/mail-core/auth`, `@jack/mail-core/db`, etc.

## Architecture: Where to Put New Logic

This monorepo has a shared core (`packages/core`) consumed by multiple apps (`apps/cli`, `apps/web`). When adding a new feature, think carefully about which layer it belongs in.

### Core first (`packages/core`)

New data queries, filters, and business logic should almost always go in `packages/core`. This ensures every consumer (CLI, web, future apps) benefits from the same capability. Examples:

- A new query filter (e.g. `minThreadCount` on `ThreadQueryOpts`) belongs in `db.ts`
- A new Gmail API call belongs in `gmail.ts`
- A new query syntax operator belongs in `query.ts`

### Server-side over client-side

In the web app, prefer server-side data fetching and filtering over client-side. TanStack Start server functions (`apps/web/src/server/functions.ts`) call into core and return the right data to the client. The route loaders (`apps/web/src/routes/`) declare dependencies via `loaderDeps` so data re-fetches automatically when params change.

**Default to server-side when:**
- Filtering, sorting, or transforming data (let the DB/core do the work)
- The filter reduces the result set (fewer bytes over the wire)
- The logic should also work in the CLI or other consumers

**Client-side is appropriate when:**
- It's purely a UI concern (expand/collapse, hover states, selection tracking)
- Responsiveness matters and the data is already loaded (e.g. instant text highlighting)
- The operation is trivial and doesn't warrant a round-trip

### Typical feature flow

A feature that touches data usually spans three layers:

1. **Core** (`packages/core/src/db.ts`) — add the query option / filter / function
2. **Server function** (`apps/web/src/server/functions.ts`) — expose it via a server function param
3. **Route / UI** (`apps/web/src/routes/`, `apps/web/src/components/`) — wire it into URL search params and loaders so it's URL-driven, and connect it to UI controls

After implementing, verify the feature works in the CLI too — core changes are automatically available there since the CLI imports from `packages/core` directly.

### URL-driven state for filters

Filters and view modes in the web app should be URL search params (like `?threads=true`, `?q=search`), not local component state. This means:
- Filters survive page refreshes
- They properly trigger server-side re-fetching via route `loaderDeps`
- Deep links work (you can share a filtered view)
