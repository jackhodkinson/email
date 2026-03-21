import { google, type gmail_v1 } from "googleapis";
import { createOAuth2Client, isAuthenticated } from "./auth.ts";

export interface EmailSummary {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  labels: string[];
  attachmentCount: number;
}

export interface AttachmentInfo {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
}

function getGmailClient(): gmail_v1.Gmail {
  if (!isAuthenticated()) {
    throw new Error(
      "Not authenticated. Run setup-auth first:\n" +
        "  cd ~/.claude/skills/gmail/scripts && bun run setup-auth.ts"
    );
  }

  const auth = createOAuth2Client();
  return google.gmail({ version: "v1", auth });
}

function countAttachments(parts: gmail_v1.Schema$MessagePart[] | undefined): number {
  if (!parts) return 0;
  let count = 0;
  for (const part of parts) {
    if (part.filename) count++;
    if (part.parts) count += countAttachments(part.parts);
  }
  return count;
}

function extractAttachments(parts: gmail_v1.Schema$MessagePart[] | undefined): AttachmentInfo[] {
  if (!parts) return [];
  const attachments: AttachmentInfo[] = [];
  for (const part of parts) {
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType || "application/octet-stream",
        size: part.body?.size || 0,
        attachmentId: part.body.attachmentId,
      });
    }
    if (part.parts) {
      attachments.push(...extractAttachments(part.parts));
    }
  }
  return attachments;
}

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  if (!headers) return "";
  const header = headers.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase()
  );
  return header?.value || "";
}

function headersToMap(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const header of headers || []) {
    if (!header.name) continue;
    out[header.name] = header.value ?? "";
  }
  return out;
}

function decodeBody(data: string): string {
  // Gmail uses URL-safe base64
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

function htmlToText(html: string): string {
  let text = html;
  // Remove everything before <body> and after </body>
  text = text.replace(/^[\s\S]*<body[^>]*>/i, "");
  text = text.replace(/<\/body>[\s\S]*$/i, "");
  // Strip <style> and <script> blocks (quoted messages embed their own)
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  // Strip conditional comments <!--[if mso]>...<![endif]-->
  text = text.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, "");
  // Block elements → newlines
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<\/div>/gi, "\n");
  text = text.replace(/<\/tr>/gi, "\n");
  text = text.replace(/<\/li>/gi, "\n");
  text = text.replace(/<li[^>]*>/gi, "  - ");
  text = text.replace(/<hr[^>]*>/gi, "\n---\n");
  // Links → text (url)
  text = text.replace(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, url, label) => {
    const cleanLabel = label.replace(/<[^>]+>/g, "").trim();
    if (!cleanLabel || cleanLabel === url) return url;
    return `${cleanLabel} (${url})`;
  });
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, "");
  // Decode HTML entities
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));
  // Collapse whitespace (but preserve newlines)
  text = text.replace(/[^\S\n]+/g, " ");
  // Trim trailing spaces on each line, then collapse 3+ blank lines into 1
  text = text.replace(/ +\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function cleanBody(text: string): string {
  let t = text;
  // Strip "Sent from my iPhone/iPad"
  t = t.replace(/^Sent from my .+$/gm, "");
  // Strip corporate email gateway warnings
  t = t.replace(/EXTERNAL EMAIL:[\s\S]*?credentials via email/g, "");
  // Strip attachment/image placeholders like <image001.gif>, <IMG_0315.jpg>
  t = t.replace(/<[^>\n]+\.(?:jpe?g|png|gif|bmp|pdf|docx?|xlsx?|pptx?|zip|csv)>/gi, "");
  // Clean mailto: duplication "email (mailto:email)" → "email"
  t = t.replace(/\s*\(mailto:[^)]+\)/g, "");
  // Strip legal/privacy disclaimers at end of message
  t = t.replace(/Privacy and Confidentiality Notice:[\s\S]*$/i, "");
  // Collapse blank lines
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

function extractBody(payload: gmail_v1.Schema$MessagePart): { text: string; isHtml: boolean } {
  // Prefer text/plain
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return { text: decodeBody(payload.body.data), isHtml: false };
  }

  // Direct text/html
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return { text: decodeBody(payload.body.data), isHtml: true };
  }

  // Multipart — first pass: text/plain, second pass: text/html, third: recurse
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return { text: decodeBody(part.body.data), isHtml: false };
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return { text: decodeBody(part.body.data), isHtml: true };
      }
    }
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested.text) return nested;
    }
  }

  return { text: "", isHtml: false };
}

