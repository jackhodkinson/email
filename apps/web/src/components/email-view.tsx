import { EmailContent } from "./email-content";
import { EmailAddressChip } from "./email-address-chip";
import { Separator } from "./ui/separator";
import { Button } from "./ui/button";
import { Reply } from "lucide-react";

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
  };
  onReply?: (messageId: string) => void;
}

export function EmailView({ email, onReply }: EmailViewProps) {
  return (
    <div
      className="email-view flex flex-col h-full min-h-0"
      tabIndex={-1}
      data-message-root
      data-message-focus
    >
      {/* Email metadata */}
      <div className="panel-header space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h1 className="heading-page">
            {email.subject || "(no subject)"}
          </h1>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onReply?.(email.id)}
          >
            <Reply />
            Reply
          </Button>
        </div>

        <div className="email-meta space-y-1">
          <div className="email-meta__row">
            <span className="email-meta__label">From:</span>
            <span>
              <EmailAddressChip raw={email.sender} />
            </span>
          </div>

          {email.recipients.length > 0 && (
            <div className="email-meta__row">
              <span className="email-meta__label">To:</span>
              <span>
                {email.recipients.map((r, i) => (
                  <span key={r}>
                    <EmailAddressChip raw={r} />
                    {i < email.recipients.length - 1 && ", "}
                  </span>
                ))}
              </span>
            </div>
          )}

          <div className="email-meta__row">
            <span className="email-meta__label">Date:</span>
            <span>{formatFullDate(email.date)}</span>
          </div>
        </div>

        {email.hasAttachments && (
          <div className="email-attachment-hint">
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
      </div>

      <Separator />

      {/* Email body */}
      <div className="panel-body flex-1 min-h-0 overflow-auto">
        <EmailContent bodyHtml={email.bodyHtml} bodyText={email.bodyText} />
      </div>
    </div>
  );
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
