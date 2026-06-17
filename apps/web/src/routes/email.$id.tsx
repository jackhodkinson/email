import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  setReadStatus,
  removeFromInboxAction,
  addToInboxAction,
} from "../server/functions";
import { ComposeSheet } from "../components/compose-sheet";
import { EmailSplitView } from "../components/email-split-view";
import { NoAccount } from "../components/no-account";
import { useSearchBox } from "../lib/search-context";
import {
  inboxQueryOptions,
  emailDetailQueryOptions,
  threadEmailsQueryOptions,
  getQueryClient,
  prefetchAdjacent,
  prefetchEmailDetail,
} from "../lib/query";
import {
  addPendingArchiveThreadIds,
  getPendingArchiveThreadIds,
  removePendingArchiveThreadIds,
} from "../lib/pending-archive";
import { useMutation } from "@tanstack/react-query";

type SidebarCounts = {
  inbox: number;
  primary: number;
  promotions: number;
  social: number;
  updates: number;
  forums: number;
  starred: number;
};

type ArchivedThreadSnapshot = {
  messageId: string;
  threadId: string;
  labels: string[];
};

const INBOX_CATEGORY_TO_COUNT_KEY: Array<{
  label: string;
  key: keyof SidebarCounts;
}> = [
  { label: "CATEGORY_PERSONAL", key: "primary" },
  { label: "CATEGORY_PROMOTIONS", key: "promotions" },
  { label: "CATEGORY_SOCIAL", key: "social" },
  { label: "CATEGORY_UPDATES", key: "updates" },
];

export const Route = createFileRoute("/email/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : undefined,
    threads:
      search.threads === true || search.threads === "true" ? true : undefined,
    category:
      typeof search.category === "string" ? search.category : undefined,
    label:
      typeof search.label === "string" ? search.label : undefined,
    compose:
      search.compose === "new" || search.compose === "reply"
        ? search.compose
        : undefined,
    replyTo: typeof search.replyTo === "string" ? search.replyTo : undefined,
  }),
  loaderDeps: ({ search }) => ({
    q: search.q,
    threads: search.threads,
    category: search.category,
    label: search.label,
  }),
  loader: async ({ params, deps }) => {
    const queryClient = getQueryClient();
    const inboxOpts = {
      query: deps.q,
      threadsOnly: !!deps.threads,
      category: deps.category,
      label: deps.label,
    };

    // ensureQueryData returns cached data instantly when fresh (within
    // staleTime), so this only blocks on the very first load or when search
    // params change.  Rapid j/k navigation never re-fetches.
    const inbox = await queryClient.ensureQueryData(
      inboxQueryOptions(inboxOpts),
    );

    // Non-blocking prefetches for the selected + adjacent emails
    queryClient.prefetchQuery(emailDetailQueryOptions(params.id));
    const emailIds = inbox.threads.map((t) => t.id);
    const selectedIdx = emailIds.indexOf(params.id);
    if (selectedIdx >= 0) {
      prefetchAdjacent(queryClient, emailIds, selectedIdx);
    }

    return { accountId: inbox.accountId };
  },
  component: EmailDetailPage,
  notFoundComponent: NotFound,
});

