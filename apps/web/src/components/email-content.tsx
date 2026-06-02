"use client";

import { useMemo, useRef, useEffect, useCallback, useState } from "react";
import { useObservable, useValue } from "@legendapp/state/react";
import { ChevronDown, ChevronRight, Image as ImageIcon } from "lucide-react";
import {
  renderHtmlEmail,
  renderPlainTextEmail,
  type InlinePart,
  type RenderResult,
} from "@/lib/email-render";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface EmailContentProps {
  emailId: string;
  bodyHtml: string | null;
  bodyText: string | null;
  inlineParts?: InlinePart[];
}

export function EmailContent({
  emailId,
  bodyHtml,
  bodyText,
  inlineParts = [],
}: EmailContentProps) {
  if (bodyHtml) {
    return (
      <HtmlEmail emailId={emailId} html={bodyHtml} inlineParts={inlineParts} />
    );
  }
  if (bodyText) {
    return <PlainTextEmail text={bodyText} />;
  }
  return (
    <div className="email-content">
      <p className="text-muted-foreground">(No content)</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HTML email — sandboxed iframe
// ---------------------------------------------------------------------------

function HtmlEmail({
  emailId,
  html,
  inlineParts,
}: {
  emailId: string;
  html: string;
  inlineParts: InlinePart[];
}) {
  const showQuoted$ = useObservable(false);
  const showQuoted = useValue(showQuoted$);
  const showRemote$ = useObservable(false);
  const showRemoteImages = useValue(showRemote$);

  // Reset toggles when the source html changes.
  const prevHtmlRef = useRef(html);
  if (prevHtmlRef.current !== html) {
    showQuoted$.set(false);
    showRemote$.set(false);
    prevHtmlRef.current = html;
  }

  const rendered = useMemo<RenderResult>(
    () => renderHtmlEmail(html, { emailId, inlineParts, showRemoteImages }),
    [html, emailId, inlineParts, showRemoteImages],
  );

  return (
    <div className="email-content">
      {rendered.blockedRemoteImages && (
        <RemoteImageBanner onShow={() => showRemote$.set(true)} />
      )}

      <EmailIframe
        html={rendered.mainHtml}
        styles={rendered.styles}
        hasOwnBackground={rendered.hasOwnBackground}
      />

      {rendered.quotedHtml && (
        <div className="mt-3">
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
              <span className="quote-collapsed__dots">…</span>
            </div>
          )}
          {showQuoted && (
            <div className="quote-expanded">
              <EmailIframe
                html={rendered.quotedHtml}
                styles={rendered.styles}
                hasOwnBackground={rendered.hasOwnBackground}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plain-text email — same iframe pipeline, so typography matches
// ---------------------------------------------------------------------------

function PlainTextEmail({ text }: { text: string }) {
  const showQuoted$ = useObservable(false);
  const showQuoted = useValue(showQuoted$);

  const prevTextRef = useRef(text);
  if (prevTextRef.current !== text) {
    showQuoted$.set(false);
    prevTextRef.current = text;
  }

  const rendered = useMemo(() => renderPlainTextEmail(text), [text]);

  return (
    <div className="email-content">
      <EmailIframe
        html={rendered.mainHtml}
        styles={rendered.styles}
        hasOwnBackground={false}
      />
      {rendered.quotedHtml && (
        <div className="mt-3">
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
              <span className="quote-collapsed__dots">…</span>
            </div>
          )}
          {showQuoted && (
            <div className="quote-expanded">
              <EmailIframe
                html={rendered.quotedHtml}
                styles=""
                hasOwnBackground={false}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Remote-image banner
// ---------------------------------------------------------------------------

function RemoteImageBanner({ onShow }: { onShow: () => void }) {
  return (
    <div className="remote-images-banner" role="status">
      <ImageIcon className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1">Images are not displayed for your privacy.</span>
      <button type="button" className="remote-images-banner__action" onClick={onShow}>
        Show images
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sandboxed iframe
// ---------------------------------------------------------------------------

function EmailIframe({
  html,
  styles,
  hasOwnBackground,
}: {
  html: string;
  styles: string;
  hasOwnBackground: boolean;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [scale, setScale] = useState(1);
  const observerRef = useRef<ResizeObserver | null>(null);
  const cleanupListenersRef = useRef<Array<() => void>>([]);
  const { effectiveTheme } = useTheme();
  // Light shell when the email defines its own background, regardless of app theme.
  const useDark = !hasOwnBackground && effectiveTheme === "dark";

  const srcdoc = useMemo(
    () => buildSrcdoc(html, styles, useDark, hasOwnBackground),
    [html, styles, useDark, hasOwnBackground],
  );

  const measure = useCallback(() => {
    const iframe = iframeRef.current;
    const wrapper = wrapperRef.current;
    if (!iframe || !wrapper) return;
    const doc = iframe.contentDocument;
    if (!doc?.body) return;

    const contentWidth = doc.body.scrollWidth;
    const containerWidth = wrapper.clientWidth;
    let nextScale = 1;
    if (containerWidth > 0 && contentWidth > containerWidth + 1) {
      nextScale = Math.max(0.55, containerWidth / contentWidth);
    }
    setScale(nextScale);

    const h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
    if (h > 0) setHeight(Math.ceil(h * nextScale));
  }, []);

  const handleLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc?.body) return;

    // Cleanup previous listeners.
    cleanupListenersRef.current.forEach((fn) => fn());
    cleanupListenersRef.current = [];

    // Cap any width: 100% on the document so it can't exceed our container.
    doc.documentElement.style.width = "100%";

    measure();

    // Body resize observer.
    observerRef.current?.disconnect();
    const observer = new ResizeObserver(() => measure());
    observer.observe(doc.body);
    observerRef.current = observer;

    // Image load/error — re-measure.
    for (const img of Array.from(doc.querySelectorAll("img"))) {
      if (img.complete) continue;
      const onChange = () => measure();
      img.addEventListener("load", onChange);
      img.addEventListener("error", onChange);
      cleanupListenersRef.current.push(() => {
        img.removeEventListener("load", onChange);
        img.removeEventListener("error", onChange);
      });
    }

    // Fonts ready.
    const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts && typeof fonts.ready?.then === "function") {
      fonts.ready.then(() => measure()).catch(() => {});
    }
  }, [measure]);

  // Re-measure on container resize (so scale tracks the panel width).
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      cleanupListenersRef.current.forEach((fn) => fn());
      cleanupListenersRef.current = [];
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "email-iframe-wrapper",
        hasOwnBackground && "email-iframe-wrapper--own-bg",
      )}
      style={{
        height: height > 0 ? `${height}px` : "150px",
      }}
    >
      <iframe
        ref={iframeRef}
        srcDoc={srcdoc}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        className="email-iframe"
        style={{
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: "top left",
          width: scale !== 1 ? `${100 / scale}%` : "100%",
          height: scale !== 1 && height > 0 ? `${height / scale}px` : "100%",
        }}
        onLoad={handleLoad}
        title="Email content"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// srcdoc builder
// ---------------------------------------------------------------------------

function buildSrcdoc(
  content: string,
  styles: string,
  isDark: boolean,
  hasOwnBackground: boolean,
): string {
  const textColor = isDark ? "#e4e4e7" : "#1f2328";
  const linkColor = isDark ? "#60a5fa" : "#2563eb";
  // When the email defines its own background, the shell must be white so
  // hard-coded dark text on a white card stays readable in app dark mode.
  const bg = hasOwnBackground ? "#ffffff" : "transparent";
  const shellTextColor = hasOwnBackground ? "#1f2328" : textColor;

  const baseStyles = `<style>
html, body {
  margin: 0;
  padding: 0;
  background: ${bg};
  color: ${shellTextColor};
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 0.9375rem;
  line-height: 1.6;
  word-wrap: break-word;
  overflow-wrap: break-word;
}
body {
  /* leave horizontal scroll possible if needed but normally the wrapper scales */
  overflow-x: hidden;
}
a { color: ${linkColor}; }
img { max-width: 100%; height: auto; }
img[data-blocked-src] {
  background: ${isDark ? "#23272e" : "#f1f5f9"};
  border: 1px dashed ${isDark ? "#3f3f46" : "#cbd5e1"};
  border-radius: 4px;
  min-width: 32px;
  min-height: 32px;
  max-width: 100%;
  display: inline-block;
}
pre, code {
  white-space: pre-wrap;
  overflow-x: auto;
  word-break: break-word;
}
table { max-width: 100%; }
blockquote {
  margin: 0.5em 0;
  padding-left: 12px;
  border-left: 3px solid ${isDark ? "#3f3f46" : "#e2e8f0"};
  color: ${isDark ? "#a1a1aa" : "#475569"};
}
</style>`;

  return [
    "<!DOCTYPE html>",
    '<html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    baseStyles,
    styles ? `<style>${styles}</style>` : "",
    "</head><body>",
    content,
    "</body></html>",
  ].join("");
}
