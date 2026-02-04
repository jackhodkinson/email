import type { gmail_v1 } from "googleapis";

type GmailMessage = gmail_v1.Schema$Message;
type GmailMessagePart = gmail_v1.Schema$MessagePart;
type GmailMessagePartHeader = gmail_v1.Schema$MessagePartHeader;

// Target structure matching our database schema
export interface ParsedEmail {
  id: string;
  threadId: string;
  subject: string | null;
  sender: string; // "Name <email>" format
  recipients: string[]; // Array of recipients
  snippet: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  date: number; // Unix timestamp
  labels: string[];
  hasAttachments: boolean;
  isRead: boolean;
  rawSize: number | null;
}

export interface ParsedAttachment {
  id: string;
  emailId: string;
  filename: string;
  mimeType: string;
  size: number;
}

// Parsed headers structure
interface ParsedHeaders {
  from: string | null;
  to: string | null;
  cc: string | null;
  bcc: string | null;
  subject: string | null;
  date: string | null;
}

// Parsed body structure
interface ParsedBody {
  text: string | null;
  html: string | null;
}

/**
 * Parse headers from Gmail message payload
 */
function parseHeaders(headers: GmailMessagePartHeader[]): ParsedHeaders {
  const result: ParsedHeaders = {
    from: null,
    to: null,
    cc: null,
    bcc: null,
    subject: null,
    date: null,
  };

  for (const header of headers) {
    const name = header.name?.toLowerCase();
    const value = header.value || null;

    switch (name) {
      case "from":
        result.from = value;
        break;
      case "to":
        result.to = value;
        break;
      case "cc":
        result.cc = value;
        break;
      case "bcc":
        result.bcc = value;
        break;
      case "subject":
        result.subject = value;
        break;
      case "date":
        result.date = value;
        break;
    }
  }

  return result;
}

/**
 * Split comma-separated email addresses, handling commas within quoted names
 * e.g., "Name, Jr. <email@example.com>, Another <other@example.com>"
 */
function splitAddresses(addressString: string): string[] {
  // Handle comma-separated addresses, accounting for commas in names
  // This regex matches commas that are not inside quotes
  return addressString
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((addr) => addr.trim())
    .filter(Boolean);
}

/**
 * Parse recipients from headers (To, CC, BCC)
 */
function parseRecipients(headers: ParsedHeaders): string[] {
  const recipients: string[] = [];

  if (headers.to) recipients.push(...splitAddresses(headers.to));
  if (headers.cc) recipients.push(...splitAddresses(headers.cc));
  if (headers.bcc) recipients.push(...splitAddresses(headers.bcc));

  return recipients;
}

/**
 * Decode URL-safe base64 encoded data (Gmail's encoding)
 * Gmail uses URL-safe base64: + -> -, / -> _, no padding
 */
function decodeBase64Url(data: string): string {
  // Replace URL-safe characters back to standard base64
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  // Decode
  return Buffer.from(base64, "base64").toString("utf-8");
}

/**
 * Parse body content from message payload
 * Handles both simple messages and multipart structures
 */
function parseBody(payload: GmailMessagePart | undefined): ParsedBody {
  const result: ParsedBody = { text: null, html: null };

  if (!payload) return result;

  function extractBody(part: GmailMessagePart) {
    const mimeType = part.mimeType;
    const data = part.body?.data;

    if (data) {
      const decoded = decodeBase64Url(data);

      if (mimeType === "text/plain" && !result.text) {
        result.text = decoded;
      } else if (mimeType === "text/html" && !result.html) {
        result.html = decoded;
      }
    }

    // Recurse into parts
    part.parts?.forEach(extractBody);
  }

  extractBody(payload);
  return result;
}

/**
 * Parse date string to Unix timestamp (seconds)
 * Gmail returns RFC 2822 dates
 */
function parseDate(dateString: string | null): number {
  if (!dateString) return Math.floor(Date.now() / 1000);

  const date = new Date(dateString);

  // If invalid date, return current timestamp
  if (isNaN(date.getTime())) {
    return Math.floor(Date.now() / 1000);
  }

  // Return Unix timestamp (seconds)
  return Math.floor(date.getTime() / 1000);
}

/**
 * Check if message has attachments
 */
function hasAttachments(payload: GmailMessagePart | undefined): boolean {
  if (!payload) return false;

  function checkPart(part: GmailMessagePart): boolean {
    if (part.filename && part.body?.attachmentId) {
      return true;
    }
    return part.parts?.some(checkPart) || false;
  }

  return checkPart(payload);
}

/**
 * Main parsing function - transforms Gmail API message to clean format
 */
export function parseGmailMessage(message: GmailMessage): ParsedEmail {
  const headers = parseHeaders(message.payload?.headers || []);
  const body = parseBody(message.payload);

  return {
    id: message.id!,
    threadId: message.threadId!,
    subject: headers.subject,
    sender: headers.from || "Unknown",
    recipients: parseRecipients(headers),
    snippet: message.snippet || null,
    bodyText: body.text,
    bodyHtml: body.html,
    date: parseDate(headers.date),
    labels: message.labelIds || [],
    hasAttachments: hasAttachments(message.payload),
    isRead: !message.labelIds?.includes("UNREAD"),
    rawSize: message.sizeEstimate || null,
  };
}

/**
 * Parse attachments from a Gmail message
 */
export function parseAttachments(message: GmailMessage): ParsedAttachment[] {
  const attachments: ParsedAttachment[] = [];

  function extractAttachments(part: GmailMessagePart | undefined) {
    if (!part) return;

    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        id: part.body.attachmentId,
        emailId: message.id!,
        filename: part.filename,
        mimeType: part.mimeType || "application/octet-stream",
        size: part.body.size || 0,
      });
    }

    part.parts?.forEach(extractAttachments);
  }

  extractAttachments(message.payload);
  return attachments;
}

// Export helper functions for testing
export { decodeBase64Url, parseHeaders, parseBody, parseDate, splitAddresses };
