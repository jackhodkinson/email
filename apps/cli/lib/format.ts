import type { EmailSummary, AttachmentInfo } from "./gmail.ts";

// ANSI codes — disabled when plain mode is active
let BOLD = "\x1b[1m";
let DIM = "\x1b[2m";
let CYAN = "\x1b[36m";
let YELLOW = "\x1b[33m";
let RESET = "\x1b[0m";

let plainMode = false;

export function setPlainMode(enabled: boolean) {
  plainMode = enabled;
  if (enabled) {
    BOLD = DIM = CYAN = YELLOW = RESET = "";
  }
}

function formatNameAndEmail(raw: string): string {
  // "Jack Hodkinson <jack@example.com>" -> "Jack Hodkinson <jack@example.com>"
  // already in a good format, just trim
  return raw.trim();
}

function formatName(raw: string): string {
  const match = raw.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1]!.trim();
  return raw;
}

function formatDate(raw: string): string {
  try {
    const d = new Date(raw);
    const now = new Date();
    const isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();

    if (isToday) {
      return d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }

    const isThisYear = d.getFullYear() === now.getFullYear();
    if (isThisYear) {
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }

    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return raw;
  }
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

interface ChainMessage {
  from: string;
  date: string;
  to: string;
  cc: string;
  body: string;
}

function parseChain(text: string): ChainMessage[] {
  const segments: ChainMessage[] = [];
  const lines = text.split("\n");

  let segBody: string[] = [];
  let segFrom = "";
  let segDate = "";

  let segTo = "";
  let segCc = "";

  function pushSegment() {
    const body = segBody.join("\n").trim();
    if (body || segments.length === 0) {
      segments.push({ from: segFrom, date: segDate, to: segTo, cc: segCc, body });
    }
    segBody = [];
    segTo = "";
    segCc = "";
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;

    // Pattern 1: "On ..., Name <email> wrote:" or "On ..., Name wrote:"
    // Also matches with "> " quote prefix (Apple Mail style)
    const unquoted = line.replace(/^(?:>\s*)+/, "");
    if (/^On .+ wrote:\s*$/.test(unquoted)) {
      pushSegment();
      const nameMatch = unquoted.match(/,\s*([^,<]+?)\s*(?:<[^>]+>)?\s*wrote:\s*$/);
      segFrom = nameMatch ? nameMatch[1]!.trim() : "";
      const dateMatch = unquoted.match(/^On (.+?),\s*(?:at .+?,\s*)?/);
      segDate = dateMatch ? dateMatch[1]!.trim() : "";
      i++;
      continue;
    }

    // Pattern 2: "From: ...\n[blank]\nSent/Date: ..."
    if (/^From:\s+.+/.test(line)) {
      let j = i + 1;
      while (j < lines.length && lines[j]!.trim() === "") j++;
      if (j < lines.length && /^(?:Sent|Date):\s+/.test(lines[j]!)) {
        pushSegment();
        const fromMatch = line.match(/^From:\s+(.+)/);
        const sentMatch = lines[j]!.match(/^(?:Sent|Date):\s+(.+)/);
        segFrom = fromMatch ? formatName(fromMatch[1]!) : "";
        segDate = sentMatch ? sentMatch[1]!.trim() : "";
        // Capture To, Cc from remaining header lines
        j++;
        while (j < lines.length && lines[j]!.trim() === "") j++;
        while (j < lines.length && /^(?:To|Cc|Bcc|Subject):\s+/.test(lines[j]!)) {
          const toMatch = lines[j]!.match(/^To:\s+(.+)/);
          const ccMatch = lines[j]!.match(/^Cc:\s+(.+)/);
          if (toMatch) segTo = toMatch[1]!.trim();
          if (ccMatch) segCc = ccMatch[1]!.trim();
          j++;
          while (j < lines.length && lines[j]!.trim() === "") j++;
        }
        i = j;
        continue;
      }
    }

    // Pattern 3: "-----Original Message-----"
    if (/^-{3,}Original Message-{3,}/.test(line)) {
      pushSegment();
      segFrom = "";
      segDate = "";
      i++;
      continue;
    }

    segBody.push(line);
    i++;
  }

  pushSegment();
  return segments;
}

function stripSignature(text: string): string {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    // Standard "-- " signature delimiter or long dash lines (Outlook signatures)
    if (/^-- \s*$/.test(lines[i]!) || /^-{20,}\s*$/.test(lines[i]!)) {
      return lines.slice(0, i).join("\n").trim();
    }
  }
  return text;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatAttachmentList(attachments: AttachmentInfo[]): string {
  const lines: string[] = [];
  for (let i = 0; i < attachments.length; i++) {
    const a = attachments[i]!;
    lines.push(`  ${i + 1}. ${a.filename} (${formatSize(a.size)})${a.mimeType !== "application/octet-stream" ? ` ${DIM}${a.mimeType}${RESET}` : ""}`);
  }
  return lines.join("\n");
}

export type ReadMode = "latest" | "thread" | "raw";

function stripQuoteMarkers(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/^(?:>\s?)+/, ""))
    .join("\n");
}

