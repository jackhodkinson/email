/**
 * Email rendering pipeline.
 *
 * 1. Parse HTML into a DOM with DOMParser.
 * 2. Rewrite cid: image URLs to /api/inline/... so inline images load.
 * 3. Detect & isolate quoted/forwarded content (returns the boundary node).
 * 4. Strip / placeholder remote images unless trusted.
 * 5. Sanitize with DOMPurify (iframe-permissive policy).
 * 6. Detect whether the email defines its own background — used to pick
 *    a light vs dark shell.
 */

import DOMPurify from "isomorphic-dompurify";

export interface InlinePart {
  attachmentId: string;
  contentId: string | null;
  filename: string;
  mimeType: string;
}

export interface RenderOptions {
  emailId: string;
  inlineParts: InlinePart[];
  /** When true, do not strip remote <img> / background-image. */
  showRemoteImages: boolean;
}

export interface RenderResult {
  /** HTML for the main body (above the quote boundary). */
  mainHtml: string;
  /** HTML for the quoted/forwarded tail, or null. */
  quotedHtml: string | null;
  /** Concatenated <style> tag bodies extracted from <head>. */
  styles: string;
  /** True if any remote image was stripped (so the UI shows the banner). */
  blockedRemoteImages: boolean;
  /** True if the email defines its own visible background colour. */
  hasOwnBackground: boolean;
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

export function renderHtmlEmail(
  rawHtml: string,
  options: RenderOptions,
): RenderResult {
  // SSR safety — return raw HTML; the client will re-run on hydrate.
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return {
      mainHtml: rawHtml,
      quotedHtml: null,
      styles: extractStyleBlocks(rawHtml),
      blockedRemoteImages: false,
      hasOwnBackground: false,
    };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(
    rawHtml.includes("<html") ? rawHtml : `<html><body>${rawHtml}</body></html>`,
    "text/html",
  );

  const styles = collectStyles(doc);
  rewriteCidUrls(doc, options);
  const hasOwnBackground = detectOwnBackground(doc);
  const blockedRemoteImages = options.showRemoteImages
    ? false
    : blockRemoteImages(doc);
  linkifyTextNodes(doc);
  retargetLinks(doc);
  const { quotedHtml } = extractQuotedRegion(doc);

  const mainHtml = sanitizeForIframe(doc.body.innerHTML);
  return {
    mainHtml,
    quotedHtml: quotedHtml ? sanitizeForIframe(quotedHtml) : null,
    styles,
    blockedRemoteImages,
    hasOwnBackground,
  };
}

export function renderPlainTextEmail(text: string): RenderResult {
  const { main, quoted } = splitPlainTextQuote(text);
  return {
    mainHtml: sanitizeForIframe(plainToHtml(main)),
    quotedHtml: quoted ? sanitizeForIframe(plainToHtml(quoted)) : null,
    styles: "",
    blockedRemoteImages: false,
    hasOwnBackground: false,
  };
}

// ---------------------------------------------------------------------------
// DOMPurify sanitization (permissive — iframe sandbox is the security boundary)
// ---------------------------------------------------------------------------

export function sanitizeForIframe(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["style"],
    ADD_ATTR: [
      "bgcolor",
      "background",
      "align",
      "valign",
      "cellpadding",
      "cellspacing",
      "border",
      "target",
      "data-blocked-src",
      "open",
    ],
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "meta", "link"],
    FORBID_ATTR: ["srcset"],
    ALLOW_DATA_ATTR: false,
  });
}

// ---------------------------------------------------------------------------
// <style> extraction
// ---------------------------------------------------------------------------

function collectStyles(doc: Document): string {
  const styles: string[] = [];
  for (const node of doc.querySelectorAll("style")) {
    styles.push(node.textContent || "");
  }
  // Leave the inline ones in place (some emails put <style> inside <body>);
  // duplicate-load is harmless.
  return styles.join("\n");
}

function extractStyleBlocks(html: string): string {
  const out: string[] = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m[1]);
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// CID rewriting
// ---------------------------------------------------------------------------

