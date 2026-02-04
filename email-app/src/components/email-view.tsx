import { Link } from "@tanstack/react-router";
import { EmailContent } from "./email-content";
import { Separator } from "./ui/separator";

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
}

export function EmailView({ email }: EmailViewProps) {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header with back button */}
      <div className="flex items-center gap-4 px-4 py-3 border-b flex-shrink-0">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
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
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to Inbox
        </Link>
      </div>

      {/* Email metadata */}
      <div className="px-6 py-4 space-y-2 flex-shrink-0">
        <h1 className="text-xl font-semibold">
          {email.subject || "(no subject)"}
        </h1>

        <div className="space-y-1 text-sm">
          <div className="flex gap-2">
            <span className="font-medium text-muted-foreground w-12">From:</span>
            <span>{email.sender}</span>
          </div>

          {email.recipients.length > 0 && (
            <div className="flex gap-2">
              <span className="font-medium text-muted-foreground w-12">To:</span>
              <span>{email.recipients.join(", ")}</span>
            </div>
          )}

          <div className="flex gap-2">
            <span className="font-medium text-muted-foreground w-12">Date:</span>
            <span>{formatFullDate(email.date)}</span>
          </div>
        </div>

        {email.hasAttachments && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
      <div className="flex-1 min-h-0 overflow-auto px-6 py-4">
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
