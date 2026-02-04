# Email Client - Product Specification

## Overview

A fast, keyboard-first web-based email client supporting multiple Gmail accounts with offline capabilities. Designed to run locally with a focus on speed and responsiveness.

---

## Platform

- **Primary**: Local web application
- **Future**: Desktop app (Electron/Tauri)

---

## Core Features

### Multi-Account Support
- Connect multiple Gmail accounts via OAuth 2.0
- Add/remove accounts through settings
- Unified inbox view (all accounts combined)
- Per-account inbox views
- Clear visual indicator showing which account is active
- Account switcher in UI
- Select sending account when composing

### Reading Email
- View inbox, sent, drafts, trash, spam
- Conversation threading (group related messages)
- Full HTML rendering with inline images
- Attachment viewing and download
- Mark as read/unread
- Star/flag messages
- Archive messages
- Delete messages (move to trash)

### Composing Email
- New message composition
- Reply, reply-all, forward
- Rich text formatting
- Attachments
- Auto-save drafts
- CC/BCC support
- Select which account to send from

### Search
- Full-text search across all synced emails
- Search by sender, subject, date range
- Cross-account search in unified view
- Fast local search (searches cached data)

### Offline Support
- Local caching of email data
- **Production**: Last 12 months of email history
- **Development/Prototyping**: Last 7 days
- Read emails while offline
- Queue actions (archive, delete, etc.) for sync when online
- Queue composed emails for sending when online

### Keyboard-First Interface
- Vim-style navigation (j/k for up/down, etc.)
- Single-key actions (a=archive, d=delete, r=reply, etc.)
- Command palette for quick actions
- Full mouse support as alternative

---

## Future Features (Post-MVP)

### Labels & Organization
- Full Gmail label support (multiple labels per email)
- Create/edit/delete labels
- Filter by label
- Drag-and-drop labeling

### Contacts Integration
- Google Contacts sync
- Autocomplete when composing
- Contact management UI

### Calendar Integration
- Display calendar invites inline
- Accept/decline/tentative from email view
- Quick calendar preview

### Desktop App
- Native desktop application
- System tray integration
- Desktop notifications (real-time push)
- OS-level keyboard shortcuts

### Advanced Features
- Email templates
- Scheduled sending
- Snooze emails
- Undo send
- Email signatures (per-account)
- Filters and rules

---

## Technical Considerations

### Authentication
- OAuth 2.0 with Gmail API
- Secure token storage
- Token refresh handling
- Multi-account token management

### Data Storage
- IndexedDB for email cache
- Efficient sync strategy (delta updates)
- Storage quota management
- Cache invalidation

### Performance Goals
- Inbox load: < 100ms (cached)
- Search results: < 200ms (local)
- Smooth scrolling through large inboxes
- Lazy loading for conversation threads

---

## Non-Goals (Explicitly Out of Scope)

- Support for non-Gmail providers (initially)
- Email encryption (PGP/S/MIME)
- Shared mailboxes / delegation
- Mobile app
