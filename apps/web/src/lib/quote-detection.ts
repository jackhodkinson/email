/**
 * Utilities for detecting and handling quoted content in email threads
 *
 * Email clients use various patterns to indicate quoted/forwarded content:
 * - HTML: <blockquote>, class="gmail_quote", class="yahoo_quoted", etc.
 * - Text: Lines starting with ">", "On [date], [name] wrote:", "-----Original Message-----"
 */

/**
 * Patterns that indicate the start of quoted content in plain text
 */
const QUOTE_HEADER_PATTERNS = [
  // "On Mon, Jan 1, 2024 at 10:00 AM John Doe <john@example.com> wrote:"
  /^On .+wrote:\s*$/im,
  // "-----Original Message-----"
  /^-{3,}\s*Original Message\s*-{3,}\s*$/im,
  // Gmail-style forwarded header
  /^-{3,}\s*Forwarded message\s*-{3,}\s*$/im,
  // Separator lines (underscores or dashes)
  /^_{10,}\s*$/m,
  // "From: ... Sent: ... To: ... Subject: ..." block (Outlook style)
  /^From:\s*.+\n(?:Sent|Date):\s*.+\n(?:To|Cc):\s*.+\n(?:Subject|Re):\s*.+$/im,
];

/**
 * CSS class names used by email clients to mark quoted content
 */
const QUOTE_CLASS_PATTERNS = [
  "gmail_quote",
  "gmail_extra",
  "gmail_attr", // Gmail attribution line
  "yahoo_quoted",
  "moz-cite-prefix", // Thunderbird
  "protonmail_quote",
  "tutanota_quote",
];

/**
 * IDs used by email clients for quoted content
 */
const QUOTE_ID_PATTERNS = [
  "divRplyFwdMsg", // Outlook
  "x_divRplyFwdMsg",
  "Signature", // Some clients
];

/**
 * Process HTML email content to wrap quoted sections in collapsible containers
 */
export function processQuotedContent(html: string): {
  mainContent: string;
  quotedContent: string | null;
  hasQuotedContent: boolean;
} {
  // DOMParser is not available on the server, return content unprocessed during SSR
  if (typeof window === "undefined") {
    return {
      mainContent: html,
      quotedContent: null,
      hasQuotedContent: false,
    };
  }

  // Create a temporary DOM to process the HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Find quoted content using various strategies
  const quotedElement = findQuotedElement(doc);

  if (quotedElement) {
    // Remove the quoted content from the main body
    const quotedHtml = quotedElement.outerHTML;
    quotedElement.remove();

    // Also remove any attribution line before the quote (e.g., "On ... wrote:")
    removeAttributionLines(doc);

    return {
      mainContent: doc.body.innerHTML,
      quotedContent: quotedHtml,
      hasQuotedContent: true,
    };
  }

  // Try text-based detection for plain-text-style emails
  const textBasedResult = detectTextBasedQuotes(doc);
  if (textBasedResult.hasQuotedContent) {
    return textBasedResult;
  }

  return {
    mainContent: html,
    quotedContent: null,
    hasQuotedContent: false,
  };
}

/**
 * Find the element containing quoted content in the DOM
 */
function findQuotedElement(doc: Document): Element | null {
  // Strategy 1: Look for blockquote elements (most common)
  const blockquotes = doc.querySelectorAll("blockquote");
  if (blockquotes.length > 0) {
    // Return the first top-level blockquote (not nested inside another blockquote)
    for (const bq of blockquotes) {
      if (!bq.closest("blockquote:not(:scope)")) {
        // Check if this blockquote has substantial content (not just styling)
        if (bq.textContent && bq.textContent.trim().length > 50) {
          return bq;
        }
      }
    }
    // If no substantial blockquote found, return the first one anyway
    return blockquotes[0];
  }

  // Strategy 2: Look for elements with quote-related class names
  for (const className of QUOTE_CLASS_PATTERNS) {
    const element = doc.querySelector(`.${className}`);
    if (element) {
      return element;
    }
  }

  // Strategy 3: Look for elements with quote-related IDs
  for (const id of QUOTE_ID_PATTERNS) {
    const element = doc.getElementById(id);
    if (element) {
      return element;
    }
  }

  // Strategy 4: Look for div with type="cite" (some clients)
  const citeDiv = doc.querySelector('div[type="cite"]');
  if (citeDiv) {
    return citeDiv;
  }

  return null;
}

/**
 * Remove attribution lines like "On Mon, Jan 1, 2024, John wrote:"
 * These often appear just before the quoted content
 */
