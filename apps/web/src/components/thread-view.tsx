import { useCallback, useRef } from "react";
import { useObservable, useValue } from "@legendapp/state/react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { ThreadMessage } from "./thread-message";
import { Button } from "./ui/button";
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
  onReply?: (messageId: string) => void;
}

export function ThreadView({ emails, subject, onReply }: ThreadViewProps) {
  // By default, expand only the most recent email (first in array since sorted DESC)
  const expandedIds$ = useObservable<Set<string>>(() => {
    if (emails.length === 0) return new Set();
    return new Set([emails[0].id]);
  });

  const expandedIds = useValue(expandedIds$);

  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const hotkeyScopeRef = useRef<HTMLDivElement>(null);

  // Trim refs array at render time if emails shrunk
  if (buttonRefs.current.length > emails.length) {
    buttonRefs.current = buttonRefs.current.slice(0, emails.length);
  }

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
    const prev = expandedIds$.get();
    const next = new Set(prev);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    expandedIds$.set(next);
  }, []);

  const expandAll = useCallback(() => {
    expandedIds$.set(new Set(emails.map((e) => e.id)));
  }, [emails]);

  const collapseAll = useCallback(() => {
    expandedIds$.set(new Set<string>());
  }, []);

  const allExpanded = emails.length > 0 && expandedIds.size === emails.length;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Thread subject and controls */}
      <div className="flex items-center gap-2 px-4 py-2 border-b">
        <h1 className="text-sm font-medium text-muted-foreground truncate flex-1">
          {subject || "(no subject)"}
        </h1>
        {emails.length > 1 && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={allExpanded ? collapseAll : expandAll}
            title={allExpanded ? "Collapse all" : "Expand all"}
          >
            {allExpanded ? <ChevronsDownUp /> : <ChevronsUpDown />}
          </Button>
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
                onReply={onReply}
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
