# EmailSwiftApp

A first-pass native SwiftUI version of the email app.

This currently uses local sample data and focuses on the inbox list shape from the web app: sender, subject, snippet, date, unread state, attachment indicator, labels, and thread count.

## Run

```bash
cd apps/swift
./scripts/run-app.sh
```

The next useful step is wiring the list model to the shared local mailbox data instead of the sample inbox.