export function formatEmail(summary: EmailSummary, body: string, mode: ReadMode = "latest", verbose = false, reverse = false, attachments?: AttachmentInfo[]): string {
  const lines: string[] = [];
  const date = formatDate(summary.date);
  const subject = summary.subject || "(no subject)";

  lines.push(`${CYAN}${subject}${RESET}`);

  if (mode === "thread") {
    const chain = parseChain(body);
    // Default: oldest at top, newest at bottom. -r flips it.
    const ordered = reverse ? chain : [...chain].reverse();
    lines.push("");

    for (let i = 0; i < ordered.length; i++) {
      const seg = ordered[i]!;
      const isFirst = i === 0;
      const isLast = i === ordered.length - 1;

      // Separator between messages
      if (!isFirst) {
        lines.push(`${DIM}${"─".repeat(50)}${RESET}`);
        lines.push("");
      }

      // Each message gets its own headers
      if (isLast) {
        // Latest message: use full headers from the email envelope
        lines.push(`${BOLD}From:${RESET} ${formatNameAndEmail(summary.from)}`);
        lines.push(`${BOLD}To:${RESET}   ${formatNameAndEmail(summary.to)}`);
        if (summary.cc) lines.push(`${BOLD}Cc:${RESET}   ${formatNameAndEmail(summary.cc)}`);
        lines.push(`${BOLD}Date:${RESET} ${date}`);
      } else {
        // Older messages: use what we parsed from the chain
        const from = seg.from || "Unknown";
        lines.push(`${BOLD}From:${RESET} ${from}`);
        if (seg.to) lines.push(`${BOLD}To:${RESET}   ${seg.to}`);
        if (seg.cc) lines.push(`${BOLD}Cc:${RESET}   ${seg.cc}`);
        if (seg.date) lines.push(`${BOLD}Date:${RESET} ${seg.date}`);
      }
      lines.push("");

      // Body: strip quote markers and optionally signature
      let segBody = isLast ? seg.body : stripSignature(seg.body);
      segBody = stripQuoteMarkers(segBody);
      lines.push(segBody.trimEnd());
      lines.push("");
    }
  } else {
    // latest and raw modes: show full header
    lines.push(`${BOLD}From:${RESET} ${formatNameAndEmail(summary.from)}`);
    lines.push(`${BOLD}To:${RESET}   ${formatNameAndEmail(summary.to)}`);
    if (summary.cc) {
      lines.push(`${BOLD}Cc:${RESET}   ${formatNameAndEmail(summary.cc)}`);
    }
    lines.push(`${BOLD}Date:${RESET} ${date}`);
    lines.push("");

    if (mode === "raw") {
      lines.push(body.trimEnd());
    } else {
      // latest: just the first message
      const chain = parseChain(body);
      const latest = chain.length > 0 ? chain[0]!.body : body;
      lines.push(latest.trimEnd());
      if (chain.length > 1) {
        const count = chain.length - 1;
        const plural = count === 1 ? "message" : "messages";
        lines.push("");
        lines.push(`${DIM}··· ${count} earlier ${plural} — use --thread to expand${RESET}`);
      }
    }
  }

  if (attachments && attachments.length > 0) {
    lines.push("");
    lines.push(`${BOLD}Attachments:${RESET}`);
    lines.push(formatAttachmentList(attachments));
    lines.push("");
    lines.push(`${DIM}Use 'cmail download <id>' to save.${RESET}`);
  }

  return lines.join("\n");
}

