#!/usr/bin/env bun
/**
 * Test script for bootstrapping account and syncing emails
 *
 * Usage: bun run src/lib/gmail/test-sync.ts
 */

import { isAuthenticated, createOAuth2Client, getTokensForDb } from "./auth";
import { google } from "googleapis";
import { upsertAccount, getAccounts, getEmailsByAccount } from "../db/queries";
import { performInitialSync } from "./sync";

async function main() {
  console.log("=== Gmail Sync Test ===\n");

  // Step 1: Check authentication
  console.log("1. Checking authentication...");
  if (!isAuthenticated()) {
    console.error("Not authenticated. Please set up Gmail credentials in ~/.config/gmail-skill/");
    process.exit(1);
  }
  console.log("   Authentication OK\n");

  // Step 2: Get or create account
  console.log("2. Getting/creating account...");
  const tokens = getTokensForDb();
  if (!tokens) {
    console.error("Could not load tokens");
    process.exit(1);
  }

  const oauth2Client = createOAuth2Client();
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const email = profile.data.emailAddress!;

  console.log(`   Email: ${email}`);

  // Check if account exists
  let accounts = await getAccounts();
  let account = accounts.find((a) => a.email === email);

  if (account) {
    console.log(`   Account exists: ${account.id}`);
    // Update tokens
    await upsertAccount({
      id: account.id,
      email,
      ...tokens,
    });
  } else {
    // Create new account
    const accountId = crypto.randomUUID();
    await upsertAccount({
      id: accountId,
      email,
      ...tokens,
    });
    accounts = await getAccounts();
    account = accounts.find((a) => a.email === email)!;
    console.log(`   Created account: ${account.id}`);
  }
  console.log();

  // Step 3: Perform sync
  console.log("3. Starting sync...");
  const result = await performInitialSync(account);
  console.log(`   Synced ${result.emailCount} emails`);
  console.log(`   History ID: ${result.historyId}\n`);

  // Step 4: Verify emails in database
  console.log("4. Verifying emails in database...");
  const emails = await getEmailsByAccount(account.id, 5);
  console.log(`   Found ${emails.length} emails (showing first 5):\n`);

  for (const e of emails) {
    const date = new Date(e.date * 1000).toLocaleString();
    console.log(`   - [${date}] ${e.subject}`);
    console.log(`     From: ${e.sender}`);
    console.log();
  }

  console.log("=== Sync complete! ===");
  console.log("\nYou can now start the dev server:");
  console.log("  cd email-app && bun --bun run dev");
  console.log("\nThen visit http://localhost:3000 to see your inbox.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
