import { memo, useState, type Ref } from "react";
import { ChevronDown, Paperclip, Reply } from "lucide-react";
import { AttachmentsRow } from "./attachments-row";
import { EmailContent } from "./email-content";
import type { InlinePart } from "@/lib/email-render";
import { EmailAddressChip, parseEmailAddress } from "./email-address-chip";
import { cn } from "@/lib/utils";
import { formatRelativeDate } from "@/lib/date";
import { avatarColors } from "@/lib/avatar-color";

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
    inlineParts?: InlinePart[];
  };
  isExpanded?: boolean;
  isInitialFocusTarget?: boolean;
  onToggle?: () => void;
  onReply?: (messageId: string) => void;
  buttonRef?: Ref<HTMLButtonElement>;
}

export const ThreadMessage = memo(function ThreadMessage({
  email,
  isExpanded = false,
  isInitialFocusTarget = false,
  onToggle,
  onReply,
  buttonRef,
}: ThreadMessageProps) {
  const [showDetails, setShowDetails] = useState(false);
  const { name: senderName, email: senderEmail } = parseEmailAddress(email.sender);
  const senderInitial = senderName.charAt(0).toUpperCase();
  const avatarStyle = (() => {
    const c = avatarColors((senderEmail || senderName).toLowerCase());
    return { backgroundColor: c.bg, color: c.fg };
  })();
  const recipientNames = email.recipients.map(
    (r) => parseEmailAddress(r).name,
  );
  const recipientsSummary =
    recipientNames.length <= 2
      ? recipientNames.join(", ")
      : `${recipientNames[0]}, ${recipientNames[1]}, +${recipientNames.length - 2}`;

  return (
    <div className="thread-msg group" data-message-root>
      {/* Collapsed header - always visible */}
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        data-message-focus
        data-message-focus-initial={isInitialFocusTarget || undefined}
        className={cn(
          "thread-msg__header",
          isExpanded && "thread-msg__header--expanded",
        )}
      >
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="avatar" style={avatarStyle}>{senderInitial}</div>

          {/* Sender and snippet */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span
                className={cn(
                  "text-body text-truncate",
                  !email.isRead && "font-semibold",
                )}
              >
                {senderName}
              </span>
              {isExpanded && recipientsSummary && (
                <span
                  className="thread-msg__recipients-toggle"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDetails((prev) => !prev);
                  }}
                >
                  to {recipientsSummary}
                  <ChevronDown className={cn(
                    "inline-block h-3 w-3 ml-0.5 transition-transform",
                    showDetails && "rotate-180",
                  )} />
                </span>
              )}
              <span className="text-caption whitespace-nowrap ml-auto flex items-center gap-1">
                {email.hasAttachments && (
                  <Paperclip className="inline-block h-3 w-3" />
                )}
                {formatRelativeDate(email.date)}
              </span>
            </div>
            {!isExpanded && (
              <div className="email-item__snippet">
                {email.bodyText?.slice(0, 100) || "(no content)"}
              </div>
            )}
          </div>

          {/* Reply — inline in the header row */}
          {isExpanded && (
            <div
              className="thread-msg__reply-btn"
              onClick={(e) => {
                e.stopPropagation();
                onReply?.(email.id);
              }}
              role="button"
              tabIndex={-1}
              title="Reply (r)"
            >
              <Reply className="h-4 w-4" />
            </div>
          )}
        </div>
      </button>

      {/* Full sender/recipient details */}
      {isExpanded && showDetails && (
        <div className="thread-msg__details">
          <div className="thread-msg__detail-row">
            <span className="thread-msg__detail-label">From</span>
            <span><EmailAddressChip raw={email.sender} /></span>
          </div>
          {email.recipients.length > 0 && (
            <div className="thread-msg__detail-row">
              <span className="thread-msg__detail-label">To</span>
              <span className="flex flex-wrap gap-x-1">
                {email.recipients.map((r, i) => (
                  <span key={r}>
                    <EmailAddressChip raw={r} />
                    {i < email.recipients.length - 1 && ","}
                  </span>
                ))}
              </span>
            </div>
          )}
          <div className="thread-msg__detail-row">
            <span className="thread-msg__detail-label">Date</span>
            <span>{formatFullDate(email.date)}</span>
          </div>
        </div>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div className="thread-msg__body">
          <EmailContent
            emailId={email.id}
            bodyHtml={email.bodyHtml}
            bodyText={email.bodyText}
            inlineParts={email.inlineParts}
          />
          <AttachmentsRow
            emailId={email.id}
            hasAttachments={email.hasAttachments}
          />
        </div>
      )}
    </div>
  );
});

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
