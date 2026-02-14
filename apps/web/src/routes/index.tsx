import { useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  getThreadedInboxEmails,
  searchThreadedInboxEmails,
} from "../server/functions";
import { EmailSplitView } from "../components/email-split-view";
import { NoAccount } from "../components/no-account";
import { useSearchBox } from "../lib/search-context";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : undefined,
    threads:
      search.threads === true || search.threads === "true" ? true : undefined,
    category:
      typeof search.category === "string" ? search.category : undefined,
  }),
  loaderDeps: ({ search }) => ({
    q: search.q,
    threads: search.threads,
    category: search.category,
  }),
  loader: async ({ deps }) => {
    if (deps.q) {
      return {
        ...(await searchThreadedInboxEmails({
          data: { query: deps.q },
        })),
        query: deps.q,
        threadsOnly: !!deps.threads,
        category: deps.category,
      };
    }
    return {
      ...(await getThreadedInboxEmails({
        data: { threadsOnly: !!deps.threads, category: deps.category },
      })),
      query: undefined,
      threadsOnly: !!deps.threads,
      category: deps.category,
    };
  },
  component: InboxPage,
});

function InboxPage() {
  const { threads, accountId, query, threadsOnly, category } =
    Route.useLoaderData();
  const navigate = useNavigate();
  const searchBoxRef = useSearchBox();

  const handleSelectEmail = useCallback(
    (id: string) => {
      navigate({
        to: "/email/$id",
        params: { id },
        search: { q: query, threads: threadsOnly || undefined, category },
      });
    },
    [navigate, query, threadsOnly, category],
  );

  const handleToggleThreadsOnly = useCallback(() => {
    const nextThreads = !threadsOnly || undefined;
    navigate({
      to: "/",
      search: { q: query, threads: nextThreads, category },
    });
  }, [navigate, threadsOnly, query, category]);

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
          focusSearch={focusSearch}
          searchParams={query ? { q: query } : undefined}
          accountId={accountId}
          threadsOnly={threadsOnly}
          onToggleThreadsOnly={handleToggleThreadsOnly}
        />
      </main>
    </div>
  );
}
