# cmail

A fast Gmail client for the terminal.

> `cmail` now shares the same underlying local mailbox database and core library as `email/email-app`.

```
cmail                                    # latest inbox
cmail list --from alice                  # search all mail from alice
cmail list --unread                      # unread across all mail
cmail list --from alice --inbox          # unread in inbox only

cmail read 3                             # read latest message (by # from list)
cmail read 3 --thread                    # full conversation, oldest first
cmail read 3 --thread -v                 # with To/Cc on each message

cmail reply <id>                         # reply (opens $EDITOR)
cmail reply <id> --all                   # reply all

cmail forward <id> --to bob@x.com       # forward

cmail send --to bob@x.com               # compose new (opens $EDITOR)

cmail auth                               # authenticate with Gmail
```

## Install

Requires [Bun](https://bun.sh).

```sh
bun install
bun link
```

## Setup

1. Create a [Google Cloud project](https://console.cloud.google.com/) with the Gmail API enabled.
2. Create OAuth 2.0 credentials (Desktop app) and download the JSON file.
3. Save it to `~/.config/gmail-skill/client-credentials.json`.
4. Run `cmail auth` and follow the prompts.

## Commands

### `cmail list`

List emails. This is the default when you run `cmail` with no arguments.

With no filters, shows your inbox. Adding any filter searches all mail.

```sh
cmail                              # latest inbox
cmail list -n 10                   # show 10 emails
cmail list --from alice            # all mail from alice
cmail list --to bob                # all mail to bob
cmail list --unread                # unread emails
cmail list --starred               # starred emails
cmail list --from alice --inbox    # from alice, inbox only
cmail list -q "has:attachment"     # Gmail search query
cmail list --fresh                 # skip cache, fetch live
```

The `-q` flag accepts the full [Gmail search syntax](https://support.google.com/mail/answer/7190). Filters can be combined.

### `cmail read <id>`

Read an email. Use the `#` shown in `cmail list` output.

```sh
cmail read 3                # latest message only (default)
cmail read 3 --thread       # full conversation, oldest first
cmail read 3 --thread -v    # with To/Cc details per message
cmail read 3 --raw          # original source
```

HTML emails are automatically converted to clean terminal text. Email chains show just the latest message by default — use `--thread` to see the full conversation.

### `cmail reply <id>`

Reply to an email. Opens `$EDITOR` to compose your message.

```sh
cmail reply <id>         # reply to sender
cmail reply <id> --all   # reply to all recipients
```

### `cmail forward <id>`

Forward an email.

```sh
cmail forward <id> --to bob@example.com
```

### `cmail send`

Compose and send a new email. Opens `$EDITOR` to write the body.

```sh
cmail send --to bob@example.com
cmail send --to bob@example.com --subject "Hello"
```

### `cmail auth`

Authenticate with Gmail via OAuth 2.0. Only needed once.
