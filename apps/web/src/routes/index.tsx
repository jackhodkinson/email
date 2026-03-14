import { useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getThreadedInboxEmails,
  searchThreadedInboxEmails,
} from "../server/functions";
import { ComposeSheet } from "../components/compose-sheet";
import { EmailSplitView } from "../components/email-split-view";
import { NoAccount } from "../components/no-account";
import { useSearchBox } from "../lib/search-context";
import {
  emailDetailQueryOptions,
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
  loader: async ({ deps }) => {
    const result = deps.q
      ? {
          ...(await searchThreadedInboxEmails({
            data: { query: deps.q },
          })),
          query: deps.q as string | undefined,
          threadsOnly: !!deps.threads,
          category: deps.category,
          compose: deps.compose,
          replyTo: deps.replyTo,
        }
      : {
          ...(await getThreadedInboxEmails({
            data: { threadsOnly: !!deps.threads, category: deps.category },
          })),
          query: undefined as string | undefined,
          threadsOnly: !!deps.threads,
          category: deps.category,
          compose: deps.compose,
          replyTo: deps.replyTo,
        };

    // Eagerly prefetch the first N email bodies so the first click is instant
    const queryClient = getQueryClient();
    prefetchBatch(
      queryClient,
      result.threads.map((t) => t.id),
    );

    return result;
  },
  component: InboxPage,
});

function InboxPage() {
  const { threads, accountId, query, threadsOnly, category, compose, replyTo } =
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
          compose,
          replyTo,
        },
      });
    },
    [category, compose, navigate, query, replyTo, threadsOnly],
  );

  const handleToggleThreadsOnly = useCallback(() => {
    const nextThreads = !threadsOnly || undefined;
    navigate({
      to: "/",
      search: { q: query, threads: nextThreads, category, compose, replyTo },
    });
  }, [category, compose, navigate, query, replyTo, threadsOnly]);

  const handleComposeNew = useCallback(() => {
    navigate({
      to: "/",
      search: {
        q: query,
        threads: threadsOnly || undefined,
        category,
        compose: "new",
        replyTo: undefined,
      },
    });
  }, [category, navigate, query, threadsOnly]);

  const handleComposeReply = useCallback(
    (messageId: string) => {
      navigate({
        to: "/",
        search: {
          q: query,
          threads: threadsOnly || undefined,
          category,
          compose: "reply",
          replyTo: messageId,
        },
      });
    },
    [category, navigate, query, threadsOnly],
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
          compose: undefined,
          replyTo: undefined,
        },
      });
    },
    [category, navigate, query, threadsOnly],
  );

  const composeOpen = compose === "new" || compose === "reply";
  const { data: replyEmail } = useQuery({
    ...emailDetailQueryOptions(replyTo ?? ""),
    enabled: compose === "reply" && !!replyTo,
  });

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
          onHoverEmail={handleHoverEmail}
          focusSearch={focusSearch}
          searchParams={query ? { q: query } : undefined}
          accountId={accountId}
          threadsOnly={threadsOnly}
          onToggleThreadsOnly={handleToggleThreadsOnly}
          onComposeNew={handleComposeNew}
          onComposeReply={handleComposeReply}
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
