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

## Styling Rules

All styles are centralized in `src/styles.css`. Follow these rules strictly:

### Single stylesheet — no exceptions

- **`src/styles.css` is the only CSS file in the project.** Do not create new `.css` files anywhere (not per-route, not per-component, not in subdirectories).
- All CSS custom properties, `@theme` mappings, `@layer base` resets, and `@layer components` classes live in `src/styles.css`.
- It is loaded once via `__root.tsx` and applies globally.

### What goes in `styles.css`

- Design tokens / CSS custom properties (`:root`, `.dark`)
- `@theme inline` mappings to Tailwind
- `@layer base` resets and defaults
- `@layer components` classes for **reusable patterns used in 3+ places** with semantic meaning (e.g. `.email-item`, `.btn-icon`, `.thread-msg`)
- Animation `@keyframes`

### What stays as inline Tailwind utilities in components

- One-off layout and spacing (`flex`, `gap-2`, `p-4`, `grid`)
- Responsive variants (`md:flex`, `lg:grid-cols-3`)
- State variants (`hover:bg-muted`, `focus:ring-2`, `disabled:opacity-50`)
- Conditional classes via `cn()` from `src/lib/utils.ts`

### Do NOT

- Create separate `.css` files per route or component
- Use `@apply` in `styles.css` to replicate what inline Tailwind utilities already do well
- Import CSS files in route/component files (only `__root.tsx` imports `styles.css`)
- Use inline `style={}` attributes except for truly dynamic values (e.g. computed positions)

### When to extract to `@layer components`

Extract a new class in `styles.css` when a Tailwind pattern is:
1. Used in **3 or more** places, AND
2. Has **semantic meaning** (e.g. `.attachment-card`, not `.flex-col-gap-2`)

Follow the existing naming convention: BEM-like with double-dash modifiers (`.email-item--unread`, `.thread-msg__header--expanded`).

## Placement Rules

- Keep route files thin: only routing config (loader, validateSearch, loaderDeps) and a page component that composes feature components.
- Put server functions in `src/server/functions.ts` (or split by domain if it grows).
- Feature UI lives in `src/components/`. Extract when a component exceeds ~200 lines.

## React Patterns

### Avoid syncing state with useEffect

**Do not use `useEffect` to sync local state from props or other state.** This creates two sources of truth and causes subtle bugs (stale values, lost keystrokes, sync loops).

Bad (creates sync bugs):

```tsx
const [local, setLocal] = useState(prop)
useEffect(() => setLocal(prop), [prop]) // DON'T DO THIS
```

Good (single source of truth):

```tsx
const [draft, setDraft] = useState<string | null>(null)
const value = draft ?? prop // prop is the source of truth
```

Alternatives by use case:
- **Derived values**: Use `useMemo` to compute from the source of truth, don't copy into separate state.
- **Debouncing**: Debounce the callback, not the state. Use `useDebouncedCallback` or throttle the setter directly.
- **Expensive renders**: Use `useDeferredValue` to let React deprioritize heavy re-renders while keeping input responsive.
- **Prop-driven initial values**: Use a `key` to reset the component, or make it fully controlled.
- **Input drafts**: Keep draft as `string | null`, render `value={draft ?? committed}`, clear draft on commit.

### Search inputs with router params

Treat the URL as committed state and keep a local draft only while typing. Render `value = draft ?? search ?? ''`. Debounced navigation should read from the draft; clear the draft only when search matches the last debounced value (or on blur/Enter). **Symptom to watch for**: input loses characters when data loads → you're overwriting local draft with a stale URL value.

### TanStack Router search params

Search params are JSON-first. Define/validate search params with `validateSearch`, read them via `Route.useSearch()` or `Route.useLoaderData()`, and use `loaderDeps` to wire search params into loaders. Passing strings like `"true"` will serialize as `%22true%22`.

### Polling

Use TanStack Query's `refetchInterval` option instead of manual `setInterval` with `useEffect`.

## React Performance Best Practices

### Memoization

1. **Wrap list item components with `memo()`** - Prevents N-1 unnecessary re-renders when selection changes:
   ```tsx
   export const ListItem = memo(
     forwardRef<HTMLDivElement, Props>(function ListItem({ item, isSelected }, ref) {
       // ...
     })
   );
   ```

2. **Use `useMemo` instead of `useEffect` + `useState` for derived data** - Avoids double-render (empty state → computed state):
   ```tsx
   const processedData = useMemo(() => computeExpensive(input), [input]);
   ```

3. **Use `useCallback` for event handlers passed to memoized children**:
   ```tsx
   const handleClick = useCallback(() => setState(prev => !prev), []);
   ```

### Event Handlers

- Avoid inline arrow functions in JSX for memoized components
- Define handlers with `useCallback` when passed as props to child components

### Lists and Keys

- Always use stable IDs for `key` props, never array indices
- For large lists (500+ items), virtualize with `@tanstack/react-virtual` so only visible items render
- Keep list item props stable; avoid allocating new arrays/objects for every item on each filter change
- Normalize expensive search inputs once (e.g. `trim().toLowerCase()`) and precompute per-item lowercase fields during data transform

### Expensive Operations

- Move heavy computations (DOM parsing, data transformation) to server-side when possible
- For client-side heavy work, consider Web Workers for files >1MB
- Optimize binary operations (e.g., base64 decoding) by writing directly to typed arrays

### Component Structure

- Keep components focused and single-purpose
- Extract pure utility functions outside components (e.g., `formatDate`, `formatSender`)
- Use `forwardRef` for components that need parent-controlled focus/scroll

## Design

- When choosing colors always support both dark and light mode.
- Use shadcn/ui components and Tailwind's default scale values—avoid arbitrary values like `text-[14px]` or `p-[20px]`. Use CSS variables from `styles.css` for colors.
