# Focus Management & Keyboard-First UX Refactor

This task set addresses keyboard interaction, focus management, and accessibility issues identified in an audit of the email client.

## Goal

Ensure the application follows best-in-class principles for keyboard-first interaction:
- Native browser focus drives keyboard behavior
- Predictable shortcut scoping by surface
- Low-latency interaction without over-using React state
- Screen reader accessibility via proper ARIA semantics

## Core Principle

**React state models application state, not moment-to-moment cursor position.**
**DOM focus models interaction target (where keystrokes go now).**

## Current Architecture

The email client uses a split-view with two surfaces:
- **Email List** (left pane) - scrollable list of email summaries
- **Email Viewer** (right pane) - displays selected email content

Key files:
- `src/lib/hooks/use-keyboard.ts` - Global keyboard shortcut hook
- `src/components/email-split-view.tsx` - Orchestrates focus + selection + keyboard
- `src/components/email-list.tsx` - Renders list with selection highlighting
- `src/components/email-item.tsx` - Individual email row

## Tasks

| Task | Priority | Description |
|------|----------|-------------|
| [01-focus-architecture](./01-focus-architecture.md) | Critical | Fix focus sync between React state and DOM |
| [02-keyboard-routing](./02-keyboard-routing.md) | High | Refactor to capture-phase routing with stable handlers |
| [03-accessibility](./03-accessibility.md) | Critical | Add ARIA roles and roving tabIndex |
| [04-command-layer](./04-command-layer.md) | Medium | Extract commands from inline handlers |
| [05-performance](./05-performance.md) | Medium | Virtualize list, optimize re-renders |

## Implementation Order

1. **01-focus-architecture** - Foundation for everything else
2. **03-accessibility** - Non-negotiable for users
3. **02-keyboard-routing** - Enables proper shortcut scoping
4. **04-command-layer** - Clean architecture
5. **05-performance** - Optimization

## Testing Checklist

After implementation, verify:

- [ ] Page load: list pane has DOM focus, arrow keys work immediately
- [ ] Tab key: moves focus between panes, updates keyboard behavior
- [ ] Click on pane: focuses that pane
- [ ] Arrow keys in list: navigate without lag on fast repetition
- [ ] Screen reader: announces list items, selection state
- [ ] Future inputs: typing doesn't trigger shortcuts (except Escape)
