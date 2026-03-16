import { useCallback, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getThreadedInboxEmails,
  searchThreadedInboxEmails,
  setReadStatus,
  removeFromInboxAction,
  addToInboxAction,
} from "../server/functions";
import { ComposeSheet } from "../components/compose-sheet";
import { EmailSplitView } from "../components/email-split-view";
import { NoAccount } from "../components/no-account";
import { useSearchBox } from "../lib/search-context";
import {
  emailDetailQueryOptions,
  threadEmailsQueryOptions,
  getQueryClient,
  prefetchAdjacent,
  prefetchEmailDetail,
} from "../lib/query";
import { useMutation } from "@tanstack/react-query";

export const Route = createFileRoute("/email/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : undefined,
    threads:
      search.threads === true || search.threads === "true" ? true : undefined,
    category:
      typeof search.category === "string" ? search.category : undefined,
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
    compose: search.compose,
    replyTo: search.replyTo,
  }),
  loader: async ({ params, deps }) => {
    const queryClient = getQueryClient();

    const inbox = await (deps.q
      ? searchThreadedInboxEmails({ data: { query: deps.q } })
      : getThreadedInboxEmails({
          data: { threadsOnly: !!deps.threads, category: deps.category },
        }));

    // Warm the query cache — returns cached data if fresh, fetches otherwise.
    // This does NOT block navigation; the component reads from cache via useQuery.
    queryClient.prefetchQuery(emailDetailQueryOptions(params.id));

    // Prefetch adjacent emails so j/k navigation feels instant
    const emailIds = inbox.threads.map((t) => t.id);
    const selectedIdx = emailIds.indexOf(params.id);
    if (selectedIdx >= 0) {
      prefetchAdjacent(queryClient, emailIds, selectedIdx);
    }

    return {
      selectedId: params.id,
      threads: inbox.threads,
      accountId: inbox.accountId,
      query: deps.q,
      threadsOnly: !!deps.threads,
      category: deps.category,
      compose: deps.compose,
      replyTo: deps.replyTo,
    };
  },
  component: EmailDetailPage,
  notFoundComponent: NotFound,
});

