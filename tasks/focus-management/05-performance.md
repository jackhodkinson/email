# Task 05: Performance Optimizations

**Priority:** Medium
**Estimated Scope:** Medium refactor

## Problem Summary

Current implementation has performance concerns that will become problematic as the email list grows:

1. **Full list render** - All emails render to DOM, no virtualization
2. **Re-renders on every arrow key** - Selection changes trigger full re-render cascade
3. **Handler recreation** - Keyboard handlers recreated on state changes

## Issue 1: Non-Virtualized List

### Current Code (email-list.tsx)
```typescript
{emails.map((email, index) => (
  <EmailItem
    key={email.id}
    email={email}
    isSelected={index === selectedIndex}
  />
))}
```

For 1000 emails, this creates 1000 DOM nodes immediately.

### Solution: TanStack Virtual

```typescript
// email-list.tsx

import { useVirtualizer } from "@tanstack/react-virtual";

export function EmailList({ emails, selectedIndex = -1 }: EmailListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: emails.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 76,  // Approximate height of EmailItem
    overscan: 5,  // Render 5 extra items above/below viewport
  });

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0) {
      virtualizer.scrollToIndex(selectedIndex, { align: "auto" });
    }
  }, [selectedIndex, virtualizer]);

  if (emails.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No emails found
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="h-full overflow-auto"
      role="listbox"
      aria-label="Email messages"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const email = emails[virtualRow.index];
          const isSelected = virtualRow.index === selectedIndex;

          return (
            <div
              key={email.id}
              ref={isSelected ? selectedRef : undefined}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <EmailItem
                id={`email-${email.id}`}
                email={email}
                isSelected={isSelected}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

Install dependency:
```bash
bun add @tanstack/react-virtual
```

## Issue 2: Re-renders on Selection Change

### Current Behavior

Each ArrowDown press:
1. `setLocalSelectedIndex(n+1)` - triggers re-render
2. `onSelectEmail(id)` - triggers navigation
3. `EmailSplitView` re-renders
4. `EmailList` re-renders
5. All `EmailItem` components re-render (only one actually changed)

### Solution A: Memoize EmailItem

```typescript
// email-item.tsx

import { memo } from "react";

export const EmailItem = memo(forwardRef<HTMLDivElement, EmailItemProps>(
  function EmailItem({ id, email, isSelected }, ref) {
    // ... existing implementation ...
  }
));
```

This prevents re-render of items that haven't changed. Only the previously-selected and newly-selected items re-render.

### Solution B: Use refs for transient focus state

If the visual selection is separate from the "active" email (i.e., you can browse without loading each email), use refs:

```typescript
// email-split-view.tsx

const selectedIndexRef = useRef(resolvedSelectedIndex);

// Update ref without re-render
const selectIndex = useCallback((index: number) => {
  selectedIndexRef.current = index;
  // Only trigger re-render when we actually want to load the email
}, []);

// Use state only for committed selection
const [loadedEmailIndex, setLoadedEmailIndex] = useState(-1);

const openSelected = useCallback(() => {
  setLoadedEmailIndex(selectedIndexRef.current);
  // This triggers the actual load
}, []);
```

This is more complex and may not be needed if virtualization + memoization are sufficient.

### Solution C: Use startTransition for low-priority updates

```typescript
import { startTransition } from "react";

const selectNext = useCallback(() => {
  startTransition(() => {
    const nextIndex = Math.min(resolvedSelectedIndex + 1, emails.length - 1);
    selectIndex(nextIndex);
  });
}, [...]);
```

This marks the update as non-urgent, allowing React to interrupt if the user keeps pressing keys.

## Issue 3: Handler Recreation

### Current Code
```typescript
const keyboardHandlers = useMemo(() => {
  // ...
}, [focusList, focusViewer, focusedPane, openSelected, selectNext, selectPrevious]);
```

Six dependencies means frequent recreation.

### Solution: Stable callback with refs

```typescript
// Move navigation functions to refs
const selectNextRef = useRef(selectNext);
const selectPreviousRef = useRef(selectPrevious);
const openSelectedRef = useRef(openSelected);

// Update refs when functions change (no re-subscribe)
useEffect(() => {
  selectNextRef.current = selectNext;
  selectPreviousRef.current = selectPrevious;
  openSelectedRef.current = openSelected;
});

// Stable handler that reads from refs
const handleKeyDown = useCallback((e: KeyboardEvent) => {
  // Check focus
  const isList = listRef.current?.contains(document.activeElement);

  if (isList) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        selectNextRef.current();
        break;
      // ...
    }
  }
}, []); // No dependencies - stable forever

useEffect(() => {
  window.addEventListener("keydown", handleKeyDown, { capture: true });
  return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
}, [handleKeyDown]); // Only subscribes once
```

## Performance Measurement

Before optimizing, measure:

```typescript
// Add to EmailList for profiling
useEffect(() => {
  console.time("EmailList render");
  return () => console.timeEnd("EmailList render");
});

// Or use React DevTools Profiler
// Or use browser Performance tab
```

Test with:
- 100 emails (should be fine)
- 1000 emails (may see lag)
- Hold arrow key down for 2 seconds (rapid fire)

## Acceptance Criteria

- [ ] Email list virtualized - only visible items in DOM
- [ ] Holding arrow key doesn't cause visible lag
- [ ] EmailItem components don't re-render unless their props change
- [ ] Keyboard handler subscription is stable (doesn't churn)

## Files to Modify

- `src/components/email-list.tsx` - Add virtualization
- `src/components/email-item.tsx` - Add memo
- `src/components/email-split-view.tsx` - Stabilize handlers

## Dependencies to Add

```bash
bun add @tanstack/react-virtual
```

## Testing

1. **Virtual scrolling test:**
   - Load page with 100+ emails
   - Open browser DevTools Elements panel
   - Scroll the list
   - Observe that only ~20-30 items are in DOM at any time

2. **Rapid navigation test:**
   - Focus email list
   - Hold ArrowDown for 3 seconds
   - Selection should move smoothly without stuttering

3. **React DevTools Profiler:**
   - Start recording
   - Press ArrowDown 10 times
   - Stop recording
   - Verify only 2 EmailItems re-render per keypress (old and new selection)