export async function getEmail(id: string): Promise<{ summary: EmailSummary; body: string; rawBody: string; attachments: AttachmentInfo[] }> {
  const gmail = getGmailClient();

  const detail = await gmail.users.messages.get({
    userId: "me",
    id,
    format: "full",
  });

  const headers = detail.data.payload?.headers;
  const attachments = extractAttachments(detail.data.payload?.parts);
  const summary: EmailSummary = {
    id,
    threadId: detail.data.threadId || "",
    snippet: detail.data.snippet || "",
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    cc: getHeader(headers, "Cc"),
    subject: getHeader(headers, "Subject"),
    date: getHeader(headers, "Date"),
    labels: detail.data.labelIds || [],
    attachmentCount: attachments.length,
  };

  const { text, isHtml } = detail.data.payload
    ? extractBody(detail.data.payload)
    : { text: "", isHtml: false };
  const looksLikeHtml = isHtml || /^\s*<!DOCTYPE|^\s*<html/i.test(text);
  const converted = looksLikeHtml ? htmlToText(text) : text;
  const body = cleanBody(converted);
  const rawBody = text;

  return { summary, body, rawBody, attachments };
}

export async function downloadAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
  const gmail = getGmailClient();
  const res = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId,
    id: attachmentId,
  });
  const data = res.data.data || "";
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64");
}

export async function getThread(
  threadId: string
): Promise<{ summary: EmailSummary; body: string }[]> {
  const gmail = getGmailClient();

  const res = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "full",
  });

  const messages = (res.data.messages || []).filter(
    (msg) => !msg.labelIds?.includes("DRAFT")
  );

  return messages.map((msg) => {
    const headers = msg.payload?.headers;
    const summary: EmailSummary = {
      id: msg.id || "",
      threadId: msg.threadId || threadId,
      snippet: msg.snippet || "",
      from: getHeader(headers, "From"),
      to: getHeader(headers, "To"),
      cc: getHeader(headers, "Cc"),
      subject: getHeader(headers, "Subject"),
      date: getHeader(headers, "Date"),
      labels: msg.labelIds || [],
      attachmentCount: countAttachments(msg.payload?.parts),
    };

    const { text, isHtml } = msg.payload
      ? extractBody(msg.payload)
      : { text: "", isHtml: false };
    const looksLikeHtml = isHtml || /^\s*<!DOCTYPE|^\s*<html/i.test(text);
    const converted = looksLikeHtml ? htmlToText(text) : text;
    const body = cleanBody(converted);

    return { summary, body };
  });
}

export async function searchEmails(
  query: string,
  maxResults: number = 20
): Promise<EmailSummary[]> {
  const gmail = getGmailClient();

  const listResponse = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults,
  });

  const messages = listResponse.data.messages || [];
  const results: EmailSummary[] = [];

  for (const msg of messages) {
    if (!msg.id) continue;

    const detail = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "full",
    });

    const headers = detail.data.payload?.headers;
    results.push({
      id: msg.id,
      threadId: msg.threadId || "",
      snippet: detail.data.snippet || "",
      from: getHeader(headers, "From"),
      to: getHeader(headers, "To"),
      cc: getHeader(headers, "Cc"),
      subject: getHeader(headers, "Subject"),
      date: getHeader(headers, "Date"),
      labels: detail.data.labelIds || [],
      attachmentCount: countAttachments(detail.data.payload?.parts),
    });
  }

  return results;
}

function summaryFromMessage(
  msg: gmail_v1.Schema$Message,
  threadId: string
): EmailSummary {
  const headers = msg.payload?.headers;
  return {
    id: msg.id || "",
    threadId,
    snippet: msg.snippet || "",
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    cc: getHeader(headers, "Cc"),
    subject: getHeader(headers, "Subject"),
    date: getHeader(headers, "Date"),
    labels: msg.labelIds || [],
    attachmentCount: countAttachments(msg.payload?.parts),
  };
}

