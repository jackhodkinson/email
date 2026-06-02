import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
  PointerEvent as ReactPointerEvent,
} from "react";
import { useObservable, useValue } from "@legendapp/state/react";
import { useHotkey, useHotkeySequence } from "@tanstack/react-hotkeys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { EmailList } from "./email-list";
import { EmailListToolbar } from "./email-list-toolbar";
import { EmailView } from "./email-view";
import { ThreadView } from "./thread-view";
import { ReplyPanel } from "./reply-panel";
import { cn } from "@/lib/utils";
import { useFocusManager } from "@/lib/focus-manager";
import { useCommands } from "@/lib/commands/use-commands";
import { userLabelsQueryOptions } from "@/lib/query";
import { setThreadLabelsAction } from "@/server/functions";

interface EmailSummary {
  id: string;
  threadId: string;
  sender: string;
  subject: string | null;
  snippet: string | null;
  date: number;
  isRead: boolean;
  hasAttachments: boolean;
  threadCount?: number;
  labels: string[];
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
  inlineParts?: import("@/lib/email-render").InlinePart[];
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
  inlineParts?: import("@/lib/email-render").InlinePart[];
}

interface EmailSplitViewProps {
  emails: EmailSummary[];
  selectedEmailId?: string | null;
  email?: EmailDetail | null;
  threadEmails?: ThreadEmail[] | null;
  onSelectEmail: (id: string) => void;
  onHoverEmail?: (id: string) => void;
  focusSearch?: () => void;
  searchParams?: Record<string, unknown>;
  accountId: string;
  threadsOnly: boolean;
  onToggleThreadsOnly: () => void;
  onComposeNew: () => void;
  onComposeReply: (messageId: string) => void;
  onToggleRead?: (messageId: string, isRead: boolean) => void;
  onRemoveFromInbox?: (messageId: string) => void;
  onRemoveManyFromInbox?: (messageIds: string[]) => void;
  onUndoArchive?: () => void;
  replyTo?: {
    messageId: string;
    threadId: string;
    sender: string | null;
    subject: string | null;
  } | null;
  onCloseReply?: () => void;
  onDeselectEmail?: () => void;
  onOpenEmailFullscreen?: (id: string) => void;
  fullscreenRequestKey?: number | null;
  onFullscreenRequestHandled?: () => void;
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
const LIST_SURFACE_ID = "mail-list";
const VIEWER_SURFACE_ID = "mail-viewer";

export function EmailSplitView({
  emails,
  selectedEmailId,
  email,
  threadEmails,
  onSelectEmail,
  onHoverEmail,
  focusSearch = noop,
  searchParams,
  accountId,
  threadsOnly,
  onToggleThreadsOnly,
  onComposeNew,
  onComposeReply,
  onToggleRead,
  onRemoveFromInbox,
  onRemoveManyFromInbox,
  onUndoArchive,
  replyTo,
  onCloseReply,
  onDeselectEmail,
  onOpenEmailFullscreen,
  fullscreenRequestKey = null,
  onFullscreenRequestHandled,
}: EmailSplitViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const focusManager = useFocusManager();
  const listFocusRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const state$ = useObservable({
    localSelectedIndex: -1,
    activeSurface: "none" as "none" | "list" | "viewer",
    pendingViewerFocus: false,
    isFullscreen: false,
    isListOnly: false,
    selectedEmailIds: [] as string[],
  });

  const findViewerFocusTarget = useCallback((viewer: HTMLElement) => {
    return (
      viewer.querySelector<HTMLElement>("[data-message-focus-initial]") ??
      viewer.querySelector<HTMLElement>("[data-message-focus]")
    );
  }, []);

  const localSelectedIndex = useValue(() => state$.localSelectedIndex.get());
  const activeSurface = useValue(() => state$.activeSurface.get());
  const pendingViewerFocus = useValue(() => state$.pendingViewerFocus.get());
  const isFullscreen = useValue(() => state$.isFullscreen.get());
  const isListOnly = useValue(() => state$.isListOnly.get());
  const selectedEmailIds = useValue(() => state$.selectedEmailIds.get());
  const selectedEmailIdSet = useMemo(
    () => new Set(selectedEmailIds),
    [selectedEmailIds],
  );

  // Exit list-only mode when an email is selected
  useEffect(() => {
    if (selectedEmailId) {
      state$.isListOnly.set(false);
    }
  }, [selectedEmailId]);

  useEffect(() => {
    const visibleIds = new Set(emails.map((item) => item.id));
    const filtered = selectedEmailIds.filter((id) => visibleIds.has(id));
    if (filtered.length !== selectedEmailIds.length) {
      state$.selectedEmailIds.set(filtered);
    }
  }, [emails, selectedEmailIds, state$]);

  const { data: labelData } = useQuery(userLabelsQueryOptions());
  const availableLabels = labelData?.labels.map((label) => ({
    id: label.id,
    name: label.name,
  })) ?? [];

  const labelMutation = useMutation({
    mutationFn: async (input: {
      threadId: string;
      addLabelIds: string[];
      removeLabelIds: string[];
    }) => setThreadLabelsAction({ data: input }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["email", "inbox"] }),
        queryClient.invalidateQueries({ queryKey: ["email", "labels"] }),
      ]);
      await router.invalidate();
    },
  });

  const toggleFullscreen = useCallback(() => {
    state$.isFullscreen.set((prev) => !prev);
  }, []);

  const enterFullscreen = useCallback(() => {
    state$.isFullscreen.set(true);
  }, []);

  // URL-derived index is the source of truth when selectedEmailId is present.
  // localSelectedIndex is only used as a brief optimistic override so the list
  // highlights the new row immediately, before the router delivers the new URL.
  const urlSelectedIndex = useMemo(() => {
    if (!selectedEmailId) return -1;
    return emails.findIndex((item) => item.id === selectedEmailId);
  }, [emails, selectedEmailId]);

  const resolvedSelectedIndex =
    localSelectedIndex >= 0 &&
    localSelectedIndex < emails.length &&
    urlSelectedIndex !== localSelectedIndex
      ? localSelectedIndex
      : urlSelectedIndex;

  // Clear the optimistic override once the URL catches up
  useEffect(() => {
    if (urlSelectedIndex >= 0 && localSelectedIndex === urlSelectedIndex) {
      state$.localSelectedIndex.set(-1);
    }
  }, [urlSelectedIndex, localSelectedIndex]);

  useEffect(() => {
    if (fullscreenRequestKey === null) return;
    state$.isFullscreen.set(true);
    onFullscreenRequestHandled?.();
  }, [fullscreenRequestKey, onFullscreenRequestHandled]);
  useEffect(() => {
    return focusManager.registerSurface(LIST_SURFACE_ID, () => listFocusRef.current);
  }, [focusManager]);

  useEffect(() => {
    return focusManager.registerSurface(VIEWER_SURFACE_ID, () => {
      const viewer = viewerRef.current;
      if (!viewer) return null;
      return findViewerFocusTarget(viewer) ?? viewer;
    });
  }, [findViewerFocusTarget, focusManager]);

  useEffect(() => {
    const handleFocusIn = () => {
      const active = document.activeElement;

      if (active && listFocusRef.current?.contains(active)) {
        state$.activeSurface.set("list");
        focusManager.setActiveSurface(LIST_SURFACE_ID);
        return;
      }
      if (active && viewerRef.current?.contains(active)) {
        state$.activeSurface.set("viewer");
        focusManager.setActiveSurface(VIEWER_SURFACE_ID);
        if (active !== viewerRef.current) {
          state$.pendingViewerFocus.set(false);
        }
        return;
      }

      state$.pendingViewerFocus.set(false);
      state$.activeSurface.set("none");
    };

    document.addEventListener("focusin", handleFocusIn);

    if (document.activeElement === document.body) {
      focusManager.focusSurface(LIST_SURFACE_ID);
    }

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, [focusManager]);

  const focusList = useCallback(() => {
    listFocusRef.current?.focus({ preventScroll: true });
    state$.activeSurface.set("list");
    focusManager.setActiveSurface(LIST_SURFACE_ID);
  }, [focusManager]);

  const focusViewer = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const focusTarget = findViewerFocusTarget(viewer);
    if (focusTarget) {
      focusTarget.focus({ preventScroll: true });
      state$.activeSurface.set("viewer");
      state$.pendingViewerFocus.set(false);
      focusManager.setActiveSurface(VIEWER_SURFACE_ID);
      return;
    }
    viewer.focus({ preventScroll: true });
    state$.activeSurface.set("viewer");
    state$.pendingViewerFocus.set(true);
    focusManager.setActiveSurface(VIEWER_SURFACE_ID);
  }, [findViewerFocusTarget, focusManager]);

  const selectIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= emails.length) return;
      state$.selectedEmailIds.set([]);
      state$.localSelectedIndex.set(index);
      if (!state$.isListOnly.get()) {
        onSelectEmail(emails[index].id);
      }
    },
    [emails, onSelectEmail, state$],
  );

  const handleSelectEmail = useCallback(
    (id: string) => {
      state$.selectedEmailIds.set([]);
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

  const openSelectedOrFullscreen = useCallback(() => {
    if (emails.length === 0) return;
    if (resolvedSelectedIndex < 0) {
      selectIndex(0);
      return;
    }

    const id = emails[resolvedSelectedIndex]?.id;
    if (!id) return;

    // In list-only mode, Enter reopens the detail view without going fullscreen
    if (state$.isListOnly.get()) {
      state$.isListOnly.set(false);
      onSelectEmail(id);
      return;
    }

    if (onOpenEmailFullscreen) {
      onOpenEmailFullscreen(id);
      return;
    }

    runCommand("openSelectedEmail");
  }, [emails, onOpenEmailFullscreen, onSelectEmail, resolvedSelectedIndex, runCommand, selectIndex]);

  const handleExitFullscreen = useCallback(() => {
    state$.isFullscreen.set(false);
    requestAnimationFrame(() => focusViewer());
  }, [focusViewer]);

  const handleEscape = useCallback(() => {
    if (state$.isFullscreen.get()) {
      state$.isFullscreen.set(false);
      requestAnimationFrame(() => focusViewer());
      return;
    }

    if (selectedEmailId && onDeselectEmail) {
      onDeselectEmail();
      return;
    }

    if (!state$.isListOnly.get()) {
      state$.isListOnly.set(true);
      return;
    }

    runCommand("goToInbox");
  }, [focusViewer, onDeselectEmail, runCommand, selectedEmailId, state$]);

  const listHotkeyOptions = useMemo(
    () => ({ target: listFocusRef, enabled: activeSurface === "list" }),
    [activeSurface],
  );
  const viewerHotkeyOptions = useMemo(
    () => ({ target: viewerRef, enabled: activeSurface === "viewer" }),
    [activeSurface],
  );
  const fullscreenHotkeyOptions = useMemo(
    () => ({ enabled: isFullscreen }),
    [isFullscreen],
  );

  useHotkey("ArrowDown", () => runCommand("selectNextEmail"), listHotkeyOptions);
  useHotkey("ArrowUp", () => runCommand("selectPreviousEmail"), listHotkeyOptions);
  useHotkey("Enter", openSelectedOrFullscreen, listHotkeyOptions);
  useHotkey("ArrowRight", () => runCommand("focusEmailViewer"), listHotkeyOptions);
  useHotkey("j", () => runCommand("selectNextEmail"), listHotkeyOptions);
  useHotkey("k", () => runCommand("selectPreviousEmail"), listHotkeyOptions);
  useHotkey("/", () => runCommand("focusSearch"), listHotkeyOptions);
  useHotkey("Escape", handleEscape, listHotkeyOptions);

  const archiveSelected = useCallback(() => {
    if (selectedEmailIds.length > 0) {
      onRemoveManyFromInbox?.(selectedEmailIds);
      state$.selectedEmailIds.set([]);
      return;
    }

    const id = selectedEmailId ?? emails[resolvedSelectedIndex]?.id;
    if (id) onRemoveFromInbox?.(id);
  }, [
    emails,
    onRemoveFromInbox,
    onRemoveManyFromInbox,
    resolvedSelectedIndex,
    selectedEmailId,
    selectedEmailIds,
    state$,
  ]);

  useHotkey("e", archiveSelected, listHotkeyOptions);
  useHotkey("e", archiveSelected, viewerHotkeyOptions);

  const selectAllEmails = useCallback(() => {
    if (emails.length === 0) return;
    state$.selectedEmailIds.set(emails.map((item) => item.id));
  }, [emails, state$]);

  useHotkey("Meta+a", selectAllEmails, listHotkeyOptions);

  const undoHotkeyOptions = useMemo(
    () => ({ enabled: activeSurface !== "none" }),
    [activeSurface],
  );
  useHotkey("Meta+z", () => onUndoArchive?.(), undoHotkeyOptions);

  const copySelectedEmailRef = useCallback(() => {
    const idx = resolvedSelectedIndex;
    const item = idx >= 0 ? emails[idx] : null;
    if (!item) return;
    const subject = item.subject || "(no subject)";
    const text = `${item.id} — ${subject}`;
    navigator.clipboard.writeText(text);
  }, [emails, resolvedSelectedIndex]);

  useHotkey("Meta+c", copySelectedEmailRef, listHotkeyOptions);
  useHotkey("Meta+c", copySelectedEmailRef, viewerHotkeyOptions);

  useHotkey("c", onComposeNew, listHotkeyOptions);
  useHotkey("c", onComposeNew, viewerHotkeyOptions);

  const replyToSelected = useCallback(() => {
    const id = selectedEmailId ?? emails[resolvedSelectedIndex]?.id;
    if (id) onComposeReply(id);
  }, [emails, onComposeReply, resolvedSelectedIndex, selectedEmailId]);

  useHotkey("r", replyToSelected, listHotkeyOptions);
  useHotkey("r", replyToSelected, viewerHotkeyOptions);

  useHotkey("ArrowLeft", () => runCommand("focusEmailList"), viewerHotkeyOptions);
  useHotkey("Enter", enterFullscreen, viewerHotkeyOptions);
  useHotkey("Escape", handleEscape, viewerHotkeyOptions);
  useHotkey("Escape", handleExitFullscreen, fullscreenHotkeyOptions);
  useHotkey("f", toggleFullscreen, viewerHotkeyOptions);
  useHotkeySequence(["g", "i"], () => runCommand("goToInbox"), {
    enabled: activeSurface !== "none",
    timeout: 1000,
  });

  const handleListPointerDown = useCallback((event: ReactPointerEvent) => {
    const target = event.target as HTMLElement | null;
    if (isFocusableElement(target)) return;
    listFocusRef.current?.focus({ preventScroll: true });
    state$.activeSurface.set("list");
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
      state$.activeSurface.set("viewer");
    },
    [focusViewer],
  );

  const handleToggleThreadLabel = useCallback(
    (threadId: string, labelId: string, enabled: boolean) => {
      labelMutation.mutate({
        threadId,
        addLabelIds: enabled ? [labelId] : [],
        removeLabelIds: enabled ? [] : [labelId],
      });
    },
    [labelMutation],
  );

  const isReplying = !!replyTo;

  // Below lg the layout is single-pane: the inbox shows the list, opening a
  // message swaps to the viewer (with a back button). At lg+ — where there's
  // room for the sidebar, a 360px list, and a readable viewer — both panes sit
  // side by side as before.
  const listVisibility = isFullscreen
    ? "hidden"
    : selectedEmailId
      ? "hidden lg:block"
      : "block";

  return (
    <div className="flex h-full w-full flex-col lg:flex-row lg:p-2 lg:gap-2">
      <section
        ref={listFocusRef}
        tabIndex={0}
        onPointerDownCapture={handleListPointerDown}
        className={cn(
          "h-full min-h-0 outline-none",
          isListOnly ? "w-full" : "lg:w-[360px] lg:flex-shrink-0",
          listVisibility,
        )}
      >
        <div className="h-full min-h-0 w-full overflow-hidden flex flex-col bg-card lg:rounded-lg lg:border lg:border-border/50">
          <EmailListToolbar
            accountId={accountId}
            threadsOnly={threadsOnly}
            onToggleThreadsOnly={onToggleThreadsOnly}
            onComposeNew={onComposeNew}
          />
          <EmailList
            emails={emails}
            selectedIndex={resolvedSelectedIndex}
            selectedEmailIds={selectedEmailIdSet}
            listRef={listRef}
            onSelectEmail={handleSelectEmail}
            onHoverEmail={onHoverEmail}
            availableLabels={availableLabels}
            onToggleThreadLabel={handleToggleThreadLabel}
            labelsBusy={labelMutation.isPending}
            onArchive={onRemoveFromInbox}
          />
        </div>
      </section>

      <section
        ref={viewerRef}
        tabIndex={0}
        aria-label="Email viewer"
        onPointerDownCapture={handleViewerPointerDown}
        className={
          isListOnly
            ? "hidden"
            : isFullscreen
              ? "email-viewer fixed inset-0 z-50 bg-background"
              : cn(
                  "email-viewer flex-1 min-w-0 h-full min-h-0 lg:rounded-lg lg:border lg:border-border/50 flex-col",
                  // Single-pane below lg: only show the viewer once a message is open
                  selectedEmailId ? "flex" : "hidden lg:flex",
                )
        }
      >
        <div className="flex-1 min-h-0">
          {threadEmails && threadEmails.length > 1 ? (
            <ThreadView
              emails={threadEmails}
              subject={email?.subject ?? null}
              onReply={onComposeReply}
              onBack={onDeselectEmail}
              selectedEmailId={selectedEmailId ?? email?.id ?? null}
              shouldAutoFocus={!isReplying && pendingViewerFocus && activeSurface === "viewer"}
              onAutoFocusComplete={() => state$.pendingViewerFocus.set(false)}
              isFullscreen={isFullscreen}
              onToggleFullscreen={toggleFullscreen}
            />
          ) : email ? (
            <EmailView
              email={email}
              onReply={onComposeReply}
              onBack={onDeselectEmail}
              onToggleRead={onToggleRead}
              onRemoveFromInbox={onRemoveFromInbox}
              shouldAutoFocus={!isReplying && pendingViewerFocus && activeSurface === "viewer"}
              onAutoFocusComplete={() => state$.pendingViewerFocus.set(false)}
              isFullscreen={isFullscreen}
              onToggleFullscreen={toggleFullscreen}
            />
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
        </div>

        {/* Inline reply — renders at bottom of viewer */}
        {replyTo && onCloseReply && (
          <div className="border-t border-border/50">
            <ReplyPanel
              key={replyTo.messageId}
              replyToMessageId={replyTo.messageId}
              threadId={replyTo.threadId}
              replySender={replyTo.sender}
              replySubject={replyTo.subject}
              onClose={onCloseReply}
            />
          </div>
        )}
      </section>
    </div>
  );
}
