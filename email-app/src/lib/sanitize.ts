/**
 * HTML sanitization utilities for safe email content rendering
 */

import DOMPurify from "dompurify";

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
 * Preserves line breaks and makes URLs clickable
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

  // Convert line breaks to <br> tags
  const withBreaks = withLinks.replace(/\n/g, "<br>");

  return withBreaks;
}
