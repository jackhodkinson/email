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
