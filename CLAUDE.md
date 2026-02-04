# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

This is a TanStack Start project using Bun as the package manager and runtime.

## Tech Stack

- **Framework**: TanStack Start (full-stack React framework)
- **Router**: TanStack Router (file-based routing)
- **Runtime/Package Manager**: Bun
- **Build Tool**: Vite
- **Language**: TypeScript
- **React**: v19

## Project Structure

```
email-app/
├── src/
│   ├── routes/           # File-based routing
│   │   ├── __root.tsx    # Root layout (html, head, body shell)
│   │   ├── index.tsx     # Home page (/)
│   │   └── demo/         # Demo routes
│   ├── components/       # Shared components
│   ├── data/             # Data files
│   ├── router.tsx        # Router configuration
│   └── styles.css        # Global styles
├── public/               # Static assets
├── vite.config.ts        # Vite + TanStack Start plugin config
├── tsconfig.json
└── package.json
```

## Development Commands

```bash
cd email-app

# Start dev server (port 3000)
bun --bun run dev

# Build for production
bun --bun run build

# Preview production build
bun --bun run preview

# Run tests
bun --bun run test
```

Note: The `--bun` flag ensures Bun is used as the runtime, not just the package manager.

## TanStack Start Conventions

### File-Based Routing

Routes are defined in `src/routes/`. File naming conventions:
- `index.tsx` - Index route for a directory
- `__root.tsx` - Root layout component
- `[param].tsx` - Dynamic route parameter
- `$.tsx` - Splat/catch-all route
- `_layout.tsx` - Layout route (prefix with underscore)

### Route Definition

Routes are created using `createFileRoute`:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/path')({
  component: MyComponent,
  loader: async () => { /* fetch data */ },
})
```

### Server Functions

Server functions allow type-safe RPC between client and server:

```tsx
import { createServerFn } from '@tanstack/react-start/server'

const myServerFn = createServerFn({ method: 'GET' })
  .handler(async () => {
    // Runs on server
    return { data: 'from server' }
  })
```

### API Routes

API routes are defined with `.ts` files (not `.tsx`) in the routes directory:
- `src/routes/demo/api.names.ts` - Creates `/demo/api/names` endpoint

## Key Configuration Files

- `vite.config.ts` - Uses `@tanstack/react-start/plugin/vite` for SSR support
- `src/router.tsx` - Creates router instance with route tree
- `src/routes/__root.tsx` - Defines the HTML shell and root layout
