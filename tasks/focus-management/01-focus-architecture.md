# Task 01: Focus Architecture

**Priority:** Critical
**Estimated Scope:** Small-medium refactor of `email-split-view.tsx`

## Problem Summary

The current implementation tracks focused pane in React state (`focusedPane`) separately from DOM focus. These can drift apart, causing keyboard shortcuts to fire for the wrong pane.

### Issues

1. **No initial DOM focus** - On page load, `focusedPane` defaults to `"list"` but nothing calls `listRef.current?.focus()`. Keyboard shortcuts don't work until user clicks.

2. **Click uses onMouseDown, ignores Tab** - Panes use `onMouseDown={focusList}` which misses focus changes via Tab key. User can Tab into viewer pane without updating `focusedPane` state.

3. **State and DOM can drift** - `setFocusedPane()` and `.focus()` are separate operations. If focus fails, state diverges from reality.

## Current Code

Location: `src/components/email-split-view.tsx`

```typescript
// Line 47: State can diverge from DOM
const [focusedPane, setFocusedPane] = useState<Pane>("list");

// Lines 66-74: Separate state update and DOM focus
const focusList = useCallback(() => {
  setFocusedPane("list");
  listRef.current?.focus();
}, []);

// Lines 146, 161: Only responds to mouse, not Tab
onMouseDown={focusList}
```

## Required Changes

### 1. Add initial focus on mount

```typescript
// After refs are defined, add effect to focus list on mount
useEffect(() => {
  listRef.current?.focus();
}, []);
```

### 2. Sync state from DOM focus events

Replace `onMouseDown` with `onFocus` to catch all focus sources (click, Tab, programmatic):

```typescript
<section
  ref={listRef}
  tabIndex={0}
  aria-label="Email list"
  onFocus={() => setFocusedPane("list")}
  // ... rest
>
```

```typescript
<section
  ref={viewerRef}
  tabIndex={0}
  aria-label="Email viewer"
  onFocus={() => setFocusedPane("viewer")}
  // ... rest
>
```

### 3. (Optional) Derive focus from DOM instead of state

For maximum reliability, check DOM focus directly in keyboard handlers instead of relying on React state:

```typescript
const getActiveSurface = useCallback((): Pane | null => {
  const active = document.activeElement;
  if (listRef.current?.contains(active)) return "list";
  if (viewerRef.current?.contains(active)) return "viewer";
  return null;
}, []);
```

Then in keyboard handler:
```typescript
const surface = getActiveSurface();
if (surface === "list") {
  // handle list shortcuts
}
```

This approach is more robust but requires changes to how `keyboardHandlers` is structured (see Task 02).

## Acceptance Criteria

- [ ] On page load with emails, list pane has DOM focus (visible focus ring)
- [ ] Arrow keys work immediately without clicking first
- [ ] Pressing Tab moves focus between panes
- [ ] After Tab to viewer, ArrowUp/Down no longer navigate list
- [ ] After Tab back to list, ArrowUp/Down work again
- [ ] Clicking a pane focuses it (existing behavior preserved)

## Files to Modify

- `src/components/email-split-view.tsx`

## Testing

1. Hard refresh the page
2. Without clicking, press ArrowDown - should select first email
3. Press Tab - focus should move to viewer pane (focus ring visible)
4. Press ArrowDown - should NOT change email selection
5. Press Tab or ArrowLeft - focus should return to list
6. Press ArrowDown - should navigate to next email