function stripQuotedReply(body: string): string {
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const unquoted = line.replace(/^(?:>\s*)+/, "");

    // "On ..., Name wrote:"
    if (/^On .+ wrote:\s*$/.test(unquoted)) {
      return lines.slice(0, i).join("\n").trim();
    }
    // "-----Original Message-----"
    if (/^-{3,}Original Message-{3,}/.test(line)) {
      return lines.slice(0, i).join("\n").trim();
    }
    // Outlook "From: ..." followed by "Sent/Date: ..."
    if (/^From:\s+.+/.test(line)) {
      let j = i + 1;
      while (j < lines.length && lines[j]!.trim() === "") j++;
      if (j < lines.length && /^(?:Sent|Date):\s+/.test(lines[j]!)) {
        return lines.slice(0, i).join("\n").trim();
      }
    }
  }
  return body;
}

export function formatThread(
  messages: { summary: EmailSummary; body: string }[],
  reverse = false
): string {
  if (messages.length === 0) return "No messages in thread.";

  const lines: string[] = [];
  const subject =
    messages[messages.length - 1]?.summary.subject ||
    messages[0]?.summary.subject ||
    "(no subject)";

  lines.push(`${CYAN}${subject}${RESET}`);
  lines.push("");

  // Default: oldest first. -r reverses to newest first.
  const ordered = reverse ? [...messages].reverse() : messages;

  for (let i = 0; i < ordered.length; i++) {
    const { summary, body } = ordered[i]!;

    if (i > 0) {
      lines.push(`${DIM}${"─".repeat(50)}${RESET}`);
      lines.push("");
    }

    lines.push(`${BOLD}From:${RESET} ${formatNameAndEmail(summary.from)}`);
    lines.push(`${BOLD}To:${RESET}   ${formatNameAndEmail(summary.to)}`);
    if (summary.cc) {
      lines.push(`${BOLD}Cc:${RESET}   ${formatNameAndEmail(summary.cc)}`);
    }
    lines.push(`${BOLD}Date:${RESET} ${formatDate(summary.date)}`);
    lines.push("");

    const cleaned = stripQuotedReply(body);
    lines.push(cleaned.trimEnd());
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Search result formatting ────────────────────────────────────────

export interface SearchEntry {
  id: string;
  threadId: string;
  from: string;
  date: string;
  subject: string;
  bodyText: string;
  threadCount: number;
  attachmentCount: number;
}

function highlightMatch(text: string, query: string): string {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  return text.replace(regex, `${BOLD}${YELLOW}$1${RESET}${DIM}`);
}

function extractMatchSnippet(body: string, query: string, contextChars = 120): string {
  if (!body) return "";

  const lower = body.toLowerCase();
  const queryLower = query.toLowerCase();
  const idx = lower.indexOf(queryLower);
  if (idx === -1) return "";

  // Find a window around the match
  const halfCtx = Math.floor((contextChars - query.length) / 2);
  let start = Math.max(0, idx - halfCtx);
  let end = Math.min(body.length, idx + query.length + halfCtx);

  // Snap to word boundaries
  if (start > 0) {
    const space = body.lastIndexOf(" ", start);
    if (space > start - 20) start = space + 1;
  }
  if (end < body.length) {
    const space = body.indexOf(" ", end);
    if (space !== -1 && space < end + 20) end = space;
  }

  // Clean up: collapse whitespace, trim
  let snippet = body.slice(start, end).replace(/\s+/g, " ").trim();

  const prefix = start > 0 ? "…" : "";
  const suffix = end < body.length ? "…" : "";

  return `${prefix}${snippet}${suffix}`;
}

export function formatSearchResults(results: SearchEntry[], query: string, shortIds: string[]): string {
  if (results.length === 0) return "No results found.";

  const lines: string[] = [];
  const idWidth = shortIds[0]?.length ?? 4;
  const indent = " ".repeat(idWidth + 2);

  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    const idx = `${DIM}${shortIds[i]}${RESET}`;
    const from = formatName(r.from);
    const date = formatDate(r.date);
    const subject = r.subject || "(no subject)";
    const countBadge = r.threadCount > 1
      ? plainMode
        ? `[${r.threadCount} messages] `
        : `💬${r.threadCount} `
      : "";
    const ac = r.attachmentCount || 0;
    const attachBadge = ac > 0
      ? plainMode
        ? `[${ac} attachment${ac > 1 ? "s" : ""}] `
        : `📎${ac} `
      : "";

    lines.push(`${idx}  ${BOLD}${truncate(from, 50)}${RESET}  ${DIM}${date}${RESET}`);
    lines.push(`${indent}${countBadge}${attachBadge}${CYAN}${subject}${RESET}`);

    // Show match context from body
    const snippet = extractMatchSnippet(r.bodyText, query);
    if (snippet) {
      const highlighted = highlightMatch(snippet, query);
      lines.push(`${indent}${DIM}${highlighted}${RESET}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export interface ThreadEntry {
  latest: EmailSummary;
  count: number;
}

export function computeShortIds(threads: ThreadEntry[]): string[] {
  const ids = threads.map((t) => t.latest.id);
  if (ids.length === 0) return [];

  // Find minimum suffix length (starting at 4) where all IDs are unique
  let len = 4;
  while (len < 20) {
    const shorts = ids.map((id) => id.slice(-len));
    if (new Set(shorts).size === ids.length) break;
    len++;
  }

  return ids.map((id) => id.slice(-len));
}

const HIDDEN_LABELS = new Set([
  "INBOX", "SENT", "DRAFT", "SPAM", "TRASH", "UNREAD", "STARRED", "IMPORTANT", "CHAT",
  "YELLOW_STAR",
]);

const CATEGORY_SHORT: Record<string, string> = {
  "CATEGORY_PERSONAL": "primary",
  "CATEGORY_PROMOTIONS": "promo",
  "CATEGORY_SOCIAL": "social",
  "CATEGORY_UPDATES": "updates",
  "CATEGORY_FORUMS": "forums",
};

function formatLabelBadges(labels: string[], labelNames?: Map<string, string>): { text: string; len: number } {
  let text = "";
  let len = 0;

  // Category badge (dim, no brackets)
  for (const l of labels) {
    const short = CATEGORY_SHORT[l];
    if (short) {
      text += `${DIM}${short}${RESET} `;
      len += short.length + 1;
      break; // only one category per email
    }
  }

  // User label badges (yellow, bracketed)
  const userLabels = labels
    .filter((l) => !HIDDEN_LABELS.has(l) && !CATEGORY_SHORT[l])
    .map((l) => labelNames?.get(l) ?? l);
  for (const name of userLabels) {
    text += `${YELLOW}[${name}]${RESET} `;
    len += name.length + 3;
  }

  return { text, len };
}

export function formatEmailList(threads: ThreadEntry[], reverse = false, shortIds?: string[], labelNames?: Map<string, string>): string {
  if (threads.length === 0) return "No emails found.";

  const ids = shortIds ?? computeShortIds(threads);
  const lines: string[] = [];
  const idWidth = ids[0]?.length ?? 4;
  const indent = " ".repeat(idWidth + 2);

  const indices = reverse
    ? Array.from({ length: threads.length }, (_, i) => i)
    : Array.from({ length: threads.length }, (_, i) => threads.length - 1 - i);

  for (const j of indices) {
    const { latest: email, count } = threads[j]!;
    const idx = `${DIM}${ids[j]}${RESET}`;
    const from = formatName(email.from);
    const date = formatDate(email.date);
    const subject = email.subject || "(no subject)";
    const countBadge = count > 1
      ? plainMode
        ? `[${count} messages] `
        : `💬${count} `
      : "";
    const ac = email.attachmentCount || 0;
    const attachBadge = ac > 0
      ? plainMode
        ? `[${ac} attachment${ac > 1 ? "s" : ""}] `
        : `📎${ac} `
      : "";
    const { text: labelBadge, len: labelBadgeLen } = formatLabelBadges(email.labels, labelNames);
    const snippet = email.snippet.replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    const countBadgeLen = count > 1 ? (plainMode ? `[${count} messages] `.length : 4 + String(count).length) : 0;
    const attachBadgeLen = ac > 0 ? (plainMode ? `[${ac} attachment${ac > 1 ? "s" : ""}] `.length : 4 + String(ac).length) : 0;
    const badgeLen = countBadgeLen + attachBadgeLen + labelBadgeLen;

    lines.push(`${idx}  ${BOLD}${truncate(from, 50)}${RESET}  ${DIM}${date}${RESET}`);
    lines.push(`${indent}${countBadge}${attachBadge}${labelBadge}${CYAN}${truncate(subject, 74 - badgeLen)}${RESET}`);
    lines.push(`${indent}${DIM}${truncate(snippet, 74)}${RESET}`);
    lines.push("");
  }

  return lines.join("\n");
}
