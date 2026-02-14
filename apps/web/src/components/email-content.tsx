"use client";

import { useMemo, useRef } from "react";
import { useObservable, useValue } from "@legendapp/state/react";
import { sanitizeHtml, plainTextToHtml } from "@/lib/sanitize";
import {
  processQuotedContent,
  processPlainTextQuotes,
} from "@/lib/quote-detection";
import { ChevronDown, ChevronRight } from "lucide-react";

interface EmailContentProps {
  bodyHtml: string | null;
  bodyText: string | null;
}

export function EmailContent({ bodyHtml, bodyText }: EmailContentProps) {
  const showQuoted$ = useObservable(false);
  const showQuoted = useValue(showQuoted$);

  // Reset showQuoted when email content changes
  const prevContentRef = useRef({ bodyHtml, bodyText });
  if (
    prevContentRef.current.bodyHtml !== bodyHtml ||
    prevContentRef.current.bodyText !== bodyText
  ) {
    showQuoted$.set(false);
    prevContentRef.current = { bodyHtml, bodyText };
  }

  // Process content with useMemo to avoid double-render from useEffect + useState
  const processedContent = useMemo(() => {
    if (bodyHtml) {
      const { mainContent, quotedContent, hasQuotedContent } =
        processQuotedContent(bodyHtml);
      return {
        mainContent: sanitizeHtml(mainContent),
        quotedContent: quotedContent ? sanitizeHtml(quotedContent) : null,
        hasQuotedContent,
      };
    }

    if (bodyText) {
      const { mainContent, quotedContent, hasQuotedContent } =
        processPlainTextQuotes(bodyText);
      return {
        mainContent: sanitizeHtml(plainTextToHtml(mainContent)),
        quotedContent: quotedContent
          ? sanitizeHtml(plainTextToHtml(quotedContent))
          : null,
        hasQuotedContent,
      };
    }

    return {
      mainContent: "<p>(No content)</p>",
      quotedContent: null,
      hasQuotedContent: false,
    };
  }, [bodyHtml, bodyText]);

  const toggleQuoted = () => showQuoted$.set(!showQuoted$.get());

  return (
    <div className="email-content">
      {/* Main email content */}
      <div
        className="prose prose-sm max-w-none dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: processedContent.mainContent }}
      />

      {/* Quoted content toggle */}
      {processedContent.hasQuotedContent && processedContent.quotedContent && (
        <div className="mt-4">
          <button
            onClick={toggleQuoted}
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

          {/* Collapsed indicator (three dots) when hidden */}
          {!showQuoted && (
            <div className="quote-collapsed">
              <span className="quote-collapsed__dots">
                ...
              </span>
            </div>
          )}

          {/* Quoted content (collapsible) */}
          {showQuoted && (
            <div className="quote-expanded">
              <div
                className="prose prose-sm max-w-none dark:prose-invert text-muted"
                dangerouslySetInnerHTML={{
                  __html: processedContent.quotedContent,
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
