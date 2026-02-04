/**
 * Test script for the email parser
 *
 * Usage: bun run src/lib/gmail/test-parser.ts
 *
 * This script:
 * 1. Fetches one real email using GmailClient
 * 2. Parses it with parseGmailMessage()
 * 3. Verifies the parsed output has required fields
 */

import { GmailClient } from "./client";
import { parseGmailMessage, parseAttachments, type ParsedEmail } from "./parser";

async function testParser() {
  console.log("=== Email Parser Test ===\n");

  // Step 1: Create Gmail client and fetch a message
  console.log("1. Connecting to Gmail API...");
  let client: GmailClient;
  try {
    client = GmailClient.create();
    console.log("   Connected successfully\n");
  } catch (error) {
    console.error("   Failed to connect:", (error as Error).message);
    console.error("\n   Make sure you have authenticated with Gmail first.");
    process.exit(1);
  }

  // Step 2: List messages to get an ID
  console.log("2. Fetching message list...");
  const listResult = await client.listMessages({ maxResults: 1 });

  if (!listResult.messages || listResult.messages.length === 0) {
    console.error("   No messages found in mailbox.");
    process.exit(1);
  }

  const messageId = listResult.messages[0].id!;
  console.log(`   Found message ID: ${messageId}\n`);

  // Step 3: Fetch the full message
  console.log("3. Fetching full message...");
  const message = await client.getMessage(messageId);
  console.log("   Fetched successfully\n");

  // Step 4: Parse the message
  console.log("4. Parsing message with parseGmailMessage()...");
  const parsed = parseGmailMessage(message);
  console.log("   Parsed successfully\n");

  // Step 5: Display parsed output
  console.log("5. Parsed Email Output:");
  console.log("-".repeat(50));
  console.log(`   ID:             ${parsed.id}`);
  console.log(`   Thread ID:      ${parsed.threadId}`);
  console.log(`   Subject:        ${parsed.subject || "(none)"}`);
  console.log(`   Sender:         ${parsed.sender}`);
  console.log(`   Recipients:     ${parsed.recipients.length > 0 ? parsed.recipients.join(", ") : "(none)"}`);
  console.log(`   Snippet:        ${parsed.snippet?.substring(0, 60)}${(parsed.snippet?.length || 0) > 60 ? "..." : ""}`);
  console.log(`   Body Text:      ${parsed.bodyText ? `${parsed.bodyText.length} chars` : "null"}`);
  console.log(`   Body HTML:      ${parsed.bodyHtml ? `${parsed.bodyHtml.length} chars` : "null"}`);
  console.log(`   Date:           ${new Date(parsed.date * 1000).toISOString()}`);
  console.log(`   Labels:         ${parsed.labels.join(", ") || "(none)"}`);
  console.log(`   Has Attachments: ${parsed.hasAttachments}`);
  console.log(`   Is Read:        ${parsed.isRead}`);
  console.log(`   Raw Size:       ${parsed.rawSize} bytes`);
  console.log("-".repeat(50));

  // Step 6: Parse attachments
  console.log("\n6. Parsing attachments...");
  const attachments = parseAttachments(message);
  if (attachments.length > 0) {
    console.log(`   Found ${attachments.length} attachment(s):`);
    for (const att of attachments) {
      console.log(`     - ${att.filename} (${att.mimeType}, ${att.size} bytes)`);
    }
  } else {
    console.log("   No attachments found");
  }

  // Step 7: Verify required fields
  console.log("\n7. Verifying required fields...");
  const requiredFields: (keyof ParsedEmail)[] = [
    "id",
    "threadId",
    "subject",
    "sender",
    "recipients",
    "snippet",
    "bodyText",
    "bodyHtml",
    "date",
    "labels",
    "hasAttachments",
    "isRead",
    "rawSize",
  ];

  let allPresent = true;
  for (const field of requiredFields) {
    const value = parsed[field];
    const hasField = field in parsed;
    const isNullable = ["subject", "snippet", "bodyText", "bodyHtml", "rawSize"].includes(field);

    if (!hasField) {
      console.log(`   FAIL: Missing field '${field}'`);
      allPresent = false;
    } else if (value === undefined) {
      console.log(`   FAIL: Field '${field}' is undefined (should be null if empty)`);
      allPresent = false;
    } else {
      console.log(`   OK: ${field} = ${typeof value === "object" ? JSON.stringify(value) : value}`);
    }
  }

  console.log("\n" + "=".repeat(50));
  if (allPresent) {
    console.log("TEST PASSED: All required fields present and valid!");
  } else {
    console.log("TEST FAILED: Some fields are missing or invalid");
    process.exit(1);
  }
  console.log("=".repeat(50));
}

// Run the test
testParser().catch((error) => {
  console.error("Test failed with error:", error);
  process.exit(1);
});