function EmailDetailPage() {
  const {
    selectedId,
    threads,
    accountId,
    query,
    threadsOnly,
    category,
    compose,
    replyTo,
  } = Route.useLoaderData();
  const navigate = useNavigate();
  const searchBoxRef = useSearchBox();
  const queryClient = useQueryClient();

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
  const [archivedThreadIds, setArchivedThreadIds] = useState<Set<string>>(() => new Set());
  const visibleThreads = useMemo(
    () =>
      archivedThreadIds.size === 0
        ? displayThreads
        : displayThreads.filter((t) => !archivedThreadIds.has(t.threadId)),
    [displayThreads, archivedThreadIds],
  );

  const lastArchivedRef = useRef<{ messageId: string; threadId: string } | null>(null);

  const archiveMutation = useMutation({
    mutationFn: async (vars: { threadId: string }) => {
      const result = await removeFromInboxAction({ data: vars });
      window.dispatchEvent(new Event("sidebar-counts-changed"));
      return result;
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: async (vars: { threadId: string }) => {
      const result = await addToInboxAction({ data: vars });
      window.dispatchEvent(new Event("sidebar-counts-changed"));
      return result;
    },
  });

  const handleRemoveFromInbox = useCallback(
    (messageId: string) => {
      // Navigate to the next email in the list before removing
      const currentIdx = visibleThreads.findIndex((t) => t.id === messageId);
      const thread = visibleThreads[currentIdx];
      const nextEmail =
        visibleThreads[currentIdx + 1] ?? visibleThreads[currentIdx - 1];

      const threadId = thread?.threadId;
      if (!threadId) return;

      lastArchivedRef.current = { messageId, threadId };
      setArchivedThreadIds((prev) => new Set(prev).add(threadId));
      archiveMutation.mutate({ threadId });

      if (nextEmail) {
        navigate({
          to: "/email/$id",
          params: { id: nextEmail.id },
          search: {
            q: query,
            threads: threadsOnly || undefined,
            category,
            compose,
            replyTo,
          },
        });
      } else {
        navigate({
          to: "/",
          search: {
            q: query,
            threads: threadsOnly || undefined,
            category,
            compose: undefined,
            replyTo: undefined,
          },
        });
      }
    },
    [archiveMutation, category, compose, navigate, query, replyTo, threadsOnly, visibleThreads],
  );

  const handleUndoArchive = useCallback(() => {
    const last = lastArchivedRef.current;
    if (!last) return;

    lastArchivedRef.current = null;
    setArchivedThreadIds((prev) => {
      const next = new Set(prev);
      next.delete(last.threadId);
      return next;
    });
    unarchiveMutation.mutate({ threadId: last.threadId });

    // Navigate back to the restored email
    navigate({
      to: "/email/$id",
      params: { id: last.messageId },
      search: {
        q: query,
        threads: threadsOnly || undefined,
        category,
        compose,
        replyTo,
      },
    });
  }, [category, compose, navigate, query, replyTo, threadsOnly, unarchiveMutation]);

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
          compose,
          replyTo,
        },
      });
    },
    [
      category,
      compose,
      navigate,
      query,
      queryClient,
      replyTo,
      selectedId,
      threads,
      threadsOnly,
    ],
  );

  // Prefetch email detail on hover so click is instant
  const handleHoverEmail = useCallback(
    (id: string) => {
      prefetchEmailDetail(queryClient, id);
    },
    [queryClient],
  );

  const handleToggleThreadsOnly = useCallback(() => {
    const nextThreads = !threadsOnly || undefined;
    navigate({
      to: "/email/$id",
      params: { id: selectedId },
      search: { q: query, threads: nextThreads, category, compose, replyTo },
    });
  }, [category, compose, navigate, query, replyTo, selectedId, threadsOnly]);

  const handleComposeNew = useCallback(() => {
    navigate({
      to: "/email/$id",
      params: { id: selectedId },
      search: {
        q: query,
        threads: threadsOnly || undefined,
        category,
        compose: "new",
        replyTo: undefined,
      },
    });
  }, [category, navigate, query, selectedId, threadsOnly]);

  const handleComposeReply = useCallback(
    (messageId: string) => {
      navigate({
        to: "/email/$id",
        params: { id: selectedId },
        search: {
          q: query,
          threads: threadsOnly || undefined,
          category,
          compose: "reply",
          replyTo: messageId,
        },
      });
    },
    [category, navigate, query, selectedId, threadsOnly],
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
          compose: undefined,
          replyTo: undefined,
        },
      });
    },
    [category, navigate, query, selectedId, threadsOnly],
  );

  const composeOpen = compose === "new" || compose === "reply";
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
          selectedEmailId={selectedId}
          email={emailDetail ?? null}
          threadEmails={threadEmails ?? null}
          onSelectEmail={handleSelectEmail}
          onHoverEmail={handleHoverEmail}
          focusSearch={focusSearch}
          searchParams={query ? { q: query } : undefined}
          accountId={accountId}
          threadsOnly={threadsOnly}
          onToggleThreadsOnly={handleToggleThreadsOnly}
          onComposeNew={handleComposeNew}
          onComposeReply={handleComposeReply}
          onToggleRead={handleToggleRead}
          onRemoveFromInbox={handleRemoveFromInbox}
          onUndoArchive={handleUndoArchive}
        />
      </main>
      {composeOpen && (
        <ComposeSheet
          key={`${compose}:${replyTo ?? "none"}`}
          open={composeOpen}
          mode={compose}
          replyToMessageId={compose === "reply" ? replyTo : undefined}
          replySender={replyEmail?.sender}
          replySubject={replyEmail?.subject}
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
        search={{ q: undefined, threads: undefined, category: undefined }}
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
