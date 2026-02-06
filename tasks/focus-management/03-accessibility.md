# Task 03: Accessibility (ARIA & Roving TabIndex)

**Priority:** Critical
**Estimated Scope:** Medium refactor of `email-list.tsx` and `email-item.tsx`

## Problem Summary

The email list lacks proper ARIA semantics. Screen readers won't announce it as a list, won't indicate which item is selected, and Tab order goes through every item instead of using roving tabIndex.

## Current Code

### email-list.tsx (lines 39-50)
```typescript
<ScrollArea className="h-full">
  <div className="divide-y">
    {emails.map((email, index) => (
      <EmailItem
        key={email.id}
        email={email}
        isSelected={index === selectedIndex}
        ref={index === selectedIndex ? selectedRef : undefined}
      />
    ))}
  </div>
</ScrollArea>
```

No `role`, no `aria-label`, no `aria-activedescendant`.

### email-item.tsx (lines 21-70)
```typescript
<div ref={ref}>
  <Link
    to="/email/$id"
    params={{ id: email.id }}
    className={cn(/* ... */)}
  >
    {/* content */}
  </Link>
</div>
```

- Wrapper `<div>` has no role
- `<Link>` is always focusable (no roving tabIndex)
- No `aria-selected`

## Required Changes

### 1. Add listbox semantics to EmailList

```typescript
// email-list.tsx

export function EmailList({
  emails,
  selectedIndex = -1,
  onSelect,  // New prop for keyboard selection
}: EmailListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  // Handle keyboard navigation within list
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // This is handled by parent, but we could add list-specific handling here
  };

  if (emails.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No emails found
      </div>
    );
  }

  const selectedId = selectedIndex >= 0 ? emails[selectedIndex]?.id : undefined;

  return (
    <ScrollArea className="h-full">
      <div
        ref={listRef}
        role="listbox"
        aria-label="Email messages"
        aria-activedescendant={selectedId ? `email-${selectedId}` : undefined}
        className="divide-y"
      >
        {emails.map((email, index) => (
          <EmailItem
            key={email.id}
            id={`email-${email.id}`}
            email={email}
            isSelected={index === selectedIndex}
            ref={index === selectedIndex ? selectedRef : undefined}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
```

### 2. Add option semantics to EmailItem

```typescript
// email-item.tsx

interface EmailItemProps {
  id: string;  // For aria-activedescendant
  email: {
    id: string;
    sender: string;
    subject: string | null;
    snippet: string | null;
    date: number;
    isRead: boolean;
    hasAttachments: boolean;
  };
  isSelected?: boolean;
}

export const EmailItem = forwardRef<HTMLDivElement, EmailItemProps>(
  function EmailItem({ id, email, isSelected }, ref) {
    return (
      <div
        ref={ref}
        id={id}
        role="option"
        aria-selected={isSelected}
      >
        <Link
          to="/email/$id"
          params={{ id: email.id }}
          tabIndex={-1}  // Remove from tab order - parent handles focus
          className={cn(
            "block relative px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors",
            isSelected && "bg-primary/10 ring-2 ring-primary/20 ring-inset",
            !email.isRead && !isSelected && "bg-blue-50 dark:bg-blue-950/20"
          )}
        >
          {/* ... existing content ... */}
        </Link>
      </div>
    );
  }
);
```

### 3. Alternative: Roving tabIndex pattern

If you want each item to be individually focusable (instead of using aria-activedescendant):

```typescript
// email-item.tsx - roving tabIndex version

export const EmailItem = forwardRef<HTMLDivElement, EmailItemProps>(
  function EmailItem({ id, email, isSelected }, ref) {
    return (
      <div
        ref={ref}
        id={id}
        role="option"
        aria-selected={isSelected}
        tabIndex={isSelected ? 0 : -1}  // Only selected item in tab order
        className={cn(
          "block relative px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors outline-none",
          "focus-visible:ring-2 focus-visible:ring-primary",
          isSelected && "bg-primary/10 ring-2 ring-primary/20 ring-inset",
          !email.isRead && !isSelected && "bg-blue-50 dark:bg-blue-950/20"
        )}
      >
        <Link
          to="/email/$id"
          params={{ id: email.id }}
          tabIndex={-1}  // Link not in tab order
          className="block"
          onClick={(e) => e.stopPropagation()}  // Let parent handle click
        >
          {/* ... content ... */}
        </Link>
      </div>
    );
  }
);
```

With roving tabIndex, you also need to:
1. Move DOM focus when selection changes
2. Handle click on the item wrapper

```typescript
// In EmailList or EmailSplitView

useEffect(() => {
  // When selection changes, focus the selected item
  if (selectedRef.current) {
    selectedRef.current.focus();
  }
}, [selectedIndex]);
```

### 4. Add screen reader announcements

For selection changes, the browser will announce automatically with proper ARIA. For additional context:

```typescript
// Optional: Live region for status announcements
<div
  role="status"
  aria-live="polite"
  className="sr-only"
>
  {selectedIndex >= 0 && `Email ${selectedIndex + 1} of ${emails.length} selected`}
</div>
```

## ARIA Pattern Reference

We're implementing the [Listbox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/):

| Element | Role | ARIA Attributes |
|---------|------|-----------------|
| Container | `listbox` | `aria-label`, `aria-activedescendant` |
| Items | `option` | `aria-selected`, `id` |

Keyboard behavior per spec:
- Up/Down: Move selection
- Home: First item
- End: Last item
- Type-ahead: Jump to matching item (optional)

## Acceptance Criteria

- [ ] List container has `role="listbox"` and `aria-label`
- [ ] Each item has `role="option"` and `aria-selected`
- [ ] Screen reader announces "Email messages, listbox, X items"
- [ ] Screen reader announces selected item and selection state
- [ ] Tab moves focus into/out of list, not through each item
- [ ] Arrow keys move selection (existing behavior)

## Files to Modify

- `src/components/email-list.tsx`
- `src/components/email-item.tsx`
- `src/components/email-split-view.tsx` (pass `id` prop)

## Testing

### Screen Reader Testing (VoiceOver on Mac)
1. Enable VoiceOver (Cmd+F5)
2. Navigate to email list
3. Verify it announces "Email messages, listbox"
4. Use arrow keys to navigate
5. Verify it announces sender, subject, and "selected"

### Keyboard Testing
1. Tab into the app - focus should land on list
2. Press Tab - focus should move to viewer (not to each email)
3. Shift+Tab back - focus returns to list
4. Arrow keys navigate within list
