import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  addToInboxAction,
  getThreadedInboxEmails,
  removeFromInboxAction,
  searchThreadedInboxEmails,
} from "../server/functions";
import { inboxQueryOptions } from "../lib/query";
import { ComposeSheet } from "../components/compose-sheet";
import { EmailSplitView } from "../components/email-split-view";
import { NoAccount } from "../components/no-account";
import { useSearchBox } from "../lib/search-context";
import {
  getQueryClient,
  prefetchBatch,
  prefetchEmailDetail,
} from "../lib/query";
import {
  addPendingArchiveThreadIds,
  getPendingArchiveThreadIds,
  removePendingArchiveThreadIds,
} from "../lib/pending-archive";

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

export const Route = createFileRoute("/")({
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
    compose: search.compose,
    replyTo: search.replyTo,
  }),
  loader: async ({ deps }) => {
    const result = deps.q
      ? {
          ...(await searchThreadedInboxEmails({
            data: {
              query: deps.q,
              category: deps.category,
              labelId: deps.label,
            },
          })),
          query: deps.q as string | undefined,
          threadsOnly: !!deps.threads,
          category: deps.category,
          label: deps.label,
          compose: deps.compose,
          replyTo: deps.replyTo,
        }
      : {
          ...(await getThreadedInboxEmails({
            data: {
              threadsOnly: !!deps.threads,
              category: deps.category,
              labelId: deps.label,
            },
          })),
          query: undefined as string | undefined,
          threadsOnly: !!deps.threads,
          category: deps.category,
          label: deps.label,
          compose: deps.compose,
          replyTo: deps.replyTo,
        };

    // Seed React Query cache so navigating to /email/$id has instant inbox data
    const queryClient = getQueryClient();
    const inboxOpts = {
      query: deps.q,
      threadsOnly: !!deps.threads,
      category: deps.category,
      label: deps.label,
    };
    queryClient.setQueryData(inboxQueryOptions(inboxOpts).queryKey, {
      threads: result.threads,
      accountId: result.accountId,
    } as Awaited<ReturnType<(typeof inboxQueryOptions)["prototype"]["queryFn"]>>);

    // Eagerly prefetch the first N email bodies so the first click is instant
    prefetchBatch(
      queryClient,
      result.threads.map((t) => t.id),
    );

    return result;
  },
  component: InboxPage,
});

function InboxPage() {
  const { threads, accountId, query, threadsOnly, category, label, compose, replyTo } =
    Route.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();
  const searchBoxRef = useSearchBox();
  const queryClient = useQueryClient();
  const [archivedThreadIds, setArchivedThreadIds] = useState<Set<string>>(
    () => new Set(getPendingArchiveThreadIds()),
  );
  const visibleThreads = useMemo(
    () =>
      archivedThreadIds.size === 0
        ? threads
        : threads.filter((thread) => !archivedThreadIds.has(thread.threadId)),
    [archivedThreadIds, threads],
  );
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
    onSuccess: async (_data, vars) => {
      removePendingArchiveThreadIds([vars.threadId]);
      reconcileSidebarCounts();
      await queryClient.invalidateQueries({ queryKey: ["email", "inbox"] });
      await router.invalidate();
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
    onSuccess: async () => {
      reconcileSidebarCounts();
      await queryClient.invalidateQueries({ queryKey: ["email", "inbox"] });
      await router.invalidate();
    },
  });

  // Prefetch email detail on hover so first click is instant
  const handleHoverEmail = useCallback(
    (id: string) => {
      prefetchEmailDetail(queryClient, id);
    },
    [queryClient],
  );

  const handleSelectEmail = useCallback(
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
      });
    },
    [category, compose, label, navigate, query, replyTo, threadsOnly],
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

      const threadIds = Array.from(new Set(batch.map((item) => item.threadId)));
      addPendingArchiveThreadIds(threadIds);
      lastArchivedRef.current = batch;
      setArchivedThreadIds((prev) => {
        const next = new Set(prev);
        for (const threadId of threadIds) {
          next.add(threadId);
        }
        return next;
      });
      applyOptimisticSidebarDelta(batch, -1);

      for (const threadId of threadIds) {
        archiveMutation.mutate({ threadId });
      }
    },
    [archiveMutation, visibleThreads],
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
  }, [applyOptimisticSidebarDelta, unarchiveMutation]);

  const handleToggleThreadsOnly = useCallback(() => {
    const nextThreads = !threadsOnly || undefined;
    navigate({
      to: "/",
      search: { q: query, threads: nextThreads, category, label, compose, replyTo },
    });
  }, [category, compose, label, navigate, query, replyTo, threadsOnly]);

  const handleComposeNew = useCallback(() => {
    navigate({
      to: "/",
      search: {
        q: query,
        threads: threadsOnly || undefined,
        category,
        label,
        compose: "new",
        replyTo: undefined,
      },
    });
  }, [category, label, navigate, query, threadsOnly]);

  const handleComposeReply = useCallback(
    (messageId: string) => {
      navigate({
        to: "/",
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
    [category, label, navigate, query, threadsOnly],
  );

  const handleComposeOpenChange = useCallback(
    (open: boolean) => {
      if (open) return;
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
    },
    [category, label, navigate, query, threadsOnly],
  );

  const composeOpen = compose === "new";

  const focusSearch = useCallback(() => {
    searchBoxRef.current?.focus();
  }, [searchBoxRef]);

  if (!accountId) {
    return <NoAccount />;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <main className="flex flex-1 min-h-0">
        <EmailSplitView
          emails={visibleThreads}
          onSelectEmail={handleSelectEmail}
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
          onRemoveFromInbox={handleRemoveFromInbox}
          onRemoveManyFromInbox={handleRemoveManyFromInbox}
          onUndoArchive={handleUndoArchive}
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