function EmailDetailPage() {
  const { accountId } = Route.useLoaderData();
  const { id: selectedId } = Route.useParams();
  const search = Route.useSearch();
  const query = search.q;
  const threadsOnly = !!search.threads;
  const category = search.category;
  const label = search.label;
  const compose = search.compose;
  const replyTo = search.replyTo;
  const navigate = useNavigate();
  const fullscreenRequestKey = useLocation({
    select: (location) => {
      const state = location.state as Record<string, unknown> | undefined;
      if (state?.fullscreenEmailId !== selectedId) return null;
      return typeof state?.fullscreenNonce === "number"
        ? state.fullscreenNonce
        : null;
    },
  });
  const searchBoxRef = useSearchBox();
  const queryClient = useQueryClient();

  // Inbox list lives in React Query so it survives route transitions.
  // The loader seeds the cache; this hook reads from it (instant) and
  // keeps the previous list visible while a background refetch runs.
  const { data: inboxData } = useQuery({
    ...inboxQueryOptions({ query, threadsOnly, category, label }),
    placeholderData: (prev) => prev,
  });
  const threads = inboxData?.threads ?? [];

  // Optimistic read-status overrides so the list updates instantly
  const [readOverrides, setReadOverrides] = useState<Map<string, boolean>>(
    () => new Map(),
  );
  const displayThreads = useMemo(
    () =>
      readOverrides.size === 0
        ? threads
        : threads.map((t) => {
            const override = readOverrides.get(t.id);
            return override !== undefined ? { ...t, isRead: override } : t;
          }),
    [threads, readOverrides],
  );

  // Fetch email detail from cache (instant if prefetched) or network.
  // `placeholderData: keepPreviousData` keeps the previous email visible
  // while the next one loads — no blank flash.
  const { data: emailDetail } = useQuery({
    ...emailDetailQueryOptions(selectedId),
    placeholderData: (prev) => prev,
  });

  // Once we know the threadId, fetch thread emails
  const threadId = emailDetail?.threadId;
  const { data: threadEmails } = useQuery({
    ...threadEmailsQueryOptions(threadId ?? ""),
    enabled: !!threadId,
    placeholderData: (prev) => prev,
  });

  // When the inbox shows a thread has changed (new reply → different
  // threadCount or date), invalidate the cached thread emails so the
  // detail view picks up the new message.
  const inboxThread = threads.find((t) => t.threadId === threadId);
  const inboxThreadKey = inboxThread
    ? `${inboxThread.threadCount}:${inboxThread.date}`
    : null;
  useEffect(() => {
    if (threadId && inboxThreadKey) {
      queryClient.invalidateQueries({
        queryKey: ["email", "thread", threadId],
      });
    }
  }, [threadId, inboxThreadKey, queryClient]);

  const readMutation = useMutation({
    mutationFn: async (vars: { messageId: string; isRead: boolean }) => {
      const result = await setReadStatus({ data: vars });
      window.dispatchEvent(new Event("sidebar-counts-changed"));
      return result;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["email", "detail", vars.messageId] });
      if (threadId) {
        queryClient.invalidateQueries({ queryKey: ["email", "thread", threadId] });
      }
    },
  });

  const handleToggleRead = useCallback(
    (messageId: string, isRead: boolean) => {
      setReadOverrides((prev) => new Map(prev).set(messageId, isRead));
      readMutation.mutate({ messageId, isRead });
    },
    [readMutation],
  );

  // Track archived thread IDs so they disappear from the list instantly.
  // Keyed by threadId (not messageId) because the inbox list is thread-based —
  // after archiving one message, a different message in the same thread could
  // become the new representative, which would bypass a messageId-based filter.
  const [archivedThreadIds, setArchivedThreadIds] = useState<Set<string>>(
    () => new Set(getPendingArchiveThreadIds()),
  );
  const visibleThreads = useMemo(
    () =>
      archivedThreadIds.size === 0
        ? displayThreads
        : displayThreads.filter((t) => !archivedThreadIds.has(t.threadId)),
    [displayThreads, archivedThreadIds],
  );
  const selectedThreadStillVisible = useMemo(
    () => visibleThreads.some((thread) => thread.id === selectedId),
    [selectedId, visibleThreads],
  );
  const activeSelectedEmailId = selectedThreadStillVisible ? selectedId : undefined;
  const activeEmailDetail = activeSelectedEmailId ? (emailDetail ?? null) : null;
  const activeThreadEmails = activeSelectedEmailId ? (threadEmails ?? null) : null;
  const lastArchivedRef = useRef<ArchivedThreadSnapshot[] | null>(null);
  const applyOptimisticSidebarDelta = useCallback(
    (entries: ArchivedThreadSnapshot[], direction: 1 | -1) => {
      if (entries.length === 0) return;

      const countsDelta: Partial<Record<keyof SidebarCounts, number>> = {};
      const userLabelDelta = new Map<string, number>();

      for (const entry of entries) {
        const labelSet = new Set(entry.labels);
        const isUnreadInbox = labelSet.has("INBOX") && labelSet.has("UNREAD");
        if (!isUnreadInbox) continue;

        countsDelta.inbox = (countsDelta.inbox ?? 0) + direction;
        for (const item of INBOX_CATEGORY_TO_COUNT_KEY) {
          if (labelSet.has(item.label)) {
            countsDelta[item.key] = (countsDelta[item.key] ?? 0) + direction;
          }
        }

        for (const labelId of labelSet) {
          userLabelDelta.set(labelId, (userLabelDelta.get(labelId) ?? 0) + direction);
        }
      }

      queryClient.setQueryData(["email", "sidebar-counts"], (prev: SidebarCounts | undefined) => {
        if (!prev) return prev;
        return {
          ...prev,
          inbox: Math.max(0, prev.inbox + (countsDelta.inbox ?? 0)),
          primary: Math.max(0, prev.primary + (countsDelta.primary ?? 0)),
          promotions: Math.max(0, prev.promotions + (countsDelta.promotions ?? 0)),
          social: Math.max(0, prev.social + (countsDelta.social ?? 0)),
          updates: Math.max(0, prev.updates + (countsDelta.updates ?? 0)),
        };
      });

      queryClient.setQueryData(
        ["email", "labels"],
        (
          prev:
            | { labels: Array<{ id: string; name: string; unread: number }> }
            | undefined,
        ) => {
          if (!prev) return prev;
          return {
            labels: prev.labels.map((label) => {
              if (!label.name.startsWith("Cmail/")) return label;
              const delta = userLabelDelta.get(label.id) ?? 0;
              if (delta === 0) return label;
              return {
                ...label,
                unread: Math.max(0, label.unread + delta),
              };
            }),
          };
        },
      );
    },
    [queryClient],
  );

  const reconcileSidebarCounts = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["email", "sidebar-counts"] });
    queryClient.invalidateQueries({ queryKey: ["email", "labels"] });
    window.dispatchEvent(new Event("sidebar-counts-changed"));
  }, [queryClient]);

  const archiveMutation = useMutation({
    mutationFn: async (vars: { threadId: string }) => {
      return await removeFromInboxAction({ data: vars });
    },
    onSuccess: (_data, vars) => {
      removePendingArchiveThreadIds([vars.threadId]);
      reconcileSidebarCounts();
    },
    onError: (error, vars) => {
      console.error("Failed to archive thread", vars.threadId, error);
      removePendingArchiveThreadIds([vars.threadId]);
      setArchivedThreadIds((prev) => {
        const next = new Set(prev);
        next.delete(vars.threadId);
        return next;
      });
      reconcileSidebarCounts();
    },
  });

  const replayedPendingArchivesRef = useRef(false);
  useEffect(() => {
    if (replayedPendingArchivesRef.current) return;
    replayedPendingArchivesRef.current = true;

    for (const threadId of getPendingArchiveThreadIds()) {
      archiveMutation.mutate({ threadId });
    }
  }, [archiveMutation]);

  const unarchiveMutation = useMutation({
    mutationFn: async (vars: { threadId: string }) => {
      return await addToInboxAction({ data: vars });
    },
    onSuccess: () => {
      reconcileSidebarCounts();
    },
  });

  const archiveMessageIds = useCallback(
    (messageIds: string[]) => {
      if (messageIds.length === 0) return;

      const batch = messageIds
        .map((messageId) => {
          const thread = visibleThreads.find((t) => t.id === messageId);
          if (!thread) return null;
          return { messageId, threadId: thread.threadId, labels: thread.labels };
        })
        .filter(Boolean) as ArchivedThreadSnapshot[];
      if (batch.length === 0) return;

      const archivedThreadIds = Array.from(new Set(batch.map((item) => item.threadId)));
      addPendingArchiveThreadIds(archivedThreadIds);
      lastArchivedRef.current = batch;
      setArchivedThreadIds((prev) => {
        const next = new Set(prev);
        for (const threadId of archivedThreadIds) {
          next.add(threadId);
        }
        return next;
      });
      applyOptimisticSidebarDelta(batch, -1);

      for (const threadId of archivedThreadIds) {
        archiveMutation.mutate({ threadId });
      }

      const messageIdSet = new Set(messageIds);
      const nextEmail = visibleThreads.find((thread) => !messageIdSet.has(thread.id));
      if (nextEmail) {
        navigate({
          to: "/email/$id",
          params: { id: nextEmail.id },
          search: {
            q: query,
            threads: threadsOnly || undefined,
            category,
            label,
            compose,
            replyTo,
          },
        });
        return;
      }
    },
    [archiveMutation, category, compose, label, navigate, query, replyTo, threadsOnly, visibleThreads],
  );

  const handleRemoveFromInbox = useCallback(
    (messageId: string) => {
      archiveMessageIds([messageId]);
    },
    [archiveMessageIds],
  );

  const handleRemoveManyFromInbox = useCallback(
    (messageIds: string[]) => {
      archiveMessageIds(messageIds);
    },
    [archiveMessageIds],
  );

  const handleUndoArchive = useCallback(() => {
    const lastBatch = lastArchivedRef.current;
    if (!lastBatch || lastBatch.length === 0) return;

    lastArchivedRef.current = null;
    const threadIds = Array.from(new Set(lastBatch.map((item) => item.threadId)));
    removePendingArchiveThreadIds(threadIds);
    setArchivedThreadIds((prev) => {
      const next = new Set(prev);
      for (const threadId of threadIds) {
        next.delete(threadId);
      }
      return next;
    });
    applyOptimisticSidebarDelta(lastBatch, 1);
    for (const threadId of threadIds) {
      unarchiveMutation.mutate({ threadId });
    }

    const restoreMessageId = lastBatch[0]?.messageId;
    if (!restoreMessageId) return;

    navigate({
      to: "/email/$id",
      params: { id: restoreMessageId },
      search: {
        q: query,
        threads: threadsOnly || undefined,
        category,
        label,
        compose,
        replyTo,
      },
    });
  }, [applyOptimisticSidebarDelta, category, compose, label, navigate, query, replyTo, threadsOnly, unarchiveMutation]);

  const handleSelectEmail = useCallback(
    (id: string) => {
      if (id === selectedId) return;

      // Eagerly prefetch adjacent emails around the new selection
      const emailIds = threads.map((t) => t.id);
      const newIdx = emailIds.indexOf(id);
      if (newIdx >= 0) {
        prefetchAdjacent(queryClient, emailIds, newIdx);
      }

      navigate({
        to: "/email/$id",
        params: { id },
        search: {
          q: query,
          threads: threadsOnly || undefined,
          category,
          label,
          compose,
          replyTo,
        },
      });
    },
    [
      category,
      compose,
      label,
      navigate,
      query,
      queryClient,
      replyTo,
      selectedId,
      threads,
      threadsOnly,
    ],
  );

  const handleOpenEmailFullscreen = useCallback(
    (id: string) => {
      navigate({
        to: "/email/$id",
        params: { id },
        search: {
          q: query,
          threads: threadsOnly || undefined,
          category,
          label,
          compose,
          replyTo,
        },
        state: ((prev: Record<string, unknown> | undefined) => ({
          ...(prev ?? {}),
          fullscreenEmailId: id,
          fullscreenNonce: Date.now(),
        })) as any,
      });
    },
    [category, compose, label, navigate, query, replyTo, threadsOnly],
  );

  const handleFullscreenRequestHandled = useCallback(() => {
    navigate({
      to: "/email/$id",
      params: { id: selectedId },
      search: {
        q: query,
        threads: threadsOnly || undefined,
        category,
        label,
        compose,
        replyTo,
      },
      replace: true,
      state: ((prev: Record<string, unknown> | undefined) => {
        if (!prev) return {};
        const next = { ...prev };
        delete next.fullscreenEmailId;
        delete next.fullscreenNonce;
        return next;
      }) as any,
    });
  }, [category, compose, label, navigate, query, replyTo, selectedId, threadsOnly]);

  // Prefetch email detail on hover so click is instant
  const handleHoverEmail = useCallback(
    (id: string) => {
      prefetchEmailDetail(queryClient, id);
    },
    [queryClient],
  );

  const handleDeselectEmail = useCallback(() => {
    navigate({
      to: "/",
      search: {
        q: query,
        threads: threadsOnly || undefined,
        category,
        label,
        compose: undefined,
        replyTo: undefined,
      },
    });
  }, [category, label, navigate, query, threadsOnly]);

  const handleToggleThreadsOnly = useCallback(() => {
    const nextThreads = !threadsOnly || undefined;
    navigate({
      to: "/email/$id",
      params: { id: selectedId },
      search: { q: query, threads: nextThreads, category, label, compose, replyTo },
    });
  }, [category, compose, label, navigate, query, replyTo, selectedId, threadsOnly]);

  const handleComposeNew = useCallback(() => {
    navigate({
      to: "/email/$id",
      params: { id: selectedId },
      search: {
        q: query,
        threads: threadsOnly || undefined,
        category,
        label,
        compose: "new",
        replyTo: undefined,
      },
    });
  }, [category, label, navigate, query, selectedId, threadsOnly]);

  const handleComposeReply = useCallback(
    (messageId: string) => {
      navigate({
        to: "/email/$id",
        params: { id: selectedId },
        search: {
          q: query,
          threads: threadsOnly || undefined,
          category,
          label,
          compose: "reply",
          replyTo: messageId,
        },
      });
    },
    [category, label, navigate, query, selectedId, threadsOnly],
  );

  const handleComposeOpenChange = useCallback(
    (open: boolean) => {
      if (open) return;
      navigate({
        to: "/email/$id",
        params: { id: selectedId },
        search: {
          q: query,
          threads: threadsOnly || undefined,
          category,
          label,
          compose: undefined,
          replyTo: undefined,
        },
      });
    },
    [category, label, navigate, query, selectedId, threadsOnly],
  );

  const composeOpen = compose === "new";
  const isInlineReply = compose === "reply" && !!replyTo;
  const replyEmail =
    compose === "reply" && replyTo
      ? threadEmails?.find((item) => item.id === replyTo) ??
        (emailDetail?.id === replyTo ? emailDetail : null)
      : null;

  const focusSearch = useCallback(() => {
    searchBoxRef.current?.focus();
  }, [searchBoxRef]);

  if (!accountId) {
    return <NoAccount />;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <main className="flex-1 min-h-0 overflow-hidden">
        <EmailSplitView
          emails={visibleThreads}
          selectedEmailId={activeSelectedEmailId}
          email={activeEmailDetail}
          threadEmails={activeThreadEmails}
          onSelectEmail={handleSelectEmail}
          onDeselectEmail={handleDeselectEmail}
          onOpenEmailFullscreen={handleOpenEmailFullscreen}
          onHoverEmail={handleHoverEmail}
          focusSearch={focusSearch}
          searchParams={{
            q: query,
            threads: threadsOnly || undefined,
            category,
            label,
            compose,
            replyTo,
          }}
          accountId={accountId}
          threadsOnly={threadsOnly}
          onToggleThreadsOnly={handleToggleThreadsOnly}
          onComposeNew={handleComposeNew}
          onComposeReply={handleComposeReply}
          onToggleRead={handleToggleRead}
          onRemoveFromInbox={handleRemoveFromInbox}
          onRemoveManyFromInbox={handleRemoveManyFromInbox}
          onUndoArchive={handleUndoArchive}
          replyTo={
            isInlineReply && activeSelectedEmailId && replyEmail && threadId
              ? {
                  messageId: replyTo!,
                  threadId,
                  sender: replyEmail.sender,
                  subject: replyEmail.subject,
                }
              : null
          }
          onCloseReply={() => handleComposeOpenChange(false)}
          fullscreenRequestKey={fullscreenRequestKey}
          onFullscreenRequestHandled={handleFullscreenRequestHandled}
        />
      </main>
      {composeOpen && (
        <ComposeSheet
          key="compose-new"
          open={composeOpen}
          mode="new"
          onOpenChange={handleComposeOpenChange}
        />
      )}
    </div>
  );
}

function NotFound() {
  return (
    <div className="empty-state">
      <h1 className="empty-state__title">Email not found</h1>
      <p className="empty-state__text">
        The email you're looking for doesn't exist or has been deleted.
      </p>
      <Link
        to="/"
          search={{
            q: undefined,
            threads: undefined,
            category: undefined,
            label: undefined,
            compose: undefined,
            replyTo: undefined,
          }}
        className="link-primary inline-flex items-center gap-2"
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
  );
}