export async function searchThreads(
  query: string,
  maxResults: number = 20
): Promise<{ latest: EmailSummary; count: number }[]> {
  const gmail = getGmailClient();

  const res = await gmail.users.threads.list({
    userId: "me",
    q: query,
    maxResults,
  });

  const threadStubs = res.data.threads || [];
  const results: { latest: EmailSummary; count: number }[] = [];

  for (const stub of threadStubs) {
    if (!stub.id) continue;

    const thread = await gmail.users.threads.get({
      userId: "me",
      id: stub.id,
      format: "full",
    });

    const messages = (thread.data.messages || []).filter(
      (msg) => !msg.labelIds?.includes("DRAFT")
    );
    if (messages.length === 0) continue;

    const latest = messages[messages.length - 1]!;
    results.push({
      latest: summaryFromMessage(latest, stub.id),
      count: messages.length,
    });
  }

  return results;
}

// ─── Draft creation ──────────────────────────────────────────────────

export interface DraftOptions {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
}

export interface ReplyDraftOptions {
  messageId: string;
  body: string;
  cc?: string[];
  bcc?: string[];
}

export interface DraftResult {
  id: string;
  messageId: string;
  threadId?: string;
}

export interface SendResult {
  messageId: string;
  threadId?: string;
}

function buildRfc2822Message(opts: {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
  threadSubject?: string;
}): string {
  const lines: string[] = [];
  lines.push(`To: ${opts.to.join(", ")}`);
  if (opts.cc?.length) lines.push(`Cc: ${opts.cc.join(", ")}`);
  if (opts.bcc?.length) lines.push(`Bcc: ${opts.bcc.join(", ")}`);
  lines.push(`Subject: ${opts.threadSubject ?? opts.subject}`);
  lines.push("MIME-Version: 1.0");
  lines.push("Content-Type: text/plain; charset=utf-8");
  if (opts.inReplyTo) lines.push(`In-Reply-To: ${opts.inReplyTo}`);
  if (opts.references) lines.push(`References: ${opts.references}`);
  lines.push("");
  lines.push(opts.body);
  return lines.join("\r\n");
}

function base64urlEncode(str: string): string {
  return Buffer.from(str, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function buildReplyMessage(
  gmail: gmail_v1.Gmail,
  opts: ReplyDraftOptions,
): Promise<{ raw: string; threadId?: string }> {
  // Fetch original message headers for threading
  const original = await gmail.users.messages.get({
    userId: "me",
    id: opts.messageId,
    format: "metadata",
    metadataHeaders: ["Message-ID", "References", "Subject", "To", "From"],
  });

  const headers = original.data.payload?.headers;
  const originalMessageId = getHeader(headers, "Message-ID");
  const originalReferences = getHeader(headers, "References");
  const originalSubject = getHeader(headers, "Subject");
  const originalFrom = getHeader(headers, "From");
  const threadId = original.data.threadId || undefined;

  // Build References header: original References + original Message-ID
  const references = originalReferences
    ? `${originalReferences} ${originalMessageId}`
    : originalMessageId;

  // Reply subject
  const subject = /^re:/i.test(originalSubject)
    ? originalSubject
    : `Re: ${originalSubject}`;

  const raw = buildRfc2822Message({
    to: [originalFrom],
    cc: opts.cc,
    bcc: opts.bcc,
    subject,
    threadSubject: subject,
    body: opts.body,
    inReplyTo: originalMessageId,
    references,
  });

  return { raw, threadId };
}

export async function createDraft(opts: DraftOptions): Promise<DraftResult> {
  const gmail = getGmailClient();
  const raw = buildRfc2822Message({
    to: opts.to,
    cc: opts.cc,
    bcc: opts.bcc,
    subject: opts.subject,
    body: opts.body,
  });

  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: { raw: base64urlEncode(raw) },
    },
  });

  return {
    id: res.data.id!,
    messageId: res.data.message?.id || "",
    threadId: res.data.message?.threadId || undefined,
  };
}

export async function createReplyDraft(opts: ReplyDraftOptions): Promise<DraftResult> {
  const gmail = getGmailClient();
  const { raw, threadId } = await buildReplyMessage(gmail, opts);

  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: {
        raw: base64urlEncode(raw),
        threadId,
      },
    },
  });

  return {
    id: res.data.id!,
    messageId: res.data.message?.id || "",
    threadId: res.data.message?.threadId || undefined,
  };
}

export async function sendMessage(opts: DraftOptions): Promise<SendResult> {
  const gmail = getGmailClient();
  const raw = buildRfc2822Message({
    to: opts.to,
    cc: opts.cc,
    bcc: opts.bcc,
    subject: opts.subject,
    body: opts.body,
  });

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: base64urlEncode(raw),
    },
  });

  return {
    messageId: res.data.id || "",
    threadId: res.data.threadId || undefined,
  };
}

