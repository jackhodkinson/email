/**
 * Gmail sync functionality - fetches emails from Gmail and stores in SQLite
 */

import { GmailClient } from "./client";
import { parseGmailMessage, parseAttachments } from "./parser";
import {
  upsertEmail,
  insertAttachment,
  updateAccountHistoryId,
  type EmailInput,
  type Account,
} from "../db/queries";
import type { ParsedEmail, ParsedAttachment } from "./parser";

/**
 * Convert ParsedEmail (camelCase) to EmailInput (snake_case) format for database
 */
function toEmailInput(parsed: ParsedEmail, accountId: string): EmailInput {
  return {
    id: parsed.id,
    account_id: accountId,
    thread_id: parsed.threadId,
    subject: parsed.subject,
    sender: parsed.sender,
    recipients: JSON.stringify(parsed.recipients),
    snippet: parsed.snippet,
    body_text: parsed.bodyText,
    body_html: parsed.bodyHtml,
    date: parsed.date,
    labels: JSON.stringify(parsed.labels),
    has_attachments: parsed.hasAttachments ? 1 : 0,
    is_read: parsed.isRead ? 1 : 0,
    raw_size: parsed.rawSize,
  };
}

/**
 * Convert ParsedAttachment to database format
 */
function toAttachmentInput(attachment: ParsedAttachment) {
  return {
    id: attachment.id,
    email_id: attachment.emailId,
    filename: attachment.filename,
    mime_type: attachment.mimeType,
    size: attachment.size,
  };
}

/**
 * Format date as YYYY/MM/DD for Gmail query
 */
function formatDateForGmail(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

export interface SyncResult {
  emailCount: number;
  historyId: string;
}

/**
 * Perform initial sync - fetches last 7 days of emails from Gmail
 */
export async function performInitialSync(account: Account): Promise<SyncResult> {
  const client = GmailClient.create();

  // Get date 7 days ago in Gmail query format
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const afterDate = formatDateForGmail(sevenDaysAgo);

  // 1. List all message IDs from the last 7 days
  const messageIds: string[] = [];
  let pageToken: string | undefined;

  console.log(`Starting initial sync for ${account.email}...`);
  console.log(`Fetching messages after ${afterDate}`);

  do {
    const response = await client.listMessages({
      query: `after:${afterDate}`,
      maxResults: 500,
      pageToken,
    });

    if (response.messages) {
      messageIds.push(...response.messages.map((m) => m.id!));
    }
    pageToken = response.nextPageToken || undefined;
  } while (pageToken);

  console.log(`Found ${messageIds.length} messages to sync`);

  if (messageIds.length === 0) {
    // Still get the historyId even if no messages
    const profile = await client.getProfile();
    const historyId = profile.historyId!;
    await updateAccountHistoryId(account.id, historyId);
    return { emailCount: 0, historyId };
  }

  // 2. Fetch full message content in batches
  const messages = await client.getMessages(messageIds);
  console.log(`Fetched ${messages.length} full messages`);

  // 3. Parse and store each message
  let stored = 0;
  for (const message of messages) {
    const parsed = parseGmailMessage(message);
    const attachments = parseAttachments(message);

    const emailInput = toEmailInput(parsed, account.id);
    await upsertEmail(emailInput);

    for (const attachment of attachments) {
      await insertAttachment(toAttachmentInput(attachment));
    }

    stored++;
    if (stored % 50 === 0) {
      console.log(`Stored ${stored}/${messages.length} emails`);
    }
  }

  console.log(`Stored ${stored} emails`);

  // 4. Get and store the latest historyId for delta sync
  const profile = await client.getProfile();
  const historyId = profile.historyId!;

  await updateAccountHistoryId(account.id, historyId);
  console.log(`Updated historyId to ${historyId}`);

  return {
    emailCount: messages.length,
    historyId,
  };
}
