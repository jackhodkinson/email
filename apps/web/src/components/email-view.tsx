import { useCallback, useState } from "react";
import { EmailContent } from "./email-content";
import type { InlinePart } from "@/lib/email-render";
import { EmailAddressChip, parseEmailAddress } from "./email-address-chip";
import { Button } from "./ui/button";
import { Archive, ArrowLeft, Check, ChevronDown, Copy, Mail, MailOpen, Maximize2, Minimize2, Paperclip, Reply } from "lucide-react";
import { AttachmentsRow } from "./attachments-row";
import { cn } from "@/lib/utils";
import { formatRelativeDate } from "@/lib/date";
import { avatarColors } from "@/lib/avatar-color";

interface EmailViewProps {
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
    labels: string[];
    inlineParts?: InlinePart[];
  };
  onReply?: (messageId: string) => void;
  onBack?: () => void;
  onToggleRead?: (messageId: string, isRead: boolean) => void;
  onRemoveFromInbox?: (messageId: string) => void;
  shouldAutoFocus?: boolean;
  onAutoFocusComplete?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export function EmailView({
  email,
  onReply,
  onBack,
  onToggleRead,
  onRemoveFromInbox,
  shouldAutoFocus = false,
  onAutoFocusComplete,
  isFullscreen = false,
  onToggleFullscreen,
}: EmailViewProps) {
  const [copiedDebugInfo, setCopiedDebugInfo] = useState(false);
  const setRootRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el || !shouldAutoFocus) return;

      el.focus({ preventScroll: true });
      onAutoFocusComplete?.();
    },
    [onAutoFocusComplete, shouldAutoFocus],
  );

  const [showDetails, setShowDetails] = useState(false);
  const { name: senderName, email: senderEmail } = parseEmailAddress(email.sender);
  const senderInitial = senderName.charAt(0).toUpperCase();

  const recipientsSummary = formatRecipients(email.recipients);

  const copyDebugInfo = useCallback(async () => {
    const text = formatEmailDebugInfo(email.id, email.subject);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedDebugInfo(true);
      window.setTimeout(() => setCopiedDebugInfo(false), 1500);
    } catch {
      // Clipboard can fail outside a secure/user-activated context. Keep this
      // silent so the debug affordance never interrupts reading mail.
      setCopiedDebugInfo(false);
    }
  }, [email.id, email.subject]);

  return (
    <div
      ref={setRootRef}
      className="email-view flex flex-col h-full min-h-0"
      tabIndex={-1}
      data-message-root
      data-message-focus
      data-message-focus-initial
    >
      {/* Subject + actions */}
      <div className="email-detail-header">
        {onBack && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="lg:hidden -ml-1 shrink-0"
            onClick={onBack}
            aria-label="Back to inbox"
            title="Back to inbox"
          >
            <ArrowLeft />
          </Button>
        )}
        <h1 className="email-detail-subject">
          {email.subject || "(no subject)"}
        </h1>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onRemoveFromInbox?.(email.id)}
            title="Archive (e)"
          >
            <Archive />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={copyDebugInfo}
            title="Copy message ID and subject"
            aria-label="Copy message ID and subject"
          >
            {copiedDebugInfo ? <Check /> : <Copy />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onToggleRead?.(email.id, !email.isRead)}
            title={email.isRead ? "Mark unread" : "Mark read"}
          >
            {email.isRead ? <Mail /> : <MailOpen />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onReply?.(email.id)}
            title="Reply (r)"
          >
            <Reply />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="hidden lg:inline-flex"
            onClick={onToggleFullscreen}
            title={isFullscreen ? "Exit full screen" : "Full screen"}
          >
            {isFullscreen ? <Minimize2 /> : <Maximize2 />}
          </Button>
        </div>
      </div>

      {/* Sender-centric header */}
      <div className="email-detail-sender">
        <div
          className="avatar"
          style={(() => {
            const c = avatarColors((senderEmail || senderName).toLowerCase());
            return { backgroundColor: c.bg, color: c.fg };
          })()}
        >
          {senderInitial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="email-detail-sender__name" title={senderEmail}>
              {senderName}
            </span>
            <span className="email-detail-sender__date">
              {email.hasAttachments && (
                <Paperclip className="inline-block mr-1.5 h-3 w-3 text-muted-foreground" />
              )}
              {formatRelativeDate(email.date)}
            </span>
          </div>
          {recipientsSummary && (
            <button
              type="button"
              className="thread-msg__recipients-toggle"
              onClick={() => setShowDetails((prev) => !prev)}
            >
              to {recipientsSummary}
              <ChevronDown className={cn(
                "inline-block h-3 w-3 ml-0.5 transition-transform",
                showDetails && "rotate-180",
              )} />
            </button>
          )}
        </div>
      </div>

      {/* Full sender/recipient details */}
      {showDetails && (
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

      {/* Email body */}
      <div className="panel-body flex-1 min-h-0 overflow-auto">
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
    </div>
  );
}

function formatEmailDebugInfo(messageId: string, subject: string | null): string {
  return `Message ID: ${messageId}\nSubject: ${subject || "(no subject)"}`;
}

function formatRecipients(recipients: string[]): string {
  if (recipients.length === 0) return "";
  const names = recipients.map((r) => parseEmailAddress(r).name);
  if (names.length <= 2) return names.join(", ");
  return `${names[0]}, ${names[1]}, +${names.length - 2}`;
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
