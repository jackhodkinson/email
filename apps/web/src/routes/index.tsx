import { useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  getThreadedInboxEmails,
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
  const searchBoxRef = useSearchBox();
  const queryClient = useQueryClient();

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
          emails={threads}
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
