// Gmail query syntax → SQL WHERE clause translator

export interface ParsedQuery {
  whereClauses: string[];
  params: any[];
  canRunLocally: boolean;
}

// ─── Tokenizer ────────────────────────────────────────────────────────

interface Term {
  operator?: string;
  value: string;
  negated: boolean;
}

type Token = { type: "term"; term: Term } | { type: "or" };

function tokenize(query: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < query.length) {
    // Skip whitespace
    while (pos < query.length && query[pos] === " ") pos++;
    if (pos >= query.length) break;

    // Check for OR keyword
    if (
      query[pos] === "O" &&
      query[pos + 1] === "R" &&
      (pos + 2 >= query.length || query[pos + 2] === " ")
    ) {
      tokens.push({ type: "or" });
      pos += 2;
      continue;
    }

    // Negation prefix
    let negated = false;
    if (query[pos] === "-" && pos + 1 < query.length && query[pos + 1] !== " ") {
      negated = true;
      pos++;
    }

    // Bare quoted phrase: "hello world"
    if (query[pos] === '"') {
      pos++;
      let end = query.indexOf('"', pos);
      if (end === -1) end = query.length;
      const value = query.slice(pos, end);
      pos = end + 1;
      tokens.push({ type: "term", term: { value, negated } });
      continue;
    }

    // Read word — but handle operator:"quoted value"
    let word = "";
    while (pos < query.length && query[pos] !== " ") {
      if (query[pos] === '"') {
        // Read quoted section inline (e.g., subject:"hello world")
        pos++;
        let end = query.indexOf('"', pos);
        if (end === -1) end = query.length;
        word += query.slice(pos, end);
        pos = end + 1;
        continue;
      }
      word += query[pos];
      pos++;
    }

    // Split on first colon for operator:value
    const colonIdx = word.indexOf(":");
    if (colonIdx > 0) {
      const operator = word.slice(0, colonIdx).toLowerCase();
      const value = word.slice(colonIdx + 1);
      tokens.push({ type: "term", term: { operator, value, negated } });
    } else {
      tokens.push({ type: "term", term: { value: word, negated } });
    }
  }

  return tokens;
}

// ─── Operator → SQL ──────────────────────────────────────────────────

const UNSUPPORTED_OPERATORS = new Set([
  "filename", "has:drive", "has:youtube", "has:document",
  "has:spreadsheet", "has:presentation", "category",
  "deliveredto", "rfc822msgid", "list",
]);

const IN_LABEL_MAP: Record<string, string | null> = {
  inbox: "INBOX",
  sent: "SENT",
  starred: "STARRED",
  draft: "DRAFT",
  drafts: "DRAFT",
  spam: "SPAM",
  trash: "TRASH",
  anywhere: null,
};

interface SqlFragment {
  clause: string;
  params: any[];
}

function parseDateToEpochMs(dateStr: string): number | null {
  // Gmail uses YYYY/MM/DD
  const match = dateStr.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;
  const d = new Date(
    parseInt(match[1]!, 10),
    parseInt(match[2]!, 10) - 1,
    parseInt(match[3]!, 10)
  );
  if (isNaN(d.getTime())) return null;
  return d.getTime();
}

function parseRelativeDate(spec: string): number | null {
  const match = spec.match(/^(\d+)([dmy])$/);
  if (!match) return null;
  const amount = parseInt(match[1]!, 10);
  const unit = match[2]!;
  const date = new Date();
  switch (unit) {
    case "d": date.setDate(date.getDate() - amount); break;
    case "m": date.setMonth(date.getMonth() - amount); break;
    case "y": date.setFullYear(date.getFullYear() - amount); break;
  }
  return date.getTime();
}

function parseSize(sizeStr: string): number | null {
  const match = sizeStr.match(/^(\d+)([KMG]?)$/i);
  if (!match) return null;
  const num = parseInt(match[1]!, 10);
  switch ((match[2] || "").toUpperCase()) {
    case "K": return num * 1024;
    case "M": return num * 1024 * 1024;
    case "G": return num * 1024 * 1024 * 1024;
    case "": return num;
    default: return null;
  }
}

function labelExistsClause(negated: boolean): string {
  const not = negated ? "NOT " : "";
  return `${not}EXISTS (SELECT 1 FROM message_labels ml2 WHERE ml2.message_id = m.message_id AND ml2.label_id = ?)`;
}

function labelNameExistsClause(negated: boolean): string {
  const not = negated ? "NOT " : "";
  return `${not}EXISTS (SELECT 1 FROM message_labels ml2 JOIN labels l2 ON ml2.label_id = l2.label_id WHERE ml2.message_id = m.message_id AND (ml2.label_id = ? OR LOWER(l2.name) = LOWER(?)))`;
}

