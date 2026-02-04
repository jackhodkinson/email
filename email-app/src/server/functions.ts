import { createServerFn } from "@tanstack/react-start/server";
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