function removeAttributionLines(doc: Document): void {
  // Look for elements containing attribution text
  const allElements = doc.body.querySelectorAll("div, p, span");

  for (const el of allElements) {
    const text = el.textContent?.trim() || "";

    // Check if this looks like an attribution line
    if (
      /^On .+ wrote:?\s*$/i.test(text) ||
      /^-{3,}\s*(Original|Forwarded)\s+Message\s*-{3,}\s*$/i.test(text)
    ) {
      // Only remove if it's near the end and relatively short
      if (text.length < 500) {
        el.remove();
      }
    }
  }
}

/**
 * Detect quotes in emails that use plain text conventions (> prefix)
 * or text-based headers within HTML
 */
function detectTextBasedQuotes(doc: Document): {
  mainContent: string;
  quotedContent: string | null;
  hasQuotedContent: boolean;
} {
  const html = doc.body.innerHTML;

  // Look for text-based quote headers
  for (const pattern of QUOTE_HEADER_PATTERNS) {
    const match = html.match(pattern);
    if (match && match.index !== undefined) {
      // Find the position in the HTML
      const splitIndex = match.index;

      // Make sure we're not splitting in the middle of important content
      // (the quote header should be reasonably far into the email)
      const textBefore = html.substring(0, splitIndex);
      if (textBefore.replace(/<[^>]*>/g, "").trim().length > 20) {
        return {
          mainContent: html.substring(0, splitIndex),
          quotedContent: html.substring(splitIndex),
          hasQuotedContent: true,
        };
      }
    }
  }

  // Check for > prefixed lines (plain text quoting in HTML)
  // Look for multiple consecutive lines starting with >
  const lines = html.split(/<br\s*\/?>/i);
  let quoteStartIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i].replace(/<[^>]*>/g, "").trim();
    if (lineText.startsWith(">") || lineText.startsWith("&gt;")) {
      if (quoteStartIndex === -1) {
        quoteStartIndex = i;
      }
    } else if (quoteStartIndex !== -1 && lineText.length > 0) {
      // Non-quoted line after quoted content - check if we have enough quoted lines
      if (i - quoteStartIndex >= 3) {
        // At least 3 quoted lines
        break;
      }
      quoteStartIndex = -1; // Reset if not enough quoted lines
    }
  }

  if (quoteStartIndex !== -1 && lines.length - quoteStartIndex >= 3) {
    const mainLines = lines.slice(0, quoteStartIndex);
    const quotedLines = lines.slice(quoteStartIndex);

    return {
      mainContent: mainLines.join("<br>"),
      quotedContent: quotedLines.join("<br>"),
      hasQuotedContent: true,
    };
  }

  return {
    mainContent: html,
    quotedContent: null,
    hasQuotedContent: false,
  };
}

/**
 * Process plain text email content to detect quoted sections
 */
export function processPlainTextQuotes(text: string): {
  mainContent: string;
  quotedContent: string | null;
  hasQuotedContent: boolean;
} {
  // Check for quote header patterns
  for (const pattern of QUOTE_HEADER_PATTERNS) {
    const match = text.match(pattern);
    if (match && match.index !== undefined) {
      const textBefore = text.substring(0, match.index).trim();
      if (textBefore.length > 20) {
        return {
          mainContent: textBefore,
          quotedContent: text.substring(match.index),
          hasQuotedContent: true,
        };
      }
    }
  }

  // Check for > prefixed lines
  const lines = text.split("\n");
  let quoteStartIndex = -1;
  let consecutiveQuotedLines = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith(">")) {
      if (quoteStartIndex === -1) {
        quoteStartIndex = i;
      }
      consecutiveQuotedLines++;
    } else if (line.length > 0) {
      if (consecutiveQuotedLines >= 3) {
        // Found a substantial quote block
        break;
      }
      quoteStartIndex = -1;
      consecutiveQuotedLines = 0;
    }
  }

  if (quoteStartIndex !== -1 && consecutiveQuotedLines >= 3) {
    const mainLines = lines.slice(0, quoteStartIndex);
    const quotedLines = lines.slice(quoteStartIndex);

    // Check if there's meaningful content before the quote
    const mainText = mainLines.join("\n").trim();
    if (mainText.length > 20) {
      return {
        mainContent: mainText,
        quotedContent: quotedLines.join("\n"),
        hasQuotedContent: true,
      };
    }
  }

  return {
    mainContent: text,
    quotedContent: null,
    hasQuotedContent: false,
  };
}