function termToSql(term: Term): SqlFragment | null {
  const { operator: op, value, negated } = term;
  const not = negated ? "NOT " : "";

  if (!op) {
    // Bare word or quoted phrase → search subject, snippet, and body
    return {
      clause: `${not}(m.subject LIKE ? OR m.snippet LIKE ? OR EXISTS (SELECT 1 FROM message_bodies mb WHERE mb.message_id = m.message_id AND mb.body_text LIKE ?))`,
      params: [`%${value}%`, `%${value}%`, `%${value}%`],
    };
  }

  // Check for known unsupported operators
  if (UNSUPPORTED_OPERATORS.has(op)) return null;

  switch (op) {
    case "from":
      return { clause: `${not}(m."from" LIKE ?)`, params: [`%${value}%`] };
    case "to":
      return { clause: `${not}(m."to" LIKE ?)`, params: [`%${value}%`] };
    case "cc":
      return { clause: `${not}(m.cc LIKE ?)`, params: [`%${value}%`] };
    case "subject":
      return { clause: `${not}(m.subject LIKE ?)`, params: [`%${value}%`] };

    case "after":
    case "newer": {
      const epoch = parseDateToEpochMs(value);
      if (!epoch) return null;
      return { clause: negated ? `m.internal_date < ?` : `m.internal_date >= ?`, params: [epoch] };
    }
    case "before":
    case "older": {
      const epoch = parseDateToEpochMs(value);
      if (!epoch) return null;
      return { clause: negated ? `m.internal_date >= ?` : `m.internal_date < ?`, params: [epoch] };
    }
    case "newer_than": {
      const epoch = parseRelativeDate(value);
      if (!epoch) return null;
      return { clause: negated ? `m.internal_date < ?` : `m.internal_date >= ?`, params: [epoch] };
    }
    case "older_than": {
      const epoch = parseRelativeDate(value);
      if (!epoch) return null;
      return { clause: negated ? `m.internal_date >= ?` : `m.internal_date < ?`, params: [epoch] };
    }

    case "is":
      switch (value.toLowerCase()) {
        case "unread":
          return { clause: labelExistsClause(negated).replace("?", "'UNREAD'"), params: [] };
        case "read":
          return { clause: labelExistsClause(!negated).replace("?", "'UNREAD'"), params: [] };
        case "starred":
          return { clause: labelExistsClause(negated).replace("?", "'STARRED'"), params: [] };
        default:
          return null;
      }

    case "has":
      if (value.toLowerCase() === "attachment") {
        return { clause: negated ? `m.attachment_count = 0` : `m.attachment_count > 0`, params: [] };
      }
      return null; // has:drive, has:youtube etc. unsupported

    case "label":
      return { clause: labelNameExistsClause(negated), params: [value.toUpperCase(), value] };

    case "in": {
      const mapped = IN_LABEL_MAP[value.toLowerCase()];
      if (mapped === undefined) return null; // unknown in: value
      if (mapped === null) return { clause: "1=1", params: [] }; // in:anywhere — no filter
      return { clause: labelExistsClause(negated), params: [mapped] };
    }

    case "larger": {
      const bytes = parseSize(value);
      if (bytes === null) return null;
      return { clause: negated ? `m.size_estimate <= ?` : `m.size_estimate > ?`, params: [bytes] };
    }
    case "smaller": {
      const bytes = parseSize(value);
      if (bytes === null) return null;
      return { clause: negated ? `m.size_estimate >= ?` : `m.size_estimate < ?`, params: [bytes] };
    }

    default:
      return null; // Unrecognized operator → can't run locally
  }
}

// ─── OR Grouping + SQL Assembly ──────────────────────────────────────

export function parseGmailQuery(query: string): ParsedQuery {
  const trimmed = query.trim();
  if (!trimmed) {
    return { whereClauses: [], params: [], canRunLocally: true };
  }

  const tokens = tokenize(trimmed);
  const andClauses: string[] = [];
  const allParams: any[] = [];
  let canRunLocally = true;

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i]!;
    if (token.type === "or") { i++; continue; } // stray OR

    const fragment = termToSql(token.term);
    if (!fragment) { canRunLocally = false; i++; continue; }

    // Check if followed by OR — build OR group
    if (i + 1 < tokens.length && tokens[i + 1]?.type === "or") {
      const orParts: SqlFragment[] = [fragment];
      i += 2; // skip past OR

      while (i < tokens.length) {
        const next = tokens[i]!;
        if (next.type !== "term") break;
        const nextFrag = termToSql(next.term);
        if (!nextFrag) { canRunLocally = false; break; }
        orParts.push(nextFrag);
        i++;
        // Another OR?
        if (i < tokens.length && tokens[i]?.type === "or") { i++; continue; }
        break;
      }

      andClauses.push("(" + orParts.map((p) => p.clause).join(" OR ") + ")");
      for (const p of orParts) allParams.push(...p.params);
    } else {
      andClauses.push(fragment.clause);
      allParams.push(...fragment.params);
      i++;
    }
  }

  return { whereClauses: andClauses, params: allParams, canRunLocally };
}
