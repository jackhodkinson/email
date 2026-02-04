// Task 1.4 test: Verify Gmail client can fetch and parse messages
import { GmailClient, getHeader } from "./client";

const client = GmailClient.create();
const messages = await client.listMessages({ maxResults: 1 });

if (!messages.messages?.[0]) {
  console.error("✗ No messages found");
  process.exit(1);
}

const full = await client.getMessage(messages.messages[0].id!);
const subject = getHeader(full.payload?.headers, "Subject");

if (subject) {
  console.log(`✓ Task 1.4 verified: Fetched email "${subject.slice(0, 50)}..."`);
} else {
  console.error("✗ Could not parse message headers");
  process.exit(1);
}
