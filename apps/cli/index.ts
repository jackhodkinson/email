#!/usr/bin/env bun

import { getDb, getSyncState, queryThreads, searchMessages, countMessages, storedToSummary, saveIdMap, saveLastList, resolveShortId, getMessageById, getCachedBody, cacheBody, getLabels, getLabelNameMap, resolveLabelName, addLabels, removeLabels, type ThreadQueryOpts, type CountOpts } from "./lib/db.ts";
import { computeShortIds, formatEmailList, formatEmail, formatThread, formatSearchResults, formatAttachmentList, formatSize, setPlainMode, type ReadMode, type ThreadEntry, type SearchEntry } from "./lib/format.ts";

const GLOBAL_FLAGS = new Set(["-p", "--plain"]);

// Strip global flags and apply them
const args = process.argv.slice(2).filter((a) => {
  if (GLOBAL_FLAGS.has(a)) return false;
  return true;
});

if (process.argv.slice(2).some((a) => GLOBAL_FLAGS.has(a))) {
  setPlainMode(true);
}

const command = args[0];

async function sync() {
  const flagArgs = args.slice(1);
  const full = flagArgs.includes("--full");
  let since: string | undefined;

  for (let i = 0; i < flagArgs.length; i++) {
    if (flagArgs[i] === "--since" && flagArgs[i + 1]) {
      since = flagArgs[i + 1]!;
      i++;
    }
  }

  const { initialSync, incrementalSync, buildSinceQuery } = await import("./lib/sync.ts");
  const db = getDb();

  if (full) {
    const { resetDb } = await import("./lib/db.ts");
    resetDb(db);
    await initialSync(db, since ? buildSinceQuery(since) ?? undefined : undefined);
  } else {
    const state = getSyncState(db);
    if (!state.initialSyncDone) {
      await initialSync(db, since ? buildSinceQuery(since) ?? undefined : undefined);
    } else {
      await incrementalSync(db);
    }
  }
}

async function list() {
  let maxResults = 20;
  const flagArgs = args.slice(1);
  const opts: ThreadQueryOpts = {};

  // Parse flags
  let hasLabelFilter = false;
  let queryString: string | undefined;
  let fromFilter: string | undefined;
  let toFilter: string | undefined;

  for (let i = 0; i < flagArgs.length; i++) {
    if ((flagArgs[i] === "-n" || flagArgs[i] === "--max") && flagArgs[i + 1]) {
      maxResults = parseInt(flagArgs[i + 1]!, 10);
      i++;
    } else if ((flagArgs[i] === "-q" || flagArgs[i] === "--query") && flagArgs[i + 1]) {
      queryString = flagArgs[i + 1]!;
      i++;
    } else if (flagArgs[i] === "--from" && flagArgs[i + 1]) {
      fromFilter = flagArgs[i + 1]!;
      i++;
    } else if (flagArgs[i] === "--to" && flagArgs[i + 1]) {
      toFilter = flagArgs[i + 1]!;
      i++;
    } else if (flagArgs[i] === "--unread") {
      opts.unread = true;
    } else if (flagArgs[i] === "--starred") {
      opts.starred = true;
    } else if (flagArgs[i] === "--inbox") {
      hasLabelFilter = true;
      opts.labelFilter = "INBOX";
    } else if (flagArgs[i] === "--primary") {
      hasLabelFilter = true;
      opts.labelFilter = "CATEGORY_PERSONAL";
    } else if (flagArgs[i] === "--promo" || flagArgs[i] === "--promotions") {
      hasLabelFilter = true;
      opts.labelFilter = "CATEGORY_PROMOTIONS";
    } else if (flagArgs[i] === "--social") {
      hasLabelFilter = true;
      opts.labelFilter = "CATEGORY_SOCIAL";
    } else if (flagArgs[i] === "--updates") {
      hasLabelFilter = true;
      opts.labelFilter = "CATEGORY_UPDATES";
    } else if (flagArgs[i] === "--forums") {
      hasLabelFilter = true;
      opts.labelFilter = "CATEGORY_FORUMS";
    }
  }

  const fresh = flagArgs.includes("--fresh");
  const reverse = flagArgs.includes("-r") || flagArgs.includes("--reverse");

  // Handle -q: parse locally if possible, fall back to API
  if (queryString !== undefined) {
    const { parseGmailQuery } = await import("./lib/query.ts");
    const parsed = parseGmailQuery(queryString);
    if (!parsed.canRunLocally) {
      return await listViaApi(queryString, maxResults, flagArgs);
    }
    if (parsed.whereClauses.length > 0) {
      opts.extraWhere = { clauses: parsed.whereClauses, params: parsed.params };
    }
    hasLabelFilter = true; // skip default INBOX filter — -q searches all mail
  }

  // Default to INBOX
  if (!hasLabelFilter && !fromFilter && !toFilter && !opts.unread && !opts.starred) {
    opts.labelFilter = "INBOX";
  }

  if (fromFilter) opts.from = fromFilter;
  if (toFilter) opts.to = toFilter;
  opts.maxResults = maxResults;

  // Ensure synced
  const db = getDb();
  const state = getSyncState(db);

  if (!state.initialSyncDone) {
    const { initialSync } = await import("./lib/sync.ts");
    await initialSync(db);
  } else if (fresh) {
    const { incrementalSync } = await import("./lib/sync.ts");
    await incrementalSync(db);
  } else {
    const staleMs = 5 * 60 * 1000;
    if (!state.lastSyncAt || Date.now() - state.lastSyncAt > staleMs) {
      const { incrementalSync } = await import("./lib/sync.ts");
      await incrementalSync(db);
    }
  }

  // Query local DB
  const results = queryThreads(db, opts);

  const threads: ThreadEntry[] = results.map((r) => ({
    latest: storedToSummary(r.latest),
    count: r.count,
  }));

  const shortIds = computeShortIds(threads);

  // Save ID map + last list for `cmail read`
  const idEntries = threads.map((t, i) => ({
    shortId: shortIds[i]!,
    messageId: t.latest.id,
    threadId: t.latest.threadId,
  }));
  saveIdMap(db, idEntries);
  saveLastList(
    db,
    threads.map((t) => ({ messageId: t.latest.id, threadId: t.latest.threadId }))
  );

  const labelNames = getLabelNameMap(db);
  console.log(formatEmailList(threads, reverse, shortIds, labelNames));
}

