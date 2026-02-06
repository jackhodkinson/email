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

## React Performance Best Practices

Follow these patterns to avoid unnecessary re-renders and maintain performance:

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
   // Prefer this:
   const processedData = useMemo(() => computeExpensive(input), [input]);

   // Over this:
   const [processedData, setProcessedData] = useState(null);
   useEffect(() => {
     setProcessedData(computeExpensive(input));
   }, [input]);
   ```

3. **Use `useCallback` for event handlers passed to memoized children**:
   ```tsx
   const handleClick = useCallback(() => setState(prev => !prev), []);
   ```

### Event Handlers

- Avoid inline arrow functions in JSX for memoized components
- Define handlers with `useCallback` when passed as props to child components
- For simple local state toggles, still prefer `useCallback` for consistency

### Lists and Keys

- Always use stable IDs for `key` props, never array indices
- Consider virtualization (e.g., `react-virtual`) for lists with 500+ items

### Expensive Operations

- Move heavy computations (DOM parsing, data transformation) to server-side when possible
- For client-side heavy work, consider Web Workers for files >1MB
- Optimize binary operations (e.g., base64 decoding) by writing directly to typed arrays:
  ```tsx
  // Prefer this:
  const byteArray = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteArray[i] = byteCharacters.charCodeAt(i);
  }

  // Over this (creates intermediate array):
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  ```

### Component Structure

- Keep components focused and single-purpose
- Extract pure utility functions outside components (e.g., `formatDate`, `formatSender`)
- Use `forwardRef` for components that need parent-controlled focus/scroll
