import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { EmailList } from "./email-list";
import { EmailView } from "./email-view";
import { ThreadView } from "./thread-view";
import { useCommands } from "@/lib/commands/use-commands";
import { getShortcutsForSurface } from "@/lib/commands/shortcuts";

interface EmailSummary {
  id: string;
  sender: string;
  subject: string | null;
  snippet: string | null;
  date: number;
  isRead: boolean;
  hasAttachments: boolean;
  threadCount?: number;
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

interface EmailSplitViewProps {
  emails: EmailSummary[];
  selectedEmailId?: string | null;
  email?: EmailDetail | null;
  threadEmails?: ThreadEmail[] | null;
  onSelectEmail: (id: string) => void;
  focusSearch?: () => void;
  searchParams?: Record<string, unknown>;
}

const LIST_SHORTCUTS = getShortcutsForSurface("list");
const VIEWER_SHORTCUTS = getShortcutsForSurface("viewer");

function isInputElement(el: HTMLElement | null): boolean {
  if (!el) return false;
  const tagName = el.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }
  return el.isContentEditable;
}

function shouldIgnoreKey(event: ReactKeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (!isInputElement(target)) return false;
  if (event.key === "Escape") return false;
  return true;
}

function isFocusableElement(el: HTMLElement | null): boolean {
  if (!el) return false;
  const tagName = el.tagName.toLowerCase();
  if (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    tagName === "button"
  ) {
    return true;
  }
  if (tagName === "a" && (el as HTMLAnchorElement).href) return true;
  if (el.isContentEditable) return true;
  const tabIndexAttr = el.getAttribute("tabindex");
  if (tabIndexAttr !== null) {
    return tabIndexAttr !== "-1";
  }
  return false;
}

const noop = () => {};

export function EmailSplitView({
  emails,
  selectedEmailId,
  email,
  threadEmails,
  onSelectEmail,
  focusSearch = noop,
  searchParams,
}: EmailSplitViewProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (document.activeElement === document.body) {
      listRef.current?.focus({ preventScroll: true });
    }
  }, []);

  const focusList = useCallback(() => {
    listRef.current?.focus({ preventScroll: true });
  }, []);

  const focusViewer = useCallback(() => {
    viewerRef.current?.focus({ preventScroll: true });
  }, []);

  const selectIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= emails.length) return;
      setLocalSelectedIndex(index);
      onSelectEmail(emails[index].id);
    },
    [emails, onSelectEmail],
  );

  const handleSelectEmail = useCallback(
    (id: string) => {
      const index = emails.findIndex((item) => item.id === id);
      if (index >= 0) {
        selectIndex(index);
        return;
      }
      onSelectEmail(id);
    },
    [emails, onSelectEmail, selectIndex],
  );

  const commands = useCommands({
    emails,
    selectedIndex: resolvedSelectedIndex,
    setSelectedIndex: selectIndex,
    focusList,
    focusViewer,
    focusSearch,
    searchParams,
  });

  const handleListKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      if (shouldIgnoreKey(event)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const mapping = LIST_SHORTCUTS.find((shortcut) => shortcut.key === key);
      if (!mapping) return;
      const command = commands[mapping.command];
      if (!command) return;
      event.preventDefault();
      command.execute();
    },
    [commands],
  );

  const handleViewerKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      if (shouldIgnoreKey(event)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const mapping = VIEWER_SHORTCUTS.find((shortcut) => shortcut.key === key);
      if (!mapping) return;
      const command = commands[mapping.command];
      if (!command) return;
      event.preventDefault();
      command.execute();
    },
    [commands],
  );

  const handleListPointerDown = useCallback((event: ReactPointerEvent) => {
    const target = event.target as HTMLElement | null;
    if (isFocusableElement(target)) return;
    listRef.current?.focus({ preventScroll: true });
  }, []);

  const handleViewerPointerDown = useCallback((event: ReactPointerEvent) => {
    const target = event.target as HTMLElement | null;
    if (isFocusableElement(target)) return;
    viewerRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="flex h-full w-full flex-col md:flex-row">
      <section
        onKeyDownCapture={handleListKeyDown}
        onPointerDownCapture={handleListPointerDown}
        className="md:w-[360px] md:flex-shrink-0 border-b md:border-b-0 md:border-r h-1/2 md:h-full min-h-0"
      >
        <div className="h-full min-h-0 w-full border border-black">
          <EmailList
            emails={emails}
            selectedIndex={resolvedSelectedIndex}
            listRef={listRef}
            onSelectEmail={handleSelectEmail}
          />
        </div>
      </section>

      <section
        ref={viewerRef}
        tabIndex={0}
        aria-label="Email viewer"
        onKeyDownCapture={handleViewerKeyDown}
        onPointerDownCapture={handleViewerPointerDown}
        className="flex-1 min-w-0 h-1/2 md:h-full min-h-0 focus-ring"
      >
        {threadEmails && threadEmails.length > 1 ? (
          <ThreadView emails={threadEmails} subject={email?.subject ?? null} />
        ) : email ? (
          <EmailView email={email} />
        ) : (
          <div className="empty-state">
            <div className="text-center space-y-2">
              <p className="text-body text-muted">Select an email to preview</p>
              <p className="text-caption">
                Use left/right arrows to move focus.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
