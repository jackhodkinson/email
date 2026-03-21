import { forwardRef, memo } from "react";
import { cn } from "@/lib/utils";
import { formatRelativeDate } from "@/lib/date";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface EmailItemProps {
  id: string;
  email: {
    id: string;
    threadId: string;
    sender: string;
    subject: string | null;
    snippet: string | null;
    date: number;
    isRead: boolean;
    hasAttachments: boolean;
    labels: string[];
  };
  isSelected?: boolean;
  threadCount?: number;
  onSelectEmail?: (id: string) => void;
  onHoverEmail?: (id: string) => void;
  availableLabels?: Array<{ id: string; name: string }>;
  onToggleThreadLabel?: (
    threadId: string,
    labelId: string,
    enabled: boolean,
  ) => void;
  labelsBusy?: boolean;
}

export const EmailItem = memo(
  forwardRef<HTMLDivElement, EmailItemProps>(function EmailItem(
    {
      id,
      email,
      isSelected,
      threadCount,
      onSelectEmail,
      onHoverEmail,
      availableLabels = [],
      onToggleThreadLabel,
      labelsBusy = false,
    },
    ref,
  ) {
    const content = (
      <div
        ref={ref}
        id={id}
        role="option"
        aria-selected={Boolean(isSelected)}
        className={cn(
          "email-item",
          isSelected && "email-item--selected",
          !email.isRead && "email-item--unread",
        )}
        onClick={() => onSelectEmail?.(email.id)}
        onMouseEnter={() => onHoverEmail?.(email.id)}
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
              {formatRelativeDate(email.date)}
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

    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {content}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuLabel>Apply labels</ContextMenuLabel>
          <ContextMenuSeparator />
          {availableLabels.length === 0 ? (
            <div className="text-muted-foreground px-2 py-1.5 text-sm">
              No labels yet
            </div>
          ) : (
            availableLabels.map((label) => {
              const checked = email.labels.includes(label.id);
              return (
                <ContextMenuCheckboxItem
                  key={label.id}
                  checked={checked}
                  disabled={labelsBusy}
                  onCheckedChange={(nextChecked) => {
                    onToggleThreadLabel?.(
                      email.threadId,
                      label.id,
                      nextChecked === true,
                    );
                  }}
                  onSelect={(event) => event.preventDefault()}
                >
                  {label.name}
                </ContextMenuCheckboxItem>
              );
            })
          )}
        </ContextMenuContent>
      </ContextMenu>
    );
  }),
);

// Extract display name from "Name <email>" format
function formatSender(sender: string): string {
  const match = sender.match(/^(.+?)\s*<[^>]+>$/);
  return match ? match[1].trim() : sender;
}
