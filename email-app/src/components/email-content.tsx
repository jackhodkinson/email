"use client";

import { useEffect, useState } from "react";
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

interface ProcessedContent {
  mainContent: string;
  quotedContent: string | null;
  hasQuotedContent: boolean;
}

export function EmailContent({ bodyHtml, bodyText }: EmailContentProps) {
  const [processedContent, setProcessedContent] = useState<ProcessedContent>({
    mainContent: "",
    quotedContent: null,
    hasQuotedContent: false,
  });
  const [showQuoted, setShowQuoted] = useState(false);

  useEffect(() => {
    // Reset expanded state when email changes
    setShowQuoted(false);

    if (bodyHtml) {
      // Process HTML content to detect quoted sections
      const { mainContent, quotedContent, hasQuotedContent } =
        processQuotedContent(bodyHtml);

      setProcessedContent({
        mainContent: sanitizeHtml(mainContent),
        quotedContent: quotedContent ? sanitizeHtml(quotedContent) : null,
        hasQuotedContent,
      });
    } else if (bodyText) {
      // Process plain text to detect quoted sections
      const { mainContent, quotedContent, hasQuotedContent } =
        processPlainTextQuotes(bodyText);

      setProcessedContent({
        mainContent: sanitizeHtml(plainTextToHtml(mainContent)),
        quotedContent: quotedContent
          ? sanitizeHtml(plainTextToHtml(quotedContent))
          : null,
        hasQuotedContent,
      });
    } else {
      setProcessedContent({
        mainContent: "<p>(No content)</p>",
        quotedContent: null,
        hasQuotedContent: false,
      });
    }
  }, [bodyHtml, bodyText]);

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
            onClick={() => setShowQuoted(!showQuoted)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
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
            <div className="mt-2 px-3 py-2 bg-muted/50 rounded border-l-2 border-muted-foreground/30">
              <span className="text-muted-foreground text-sm tracking-widest">
                ...
              </span>
            </div>
          )}

          {/* Quoted content (collapsible) */}
          {showQuoted && (
            <div className="mt-2 pl-3 border-l-2 border-muted-foreground/30">
              <div
                className="prose prose-sm max-w-none dark:prose-invert text-muted-foreground"
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
