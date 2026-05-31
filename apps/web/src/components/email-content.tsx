"use client";

import { useMemo, useRef, useEffect, useCallback, useState } from "react";
import { useObservable, useValue } from "@legendapp/state/react";
import {
  sanitizeForIframe,
  sanitizeHtml,
  plainTextToHtml,
} from "@/lib/sanitize";
import {
  processQuotedContent,
  processPlainTextQuotes,
} from "@/lib/quote-detection";
import { useTheme } from "@/lib/theme";
import { ChevronDown, ChevronRight } from "lucide-react";

interface EmailContentProps {
  bodyHtml: string | null;
  bodyText: string | null;
}

export function EmailContent({ bodyHtml, bodyText }: EmailContentProps) {
  if (bodyHtml) {
    return <HtmlEmailContent html={bodyHtml} />;
  }
  if (bodyText) {
    return <PlainTextEmailContent text={bodyText} />;
  }
  return (
    <div className="email-content">
      <p className="text-muted-foreground">(No content)</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HTML emails — rendered in a sandboxed iframe to preserve original styling
// ---------------------------------------------------------------------------

function HtmlEmailContent({ html }: { html: string }) {
  const showQuoted$ = useObservable(false);
  const showQuoted = useValue(showQuoted$);

  const prevHtmlRef = useRef(html);
  if (prevHtmlRef.current !== html) {
    showQuoted$.set(false);
    prevHtmlRef.current = html;
  }

  const processed = useMemo(() => {
    // Extract <style> tags before quote detection (which returns body.innerHTML,
    // losing any styles that were in <head>).
    const styleRegex = /<style[^>]*>[\s\S]*?<\/style>/gi;
    const styles = (html.match(styleRegex) || []).join("\n");

    const { mainContent, quotedContent, hasQuotedContent } =
      processQuotedContent(html);

    return { mainContent, quotedContent, hasQuotedContent, styles };
  }, [html]);

  return (
    <div className="email-content">
      <EmailIframe html={processed.mainContent} styles={processed.styles} />

      {processed.hasQuotedContent && processed.quotedContent && (
        <div className="mt-4">
          <button
            onClick={() => showQuoted$.set(!showQuoted$.get())}
            className="quote-toggle"
            type="button"
          >
            {showQuoted ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <span className="text-ellipsis">
              {showQuoted ? "Hide quoted text" : "Show quoted text"}
            </span>
          </button>

          {!showQuoted && (
            <div className="quote-collapsed">
              <span className="quote-collapsed__dots">...</span>
            </div>
          )}

          {showQuoted && (
            <div className="quote-expanded">
              <EmailIframe
                html={processed.quotedContent}
                styles={processed.styles}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plain text emails — rendered with prose typography
// ---------------------------------------------------------------------------

function PlainTextEmailContent({ text }: { text: string }) {
  const showQuoted$ = useObservable(false);
  const showQuoted = useValue(showQuoted$);

  const prevTextRef = useRef(text);
  if (prevTextRef.current !== text) {
    showQuoted$.set(false);
    prevTextRef.current = text;
  }

  const processed = useMemo(() => {
    const { mainContent, quotedContent, hasQuotedContent } =
      processPlainTextQuotes(text);
    return {
      mainHtml: sanitizeHtml(plainTextToHtml(mainContent)),
      quotedHtml: quotedContent
        ? sanitizeHtml(plainTextToHtml(quotedContent))
        : null,
      hasQuotedContent,
    };
  }, [text]);

  return (
    <div className="email-content">
      <div
        className="prose prose-sm max-w-none dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: processed.mainHtml }}
      />

      {processed.hasQuotedContent && processed.quotedHtml && (
        <div className="mt-4">
          <button
            onClick={() => showQuoted$.set(!showQuoted$.get())}
            className="quote-toggle"
            type="button"
          >
            {showQuoted ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <span className="text-ellipsis">
              {showQuoted ? "Hide quoted text" : "Show quoted text"}
            </span>
          </button>

          {!showQuoted && (
            <div className="quote-collapsed">
              <span className="quote-collapsed__dots">...</span>
            </div>
          )}

          {showQuoted && (
            <div className="quote-expanded">
              <div
                className="prose prose-sm max-w-none dark:prose-invert text-muted"
                dangerouslySetInnerHTML={{ __html: processed.quotedHtml }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sandboxed iframe for rendering HTML email content
// ---------------------------------------------------------------------------

function EmailIframe({ html, styles = "" }: { html: string; styles?: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === "dark";

  const srcdoc = useMemo(() => {
    const sanitized = sanitizeForIframe(html);
    const sanitizedStyles = styles ? sanitizeForIframe(styles) : "";
    return buildSrcdoc(sanitized, sanitizedStyles, isDark);
  }, [html, styles, isDark]);

  const handleLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    try {
      const doc = iframe.contentDocument;
      if (!doc?.body) return;

      // Retarget all links to open in new tab
      for (const a of doc.querySelectorAll("a")) {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
      }

      const measure = () => {
        if (!doc.body) return;
        const h = doc.documentElement.scrollHeight;
        if (h > 0) setHeight(h);
      };

      measure();

      // Watch for layout shifts (images loading, fonts, etc.)
      observerRef.current?.disconnect();
      const observer = new ResizeObserver(measure);
      observer.observe(doc.body);
      observerRef.current = observer;

      for (const img of doc.querySelectorAll("img")) {
        if (!img.complete) {
          img.addEventListener("load", measure);
          img.addEventListener("error", measure);
        }
      }
    } catch {
      // Shouldn't happen with allow-same-origin
      setHeight(300);
    }
  }, []);

  useEffect(() => {
    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcdoc}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      className="email-iframe"
      style={{ height: height > 0 ? `${height}px` : "150px" }}
      onLoad={handleLoad}
      title="Email content"
    />
  );
}

// ---------------------------------------------------------------------------
// Build a full HTML document for the iframe srcdoc
// ---------------------------------------------------------------------------

function buildSrcdoc(
  content: string,
  styles: string,
  isDark: boolean,
): string {
  const textColor = isDark ? "#e4e4e7" : "#1a1a1a";
  const linkColor = isDark ? "#60a5fa" : "#2563eb";

  // Base styles: lowest specificity so the email's own CSS wins
  const baseStyles = `<style>
html, body {
  margin: 0;
  padding: 0;
  background: transparent;
  color: ${textColor};
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 0.9375rem;
  line-height: 1.7;
  word-wrap: break-word;
  overflow-wrap: break-word;
}
a { color: ${linkColor}; }
img { max-width: 100%; height: auto; }
pre { white-space: pre-wrap; overflow-x: auto; }
body { overflow: hidden; }
</style>`;

  return [
    "<!DOCTYPE html>",
    '<html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    baseStyles,
    styles,
    "</head><body>",
    content,
    "</body></html>",
  ].join("");
}
