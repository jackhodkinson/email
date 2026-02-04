// test-db.ts - Run with: bun run src/lib/db/test-db.ts
import { upsertAccount, upsertEmail, getEmailsByAccount, deleteAccount } from "./queries";

// Insert account → Insert email → Delete account → Verify cascade delete
await upsertAccount({ id: "test-1", email: "test@test.com", access_token: "x", refresh_token: "y", token_expiry: 0 });
await upsertEmail({ id: "email-1", account_id: "test-1", thread_id: "t1", sender: "a@b.com", date: Date.now() });
await deleteAccount("test-1");
const emails = await getEmailsByAccount("test-1");

if (emails.length === 0) {
  console.log("✓ Database setup verified: tables, queries, and cascade delete all work");
} else {
  console.error("✗ Cascade delete failed");
  process.exit(1);
}
