import { memo, type Ref } from "react";
import { EmailContent } from "./email-content";
import { cn } from "@/lib/utils";

interface ThreadMessageProps {
  email: {
    id: string;
    subject: string | null;
    sender: string;
    recipients: string[];
    bodyText: string | null;
    bodyHtml: string | null;
    date: number;
    hasAttachments: boolean;
    isRead: boolean;
  };
  isExpanded?: boolean;
  onToggle?: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}

export const ThreadMessage = memo(function ThreadMessage({
  email,
  isExpanded = false,
  onToggle,
  buttonRef,
}: ThreadMessageProps) {
  const senderName = formatSender(email.sender);
  const senderInitial = senderName.charAt(0).toUpperCase();

  return (
    <div className="thread-msg">
      {/* Collapsed header - always visible */}
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        className={cn(
          "thread-msg__header",
          isExpanded && "thread-msg__header--expanded",
        )}
      >
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="avatar">
            {senderInitial}
          </div>

          {/* Sender and snippet */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn("text-body text-truncate", !email.isRead && "font-semibold")}>
                {senderName}
              </span>
              <span className="text-caption whitespace-nowrap">
                {formatDate(email.date)}
              </span>
            </div>
            {!isExpanded && (
              <div className="email-item__snippet">
                {email.bodyText?.slice(0, 100) || "(no content)"}
              </div>
            )}
          </div>

          {/* Expand/collapse icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn(
              "flex-shrink-0 text-muted transition-transform",
              isExpanded && "rotate-180"
            )}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="thread-msg__body">
          {/* Email metadata */}
          <div className="email-meta space-y-1 mb-4">
            <div className="email-meta__row">
              <span className="email-meta__label">From:</span>
              <span>{email.sender}</span>
            </div>

            {email.recipients.length > 0 && (
              <div className="email-meta__row">
                <span className="email-meta__label">To:</span>
                <span>{email.recipients.join(", ")}</span>
              </div>
            )}

            <div className="email-meta__row">
              <span className="email-meta__label">Date:</span>
              <span>{formatFullDate(email.date)}</span>
            </div>
          </div>

          {email.hasAttachments && (
            <div className="email-attachment-hint mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              <span>Has attachments</span>
            </div>
          )}

          {/* Email body */}
          <EmailContent bodyHtml={email.bodyHtml} bodyText={email.bodyText} />
        </div>
      )}
    </div>
  );
});

function formatSender(sender: string): string {
  const match = sender.match(/^(.+?)\s*<[^>]+>$/);
  return match ? match[1].trim() : sender;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatFullDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