// Fallback for -q flag: use Gmail API directly (same as old behavior)
async function listViaApi(query: string, maxResults: number, flagArgs: string[]) {
  const reverse = flagArgs.includes("-r") || flagArgs.includes("--reverse");

  const { searchThreads } = await import("./lib/gmail.ts");
  const threads: ThreadEntry[] = await searchThreads(query, maxResults);

  const shortIds = computeShortIds(threads);

  const db = getDb();
  const idEntries = threads.map((t, i) => ({
    shortId: shortIds[i]!,
    messageId: t.latest.id,
    threadId: t.latest.threadId,
  }));
  saveIdMap(db, idEntries);
  saveLastList(
    db,
    threads.map((t) => ({ messageId: t.latest.id, threadId: t.latest.threadId }))
  );

  const labelNames = getLabelNameMap(db);
  console.log(formatEmailList(threads, reverse, shortIds, labelNames));
}

async function auth() {
  const { isAuthenticated, getAuthUrl, exchangeCodeForTokens } = await import("./lib/auth.ts");

  if (isAuthenticated()) {
    console.log("Already authenticated. Re-authenticating...\n");
  }

  const url = getAuthUrl();
  console.log("Visit this URL to authorize cmail:\n");
  console.log(url);
  console.log("\nAfter authorizing, paste the code below.");

  process.stdout.write("Authorization code: ");
  const fd = require("fs").openSync("/dev/tty", "r");

  const { execSync } = require("child_process");
  execSync("stty -echo", { stdio: ["inherit", "pipe", "pipe"] });

  try {
    const buf = Buffer.alloc(4096);
    const bytesRead = require("fs").readSync(fd, buf);
    const code = buf.toString("utf-8", 0, bytesRead).trim();
    console.log("");

    if (!code) {
      console.error("No code provided.");
      process.exit(1);
    }

    await exchangeCodeForTokens(code);
    console.log("Authenticated successfully.");
  } catch (err) {
    console.log("");
    console.error("Authentication failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    execSync("stty echo", { stdio: ["inherit", "pipe", "pipe"] });
    require("fs").closeSync(fd);
  }
}

async function read() {
  const flagArgs = new Set(args.slice(1).filter((a) => a.startsWith("-")));
  const positional = args.slice(1).filter((a) => !a.startsWith("-"));
  const id = positional[0];
  if (!id) {
    console.error("Usage: cmail read <id> [--thread] [--raw] [-v]");
    process.exit(1);
  }

  const mode: ReadMode = flagArgs.has("--raw") ? "raw" : flagArgs.has("--thread") ? "thread" : "latest";
  const verbose = flagArgs.has("-v") || flagArgs.has("--verbose");
  const reverse = flagArgs.has("-r") || flagArgs.has("--reverse");

  // Resolve ID: positional number → short ID → raw message ID
  let messageId: string | null = null;
  let threadId: string | null = null;
  const n = parseInt(id, 10);
  const isPureNumber = !isNaN(n) && String(n) === id;

  const db = getDb();

  // 1. Pure numbers → positional from last list (stored with # prefix in id_map)
  if (isPureNumber) {
    const resolved = resolveShortId(db, `#${id}`);
    if (resolved) {
      messageId = resolved.messageId;
      threadId = resolved.threadId;
    }
  }

  // 2. Try short ID lookup
  if (!messageId) {
    const resolved = resolveShortId(db, id);
    if (resolved) {
      messageId = resolved.messageId;
      threadId = resolved.threadId;
    }
  }

  // 3. Error if unresolved (don't send garbage to Gmail API)
  if (!messageId) {
    console.error(`Unknown email ID: ${id}\nRun 'cmail list' first, then use an ID from the output.`);
    process.exit(1);
  }

  if (mode === "thread") {
    // Resolve threadId if not already known
    if (!threadId) {
      const { getEmail } = await import("./lib/gmail.ts");
      const result = await getEmail(messageId);
      threadId = result.summary.threadId;
    }

    const { getThread } = await import("./lib/gmail.ts");
    const messages = await getThread(threadId);
    console.log(formatThread(messages, reverse));
  } else {
    // Check local cache first
    const cached = getCachedBody(db, messageId);
    const stored = getMessageById(db, messageId);

    if (cached && stored) {
      const summary = storedToSummary(stored);
      const body = mode === "raw" ? cached.bodyRaw : cached.bodyText;
      // Fetch attachments if the email has them
      let attachments: import("./lib/gmail.ts").AttachmentInfo[] | undefined;
      if (summary.attachmentCount > 0) {
        const { getEmail } = await import("./lib/gmail.ts");
        const result = await getEmail(messageId);
        attachments = result.attachments;
      }
      console.log(formatEmail(summary, body, mode, verbose, reverse, attachments));
    } else {
      const { getEmail } = await import("./lib/gmail.ts");
      const result = await getEmail(messageId);
      cacheBody(db, messageId, result.body, result.rawBody);
      const body = mode === "raw" ? result.rawBody : result.body;
      console.log(formatEmail(result.summary, body, mode, verbose, reverse, result.attachments));
    }
  }
}

async function download() {
  const flagArgs = args.slice(1);
  const positional = flagArgs.filter((a) => !a.startsWith("-"));
  const id = positional[0];
  if (!id) {
    console.error("Usage: cmail download <id> [--list] [-i <n>] [-o <dir>]");
    process.exit(1);
  }

  // Parse flags
  let outputDir = process.cwd();
  let attachIndex: number | undefined;
  let listOnly = false;

  for (let i = 0; i < flagArgs.length; i++) {
    if ((flagArgs[i] === "-o" || flagArgs[i] === "--output") && flagArgs[i + 1]) {
      outputDir = flagArgs[i + 1]!;
      i++;
    } else if ((flagArgs[i] === "-i" || flagArgs[i] === "--index") && flagArgs[i + 1]) {
      attachIndex = parseInt(flagArgs[i + 1]!, 10);
      i++;
    } else if (flagArgs[i] === "--list") {
      listOnly = true;
    }
  }

  // Resolve ID (same as read())
  let messageId: string | null = null;
  const n = parseInt(id, 10);
  const isPureNumber = !isNaN(n) && String(n) === id;

  const db = getDb();

  if (isPureNumber) {
    const resolved = resolveShortId(db, `#${id}`);
    if (resolved) messageId = resolved.messageId;
  }
  if (!messageId) {
    const resolved = resolveShortId(db, id);
    if (resolved) messageId = resolved.messageId;
  }
  if (!messageId) {
    console.error(`Unknown email ID: ${id}\nRun 'cmail list' first, then use an ID from the output.`);
    process.exit(1);
  }

  // Fetch email to get attachment metadata
  const { getEmail, downloadAttachment } = await import("./lib/gmail.ts");
  const result = await getEmail(messageId);
  const attachments = result.attachments;

  if (attachments.length === 0) {
    console.error("This email has no attachments.");
    process.exit(1);
  }

  // --list mode
  if (listOnly) {
    console.log(`Attachments for: ${result.summary.subject || "(no subject)"}\n`);
    console.log(formatAttachmentList(attachments));
    return;
  }

  // Validate index
  if (attachIndex !== undefined) {
    if (attachIndex < 1 || attachIndex > attachments.length) {
      console.error(`Invalid attachment index: ${attachIndex}`);
      console.error(`This email has ${attachments.length} attachment${attachments.length > 1 ? "s" : ""}:\n`);
      console.log(formatAttachmentList(attachments));
      process.exit(1);
    }
  }

  // Validate output directory
  const { existsSync } = await import("fs");
  if (!existsSync(outputDir)) {
    console.error(`Output directory does not exist: ${outputDir}`);
    process.exit(1);
  }

  // Determine which attachments to download
  const toDownload = attachIndex !== undefined
    ? [attachments[attachIndex - 1]!]
    : attachments;

  const { join } = await import("path");

  for (const att of toDownload) {
    const data = await downloadAttachment(messageId, att.attachmentId);

    // Handle filename conflicts
    let filename = att.filename;
    let filePath = join(outputDir, filename);
    let counter = 1;
    while (existsSync(filePath)) {
      const dotIdx = att.filename.lastIndexOf(".");
      if (dotIdx > 0) {
        filename = `${att.filename.slice(0, dotIdx)} (${counter})${att.filename.slice(dotIdx)}`;
      } else {
        filename = `${att.filename} (${counter})`;
      }
      filePath = join(outputDir, filename);
      counter++;
    }

    await Bun.write(filePath, data);
    console.log(`Saved: ${filename} (${formatSize(data.byteLength)})`);
  }
}

async function search() {
  const flagArgs = args.slice(1);
  const positional = flagArgs.filter((a) => !a.startsWith("-"));
  const query = positional[0];

  if (!query) {
    console.error("Usage: cmail search <query> [-n 10] [--from alice]");
    process.exit(1);
  }

  let maxResults = 20;
  let fromFilter: string | undefined;

  for (let i = 0; i < flagArgs.length; i++) {
    if ((flagArgs[i] === "-n" || flagArgs[i] === "--max") && flagArgs[i + 1]) {
      maxResults = parseInt(flagArgs[i + 1]!, 10);
      i++;
    } else if (flagArgs[i] === "--from" && flagArgs[i + 1]) {
      fromFilter = flagArgs[i + 1]!;
      i++;
    }
  }

  // Ensure synced
  const db = getDb();
  const state = getSyncState(db);

  if (!state.initialSyncDone) {
    const { initialSync } = await import("./lib/sync.ts");
    await initialSync(db);
  } else {
    const staleMs = 5 * 60 * 1000;
    if (!state.lastSyncAt || Date.now() - state.lastSyncAt > staleMs) {
      const { incrementalSync } = await import("./lib/sync.ts");
      await incrementalSync(db);
    }
  }

  const results = searchMessages(db, { query, from: fromFilter, maxResults });

  const entries: SearchEntry[] = results.map((r) => ({
    id: r.message.messageId,
    threadId: r.message.threadId,
    from: r.message.from,
    date: r.message.date,
    subject: r.message.subject,
    bodyText: r.bodyText,
    threadCount: r.threadCount,
    attachmentCount: r.message.attachmentCount,
  }));

  // Compute short IDs and save for `cmail read`
  const ids = entries.map((e) => e.id);
  let len = 4;
  while (len < 20) {
    const shorts = ids.map((id) => id.slice(-len));
    if (new Set(shorts).size === ids.length) break;
    len++;
  }
  const shortIds = ids.map((id) => id.slice(-len));

  const idEntries = entries.map((e, i) => ({
    shortId: shortIds[i]!,
    messageId: e.id,
    threadId: e.threadId,
  }));
  saveIdMap(db, idEntries);
  saveLastList(db, entries.map((e) => ({ messageId: e.id, threadId: e.threadId })));

  console.log(formatSearchResults(entries, query, shortIds));
}

async function count() {
  const flagArgs = args.slice(1);
  const opts: CountOpts = {};
  let queryString: string | undefined;
  let hasFilter = false;

  for (let i = 0; i < flagArgs.length; i++) {
    if ((flagArgs[i] === "-q" || flagArgs[i] === "--query") && flagArgs[i + 1]) {
      queryString = flagArgs[i + 1]!;
      i++;
    } else if (flagArgs[i] === "--from" && flagArgs[i + 1]) {
      opts.from = flagArgs[i + 1]!;
      hasFilter = true;
      i++;
    } else if (flagArgs[i] === "--to" && flagArgs[i + 1]) {
      opts.to = flagArgs[i + 1]!;
      hasFilter = true;
      i++;
    } else if (flagArgs[i] === "--unread") {
      opts.unread = true;
      hasFilter = true;
    } else if (flagArgs[i] === "--starred") {
      opts.starred = true;
      hasFilter = true;
    } else if (flagArgs[i] === "--all") {
      opts.all = true;
      hasFilter = true;
    }
  }

  if (queryString !== undefined) {
    const { parseGmailQuery } = await import("./lib/query.ts");
    const parsed = parseGmailQuery(queryString);
    if (!parsed.canRunLocally) {
      console.error("This query can't run locally. Use 'cmail list -q' instead.");
      process.exit(1);
    }
    if (parsed.whereClauses.length > 0) {
      opts.extraWhere = { clauses: parsed.whereClauses, params: parsed.params };
    }
    hasFilter = true;
  }

  // Default to INBOX
  if (!hasFilter) {
    opts.labelFilter = "INBOX";
  }

  const db = getDb();
  const n = countMessages(db, opts);
  console.log(n);
}

async function tag() {
  const id = args[1];
  const labelArgs = args.slice(2);

  if (!id || labelArgs.length === 0) {
    console.error("Usage: cmail tag <id> [+|-]<label> [[+|-]<label> ...]");
    console.error("Examples:");
    console.error("  cmail tag 3 Newsletters          # add label");
    console.error("  cmail tag 3 +Newsletters -INBOX   # add and remove");
    process.exit(1);
  }

  // Resolve email ID
  let messageId: string | null = null;
  const n = parseInt(id, 10);
  const isPureNumber = !isNaN(n) && String(n) === id;

  const db = getDb();

  if (isPureNumber) {
    const resolved = resolveShortId(db, `#${id}`);
    if (resolved) messageId = resolved.messageId;
  }
  if (!messageId) {
    const resolved = resolveShortId(db, id);
    if (resolved) messageId = resolved.messageId;
  }
  if (!messageId) {
    console.error(`Unknown email ID: ${id}\nRun 'cmail list' first, then use an ID from the output.`);
    process.exit(1);
  }

  // Parse +/- label arguments
  const toAdd: string[] = [];
  const toRemove: string[] = [];

  for (const arg of labelArgs) {
    let op = "+";
    let name = arg;
    if (arg.startsWith("+")) {
      name = arg.slice(1);
    } else if (arg.startsWith("-")) {
      op = "-";
      name = arg.slice(1);
    }

    const labelId = resolveLabelName(db, name);
    if (!labelId) {
      console.error(`Unknown label: ${name}\nRun 'cmail tags list' to see available labels.`);
      process.exit(1);
    }

    if (op === "+") {
      toAdd.push(labelId);
    } else {
      toRemove.push(labelId);
    }
  }

  // Apply via Gmail API
  const { modifyLabels } = await import("./lib/gmail.ts");
  await modifyLabels(messageId, toAdd, toRemove);

  // Update local DB
  if (toAdd.length > 0) addLabels(db, messageId, toAdd);
  if (toRemove.length > 0) removeLabels(db, messageId, toRemove);

  const labelNames = getLabelNameMap(db);
  const added = toAdd.map((id) => `+${labelNames.get(id) ?? id}`);
  const removed = toRemove.map((id) => `-${labelNames.get(id) ?? id}`);
  console.log(`${[...added, ...removed].join(" ")}`);
}

async function tags() {
  const subcommand = args[1];

  if (subcommand === "create") {
    const name = args.slice(2).join(" ");
    if (!name) {
      console.error("Usage: cmail tags create <name>");
      console.error("Examples:");
      console.error("  cmail tags create Receipts");
      console.error('  cmail tags create Agent/Newsletters');
      process.exit(1);
    }

    const { createLabel } = await import("./lib/gmail.ts");
    const { upsertLabels } = await import("./lib/db.ts");
    const label = await createLabel(name);
    const db = getDb();
    upsertLabels(db, [{ id: label.id, name: label.name, type: "user" }]);
    console.log(`Created: ${label.name}`);
    return;
  }

  if (subcommand !== "list") {
    console.error("Usage:");
    console.error("  cmail tags list              List all labels");
    console.error("  cmail tags create <name>     Create a new label");
    process.exit(1);
  }

  const db = getDb();
  const labels = getLabels(db);

  if (labels.length === 0) {
    console.log("No labels found. Run 'cmail sync' first.");
    return;
  }

  const system = labels.filter((l) => l.type === "system");
  const user = labels.filter((l) => l.type === "user");

  if (system.length > 0) {
    console.log("System labels:");
    for (const l of system) {
      console.log(`  ${l.name}`);
    }
  }

  if (user.length > 0) {
    if (system.length > 0) console.log("");
    console.log("User labels:");
    for (const l of user) {
      console.log(`  ${l.name}`);
    }
  }
}

async function draft() {
  const flagArgs = args.slice(1);
  let to: string | undefined;
  let cc: string | undefined;
  let bcc: string | undefined;
  let subject: string | undefined;
  let body: string | undefined;
  let replyId: string | undefined;

  for (let i = 0; i < flagArgs.length; i++) {
    if (flagArgs[i] === "--to" && flagArgs[i + 1]) {
      to = flagArgs[i + 1]!;
      i++;
    } else if (flagArgs[i] === "--cc" && flagArgs[i + 1]) {
      cc = flagArgs[i + 1]!;
      i++;
    } else if (flagArgs[i] === "--bcc" && flagArgs[i + 1]) {
      bcc = flagArgs[i + 1]!;
      i++;
    } else if ((flagArgs[i] === "-s" || flagArgs[i] === "--subject") && flagArgs[i + 1]) {
      subject = flagArgs[i + 1]!;
      i++;
    } else if ((flagArgs[i] === "-b" || flagArgs[i] === "--body") && flagArgs[i + 1]) {
      body = flagArgs[i + 1]!;
      i++;
    } else if ((flagArgs[i] === "-r" || flagArgs[i] === "--reply") && flagArgs[i + 1]) {
      replyId = flagArgs[i + 1]!;
      i++;
    }
  }

  // Read body from stdin if not provided via flag and stdin is piped
  if (!body && !process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    body = Buffer.concat(chunks).toString("utf-8").trim();
  }

  if (!body) {
    console.error("Body is required. Use --body or pipe via stdin.");
    process.exit(1);
  }

  if (replyId) {
    // Reply mode — resolve short ID
    let messageId: string | null = null;
    const n = parseInt(replyId, 10);
    const isPureNumber = !isNaN(n) && String(n) === replyId;

    const db = getDb();

    if (isPureNumber) {
      const resolved = resolveShortId(db, `#${replyId}`);
      if (resolved) messageId = resolved.messageId;
    }
    if (!messageId) {
      const resolved = resolveShortId(db, replyId);
      if (resolved) messageId = resolved.messageId;
    }
    if (!messageId) {
      console.error(`Unknown email ID: ${replyId}\nRun 'cmail list' first, then use an ID from the output.`);
      process.exit(1);
    }

    const { createReplyDraft } = await import("./lib/gmail.ts");
    const result = await createReplyDraft({
      messageId,
      body,
      cc: cc ? cc.split(",").map((s) => s.trim()) : undefined,
      bcc: bcc ? bcc.split(",").map((s) => s.trim()) : undefined,
    });
    console.log(`Draft created (reply) — id: ${result.id}`);
  } else {
    // New draft mode
    if (!to) {
      console.error("--to is required for new drafts.");
      process.exit(1);
    }
    if (!subject) {
      console.error("--subject is required for new drafts.");
      process.exit(1);
    }

    const { createDraft } = await import("./lib/gmail.ts");
    const result = await createDraft({
      to: to.split(",").map((s) => s.trim()),
      cc: cc ? cc.split(",").map((s) => s.trim()) : undefined,
      bcc: bcc ? bcc.split(",").map((s) => s.trim()) : undefined,
      subject,
      body,
    });
    console.log(`Draft created — id: ${result.id}`);
  }
}

async function send() {
  const flagArgs = args.slice(1);
  let to: string | undefined;
  let cc: string | undefined;
  let bcc: string | undefined;
  let subject: string | undefined;
  let body: string | undefined;
  let replyId: string | undefined;

  for (let i = 0; i < flagArgs.length; i++) {
    if (flagArgs[i] === "--to" && flagArgs[i + 1]) {
      to = flagArgs[i + 1]!;
      i++;
    } else if (flagArgs[i] === "--cc" && flagArgs[i + 1]) {
      cc = flagArgs[i + 1]!;
      i++;
    } else if (flagArgs[i] === "--bcc" && flagArgs[i + 1]) {
      bcc = flagArgs[i + 1]!;
      i++;
    } else if ((flagArgs[i] === "-s" || flagArgs[i] === "--subject") && flagArgs[i + 1]) {
      subject = flagArgs[i + 1]!;
      i++;
    } else if ((flagArgs[i] === "-b" || flagArgs[i] === "--body") && flagArgs[i + 1]) {
      body = flagArgs[i + 1]!;
      i++;
    } else if ((flagArgs[i] === "-r" || flagArgs[i] === "--reply") && flagArgs[i + 1]) {
      replyId = flagArgs[i + 1]!;
      i++;
    }
  }

  // Read body from stdin if not provided via flag and stdin is piped
  if (!body && !process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    body = Buffer.concat(chunks).toString("utf-8").trim();
  }

  if (!body) {
    console.error("Body is required. Use --body or pipe via stdin.");
    process.exit(1);
  }

  if (replyId) {
    // Reply mode — resolve short ID
    let messageId: string | null = null;
    const n = parseInt(replyId, 10);
    const isPureNumber = !isNaN(n) && String(n) === replyId;

    const db = getDb();

    if (isPureNumber) {
      const resolved = resolveShortId(db, `#${replyId}`);
      if (resolved) messageId = resolved.messageId;
    }
    if (!messageId) {
      const resolved = resolveShortId(db, replyId);
      if (resolved) messageId = resolved.messageId;
    }
    if (!messageId) {
      console.error(`Unknown email ID: ${replyId}\nRun 'cmail list' first, then use an ID from the output.`);
      process.exit(1);
    }

    const { sendReply } = await import("./lib/gmail.ts");
    const result = await sendReply({
      messageId,
      body,
      cc: cc ? cc.split(",").map((s) => s.trim()) : undefined,
      bcc: bcc ? bcc.split(",").map((s) => s.trim()) : undefined,
    });
    console.log(`Sent (reply) — id: ${result.messageId}`);
  } else {
    // New message mode
    if (!to) {
      console.error("--to is required for new messages.");
      process.exit(1);
    }
    if (!subject) {
      console.error("--subject is required for new messages.");
      process.exit(1);
    }

    const { sendMessage } = await import("./lib/gmail.ts");
    const result = await sendMessage({
      to: to.split(",").map((s) => s.trim()),
      cc: cc ? cc.split(",").map((s) => s.trim()) : undefined,
      bcc: bcc ? bcc.split(",").map((s) => s.trim()) : undefined,
      subject,
      body,
    });
    console.log(`Sent — id: ${result.messageId}`);
  }
}

function usage() {
  console.log(`cmail - Gmail in your terminal

Usage:
  cmail                         List latest inbox (= cmail list)
  cmail list                    List latest inbox emails
  cmail list -n 10              Limit to 10 results
  cmail list --from alice       Filter by sender
  cmail list --to bob           Filter by recipient
  cmail list --primary          Primary tab only
  cmail list --promo            Promotions tab only
  cmail list --social           Social tab only
  cmail list --updates          Updates tab only
  cmail list --forums           Forums tab only
  cmail list --unread           Unread only
  cmail list --starred          Starred only
  cmail list -q "from:alice"     Gmail search query (local DB)
  cmail list -q "filename:pdf"   Unsupported queries fall back to API
  cmail search "query"          Search email bodies with highlighted matches
  cmail search "query" -n 10   Limit search results
  cmail search "query" --from x Filter search by sender
  cmail read <id>               Read email (use ID from list, or position #)
  cmail read <id> --thread      Read full conversation thread
  cmail read <id> --raw         Read original source
  cmail read <id> --thread -v   Thread with To/Cc details
  cmail download <id>           Download all attachments from email
  cmail download <id> --list    List attachments without downloading
  cmail download <id> -i 2      Download only the 2nd attachment
  cmail download <id> -o ~/Downloads  Save to specific directory
  cmail tag <id> <label>          Add a label to an email
  cmail tag <id> +Label -Label   Add and remove labels
  cmail count                    Count inbox emails
  cmail count --unread           Count unread inbox emails
  cmail count --starred          Count starred emails
  cmail count --all              Count all synced emails
  cmail count -q "from:alice"    Count matching a query
  cmail tags list                List all labels
  cmail tags create <name>       Create a new label
  cmail send --to a@b.com --subject "Hi" --body "Hello"
                                  Send a new email
  cmail send --reply 3 --body "Thanks!"
                                  Reply to message #3
  echo "body" | cmail send --to a@b.com -s "Subject"
                                  Send with body from stdin
  cmail draft --to a@b.com --subject "Hi" --body "Hello"
                                  Create a new draft
  cmail draft --reply 3 --body "Thanks!"
                                  Reply draft to message #3
  echo "body" | cmail draft --to a@b.com -s "Subject"
                                  Draft with body from stdin
  cmail sync                    Sync mailbox (incremental)
  cmail sync --full             Force full re-sync
  cmail sync --since 2y         Set sync scope (3m, 6m, 1y, 2y, all)
  cmail auth                    Authenticate with Gmail

Options:
  -p, --plain                   Strip ANSI colors (plain text output)`);
}

function formatError(err: unknown): { message: string; hint?: string } {
  const msg = err instanceof Error ? err.message : String(err);
  const status = (err as any)?.status ?? (err as any)?.code;

  // OAuth token expired/revoked
  if (msg === "invalid_grant" || msg.includes("invalid_grant")) {
    return {
      message: "Your Gmail session has expired.",
      hint: "Run 'cmail auth' to re-authenticate.",
    };
  }

  // Not authenticated at all
  if (msg === "Not authenticated" || msg.includes("Not authenticated")) {
    return {
      message: "Not authenticated with Gmail.",
      hint: "Run 'cmail auth' to get started.",
    };
  }

  // Missing credentials file
  if (msg.includes("Client credentials not found")) {
    return {
      message: "OAuth credentials not configured.",
      hint: "Download your OAuth 2.0 credentials from Google Cloud Console\nand save them to ~/.config/gmail-skill/client-credentials.json",
    };
  }

  // Network errors
  if (msg.includes("ENOTFOUND") || msg.includes("ENETUNREACH") || msg.includes("EAI_AGAIN") || msg.includes("fetch failed")) {
    return {
      message: "Network error — couldn't reach Gmail.",
      hint: "Check your internet connection and try again.",
    };
  }

  // Rate limiting
  if (status === 429) {
    return {
      message: "Too many requests — Gmail rate limit hit.",
      hint: "Wait a minute and try again.",
    };
  }

  // Forbidden
  if (status === 403) {
    return {
      message: "Access denied by Gmail.",
      hint: "You may need to re-authenticate: run 'cmail auth'.",
    };
  }

  // Generic — just show the message, not the stack
  return { message: msg };
}

try {
  switch (command) {
    case "auth":
      await auth();
      break;
    case "sync":
      await sync();
      break;
    case "list":
      await list();
      break;
    case "read":
      await read();
      break;
    case "download":
      await download();
      break;
    case "search":
      await search();
      break;
    case "tag":
      await tag();
      break;
    case "count":
      await count();
      break;
    case "send":
      await send();
      break;
    case "draft":
      await draft();
      break;
    case "tags":
      await tags();
      break;
    case undefined:
      await list();
      break;
    case "help":
    case "--help":
    case "-h":
      usage();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      usage();
      process.exit(1);
  }
} catch (err) {
  const { message, hint } = formatError(err);
  console.error(`Error: ${message}`);
  if (hint) console.error(hint);
  process.exit(1);
}
