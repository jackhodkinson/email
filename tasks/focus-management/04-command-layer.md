# Task 04: Command Layer Abstraction

**Priority:** Medium
**Estimated Scope:** Medium refactor, new file + updates to existing

## Problem Summary

Currently, keyboard shortcuts directly call state setters and navigation functions. UI elements (like the "Back to Inbox" link) use different code paths. This makes it hard to:
- Add analytics/logging to actions
- Implement undo/redo
- Show keyboard shortcuts in tooltips
- Ensure consistent behavior between click and keyboard

## Current Code

### Keyboard handlers (email-split-view.tsx)
```typescript
const selectNext = useCallback(() => {
  // Direct state manipulation
  const nextIndex = Math.min(resolvedSelectedIndex + 1, emails.length - 1);
  selectIndex(nextIndex);
}, [...]);

// Shortcut directly calls the function
handlers.ArrowDown = selectNext;
```

### UI navigation (email-view.tsx)
```typescript
<Link to="/" className="...">
  Back to Inbox
</Link>
```

The Link and keyboard Enter do the same thing but via different paths.

## Required Changes

### 1. Create command definitions

```typescript
// src/lib/commands/index.ts

export interface Command {
  id: string;
  name: string;
  shortcut?: string;  // Display string like "↓" or "⌘K"
  execute: () => void;
}

export interface CommandContext {
  // Navigation
  navigate: (to: string, params?: Record<string, string>) => void;

  // Email state
  emails: EmailSummary[];
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;

  // Focus
  focusList: () => void;
  focusViewer: () => void;
}

export function createCommands(ctx: CommandContext): Record<string, Command> {
  return {
    selectNextEmail: {
      id: "selectNextEmail",
      name: "Next email",
      shortcut: "↓",
      execute: () => {
        if (ctx.emails.length === 0) return;
        const next = Math.min(ctx.selectedIndex + 1, ctx.emails.length - 1);
        ctx.setSelectedIndex(next);
      },
    },

    selectPreviousEmail: {
      id: "selectPreviousEmail",
      name: "Previous email",
      shortcut: "↑",
      execute: () => {
        if (ctx.emails.length === 0) return;
        const prev = Math.max(ctx.selectedIndex - 1, 0);
        ctx.setSelectedIndex(prev);
      },
    },

    openSelectedEmail: {
      id: "openSelectedEmail",
      name: "Open email",
      shortcut: "Enter",
      execute: () => {
        const email = ctx.emails[ctx.selectedIndex];
        if (email) {
          ctx.navigate("/email/$id", { id: email.id });
        }
      },
    },

    goToInbox: {
      id: "goToInbox",
      name: "Back to inbox",
      shortcut: "Escape",
      execute: () => {
        ctx.navigate("/");
      },
    },

    focusEmailList: {
      id: "focusEmailList",
      name: "Focus list",
      shortcut: "←",
      execute: () => {
        ctx.focusList();
      },
    },

    focusEmailViewer: {
      id: "focusEmailViewer",
      name: "Focus viewer",
      shortcut: "→",
      execute: () => {
        ctx.focusViewer();
      },
    },

    // Future commands
    archiveEmail: {
      id: "archiveEmail",
      name: "Archive",
      shortcut: "e",
      execute: () => {
        // TODO: Implement
        console.log("Archive not implemented");
      },
    },

    deleteEmail: {
      id: "deleteEmail",
      name: "Delete",
      shortcut: "#",
      execute: () => {
        // TODO: Implement
        console.log("Delete not implemented");
      },
    },
  };
}
```

### 2. Create shortcut-to-command mapping

```typescript
// src/lib/commands/shortcuts.ts

export type Surface = "global" | "list" | "viewer" | "composer" | "modal";

export interface ShortcutMapping {
  key: string;
  command: string;
  surface: Surface;
}

export const shortcuts: ShortcutMapping[] = [
  // Global
  { key: "Escape", command: "goToInbox", surface: "global" },

  // List surface
  { key: "ArrowDown", command: "selectNextEmail", surface: "list" },
  { key: "ArrowUp", command: "selectPreviousEmail", surface: "list" },
  { key: "Enter", command: "openSelectedEmail", surface: "list" },
  { key: "ArrowRight", command: "focusEmailViewer", surface: "list" },
  { key: "j", command: "selectNextEmail", surface: "list" },  // Vim-style
  { key: "k", command: "selectPreviousEmail", surface: "list" },

  // Viewer surface
  { key: "ArrowLeft", command: "focusEmailList", surface: "viewer" },
  { key: "e", command: "archiveEmail", surface: "viewer" },
];

export function getShortcutsForSurface(surface: Surface): ShortcutMapping[] {
  return shortcuts.filter(s => s.surface === surface || s.surface === "global");
}
```

