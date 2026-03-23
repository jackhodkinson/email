# Realtime State Propagation (CLI → Web UI)

## Status: 🔴 Not Started

## Goal

When a mutation happens via the CLI (e.g. `cmail tag`, `cmail sync`), the web/desktop UI should update in real-time without requiring a manual refresh or polling cycle.

## Problem

Currently, the CLI and web app both mutate state independently:
- CLI: `tag()` → Gmail API + SQLite update → prints result → done
- Web: server functions → Gmail API + SQLite update → no reactive invalidation

There's no mechanism for one process to notify another that state has changed. If you run `cmail tag 3 +Cmail/Important` in a terminal while the web UI is open, the UI won't reflect the change until the next 60-second sync poll or a manual refresh.

This is especially painful when an external agent (e.g. Claude Code running `/email-review`) bulk-tags dozens of emails — the UI stays stale the entire time.

## Requirements

1. **State change notifications**: When any process mutates the local SQLite database, other connected processes should be notified.
2. **UI refresh on notification**: The web app should re-query and re-render affected data when it receives a notification.
3. **Low latency**: Changes should propagate within ~100ms, not on a polling interval.
4. **Works across processes**: CLI and web server are separate Bun processes sharing the same SQLite file.

## Possible Approaches

### Option A: File-based watcher (simplest)
- After any DB mutation, touch a sentinel file (e.g. `~/.cache/cmail/db.notify`)
- Web server watches the file with `fs.watch()` and pushes invalidation to clients via WebSocket/SSE
- Pros: Dead simple, no dependencies
- Cons: Relies on filesystem events, slight delay

### Option B: SQLite WAL + polling optimization
- Use SQLite's WAL mode and check `PRAGMA data_version` on a tight interval (e.g. 200ms)
- When data_version changes, push to UI
- Pros: Works with any SQLite writer, no IPC needed
- Cons: Still polling (just faster), some CPU overhead

### Option C: Unix domain socket / IPC
- Web server listens on a Unix domain socket
- CLI sends a "state-changed" message after each mutation
- Server pushes to UI clients via WebSocket/SSE
- Pros: Instant, reliable
- Cons: More complex, CLI needs to know about the socket

### Option D: WebSocket server in the web app
- Web app runs a lightweight WebSocket server on a known local port
- CLI POSTs or sends a WS message after mutations
- Pros: Works well with TanStack Start's server architecture
- Cons: Port conflicts, discovery

## Suggested Architecture

Recommend starting with **Option A or C** — file watcher for quick wins, then upgrade to IPC if latency matters.

The propagation chain would be:

```
CLI mutation (cmail tag, cmail sync, etc.)
  → core/db.ts write function
    → emit notification (touch file / send IPC / etc.)
      → web server receives notification
        → push "invalidate" event via SSE/WebSocket to browser
          → TanStack Router loader re-fetches affected data
```

### Implementation Notes

- **Notification hook in core**: Add a post-mutation hook in `@jack/mail-core` so any consumer (CLI, web server, future tools) can trigger notifications after DB writes. This keeps the notification logic centralized.
- **Server-sent events**: SSE is simpler than WebSocket for one-way server→client push. TanStack Start supports API routes where an SSE endpoint could live.
- **Granularity**: Start with a simple "something changed" signal. Fine-grained invalidation (which messages, which labels) can come later.
- **Backward compatible**: The CLI should still work fine if no UI is listening — the notification is fire-and-forget.

## Acceptance Criteria

- [ ] `cmail tag <id> +Label` in a terminal causes the web UI to update within ~500ms without user interaction
- [ ] `cmail sync` results appear in the web UI without manual refresh
- [ ] Bulk operations (e.g. tagging 20 emails in a loop) don't cause UI thrashing — debounce/batch notifications
- [ ] CLI still works normally when web UI is not running (no errors, no hanging)
- [ ] Notification mechanism is in `@jack/mail-core` so both CLI and web app use the same code

## Files Likely Affected

- `packages/core/src/db.ts` — add post-mutation notification hook
- `packages/core/src/index.ts` — export notification utilities
- `apps/web/src/server/` — SSE or WebSocket endpoint
- `apps/web/src/routes/` — subscribe to invalidation events, re-fetch data
- `apps/cli/lib/` — ensure CLI triggers notifications after mutations
