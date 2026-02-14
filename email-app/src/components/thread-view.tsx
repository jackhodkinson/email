import { useState, useCallback, useRef, useEffect } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { ThreadMessage } from "./thread-message";
import { ScrollArea } from "./ui/scroll-area";

interface ThreadEmail {
  id: string;
  subject: string | null;
  sender: string;
  recipients: string[];
  bodyText: string | null;
  bodyHtml: string | null;
  date: number;
  hasAttachments: boolean;
  isRead: boolean;
}

interface ThreadViewProps {
  emails: ThreadEmail[];
  subject: string | null;
}

export function ThreadView({ emails, subject }: ThreadViewProps) {
  // By default, expand only the most recent email (last in array since sorted ASC)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    if (emails.length === 0) return new Set();
    return new Set([emails[emails.length - 1].id]);
  });

  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const hotkeyScopeRef = useRef<HTMLDivElement>(null);

  // Resize refs array when emails change
  useEffect(() => {
    buttonRefs.current = buttonRefs.current.slice(0, emails.length);
  }, [emails.length]);

  const moveFocusBetweenMessages = useCallback(
    (direction: "up" | "down") => {
      const currentIndex = buttonRefs.current.findIndex(
        (ref) => ref === document.activeElement,
      );
      if (currentIndex === -1) return;

      const nextIndex =
        direction === "down"
          ? Math.min(currentIndex + 1, emails.length - 1)
          : Math.max(currentIndex - 1, 0);

      buttonRefs.current[nextIndex]?.focus();
      buttonRefs.current[nextIndex]?.scrollIntoView({ block: "nearest" });
    },
    [emails.length],
  );

  useHotkey("Alt+ArrowDown", () => moveFocusBetweenMessages("down"), {
    target: hotkeyScopeRef,
  });
  useHotkey("Alt+ArrowUp", () => moveFocusBetweenMessages("up"), {
    target: hotkeyScopeRef,
  });

  const toggleMessage = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedIds(new Set(emails.map((e) => e.id)));
  }, [emails]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const allExpanded = emails.length > 0 && expandedIds.size === emails.length;
  const allCollapsed = expandedIds.size === 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Thread subject and controls */}
      <div className="panel-header panel-header--bordered space-y-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="heading-page">
            {subject || "(no subject)"}
          </h1>
          <span className="text-body text-muted whitespace-nowrap">
            {emails.length} {emails.length === 1 ? "message" : "messages"}
          </span>
        </div>

        {emails.length > 1 && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={expandAll}
              disabled={allExpanded}
              className="btn-secondary"
            >
              Expand all
            </button>
            <button
              type="button"
              onClick={collapseAll}
              disabled={allCollapsed}
              className="btn-secondary"
            >
              Collapse all
            </button>
          </div>
        )}
      </div>

      <div ref={hotkeyScopeRef} className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="panel-body space-y-3">
            {emails.map((email, index) => (
              <ThreadMessage
                key={email.id}
                email={email}
                isExpanded={expandedIds.has(email.id)}
                onToggle={() => toggleMessage(email.id)}
                buttonRef={(el) => {
                  buttonRefs.current[index] = el;
                }}
              />
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
