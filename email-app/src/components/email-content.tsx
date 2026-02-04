"use client";

import { useEffect, useState } from "react";
import { sanitizeHtml, plainTextToHtml } from "@/lib/sanitize";

interface EmailContentProps {
  bodyHtml: string | null;
  bodyText: string | null;
}

export function EmailContent({ bodyHtml, bodyText }: EmailContentProps) {
  const [sanitizedContent, setSanitizedContent] = useState<string>("");

  useEffect(() => {
    // Prefer HTML body, fall back to plain text
    if (bodyHtml) {
      setSanitizedContent(sanitizeHtml(bodyHtml));
    } else if (bodyText) {
      // Convert plain text to HTML for display
      const htmlFromText = plainTextToHtml(bodyText);
      setSanitizedContent(sanitizeHtml(htmlFromText));
    } else {
      setSanitizedContent("<p>(No content)</p>");
    }
  }, [bodyHtml, bodyText]);

  return (
    <div
      className="email-content prose prose-sm max-w-none dark:prose-invert"
      dangerouslySetInnerHTML={{ __html: sanitizedContent }}
    />
  );
}
