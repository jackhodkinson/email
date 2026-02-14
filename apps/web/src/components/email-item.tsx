import { forwardRef, memo } from "react";
import { cn } from "@/lib/utils";

interface EmailItemProps {
  id: string;
  email: {
    id: string;
    sender: string;
    subject: string | null;
    snippet: string | null;
    date: number;
    isRead: boolean;
    hasAttachments: boolean;
  };
  isSelected?: boolean;
  threadCount?: number;
  onSelectEmail?: (id: string) => void;
}

export const EmailItem = memo(
  forwardRef<HTMLDivElement, EmailItemProps>(function EmailItem(
    { id, email, isSelected, threadCount, onSelectEmail },
    ref,
  ) {
    return (
      <div
        ref={ref}
        id={id}
        role="option"
        aria-selected={Boolean(isSelected)}
        className={cn(
          "email-item",
          isSelected && "email-item--selected",
          !email.isRead && !isSelected && "email-item--unread",
        )}
        onClick={() => onSelectEmail?.(email.id)}
      >
        <div className="flex items-start justify-between gap-2 overflow-hidden">
          <div className="flex-1 min-w-0 overflow-hidden">
            {/* Sender */}
            <div
              className={cn("email-item__sender", !email.isRead && "font-semibold")}
            >
              {formatSender(email.sender)}
            </div>

            {/* Subject */}
            <div
              className={cn(
                "email-item__subject",
                !email.isRead ? "font-medium" : "email-item__subject--read",
              )}
            >
              {email.subject || "(no subject)"}
            </div>

            {/* Snippet */}
            <div className="email-item__snippet">
              {email.snippet}
            </div>
          </div>

          {/* Date and thread count */}
          <div className="flex flex-col items-end gap-1">
            <div className="email-item__date">
              {formatDate(email.date)}
            </div>
            {threadCount && threadCount > 1 && (
              <span className="badge">
                {threadCount}
              </span>
            )}
          </div>
        </div>

        {/* Unread indicator */}
        {!email.isRead && (
          <div className="unread-dot" />
        )}
      </div>
    );
  }),
);

// Extract display name from "Name <email>" format
function formatSender(sender: string): string {
  const match = sender.match(/^(.+?)\s*<[^>]+>$/);
  return match ? match[1].trim() : sender;
}

// Format timestamp for display
function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();

  // Today: show time
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  // This year: show month and day
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  // Older: show full date
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