function rewriteCidUrls(doc: Document, options: RenderOptions): void {
  const byContentId = new Map<string, InlinePart>();
  for (const p of options.inlineParts) {
    if (p.contentId) byContentId.set(p.contentId.toLowerCase(), p);
  }

  for (const img of Array.from(doc.querySelectorAll("img"))) {
    const src = img.getAttribute("src") || "";
    if (!src.toLowerCase().startsWith("cid:")) continue;
    const cid = src.slice(4).trim().toLowerCase();
    const part = byContentId.get(cid);
    if (part) {
      img.setAttribute(
        "src",
        `/api/inline/${encodeURIComponent(options.emailId)}/${encodeURIComponent(part.attachmentId)}`,
      );
      img.setAttribute("loading", "lazy");
    } else {
      // Unknown CID — swap to a transparent pixel so we don't get a broken icon.
      img.setAttribute("src", TRANSPARENT_PIXEL);
      img.setAttribute("data-missing-cid", cid);
    }
  }
}

const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

// ---------------------------------------------------------------------------
// Remote image blocking
// ---------------------------------------------------------------------------

function blockRemoteImages(doc: Document): boolean {
  let blocked = false;
  for (const img of Array.from(doc.querySelectorAll("img"))) {
    const src = img.getAttribute("src") || "";
    if (!src) continue;
    if (
      src.startsWith("data:") ||
      src.startsWith("/api/inline/") ||
      src.startsWith("cid:")
    ) {
      continue;
    }
    if (/^https?:/i.test(src)) {
      img.setAttribute("data-blocked-src", src);
      img.setAttribute("src", TRANSPARENT_PIXEL);
      img.setAttribute("alt", img.getAttribute("alt") || "");
      blocked = true;
    }
  }
  // Strip background-image: url(http...) from inline style attrs.
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>("[style]"))) {
    const style = el.getAttribute("style") || "";
    if (/background(-image)?\s*:\s*url\(\s*['\"]?https?:/i.test(style)) {
      const cleaned = style.replace(
        /background(-image)?\s*:\s*url\([^)]+\)\s*;?/gi,
        "",
      );
      el.setAttribute("style", cleaned);
      blocked = true;
    }
  }
  return blocked;
}

// ---------------------------------------------------------------------------
// Link retargeting
// ---------------------------------------------------------------------------

// Gmail (and most modern clients) auto-link bare URLs/emails even inside HTML
// emails. Walk text nodes and wrap matches in <a>, skipping anything already
// inside an <a>, <code>, <pre>, <style>, <script>, or <textarea>.
const LINKIFY_RE =
  /(\bhttps?:\/\/[^\s<>"'`)]+[^\s<>"'`).,;:!?])|(\bwww\.[^\s<>"'`)]+[^\s<>"'`).,;:!?])|([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
const LINKIFY_SKIP = new Set([
  "A",
  "CODE",
  "PRE",
  "STYLE",
  "SCRIPT",
  "TEXTAREA",
  "HEAD",
  "TITLE",
]);

function linkifyTextNodes(doc: Document): void {
  const body = doc.body;
  if (!body) return;
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let p: Node | null = node.parentNode;
      while (p && p.nodeType === 1) {
        if (LINKIFY_SKIP.has((p as Element).tagName)) return NodeFilter.FILTER_REJECT;
        p = p.parentNode;
      }
      return LINKIFY_RE.test(node.nodeValue || "")
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const targets: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    targets.push(current as Text);
    current = walker.nextNode();
  }

  for (const node of targets) {
    const text = node.nodeValue || "";
    LINKIFY_RE.lastIndex = 0;
    const frag = doc.createDocumentFragment();
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = LINKIFY_RE.exec(text))) {
      const match = m[0];
      const start = m.index;
      if (start > last) frag.appendChild(doc.createTextNode(text.slice(last, start)));
      const a = doc.createElement("a");
      const isEmail = !!m[3];
      const isWww = !!m[2];
      a.href = isEmail ? `mailto:${match}` : isWww ? `https://${match}` : match;
      a.textContent = match;
      frag.appendChild(a);
      last = start + match.length;
    }
    if (last < text.length) frag.appendChild(doc.createTextNode(text.slice(last)));
    node.parentNode?.replaceChild(frag, node);
  }
}

function retargetLinks(doc: Document): void {
  for (const a of Array.from(doc.querySelectorAll("a"))) {
    const href = a.getAttribute("href") || "";
    if (!href || href.startsWith("#")) continue;
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
  }
}