export async function sendReply(opts: ReplyDraftOptions): Promise<SendResult> {
  const gmail = getGmailClient();
  const { raw, threadId } = await buildReplyMessage(gmail, opts);

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: base64urlEncode(raw),
      threadId,
    },
  });

  return {
    messageId: res.data.id || "",
    threadId: res.data.threadId || undefined,
  };
}

// ─── Label modification ──────────────────────────────────────────────

export async function createLabel(name: string): Promise<{ id: string; name: string }> {
  const gmail = getGmailClient();
  const res = await gmail.users.labels.create({
    userId: "me",
    requestBody: {
      name,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    },
  });
  return { id: res.data.id!, name: res.data.name! };
}

export async function updateLabel(
  labelId: string,
  name: string
): Promise<{ id: string; name: string }> {
  const gmail = getGmailClient();
  const res = await gmail.users.labels.patch({
    userId: "me",
    id: labelId,
    requestBody: {
      name,
    },
  });
  return { id: res.data.id!, name: res.data.name! };
}

export async function deleteLabel(labelId: string): Promise<void> {
  const gmail = getGmailClient();
  await gmail.users.labels.delete({
    userId: "me",
    id: labelId,
  });
}

export async function modifyLabels(
  messageId: string,
  addLabelIds: string[],
  removeLabelIds: string[]
): Promise<void> {
  const gmail = getGmailClient();
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      addLabelIds,
      removeLabelIds,
    },
  });
}

export async function modifyThreadLabels(
  threadId: string,
  addLabelIds: string[],
  removeLabelIds: string[]
): Promise<void> {
  const gmail = getGmailClient();
  await gmail.users.threads.modify({
    userId: "me",
    id: threadId,
    requestBody: {
      addLabelIds,
      removeLabelIds,
    },
  });
}

// ─── Read status ─────────────────────────────────────────────────────

export async function markAsRead(messageId: string): Promise<void> {
  await modifyLabels(messageId, [], ["UNREAD"]);
}

export async function markAsUnread(messageId: string): Promise<void> {
  await modifyLabels(messageId, ["UNREAD"], []);
}

export async function removeFromInbox(messageId: string): Promise<void> {
  await modifyLabels(messageId, [], ["INBOX"]);
}

export async function addToInbox(messageId: string): Promise<void> {
  await modifyLabels(messageId, ["INBOX"], []);
}

export async function removeThreadFromInbox(threadId: string): Promise<void> {
  await modifyThreadLabels(threadId, [], ["INBOX"]);
}

export async function addThreadToInbox(threadId: string): Promise<void> {
  await modifyThreadLabels(threadId, ["INBOX"], []);
}

// ─── Sync API functions ──────────────────────────────────────────────

export async function getProfile(): Promise<{
  emailAddress: string;
  historyId: string;
  messagesTotal: number;
}> {
  const gmail = getGmailClient();
  const res = await gmail.users.getProfile({ userId: "me" });
  return {
    emailAddress: res.data.emailAddress!,
    historyId: res.data.historyId!,
    messagesTotal: res.data.messagesTotal!,
  };
}

export async function getLabels(): Promise<
  { id: string; name: string; type: string }[]
> {
  const gmail = getGmailClient();
  const res = await gmail.users.labels.list({ userId: "me" });
  return (res.data.labels || []).map((l) => ({
    id: l.id!,
    name: l.name!,
    type: l.type || "user",
  }));
}

