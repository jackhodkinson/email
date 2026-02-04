import { cn } from "@/lib/utils";

interface EmailItemProps {
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
  onClick?: () => void;
}

export function EmailItem({ email, isSelected, onClick }: EmailItemProps) {
  return (
    <div
      className={cn(
        "relative px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors",
        isSelected && "bg-muted",
        !email.isRead && "bg-blue-50 dark:bg-blue-950/20"
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Sender */}
          <div
            className={cn(
              "text-sm truncate",
              !email.isRead && "font-semibold"
            )}
          >
            {formatSender(email.sender)}
          </div>

          {/* Subject */}
          <div
            className={cn(
              "text-sm truncate",
              !email.isRead ? "font-medium" : "text-muted-foreground"
            )}
          >
            {email.subject || "(no subject)"}
          </div>

          {/* Snippet */}
          <div className="text-sm text-muted-foreground truncate">
            {email.snippet}
          </div>
        </div>

        {/* Date */}
        <div className="text-xs text-muted-foreground whitespace-nowrap">
          {formatDate(email.date)}
        </div>
      </div>

      {/* Unread indicator */}
      {!email.isRead && (
        <div className="absolute left-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-500" />
      )}
    </div>
  );
}

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