// ---------------------------------------------------------------------------
// Own-background detection
// ---------------------------------------------------------------------------

function detectOwnBackground(doc: Document): boolean {
  const body = doc.body;
  if (!body) return false;
  const bg = (body.getAttribute("bgcolor") || "").trim();
  if (bg && bg.toLowerCase() !== "transparent") return true;
  const style = body.getAttribute("style") || "";
  if (/background(-color)?\s*:\s*[^;]+/i.test(style)) {
    if (!/transparent|inherit|none/i.test(style)) return true;
  }
  // If a top-level table sets bgcolor, the email is owning its bg.
  const firstTable = body.querySelector("table");
  if (firstTable) {
    const tbg = (firstTable.getAttribute("bgcolor") || "").trim();
    if (tbg && tbg.toLowerCase() !== "transparent") return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Quote / forwarded detection (DOM-based, walks from end of body)
// ---------------------------------------------------------------------------

const QUOTE_CLASSES = [
  "gmail_quote",
  "gmail_quote_container",
  "gmail_extra",
  "gmail_attr",
  "yahoo_quoted",
  "moz-cite-prefix",
  "protonmail_quote",
  "tutanota_quote",
  "mail-editor-reference-message",
  "OLK_SRC_BODY_SECTION",
];

const QUOTE_IDS = [
  "divRplyFwdMsg",
  "x_divRplyFwdMsg",
  "appendonsend",
  "reply-intro",
];

const ATTRIBUTION_RE =
  /^(On\s.+?\s(wrote|said):?|Le\s.+?\sa\s\u00e9crit\s?:?|El\s.+?\sescribi\u00f3\s?:?|Am\s.+?\sschrieb\s.+?:?|Begin forwarded message:|-+\s*Original Message\s*-+|-+\s*Forwarded message\s*-+|From:\s.+)\s*$/i;

function extractQuotedRegion(doc: Document): { quotedHtml: string | null } {
  const body = doc.body;
  if (!body) return { quotedHtml: null };

  // 1) class/id markers.
  for (const cls of QUOTE_CLASSES) {
    const el = body.querySelector(`.${cssEscape(cls)}`);
    if (el && nodeHasText(el, 20)) {
      return splitAt(body, el);
    }
  }
  for (const id of QUOTE_IDS) {
    const el = body.querySelector(`#${cssEscape(id)}`);
    if (el && nodeHasText(el, 20)) {
      return splitAt(body, el);
    }
  }

  // 2) div[type="cite"]
  const citeDiv = body.querySelector('div[type="cite"]');
  if (citeDiv && nodeHasText(citeDiv, 20)) return splitAt(body, citeDiv);

  // 3) Bottom-most blockquote that is not nested inside another blockquote
  //    and is preceded by either an attribution line or a horizontal-rule.
  const blockquotes = Array.from(body.querySelectorAll("blockquote"));
  for (let i = blockquotes.length - 1; i >= 0; i--) {
    const bq = blockquotes[i];
    if (bq.closest("blockquote") !== bq) continue;
    if (!nodeHasText(bq, 30)) continue;
    // Look at the boundary's preceding sibling chain for an attribution.
    const attribution = findAttributionBefore(bq);
    const target = attribution ?? bq;
    return splitAt(body, target);
  }

  // 4) Standalone attribution paragraph followed by significant content.
  const attributionEl = findStandaloneAttribution(body);
  if (attributionEl) return splitAt(body, attributionEl);

  return { quotedHtml: null };
}

function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
  return s.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}

function nodeHasText(el: Element, minChars: number): boolean {
  return (el.textContent || "").trim().length >= minChars;
}

function findAttributionBefore(el: Element): Element | null {
  let cursor: Element | null = el.previousElementSibling;
  // Walk backwards through up to 3 short siblings; attribution often gets
  // wrapped in <p> + <br> + Outlook-style nested div.
  for (let i = 0; cursor && i < 3; i++) {
    const text = (cursor.textContent || "").trim();
    if (text.length === 0) {
      cursor = cursor.previousElementSibling;
      continue;
    }
    if (ATTRIBUTION_RE.test(text) && text.length < 600) return cursor;
    return null;
  }
  return null;
}

function findStandaloneAttribution(body: Element): Element | null {
  const candidates = Array.from(body.querySelectorAll("p, div, span"));
  for (const el of candidates) {
    // Only consider “leaf” blocks — we don't want to chop off the entire body.
    if (el.children.length > 0 && el.querySelector("p, div, table")) continue;
    const text = (el.textContent || "").trim();
    if (text.length < 5 || text.length > 600) continue;
    if (!ATTRIBUTION_RE.test(text)) continue;
    // Must be reasonably far down: at least 60 chars of textual content before.
    const before = textBefore(el).trim();
    if (before.length < 30) continue;
    return el;
  }
  return null;
}

function textBefore(target: Element): string {
  const out: string[] = [];
  const walker = (target.ownerDocument || document).createTreeWalker(
    (target.ownerDocument || document).body,
    NodeFilter.SHOW_TEXT,
  );
  let node: Node | null = walker.nextNode();
  while (node) {
    if (target.contains(node)) break;
    out.push(node.nodeValue || "");
    node = walker.nextNode();
  }
  return out.join(" ");
}

/**
 * Slice the body's direct-child sequence at the deepest ancestor of `target`
 * that is a direct child of body, then return the trailing HTML as quoted.
 */
function splitAt(
  body: Element,
  target: Element,
): { quotedHtml: string | null } {
  // Walk up until we find the child of body containing the target.
  let child: Element | null = target;
  while (child && child.parentElement && child.parentElement !== body) {
    child = child.parentElement;
  }
  if (!child || child.parentElement !== body) {
    // Target is the body itself, or detached — fallback to outerHTML.
    const quoted = target.outerHTML;
    target.remove();
    return { quotedHtml: quoted };
  }

  // Collect from child onward.
  const quotedParts: string[] = [];
  let cursor: Element | null = child;
  const toRemove: Element[] = [];
  while (cursor) {
    quotedParts.push(cursor.outerHTML);
    toRemove.push(cursor);
    cursor = cursor.nextElementSibling;
  }
  for (const node of toRemove) node.remove();
  return { quotedHtml: quotedParts.join("") };
}

// ---------------------------------------------------------------------------
// Plain-text helpers
// ---------------------------------------------------------------------------

const PLAIN_QUOTE_HEADER = [
  /^On\s.+wrote:?\s*$/im,
  /^Le\s.+a\s\u00e9crit\s?:?\s*$/im,
  /^-{3,}\s*Original Message\s*-{3,}\s*$/im,
  /^-{3,}\s*Forwarded message\s*-{3,}\s*$/im,
  /^Begin forwarded message:\s*$/im,
  /^From:\s.+\n(Sent|Date):\s.+\n(To|Cc):\s.+\n(Subject|Re):\s.+$/im,
];

export function splitPlainTextQuote(text: string): {
  main: string;
  quoted: string | null;
} {
  let earliest = -1;
  for (const re of PLAIN_QUOTE_HEADER) {
    const m = text.match(re);
    if (m && m.index !== undefined && (earliest === -1 || m.index < earliest)) {
      earliest = m.index;
    }
  }

  // Detect ">" prefixed runs.
  const lines = text.split("\n");
  let runStart = -1;
  let runLen = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith(">")) {
      if (runStart === -1) runStart = i;
      runLen++;
    } else if (lines[i].trim().length > 0) {
      if (runLen >= 3) break;
      runStart = -1;
      runLen = 0;
    }
  }
  let runOffset = -1;
  if (runStart !== -1 && runLen >= 3) {
    runOffset = lines.slice(0, runStart).join("\n").length;
    if (runOffset > 0) runOffset += 1; // for the trailing \n
  }

  let split = -1;
  if (earliest !== -1) split = earliest;
  if (runOffset !== -1 && (split === -1 || runOffset < split)) split = runOffset;

  if (split === -1) return { main: text, quoted: null };
  const before = text.slice(0, split).trim();
  if (before.length < 10) return { main: text, quoted: null };
  return { main: before, quoted: text.slice(split) };
}

export function plainToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const withLinks = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
  );

  const paragraphs = withLinks
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return paragraphs || `<p>${withLinks}</p>`;
}