export async function* listAllMessageIds(
  since?: string
): AsyncGenerator<{ id: string; threadId: string }> {
  const gmail = getGmailClient();
  let pageToken: string | undefined;
  do {
    const res = await gmail.users.messages.list({
      userId: "me",
      maxResults: 500,
      includeSpamTrash: false,
      q: since || undefined,
      pageToken,
    });
    for (const msg of res.data.messages || []) {
      yield { id: msg.id!, threadId: msg.threadId! };
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
}

export interface ParsedMessageMetadata {
  messageId: string;
  threadId: string;
  historyId: string | null;
  snippet: string;
  subject: string;
  from: string;
  to: string;
  cc: string;
  date: string;
  dateEpoch: number;
  internalDate: number;
  attachmentCount: number;
  sizeEstimate: number;
  labelIds: string[];
  rawHeaders: Record<string, string>;
}

export async function getMessageMetadata(
  id: string
): Promise<ParsedMessageMetadata> {
  const gmail = getGmailClient();
  const res = await gmail.users.messages.get({
    userId: "me",
    id,
    format: "metadata",
    metadataHeaders: ["From", "To", "Cc", "Subject", "Date"],
  });
  const headers = res.data.payload?.headers;
  const dateStr = getHeader(headers, "Date");
  return {
    messageId: id,
    threadId: res.data.threadId!,
    historyId: res.data.historyId ?? null,
    snippet: res.data.snippet || "",
    subject: getHeader(headers, "Subject"),
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    cc: getHeader(headers, "Cc"),
    date: dateStr,
    dateEpoch: parseDateEpoch(dateStr),
    internalDate: parseInt(res.data.internalDate || "0", 10),
    attachmentCount: 0,
    sizeEstimate: res.data.sizeEstimate || 0,
    labelIds: res.data.labelIds || [],
    rawHeaders: headersToMap(headers),
  };
}

export interface ParsedMessageFull extends ParsedMessageMetadata {
  bodyText: string;
  bodyRaw: string;
}

export async function getMessageFull(id: string): Promise<ParsedMessageFull> {
  const gmail = getGmailClient();
  const res = await gmail.users.messages.get({
    userId: "me",
    id,
    format: "full",
  });

  const headers = res.data.payload?.headers;
  const dateStr = getHeader(headers, "Date");

  const { text, isHtml } = res.data.payload
    ? extractBody(res.data.payload)
    : { text: "", isHtml: false };
  const looksLikeHtml = isHtml || /^\s*<!DOCTYPE|^\s*<html/i.test(text);
  const bodyText = cleanBody(looksLikeHtml ? htmlToText(text) : text);

  return {
    messageId: id,
    threadId: res.data.threadId!,
    historyId: res.data.historyId ?? null,
    snippet: res.data.snippet || "",
    subject: getHeader(headers, "Subject"),
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    cc: getHeader(headers, "Cc"),
    date: dateStr,
    dateEpoch: parseDateEpoch(dateStr),
    internalDate: parseInt(res.data.internalDate || "0", 10),
    attachmentCount: countAttachments(res.data.payload?.parts),
    sizeEstimate: res.data.sizeEstimate || 0,
    labelIds: res.data.labelIds || [],
    rawHeaders: headersToMap(headers),
    bodyText,
    bodyRaw: text,
  };
}

function parseDateEpoch(dateStr: string): number {
  try {
    return new Date(dateStr).getTime();
  } catch {
    return 0;
  }
}

export type HistoryEvent =
  | { type: "messageAdded"; messageId: string; threadId: string; labelIds: string[] }
  | { type: "messageDeleted"; messageId: string }
  | { type: "labelsAdded"; messageId: string; labelIds: string[] }
  | { type: "labelsRemoved"; messageId: string; labelIds: string[] }
  | { type: "syncComplete"; historyId: string };

export async function* getHistory(
  startHistoryId: string
): AsyncGenerator<HistoryEvent> {
  const gmail = getGmailClient();
  let pageToken: string | undefined;
  let latestHistoryId = startHistoryId;

  do {
    const res = await gmail.users.history.list({
      userId: "me",
      startHistoryId,
      historyTypes: [
        "messageAdded",
        "messageDeleted",
        "labelAdded",
        "labelRemoved",
      ],
      maxResults: 500,
      pageToken,
    });

    latestHistoryId = res.data.historyId ?? latestHistoryId;

    for (const record of res.data.history || []) {
      if (record.messagesAdded) {
        for (const added of record.messagesAdded) {
          yield {
            type: "messageAdded",
            messageId: added.message!.id!,
            threadId: added.message!.threadId!,
            labelIds: added.message!.labelIds || [],
          };
        }
      }
      if (record.messagesDeleted) {
        for (const deleted of record.messagesDeleted) {
          yield {
            type: "messageDeleted",
            messageId: deleted.message!.id!,
          };
        }
      }
      if (record.labelsAdded) {
        for (const added of record.labelsAdded) {
          yield {
            type: "labelsAdded",
            messageId: added.message!.id!,
            labelIds: added.labelIds || [],
          };
        }
      }
      if (record.labelsRemoved) {
        for (const removed of record.labelsRemoved) {
          yield {
            type: "labelsRemoved",
            messageId: removed.message!.id!,
            labelIds: removed.labelIds || [],
          };
        }
      }
    }

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  yield { type: "syncComplete", historyId: latestHistoryId };
}
