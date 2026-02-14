# Architecture

Technical architecture for the email client MVP.

> Update: the app now uses the shared `@jack/mail-core` package (same core as `cmail`) and the shared SQLite mailbox at `~/.cache/cmail/mail.sqlite`.

## Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| **Runtime** | Bun | Package manager, runtime, and native SQLite |
| **Framework** | TanStack Start | SSR-capable React framework with file-based routing |
| **Frontend** | React 19 + TypeScript | Already configured |
| **UI Components** | shadcn/ui | Install via `bunx shadcn@latest` |
| **Styling** | Tailwind CSS | Required by shadcn |
| **Database** | SQLite via `bun:sql` | Native Bun SQL API, no npm package needed |
| **Email API** | Gmail API | Via `googleapis` npm package |
| **Auth** | OAuth 2.0 | Google OAuth for Gmail access |

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      Browser (React)                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Inbox List  │  │ Email View  │  │ Account UI  │              │
│  │ (shadcn)    │  │ (HTML safe) │  │ (OAuth)     │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
│         └────────────────┼────────────────┘                      │
│                          │                                       │
│                    TanStack Router                               │
│                    (loaders + server functions)                  │
├──────────────────────────┼───────────────────────────────────────┤
│                          │                                       │
│                      Server (Bun)                                │
│  ┌─────────────┐  ┌──────┴──────┐  ┌─────────────┐              │
│  │ Gmail Sync  │  │ Server      │  │ OAuth       │              │
│  │ Service     │  │ Functions   │  │ Handler     │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
│         └────────────────┼────────────────┘                      │
│                          │                                       │
│                   ┌──────┴──────┐                                │
│                   │   SQLite    │                                │
│                   │   (Bun SQL) │                                │
│                   └─────────────┘                                │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Gmail API  │
                    └─────────────┘
