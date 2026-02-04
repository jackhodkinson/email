import { google, gmail_v1 } from "googleapis";
import { createOAuth2Client, isAuthenticated } from "./auth";

export class GmailClient {
  private gmail: gmail_v1.Gmail;

  constructor(gmail: gmail_v1.Gmail) {
    this.gmail = gmail;
  }

  // Factory method - creates authenticated client
  static create(): GmailClient {
    if (!isAuthenticated()) {
      throw new Error("Not authenticated. Please set up Gmail credentials.");
    }
    const auth = createOAuth2Client();
    const gmail = google.gmail({ version: "v1", auth });
    return new GmailClient(gmail);
  }

  // Get user profile (email, historyId)
  async getProfile() {
    const response = await this.gmail.users.getProfile({ userId: "me" });
    return response.data;
  }

  // List message IDs (for initial sync)
  async listMessages(options: {
    query?: string;
    maxResults?: number;
    pageToken?: string;
  }) {
    const response = await this.gmail.users.messages.list({
      userId: "me",
      q: options.query,
      maxResults: options.maxResults || 100,
      pageToken: options.pageToken,
    });
    return response.data;
  }

  // Get full message by ID
  async getMessage(messageId: string) {
    const response = await this.gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });
    return response.data;
  }

  // Batch get messages (more efficient)
  async getMessages(messageIds: string[]): Promise<gmail_v1.Schema$Message[]> {
    const results: gmail_v1.Schema$Message[] = [];
    const batchSize = 50;

    for (let i = 0; i < messageIds.length; i += batchSize) {
      const batch = messageIds.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((id) => this.getMessage(id))
      );
      results.push(...batchResults);
    }

    return results;
  }

  // Get history (for delta sync)
  async listHistory(startHistoryId: string) {
    const response = await this.gmail.users.history.list({
      userId: "me",
      startHistoryId,
      historyTypes: [
        "messageAdded",
        "messageDeleted",
        "labelAdded",
        "labelRemoved",
      ],
    });
    return response.data;
  }

  // Get attachment data
  async getAttachment(messageId: string, attachmentId: string) {
    const response = await this.gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachmentId,
    });
    return response.data;
  }
}

// Type exports for use elsewhere
export type GmailMessage = gmail_v1.Schema$Message;
export type GmailMessagePart = gmail_v1.Schema$MessagePart;
export type GmailHeader = gmail_v1.Schema$MessagePartHeader;

// Get header value by name
export function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  if (!headers) return "";
  const header = headers.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase()
  );
  return header?.value || "";
}

// Decode base64 content (Gmail uses URL-safe base64)
export function decodeBase64(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

// Extract plain text and HTML body from message
export function extractBody(
  payload: gmail_v1.Schema$MessagePart | undefined
): { plain: string; html: string | null } {
  if (!payload) return { plain: "", html: null };

  let plain = "";
  let html: string | null = null;

  function traverse(part: gmail_v1.Schema$MessagePart) {
    const mimeType = part.mimeType || "";

    if (mimeType === "text/plain" && part.body?.data) {
      plain = decodeBase64(part.body.data);
    } else if (mimeType === "text/html" && part.body?.data) {
      html = decodeBase64(part.body.data);
    }

    if (part.parts) {
      for (const subpart of part.parts) {
        traverse(subpart);
      }
    }
  }

  traverse(payload);
  return { plain, html };
}

// Extract attachment metadata
export function extractAttachments(
  payload: gmail_v1.Schema$MessagePart | undefined
): Array<{ id: string; filename: string; mimeType: string; size: number }> {
  const attachments: Array<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
  }> = [];

  if (!payload) return attachments;

  function traverse(part: gmail_v1.Schema$MessagePart) {
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        id: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType || "application/octet-stream",
        size: part.body.size || 0,
      });
    }

    if (part.parts) {
      for (const subpart of part.parts) {
        traverse(subpart);
      }
    }
  }

  traverse(payload);
  return attachments;
}
