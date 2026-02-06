# Task 02: Keyboard Event Routing

**Priority:** High
**Estimated Scope:** Medium refactor of `use-keyboard.ts` and `email-split-view.tsx`

## Problem Summary

The current keyboard handling uses a global `window.addEventListener('keydown')` which has several issues:
- No capture phase means no precedence control
- Handler object recreated on every focus change, causing listener churn
- Future modals/overlays have no way to intercept keyboard events first

## Current Code

### use-keyboard.ts (lines 63-66)
```typescript
useEffect(() => {
  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [handleKeyDown]);
```

### email-split-view.tsx (lines 115-138)
```typescript
const keyboardHandlers = useMemo(() => {
  const handlers: Record<string, () => void> = {
    ArrowLeft: () => { /* ... */ },
    ArrowRight: () => { /* ... */ },
  };

  if (focusedPane === "list") {
    handlers.ArrowDown = selectNext;
    handlers.ArrowUp = selectPrevious;
    handlers.Enter = openSelected;
  }

  return handlers;
}, [focusList, focusViewer, focusedPane, openSelected, selectNext, selectPrevious]);

useKeyboard(keyboardHandlers);
```

Problems:
1. `keyboardHandlers` has 6 dependencies - recreated frequently
2. Each recreation triggers unsubscribe/resubscribe
3. Shortcuts based on `focusedPane` state, not actual DOM focus
4. Window-level listener can't be intercepted by modals

## Required Changes

### Option A: Surface-level handlers (Recommended)

Move keyboard handling to each surface using `onKeyDownCapture`:

```typescript
// email-split-view.tsx

const handleListKeyDown = useCallback((e: React.KeyboardEvent) => {
  // Check if we should ignore (input focused)
  if (isInputElement(e.target as HTMLElement)) return;

  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      selectNext();
      break;
    case "ArrowUp":
      e.preventDefault();
      selectPrevious();
      break;
    case "Enter":
      e.preventDefault();
      openSelected();
      break;
    case "ArrowRight":
      e.preventDefault();
      viewerRef.current?.focus();
      break;
  }
}, [selectNext, selectPrevious, openSelected]);

const handleViewerKeyDown = useCallback((e: React.KeyboardEvent) => {
  if (isInputElement(e.target as HTMLElement)) return;

  switch (e.key) {
    case "ArrowLeft":
      e.preventDefault();
      listRef.current?.focus();
      break;
    // Future: j/k for scrolling
  }
}, []);

// In JSX:
<section
  ref={listRef}
  tabIndex={0}
  onKeyDownCapture={handleListKeyDown}
  // ...
>

<section
  ref={viewerRef}
  tabIndex={0}
  onKeyDownCapture={handleViewerKeyDown}
  // ...
>
```

Helper function:
```typescript
function isInputElement(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  return false;
}
```

### Option B: Stabilized global handler

If you want to keep the hook pattern, stabilize the handler using refs:

```typescript
// use-keyboard.ts - new version

export function useKeyboard(
  getHandlers: () => KeyboardHandlers,
  deps: React.DependencyList
): void {
  const handlersRef = useRef(getHandlers);

  // Update ref when deps change, but don't re-subscribe
  useEffect(() => {
    handlersRef.current = getHandlers;
  }, deps);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isInputFocused()) return;

      const handlers = handlersRef.current();
      const handler = handlers[event.key];
      if (handler) {
        event.preventDefault();
        handler();
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, []); // Only subscribe once
}
```

Usage:
```typescript
useKeyboard(() => {
  const surface = getActiveSurface(); // Check DOM, not state

  if (surface === "list") {
    return {
      ArrowDown: selectNext,
      ArrowUp: selectPrevious,
      Enter: openSelected,
      ArrowRight: () => viewerRef.current?.focus(),
    };
  }

  if (surface === "viewer") {
    return {
      ArrowLeft: () => listRef.current?.focus(),
    };
  }

  return {};
}, [selectNext, selectPrevious, openSelected]);
```

### Input Safety Enhancement

Allow Escape and modifier combos even in inputs:

```typescript
function shouldIgnoreKey(event: KeyboardEvent): boolean {
  if (!isInputFocused()) return false;

  // Allow Escape in inputs (to blur/cancel)
  if (event.key === "Escape") return false;

  // Allow Cmd/Ctrl combos in inputs
  if (event.metaKey || event.ctrlKey) return false;

  // Block other shortcuts in inputs
  return true;
}
```

## Acceptance Criteria

- [ ] Keyboard handlers don't cause listener churn on focus changes
- [ ] Each surface only handles its own shortcuts
- [ ] `onKeyDownCapture` ensures surface handles before children
- [ ] Escape key works even when a future input is focused
- [ ] No shortcuts fire when typing in inputs (except Escape, Cmd+X, etc.)

## Files to Modify

- `src/lib/hooks/use-keyboard.ts` (refactor or deprecate)
- `src/components/email-split-view.tsx`

## Future Considerations

When modals are added:
- Modal should have `onKeyDownCapture` that handles Escape
- Modal should trap Tab focus
- Modal's handler runs before underlying surface handlers

```typescript
// Future modal pattern
<div
  role="dialog"
  onKeyDownCapture={(e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeModal();
    }
  }}
>
```
