# Email Client - MVP Specification

## Goal

A **view-only** email client that lets users read their Gmail quickly and reliably. Speed and snappiness are the top priorities.

---

## Scope

### In Scope
- Connect one or more Gmail accounts (OAuth)
- View inbox
- Read individual emails
- Browse email history
- Offline access to cached emails
- Keyboard navigation

### Out of Scope for MVP
- Composing/sending emails
- Reply/forward
- Archive/delete/star actions
- Search
- Labels/folders
- Conversation threading (flat list is acceptable)
- Notifications

---

## Features

### Account Connection
- "Add Account" button triggers Gmail OAuth flow
- Display list of connected accounts
- Remove account option
- Account indicator showing which inbox you're viewing

### Inbox View
- List of emails showing:
  - Sender name/email
  - Subject line
  - Date/time (relative for recent, absolute for older)
  - Unread indicator (bold/dot)
  - Snippet/preview text
- Pagination or infinite scroll
- Per-account inbox views
- Optional: Unified inbox (all accounts)

### Email View
- Full email content (HTML rendered safely)
- Sender, recipients, date, subject
- Attachments listed (download links)
- Inline images displayed
- Back to inbox navigation

### Offline Support
- Cache last 7 days of emails (configurable for dev)
- IndexedDB storage
- Work fully offline with cached data
- Visual indicator for online/offline status
- Sync on reconnect

### Keyboard Navigation
- `j` / `k` or `↓` / `↑` - navigate email list
- `Enter` or `o` - open selected email
- `Escape` or `u` - back to inbox
- `g i` - go to inbox
- `?` - show keyboard shortcuts

---

## UI Layout

```
┌─────────────────────────────────────────────────────────┐
│  [Account Selector ▼]                    [Add Account]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ● John Smith                              2 hours ago  │
│    Meeting tomorrow                                     │
│    Hey, just wanted to confirm our meeting...           │
│  ─────────────────────────────────────────────────────  │
│    Jane Doe                                  Yesterday  │
│    Re: Project update                                   │
│    Thanks for sending that over...                      │
│  ─────────────────────────────────────────────────────  │
│    GitHub                                    Yesterday  │
│    [repo] New pull request #123                         │
│    @user opened a new pull request...                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Technical Stack (Suggested)

### Frontend
- React or Svelte (fast, reactive)
- Tailwind CSS (rapid styling)
- IndexedDB via Dexie.js (offline storage)

### Backend
- Node.js or Python (FastAPI/Flask)
- Gmail API client
- OAuth 2.0 handling
- WebSocket or polling for sync

### Data Flow
```
Gmail API  ←→  Backend Server  ←→  Frontend  ←→  IndexedDB
                    ↓
              OAuth tokens
              (secure storage)
```

---

## Performance Requirements

| Action | Target |
|--------|--------|
| Initial inbox load (cached) | < 100ms |
| Open email (cached) | < 50ms |
| Scroll through inbox | 60fps, no jank |
| Account switch | < 200ms |

---

## Success Criteria

MVP is complete when a user can:
1. Connect their Gmail account
2. See their inbox with recent emails
3. Click/navigate to read any email
4. Close the browser, reopen, and still see cached emails offline
5. Do all of the above using only the keyboard

---

## Development Phases

### Phase 1: Foundation
- [ ] Project setup (frontend + backend)
- [ ] Gmail OAuth flow working
- [ ] Fetch and display inbox (online only)

### Phase 2: Core Reading
- [ ] Email list view with proper formatting
- [ ] Individual email view
- [ ] Basic keyboard navigation

### Phase 3: Offline
- [ ] IndexedDB caching layer
- [ ] Offline detection and handling
- [ ] Background sync

### Phase 4: Polish
- [ ] Multi-account support
- [ ] Account switcher UI
- [ ] Performance optimization
- [ ] Error handling and edge cases