### 3. Create command hook

```typescript
// src/lib/commands/use-commands.ts

import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { createCommands, Command, CommandContext } from "./index";

interface UseCommandsOptions {
  emails: EmailSummary[];
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  focusList: () => void;
  focusViewer: () => void;
}

export function useCommands(options: UseCommandsOptions): Record<string, Command> {
  const navigate = useNavigate();

  const commands = useMemo(() => {
    const ctx: CommandContext = {
      navigate: (to, params) => navigate({ to, params } as any),
      emails: options.emails,
      selectedIndex: options.selectedIndex,
      setSelectedIndex: options.setSelectedIndex,
      focusList: options.focusList,
      focusViewer: options.focusViewer,
    };

    return createCommands(ctx);
  }, [
    navigate,
    options.emails,
    options.selectedIndex,
    options.setSelectedIndex,
    options.focusList,
    options.focusViewer,
  ]);

  return commands;
}
```

### 4. Update EmailSplitView to use commands

```typescript
// email-split-view.tsx

import { useCommands } from "@/lib/commands/use-commands";
import { getShortcutsForSurface } from "@/lib/commands/shortcuts";

export function EmailSplitView({ /* ... */ }) {
  // ... existing state ...

  const commands = useCommands({
    emails,
    selectedIndex: resolvedSelectedIndex,
    setSelectedIndex: selectIndex,
    focusList,
    focusViewer,
  });

  const handleListKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (isInputElement(e.target as HTMLElement)) return;

    const shortcuts = getShortcutsForSurface("list");
    const mapping = shortcuts.find(s => s.key === e.key);

    if (mapping && commands[mapping.command]) {
      e.preventDefault();
      commands[mapping.command].execute();
    }
  }, [commands]);

  const handleViewerKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (isInputElement(e.target as HTMLElement)) return;

    const shortcuts = getShortcutsForSurface("viewer");
    const mapping = shortcuts.find(s => s.key === e.key);

    if (mapping && commands[mapping.command]) {
      e.preventDefault();
      commands[mapping.command].execute();
    }
  }, [commands]);

  // ... rest of component ...
}
```

### 5. Update UI to use commands

```typescript
// email-view.tsx

interface EmailViewProps {
  email: EmailDetail;
  onBack?: () => void;  // New prop: command callback
}

export function EmailView({ email, onBack }: EmailViewProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 px-4 py-3 border-b">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {/* ... icon ... */}
          Back to Inbox
        </button>
      </div>
      {/* ... rest ... */}
    </div>
  );
}

// In EmailSplitView:
<EmailView
  email={email}
  onBack={() => commands.goToInbox.execute()}
/>
```

## Benefits

1. **Single source of truth** for actions
2. **Keyboard shortcuts visible** in UI via `command.shortcut`
3. **Easy to add logging/analytics**:
   ```typescript
   execute: () => {
     analytics.track("email_archived", { emailId });
     // actual implementation
   }
   ```
4. **Undo/redo possible** by tracking command history
5. **Command palette** (Cmd+K) can list all available commands

## Acceptance Criteria

- [ ] Commands defined in dedicated module
- [ ] Shortcuts map to commands by name
- [ ] Keyboard handlers dispatch to commands
- [ ] UI buttons use same command functions
- [ ] Adding new command only requires editing command definitions

## Files to Create

- `src/lib/commands/index.ts` - Command definitions
- `src/lib/commands/shortcuts.ts` - Shortcut mappings
- `src/lib/commands/use-commands.ts` - React hook

## Files to Modify

- `src/components/email-split-view.tsx` - Use commands
- `src/components/email-view.tsx` - Use command callback
