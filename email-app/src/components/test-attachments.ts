#!/usr/bin/env bun
/**
 * Test script for attachment functionality
 * Run with: bun run src/components/test-attachments.ts
 */

import { db } from "../lib/db/client";
import {
  getAttachmentsByEmail,
  getAttachmentById,
  type Email,
} from "../lib/db/queries";
import { GmailClient } from "../lib/gmail/client";
import { isAuthenticated } from "../lib/gmail/auth";

console.log("=== Attachment Functionality Test ===\n");

// Step 1: Check authentication
console.log("1. Checking Gmail authentication...");
if (!isAuthenticated()) {
  console.error("   ERROR: Not authenticated. Please set up Gmail credentials.");
  process.exit(1);
}
console.log("   OK: Gmail authentication is valid.\n");

// Step 2: Find emails with attachments in the database
console.log("2. Finding emails with attachments in database...");

const emailsWithAttachments = (await db`
  SELECT e.*, COUNT(a.id) as attachment_count
  FROM emails e
  INNER JOIN attachments a ON a.email_id = e.id
  GROUP BY e.id
  ORDER BY attachment_count DESC
  LIMIT 5
`) as (Email & { attachment_count: number })[];

if (emailsWithAttachments.length === 0) {
  console.log("   No emails with attachments found in database.");
  console.log(
    "   Please sync some emails first using: bun --bun run dev and triggering a sync."
  );
  process.exit(0);
}

console.log(
  `   Found ${emailsWithAttachments.length} email(s) with attachments:`
);
for (const email of emailsWithAttachments) {
  console.log(
    `   - Email ID: ${email.id.substring(0, 20)}... | Subject: "${email.subject?.substring(0, 40) || "(no subject)"}..." | Attachments: ${email.attachment_count}`
  );
}
console.log();

// Step 3: Fetch attachment metadata for the first email
const testEmail = emailsWithAttachments[0];
console.log(
  `3. Fetching attachment metadata for email: ${testEmail.id.substring(0, 30)}...`
);

const attachments = await getAttachmentsByEmail(testEmail.id);
console.log(`   Found ${attachments.length} attachment(s):`);
for (const att of attachments) {
  const sizeFormatted = formatFileSize(att.size);
  console.log(
    `   - ID: ${att.id.substring(0, 30)}... | Filename: "${att.filename}" | Type: ${att.mime_type} | Size: ${sizeFormatted}`
  );
}
console.log();

// Step 4: Verify attachment can be retrieved by ID
const testAttachment = attachments[0];
console.log(
  `4. Verifying getAttachmentById works for: ${testAttachment.id.substring(0, 30)}...`
);

const fetchedAttachment = await getAttachmentById(testAttachment.id);
if (!fetchedAttachment) {
  console.error("   ERROR: Could not fetch attachment by ID");
  process.exit(1);
}
console.log(`   OK: Attachment retrieved successfully.`);
console.log(`   Filename: ${fetchedAttachment.filename}`);
console.log(`   Email ID: ${fetchedAttachment.email_id}`);
console.log();

// Step 5: Download attachment data from Gmail API
console.log("5. Downloading attachment data from Gmail API...");
console.log(`   Email ID: ${testEmail.id}`);
console.log(`   Attachment ID: ${testAttachment.id}`);

try {
  const gmailClient = GmailClient.create();
  const attachmentData = await gmailClient.getAttachment(
    testEmail.id,
    testAttachment.id
  );

  if (!attachmentData.data) {
    console.error("   ERROR: No data returned from Gmail API");
    process.exit(1);
  }

  // The data is URL-safe base64 encoded
  const dataLength = attachmentData.data.length;
  const estimatedBytes = Math.ceil((dataLength * 3) / 4);

  console.log(`   OK: Attachment data received successfully.`);
  console.log(`   Base64 length: ${dataLength} characters`);
  console.log(`   Estimated size: ${formatFileSize(estimatedBytes)}`);
  console.log(
    `   Data preview: ${attachmentData.data.substring(0, 50)}...`
  );
  console.log();

  // Step 6: Verify we can decode the base64 data
  console.log("6. Verifying base64 data can be decoded...");
  try {
    // Convert URL-safe base64 to standard base64
    const base64 = attachmentData.data
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    // Decode using Buffer
    const buffer = Buffer.from(base64, "base64");
    console.log(`   OK: Data decoded successfully.`);
    console.log(`   Decoded size: ${formatFileSize(buffer.length)}`);
    console.log(`   Expected size: ${formatFileSize(testAttachment.size)}`);

    // Size should roughly match (Gmail may report slightly different sizes)
    const sizeDiff = Math.abs(buffer.length - testAttachment.size);
    const sizeAccuracy =
      (1 - sizeDiff / Math.max(buffer.length, testAttachment.size)) * 100;
    console.log(`   Size accuracy: ${sizeAccuracy.toFixed(1)}%`);
    console.log();
  } catch (decodeError) {
    console.error("   ERROR: Failed to decode base64 data:", decodeError);
    process.exit(1);
  }
} catch (error) {
  console.error("   ERROR: Failed to download attachment:", error);
  process.exit(1);
}

console.log("=== All Tests Passed ===");
console.log("\nSummary:");
console.log(`- Found ${emailsWithAttachments.length} emails with attachments`);
console.log(`- Successfully retrieved attachment metadata`);
console.log(`- Successfully downloaded attachment from Gmail API`);
console.log(`- Successfully decoded attachment data`);
console.log("\nThe attachment-list component should work correctly.");

/**
 * Format bytes to human-readable size
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}
