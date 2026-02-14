import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  PointerEvent as ReactPointerEvent,
} from "react";
import { useHotkey, useHotkeySequence } from "@tanstack/react-hotkeys";
import { EmailList } from "./email-list";
import { EmailListToolbar } from "./email-list-toolbar";
import { EmailView } from "./email-view";
import { ThreadView } from "./thread-view";
import { useCommands } from "@/lib/commands/use-commands";

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
  accountId: string;
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
  accountId,
}: EmailSplitViewProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const [localSelectedIndex, setLocalSelectedIndex] = useState(-1);
  const [activeSurface, setActiveSurface] = useState<"none" | "list" | "viewer">(
    "none",
  );

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

  useEffect(() => {
    const handleFocusIn = () => {
      const active = document.activeElement;
      if (active && listRef.current?.contains(active)) {
        setActiveSurface("list");
        return;
      }
      if (active && viewerRef.current?.contains(active)) {
        setActiveSurface("viewer");
        return;
      }
      setActiveSurface("none");
    };

    document.addEventListener("focusin", handleFocusIn);
    handleFocusIn();
    return () => document.removeEventListener("focusin", handleFocusIn);
  }, []);

  const focusList = useCallback(() => {
    listRef.current?.focus({ preventScroll: true });
    setActiveSurface("list");
  }, []);

  const focusViewer = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const focusTargets = viewer.querySelectorAll<HTMLElement>(
      "[data-message-focus]",
    );
    const focusTarget =
      focusTargets.length > 0 ? focusTargets[focusTargets.length - 1] : null;
    if (focusTarget) {
      focusTarget.focus({ preventScroll: true });
      setActiveSurface("viewer");
      return;
    }
    viewer.focus({ preventScroll: true });
    setActiveSurface("viewer");
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

  const runCommand = useCallback(
    (commandId: string) => {
      const command = commands[commandId];
      if (!command) return;
      command.execute();
    },
    [commands],
  );

  const listHotkeyOptions = useMemo(
    () => ({ target: listRef, enabled: activeSurface === "list" }),
    [activeSurface],
  );
  const viewerHotkeyOptions = useMemo(
    () => ({ target: viewerRef, enabled: activeSurface === "viewer" }),
    [activeSurface],
  );

  useHotkey("ArrowDown", () => runCommand("selectNextEmail"), listHotkeyOptions);
  useHotkey("ArrowUp", () => runCommand("selectPreviousEmail"), listHotkeyOptions);
  useHotkey("Enter", () => runCommand("openSelectedEmail"), listHotkeyOptions);
  useHotkey("ArrowRight", () => runCommand("focusEmailViewer"), listHotkeyOptions);
  useHotkey("j", () => runCommand("selectNextEmail"), listHotkeyOptions);
  useHotkey("k", () => runCommand("selectPreviousEmail"), listHotkeyOptions);
  useHotkey("/", () => runCommand("focusSearch"), listHotkeyOptions);
  useHotkey("Escape", () => runCommand("goToInbox"), listHotkeyOptions);

  useHotkey("ArrowLeft", () => runCommand("focusEmailList"), viewerHotkeyOptions);
  useHotkey("Escape", () => runCommand("goToInbox"), viewerHotkeyOptions);
  useHotkeySequence(["g", "i"], () => runCommand("goToInbox"), {
    enabled: activeSurface !== "none",
    timeout: 1000,
  });

  const handleListPointerDown = useCallback((event: ReactPointerEvent) => {
    const target = event.target as HTMLElement | null;
    if (isFocusableElement(target)) return;
    listRef.current?.focus({ preventScroll: true });
    setActiveSurface("list");
  }, []);

  const handleViewerPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (isFocusableElement(target)) return;
      const messageRoot = target?.closest<HTMLElement>("[data-message-root]");
      if (messageRoot) {
        const focusTarget =
          messageRoot.querySelector<HTMLElement>("[data-message-focus]") ??
          (messageRoot.matches("[data-message-focus]") ? messageRoot : null);
        focusTarget?.focus({ preventScroll: true });
        return;
      }
      focusViewer();
      setActiveSurface("viewer");
    },
    [focusViewer],
  );

  return (
    <div className="flex h-full w-full flex-col md:flex-row p-2 space-x-2">
      <section
        onPointerDownCapture={handleListPointerDown}
        className="md:w-[360px] md:flex-shrink-0 h-1/2 md:h-full min-h-0"
      >
        <div className="h-full min-h-0 w-full border border-border rounded-md overflow-hidden flex flex-col">
          <EmailListToolbar accountId={accountId} />
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
        onPointerDownCapture={handleViewerPointerDown}
        className="email-viewer flex-1 min-w-0 h-1/2 md:h-full min-h-0 border-border border rounded-md"
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
