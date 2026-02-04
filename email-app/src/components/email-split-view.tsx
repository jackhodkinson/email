import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmailList } from "./email-list";
import { EmailView } from "./email-view";
import { useKeyboard } from "../lib/hooks/use-keyboard";
import { cn } from "@/lib/utils";

interface EmailSummary {
  id: string;
  sender: string;
  subject: string | null;
  snippet: string | null;
  date: number;
  isRead: boolean;
  hasAttachments: boolean;
}

interface EmailDetail {
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
}

interface EmailSplitViewProps {
  emails: EmailSummary[];
  selectedEmailId?: string | null;
  email?: EmailDetail | null;
  onSelectEmail: (id: string) => void;
}

type Pane = "list" | "viewer";

export function EmailSplitView({
  emails,
  selectedEmailId,
  email,
  onSelectEmail,
}: EmailSplitViewProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const [focusedPane, setFocusedPane] = useState<Pane>("list");
  const [localSelectedIndex, setLocalSelectedIndex] = useState(-1);

  const resolvedSelectedIndex = useMemo(() => {
    if (selectedEmailId) {
      const index = emails.findIndex((item) => item.id === selectedEmailId);
      return index;
    }
    return localSelectedIndex;
  }, [emails, localSelectedIndex, selectedEmailId]);

  useEffect(() => {
    if (!selectedEmailId) return;
    const index = emails.findIndex((item) => item.id === selectedEmailId);
    if (index >= 0) {
      setLocalSelectedIndex(index);
    }
  }, [emails, selectedEmailId]);

  const focusList = useCallback(() => {
    setFocusedPane("list");
    listRef.current?.focus();
  }, []);

  const focusViewer = useCallback(() => {
    setFocusedPane("viewer");
    viewerRef.current?.focus();
  }, []);

  const selectIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= emails.length) return;
      setLocalSelectedIndex(index);
      onSelectEmail(emails[index].id);
    },
    [emails, onSelectEmail]
  );

  const selectNext = useCallback(() => {
    if (emails.length === 0) return;
    const nextIndex =
      resolvedSelectedIndex < 0
        ? 0
        : Math.min(resolvedSelectedIndex + 1, emails.length - 1);
    selectIndex(nextIndex);
  }, [emails.length, resolvedSelectedIndex, selectIndex]);

  const selectPrevious = useCallback(() => {
    if (emails.length === 0) return;
    const nextIndex =
      resolvedSelectedIndex < 0
        ? 0
        : Math.max(resolvedSelectedIndex - 1, 0);
    selectIndex(nextIndex);
  }, [emails.length, resolvedSelectedIndex, selectIndex]);

  const openSelected = useCallback(() => {
    if (emails.length === 0) return;
    if (resolvedSelectedIndex < 0) {
      selectIndex(0);
      return;
    }
    const selected = emails[resolvedSelectedIndex];
    if (selected) {
      onSelectEmail(selected.id);
    }
  }, [emails, onSelectEmail, resolvedSelectedIndex, selectIndex]);

  const keyboardHandlers = useMemo(() => {
    const handlers: Record<string, () => void> = {
      ArrowLeft: () => {
        if (focusedPane === "viewer") {
          focusList();
        }
      },
      ArrowRight: () => {
        if (focusedPane === "list") {
          focusViewer();
        }
      },
    };

    if (focusedPane === "list") {
      handlers.ArrowDown = selectNext;
      handlers.ArrowUp = selectPrevious;
      handlers.Enter = openSelected;
    }

    return handlers;
  }, [focusList, focusViewer, focusedPane, openSelected, selectNext, selectPrevious]);

  useKeyboard(keyboardHandlers);

  return (
    <div className="flex h-full flex-col md:flex-row">
      <section
        ref={listRef}
        tabIndex={0}
        aria-label="Email list"
        onMouseDown={focusList}
        className={cn(
          "md:w-[360px] border-b md:border-b-0 md:border-r h-1/2 md:h-full min-h-0",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        )}
      >
        <div className="h-full min-h-0">
          <EmailList emails={emails} selectedIndex={resolvedSelectedIndex} />
        </div>
      </section>

      <section
        ref={viewerRef}
        tabIndex={0}
        aria-label="Email viewer"
        onMouseDown={focusViewer}
        className={cn(
          "flex-1 min-w-0 h-1/2 md:h-full min-h-0",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        )}
      >
        {email ? (
          <EmailView email={email} />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <div className="text-center space-y-2">
              <p className="text-sm">Select an email to preview</p>
              <p className="text-xs">Use left/right arrows to move focus.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
