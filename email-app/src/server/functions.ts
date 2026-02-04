import { createServerFn } from "@tanstack/react-start";
import { google } from "googleapis";
import {
  createOAuth2Client,
  isAuthenticated,
  getTokensForDb,
} from "../lib/gmail/auth";
import { upsertAccount, getAccounts } from "../lib/db/queries";

// Bootstrap the pre-authenticated Gmail account into our database
export const bootstrapAccount = createServerFn({ method: "GET" }).handler(
  async () => {
    if (!isAuthenticated()) {
      return { success: false, error: "No authenticated Gmail account found" };
    }

    const tokens = getTokensForDb();
    if (!tokens) {
      return { success: false, error: "Could not load tokens" };
    }

    // Get user's email address
    const oauth2Client = createOAuth2Client();
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: "me" });

    const email = profile.data.emailAddress!;

    // Check if already exists
    const existingAccounts = await getAccounts();
    const existing = existingAccounts.find((a) => a.email === email);

    if (existing) {
      // Update tokens
      await upsertAccount({
        id: existing.id,
        email,
        ...tokens,
      });
      return { success: true, accountId: existing.id, email, isNew: false };
    }

    // Create new account
    const accountId = crypto.randomUUID();
    await upsertAccount({
      id: accountId,
      email,
      ...tokens,
    });

    return { success: true, accountId, email, isNew: true };
  }
);

// Get all connected accounts
export const getConnectedAccounts = createServerFn({ method: "GET" }).handler(
  async () => {
    return await getAccounts();
  }
);

// Sync account emails from Gmail
export const syncAccount = createServerFn({ method: "POST" })
  .inputValidator((data: { accountId: string }) => data)
  .handler(async ({ data }) => {
    const { performInitialSync } = await import("../lib/gmail/sync");
    const { getAccountById } = await import("../lib/db/queries");

    const account = await getAccountById(data.accountId);
    if (!account) {
      throw new Error("Account not found");
    }

    const result = await performInitialSync(account);
    return result;
  });

// Get inbox emails for display
export const getInboxEmails = createServerFn({ method: "GET" })
  .inputValidator((data: { accountId?: string; limit?: number }) => data)
  .handler(async ({ data }) => {
    const { getEmailsByAccount, getAccounts: getAllAccounts } = await import(
      "../lib/db/queries"
    );

    // If no account specified, use first account
    let accountId = data.accountId;
    if (!accountId) {
      const accounts = await getAllAccounts();
      if (accounts.length === 0) {
        return { emails: [], accountId: null };
      }
      accountId = accounts[0].id;
    }

    const emails = await getEmailsByAccount(accountId, data.limit || 50);

    // Transform emails for frontend (parse JSON fields, convert snake_case to camelCase)
    const transformedEmails = emails.map((email) => ({
      id: email.id,
      threadId: email.thread_id,
      subject: email.subject,
      sender: email.sender,
      recipients: email.recipients ? JSON.parse(email.recipients) : [],
      snippet: email.snippet,
      date: email.date,
      labels: email.labels ? JSON.parse(email.labels) : [],
      hasAttachments: email.has_attachments === 1,
      isRead: email.is_read === 1,
    }));

    return {
      emails: transformedEmails,
      accountId,
    };
  });
