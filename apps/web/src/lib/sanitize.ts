/**
 * HTML sanitization utilities for safe email content rendering
 */

import DOMPurify from "isomorphic-dompurify";

/**
 * Split HTML on paragraph boundaries (double <br> or double newline) and wrap each
 * segment in <p> so paragraph spacing applies. Use before sanitize when rendering
 * email HTML that uses <br> or newlines for paragraphs.
 */
export function normalizeHtmlParagraphs(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return trimmed;
  // Paragraph break = two or more <br> (with optional whitespace) OR two or more newlines
  const paraBreak =
    /(?:<br\s*\/?>)\s*(?:(?:<br\s*\/?>)\s*)*|\n\s*\n+/g;
  const segments = trimmed
    .split(paraBreak)
    .map((s) => s.trim().replace(/\n/g, "<br>"))
    .filter(Boolean);
  if (segments.length <= 1) return trimmed;
  return segments.map((block) => `<p>${block}</p>`).join("");
}

/**
 * Sanitize HTML for rendering inside a sandboxed iframe.
 * Much more permissive than sanitizeHtml — keeps <style> tags, table attributes,
 * and all visual markup so the email renders as the sender intended.
 * Security is enforced by the iframe sandbox (no allow-scripts).
 */
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
    ],
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form"],
    ALLOW_DATA_ATTR: false,
  });
}

/**
 * Sanitize HTML content to prevent XSS attacks
 * Allows common email formatting tags while stripping potentially dangerous content
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "b",
      "i",
      "u",
      "strong",
      "em",
      "a",
      "img",
      "div",
      "span",
      "table",
      "thead",
      "tbody",
      "tr",
      "td",
      "th",
      "ul",
      "ol",
      "li",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "blockquote",
      "pre",
      "code",
      "hr",
      "font",
      "center",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "style", "class", "width", "height", "target", "color", "size", "face"],
    ALLOW_DATA_ATTR: false,
    // Force links to open in new tab for security
    ADD_ATTR: ["target"],
  });
}

/**
 * Convert plain text to HTML with basic formatting
 * Each line becomes a <p> element, blank lines produce extra spacing.
 * Makes URLs clickable.
 */
export function plainTextToHtml(text: string): string {
  // Escape HTML entities
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  // Convert URLs to links
  const withLinks = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  // Each line becomes its own <p>; blank lines are skipped (the gap from
  // adjacent <p> margins provides the visual separation).
  const lines = withLinks.split(/\n/);
  const wrapped = lines
    .map((line) => {
      const trimmed = line.trim();
      return trimmed ? `<p>${trimmed}</p>` : "";
    })
    .filter(Boolean)
    .join("");

  return wrapped || "<p></p>";
}
