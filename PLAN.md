# Project Plan

> **Quick Links**: [SPEC.md](SPEC.md) | [MVP.md](MVP.md) | [ARCHITECTURE.md](ARCHITECTURE.md)

## Overview

Building a view-only Gmail client MVP. Users can connect Gmail accounts, browse their inbox, and read emails with keyboard navigation. Speed and offline capability are priorities.

## Current Status

**Active Milestone**: 1 - Foundation ✅ COMPLETE
**Last Updated**: 2025-02-04

---

## Milestones

### Milestone 1: "See My Inbox" (Foundation)

**Goal**: Auth with Gmail → see your actual inbox in the browser
**Status**: 🟢 Complete

| # | Task | Status | Dependencies | Notes |
|---|------|--------|--------------|-------|
| 1.1 | [Database Setup](tasks/milestone-1/1.1-database-setup.md) | 🟢 | None | Complete |
| 1.2 | [Google Cloud Setup](tasks/milestone-1/1.2-google-cloud-setup.md) | 🟢 | None | Using existing ~/.config/gmail-skill/ |
| 1.3 | [OAuth Flow](tasks/milestone-1/1.3-oauth-flow.md) | 🟢 | 1.1, 1.2 | Complete |
| 1.4 | [Gmail API Client](tasks/milestone-1/1.4-gmail-client.md) | 🟢 | 1.2 | Complete |
| 1.5 | [Email Parser](tasks/milestone-1/1.5-email-parser.md) | 🟢 | None | Complete |
| 1.6 | [Initial Sync](tasks/milestone-1/1.6-initial-sync.md) | 🟢 | 1.1, 1.3, 1.4, 1.5 | Complete |
| 1.7 | [Inbox UI](tasks/milestone-1/1.7-inbox-ui.md) | 🟢 | 1.6 | Complete |

**Parallel tracks possible**:
- Track A: 1.1 → 1.3 (Database + OAuth)
- Track B: 1.2 + 1.4 + 1.5 (Google setup + Gmail client + Parser)
- Merge at 1.6

---

### Milestone 2: "Read an Email"

**Goal**: Click any email, read it fully, navigate back
**Status**: 🟢 Complete

| # | Task | Status | Dependencies | Notes |
|---|------|--------|--------------|-------|
| 2.1 | [Email Detail Route](tasks/milestone-2/2.1-email-detail-route.md) | 🟢 | M1 complete | Complete |
| 2.2 | [Safe HTML Rendering](tasks/milestone-2/2.2-html-rendering.md) | 🟢 | 2.1 | Complete |
| 2.3 | [Attachments Display](tasks/milestone-2/2.3-attachments.md) | 🟢 | 2.1 | Complete |
| 2.4 | [Navigation Flow](tasks/milestone-2/2.4-navigation.md) | 🟢 | 2.1, 2.2 | Complete |

---

### Milestone 3: "Keyboard Navigation"

**Goal**: Complete inbox → email → inbox flow using only keyboard
**Status**: 🔴 Not Started (Blocked by M2)

| # | Task | Status | Dependencies | Notes |
|---|------|--------|--------------|-------|
| 3.1 | [Keyboard Hook](tasks/milestone-3/3.1-keyboard-hook.md) | 🔴 | M2 complete | |
| 3.2 | [List Navigation](tasks/milestone-3/3.2-list-navigation.md) | 🔴 | 3.1 | j/k, Enter |
| 3.3 | [Email View Navigation](tasks/milestone-3/3.3-email-navigation.md) | 🔴 | 3.1 | Escape/u |
| 3.4 | [Help Modal](tasks/milestone-3/3.4-help-modal.md) | 🔴 | 3.1 | ? key |

---

### Milestone 4: "Smart Sync"

**Goal**: New emails appear automatically, can force refresh
**Status**: 🔴 Not Started (Blocked by M1)

| # | Task | Status | Dependencies | Notes |
|---|------|--------|--------------|-------|
| 4.1 | [Delta Sync](tasks/milestone-4/4.1-delta-sync.md) | 🔴 | M1 complete | Uses historyId |
| 4.2 | [Periodic Sync](tasks/milestone-4/4.2-periodic-sync.md) | 🔴 | 4.1 | 60s polling |
| 4.3 | [Manual Refresh](tasks/milestone-4/4.3-manual-refresh.md) | 🔴 | 4.1 | r key + UI button |
| 4.4 | [Sync Status UI](tasks/milestone-4/4.4-sync-status.md) | 🔴 | 4.1 | Visual indicator |

---

### Milestone 5: "Multiple Accounts"

**Goal**: Connect two Gmail accounts, switch between them
**Status**: 🔴 Not Started (Blocked by M1)

| # | Task | Status | Dependencies | Notes |
|---|------|--------|--------------|-------|
| 5.1 | [Account List](tasks/milestone-5/5.1-account-list.md) | 🔴 | M1 complete | |
| 5.2 | [Account Picker](tasks/milestone-5/5.2-account-picker.md) | 🔴 | 5.1 | Dropdown UI |
| 5.3 | [Remove Account](tasks/milestone-5/5.3-remove-account.md) | 🔴 | 5.1 | |
| 5.4 | [Per-Account Sync](tasks/milestone-5/5.4-per-account-sync.md) | 🔴 | 5.1, M4 | |

---

### Milestone 6: "Polish & Robustness"

**Goal**: Handle errors gracefully, meet performance targets
**Status**: 🔴 Not Started (Blocked by M1-M5)

| # | Task | Status | Dependencies | Notes |
|---|------|--------|--------------|-------|
| 6.1 | [Error Handling](tasks/milestone-6/6.1-error-handling.md) | 🔴 | M1-M5 | |
| 6.2 | [Loading States](tasks/milestone-6/6.2-loading-states.md) | 🔴 | M1-M5 | |
| 6.3 | [Offline Indicator](tasks/milestone-6/6.3-offline-indicator.md) | 🔴 | M1 | |
| 6.4 | [Performance Audit](tasks/milestone-6/6.4-performance.md) | 🔴 | M1-M5 | Virtual list, etc |
| 6.5 | [Empty States](tasks/milestone-6/6.5-empty-states.md) | 🔴 | M1-M5 | |

---

## Dependency Graph

```
1.1 Database ─────┬──→ 1.3 OAuth ────┐
                  │                   │
1.2 Google Cloud ─┴──→ 1.4 Gmail ────┼──→ 1.6 Sync ──→ 1.7 Inbox UI
                                     │         │
1.5 Parser ──────────────────────────┘         │
                                               ▼
                              ┌────────────────┴────────────────┐
                              │                                 │
                              ▼                                 ▼
                    Milestone 2 (Read)                 Milestone 4 (Sync)
                              │                                 │
                              ▼                                 │
                    Milestone 3 (Keyboard)                      │
                              │                                 │
                              └────────────┬────────────────────┘
                                           ▼
                                  Milestone 5 (Multi-account)
                                           │
                                           ▼
                                  Milestone 6 (Polish)
```

---

## Status Legend

| Icon | Meaning |
|------|---------|
| 🔴 | Not started |
| 🟡 | In progress |
| 🟠 | In review |
| 🟢 | Complete |
| ⚫ | Blocked |

---

## Notes

- Task files contain detailed requirements and acceptance criteria
- Update this file when starting/completing tasks
- See [tasks/README.md](tasks/README.md) for how to pick up work
