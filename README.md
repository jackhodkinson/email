# email

A personal Gmail client with a CLI (`cmail`) and a web/desktop app. Uses a local SQLite database to sync and search your mailbox offline.

This is **not** a Google-verified app — it connects to Gmail through your own Google Cloud project, so only you (and any test users you add) can use your instance.

## Prerequisites

- [Bun](https://bun.sh) (v1.1+)
- A Google account
- A Google Cloud project (free tier is fine)

## Google Cloud setup

Because this app isn't published on the Google marketplace, you need to create your own OAuth credentials. This takes about 5 minutes.

### 1. Create a Google Cloud project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)

### 2. Enable the Gmail API

1. Go to **APIs & Services > Library**
2. Search for **Gmail API** and click **Enable**

### 3. Configure the OAuth consent screen

1. Go to **APIs & Services > OAuth consent screen**
2. Choose **External** as the user type (unless you have a Google Workspace org)
3. Fill in the required fields — app name, user support email, developer contact email. The rest can be left blank.
4. On the **Scopes** step, add `https://www.googleapis.com/auth/gmail.modify`
5. On the **Test users** step, add the Gmail address you want to use with this app
6. Save and go back to the dashboard

> **Important:** While the app is in "Testing" status, only the test users you listed can authenticate. Google will show an "unverified app" warning during sign-in — this is expected. Click **Advanced > Go to \<your app name\> (unsafe)** to continue. Your data only goes between your machine and Google's servers.

### 4. Create OAuth credentials

1. Go to **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth client ID**
3. Choose **Desktop app** as the application type
4. Name it whatever you like
5. Click **Create**, then **Download JSON**
6. Save the downloaded file to:

```
~/.config/gmail-skill/client-credentials.json
```

## Installation

```bash
git clone <repo-url> && cd email
bun install
```

## Authenticate

```bash
cd apps/cli
bun run index.ts auth
```

This will print a Google sign-in URL. Open it in your browser, sign in with the Gmail account you added as a test user, and paste the authorization code back into the terminal.

## CLI usage

```bash
cd apps/cli

# List your inbox
bun run index.ts

# Sync mailbox
bun run index.ts sync

# Read an email (use the ID or position number from list output)
bun run index.ts read 3
bun run index.ts read 3 --thread

# Search email bodies
bun run index.ts search "invoice"

# Send an email
bun run index.ts send --to alice@example.com --subject "Hi" --body "Hello!"

# Reply to a message
bun run index.ts send --reply 3 --body "Thanks!"

# Create a draft instead of sending
bun run index.ts draft --to alice@example.com --subject "Hi" --body "Hello!"

# Manage labels
bun run index.ts tag 3 +Newsletters -INBOX
bun run index.ts tags list

# Download attachments
bun run index.ts download 3

# Full CLI help
bun run index.ts --help
```

You can also install it globally as `cmail`:

```bash
bun link    # from apps/cli
cmail list
```

## Web app

```bash
cd apps/web
bun --bun run dev
```

Opens on [http://localhost:3001](http://localhost:3001). The web app shares the same core library and SQLite database as the CLI.

### Desktop app (Tauri)

The web app can also run as a native desktop app via Tauri:

```bash
cd apps/web
bun run tauri:dev
```

Requires the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) (Rust toolchain, platform-specific deps).

## Project structure

```
email/
├── apps/
│   ├── cli/           # cmail — CLI client
│   └── web/           # TanStack Start web + Tauri desktop client
├── packages/
│   └── core/          # Shared library (auth, Gmail API, SQLite, sync, query)
└── package.json       # Bun workspace root
```

## Data storage

All email data is stored locally in a SQLite database under `data/` (gitignored). OAuth tokens are stored in `~/.config/gmail-skill/`. Nothing is sent to any third-party server — the app talks directly to the Gmail API.

## License

MIT
