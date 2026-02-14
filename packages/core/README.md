# @jack/mail-core

Shared Gmail + local SQLite core used by both:

- `cmail` (CLI)
- `email/email-app` (UI)

## What this package provides

- OAuth helpers (`auth.ts`)
- Gmail API client + parsing (`gmail.ts`)
- Local SQLite schema + queries (`db.ts`)
- Initial + incremental sync (`sync.ts`)
- Gmail query parser (`query.ts`)

## Database location

The shared mailbox database is stored at:

`~/.cache/cmail/mail.sqlite`

Both apps now read/write this same file.