```

## Database Schema

SQLite database stored at `data/email.db`.

```sql
-- OAuth tokens for Gmail accounts
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry INTEGER NOT NULL,
  history_id TEXT,  -- For delta sync
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Cached emails
CREATE TABLE emails (
  id TEXT PRIMARY KEY,           -- Gmail message ID
  account_id TEXT NOT NULL REFERENCES accounts(id),
  thread_id TEXT NOT NULL,
  subject TEXT,
  sender TEXT NOT NULL,          -- "Name <email>" format
  recipients TEXT,               -- JSON array
  snippet TEXT,
  body_text TEXT,
  body_html TEXT,
  date INTEGER NOT NULL,         -- Unix timestamp
  labels TEXT,                   -- JSON array of Gmail labels
  has_attachments INTEGER DEFAULT 0,
  is_read INTEGER DEFAULT 0,
  raw_size INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Attachments metadata (content fetched on-demand)
CREATE TABLE attachments (
  id TEXT PRIMARY KEY,           -- Gmail attachment ID
  email_id TEXT NOT NULL REFERENCES emails(id),
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL
);

-- Indexes for fast queries
CREATE INDEX idx_emails_account ON emails(account_id);
CREATE INDEX idx_emails_date ON emails(date DESC);
CREATE INDEX idx_emails_thread ON emails(thread_id);
CREATE INDEX idx_emails_labels ON emails(labels);
CREATE INDEX idx_attachments_email ON attachments(email_id);
```

### Bun SQL Usage

```typescript
import { SQL } from "bun";

// Initialize database
const db = new SQL("sqlite://data/email.db");

// Enable WAL mode for better concurrency
await db`PRAGMA journal_mode = WAL`;
await db`PRAGMA foreign_keys = ON`;

// Query example - tagged template literals prevent SQL injection
const emails = await db`
  SELECT * FROM emails
  WHERE account_id = ${accountId}
  ORDER BY date DESC
  LIMIT ${limit}
`;

// Insert example
await db`
  INSERT INTO emails ${db({
    id: message.id,
    account_id: accountId,
    thread_id: message.threadId,
    subject: message.subject,
    // ... other fields
  })}
`;

// Transactions
await db.begin(async (tx) => {
  await tx`DELETE FROM emails WHERE account_id = ${accountId}`;
  await tx`DELETE FROM accounts WHERE id = ${accountId}`;
});
```

## Gmail Sync Strategy

Two-phase sync approach based on [Gmail API sync documentation](https://developers.google.com/workspace/gmail/api/guides/sync).

### Initial Sync (Full)

First-time connection or when `historyId` is stale:

1. Call `messages.list` with query `after:YYYY/MM/DD` (7 days for MVP)
2. Batch fetch messages using `messages.get` with `format=FULL`
3. Parse and store in SQLite
4. Save the latest `historyId` for delta sync

```typescript
// Pseudocode for initial sync
const messages = await gmail.users.messages.list({
  userId: "me",
  q: `after:${sevenDaysAgo}`,
  maxResults: 500,
});

// Batch fetch full content
for (const batch of chunk(messages, 50)) {
  const fullMessages = await Promise.all(
    batch.map(m => gmail.users.messages.get({
      userId: "me",
      id: m.id,
      format: "full",
    }))
  );
  await saveToDatabase(fullMessages);
}

// Store historyId for future syncs
await db`UPDATE accounts SET history_id = ${latestHistoryId} WHERE id = ${accountId}`;
```

### Delta Sync (Partial)

Subsequent syncs using the History API:

1. Call `history.list` with stored `startHistoryId`
2. Process changes: additions, deletions, label changes
3. Update local database accordingly
4. Update stored `historyId`

```typescript
// Pseudocode for delta sync
const history = await gmail.users.history.list({
  userId: "me",
  startHistoryId: storedHistoryId,
  historyTypes: ["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"],
});

for (const record of history.history || []) {
  // Handle additions
  for (const added of record.messagesAdded || []) {
    const full = await gmail.users.messages.get({ userId: "me", id: added.message.id });
    await saveToDatabase(full);
  }

  // Handle deletions
  for (const deleted of record.messagesDeleted || []) {
    await db`DELETE FROM emails WHERE id = ${deleted.message.id}`;
  }

  // Handle label changes
  for (const labelChange of [...(record.labelsAdded || []), ...(record.labelsRemoved || [])]) {
    await updateLabels(labelChange.message.id, labelChange.labelIds);
  }
}
```

### Sync Triggers

- **On app open**: Delta sync
- **Periodic polling**: Every 60 seconds while app is open
- **Manual refresh**: User-triggered via UI button or keyboard shortcut
- **Future**: Real-time via Google Cloud Pub/Sub push notifications

### Error Handling

- **404 on history.list**: `historyId` too old, trigger full resync
- **Rate limits**: Exponential backoff with jitter
- **Token expiry**: Auto-refresh using refresh token

## File Structure

```
email-app/
├── src/
│   ├── routes/
│   │   ├── __root.tsx           # Root layout, keyboard handler
│   │   ├── index.tsx            # Inbox view (default route)
│   │   ├── email.$id.tsx        # Single email view
│   │   ├── accounts.tsx         # Account management
│   │   └── auth/
│   │       └── callback.tsx     # OAuth callback handler
│   ├── components/
│   │   ├── ui/                  # shadcn components (auto-generated)
│   │   ├── email-list.tsx       # Inbox email list
│   │   ├── email-item.tsx       # Single email row
│   │   ├── email-view.tsx       # Full email display
│   │   ├── account-picker.tsx   # Account selector dropdown
│   │   └── keyboard-help.tsx    # Keyboard shortcuts modal
│   ├── lib/
│   │   ├── db/
│   │   │   ├── client.ts        # Bun SQL connection
│   │   │   ├── schema.ts        # Schema initialization
│   │   │   └── queries.ts       # Typed query functions
│   │   ├── gmail/
│   │   │   ├── client.ts        # Gmail API wrapper
│   │   │   ├── sync.ts          # Full + delta sync logic
│   │   │   ├── auth.ts          # OAuth token management
│   │   │   └── parser.ts        # Email parsing utilities
│   │   └── hooks/
│   │       ├── use-keyboard.ts  # Vim-style navigation
│   │       └── use-emails.ts    # Email data fetching
│   └── server/
│       └── functions.ts         # TanStack server functions
├── data/
│   └── email.db                 # SQLite database (gitignored)
├── public/
└── package.json
```

## Keyboard Navigation

Vim-style keybindings for the MVP:

| Key | Action |
|-----|--------|
| `j` / `↓` | Next email |
| `k` / `↑` | Previous email |
| `Enter` / `o` | Open selected email |
| `Escape` / `u` | Back to inbox |
| `g i` | Go to inbox |
| `r` | Refresh/sync |
| `?` | Show keyboard shortcuts |

Implementation approach:
- Global keyboard listener in `__root.tsx`
- Track selected index in React state
- Use refs for scroll-into-view behavior

## OAuth Flow

1. User clicks "Add Account"
2. Redirect to Google OAuth consent screen
3. Google redirects to `/auth/callback` with auth code
4. Server exchanges code for tokens
5. Store tokens in SQLite (encrypted at rest in production)
6. Trigger initial sync

Required OAuth scopes:
- `https://www.googleapis.com/auth/gmail.readonly` (MVP)
- `https://www.googleapis.com/auth/gmail.modify` (post-MVP for actions)

## Performance Targets

| Metric | Target | Approach |
|--------|--------|----------|
| Inbox load (cached) | < 100ms | SQLite indexed queries |
| Email open (cached) | < 50ms | Single row lookup |
| Scroll performance | 60fps | Virtual list, minimal re-renders |
| Account switch | < 200ms | Preload in background |

## Security Considerations

- **Token storage**: OAuth tokens stored in SQLite. For production, encrypt at rest.
- **HTML rendering**: Sanitize email HTML before rendering (use DOMPurify or similar)
- **SQL injection**: Bun's tagged templates auto-escape parameters
- **XSS**: React's JSX escaping + HTML sanitization
- **CORS**: Not applicable (local app), but configure properly for any API routes

## Development Workflow

```bash
# Start dev server
cd email-app && bun --bun run dev

# Add shadcn component
bunx shadcn@latest add button

# Initialize database (first run)
bun run src/lib/db/schema.ts
```

## Dependencies to Add

```bash
# UI
bunx shadcn@latest init
bunx shadcn@latest add button card input scroll-area separator

# Gmail API
bun add googleapis

# HTML sanitization
bun add dompurify
bun add -d @types/dompurify
```

## Future Considerations

- **Push notifications**: Google Cloud Pub/Sub for real-time sync
- **Full-text search**: SQLite FTS5 extension for fast local search
- **Offline queue**: Store pending actions for when back online
- **Multi-account**: Unified inbox view, per-account tabs
- **Desktop app**: Tauri wrapper for native experience
