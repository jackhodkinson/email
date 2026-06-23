import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search, SlidersHorizontal, X } from "lucide-react";

import { EmailList } from "@/components/email-list";
import { Button } from "@/components/ui/button";
import { prefetchEmailDetail, getQueryClient } from "@/lib/query";
import { searchThreadedInboxEmails } from "@/server/functions";

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  loaderDeps: ({ search }) => ({
    q: search.q,
  }),
  loader: async ({ deps }) => {
    if (!deps.q) {
      return {
        accountId: undefined as string | undefined,
        query: undefined as string | undefined,
        threads: [],
      };
    }

    return {
      ...(await searchThreadedInboxEmails({
        data: { query: deps.q },
      })),
      query: deps.q,
    };
  },
  component: SearchPage,
});

function SearchPage() {
  const { accountId, query, threads } = Route.useLoaderData();
  const navigate = useNavigate({ from: Route.fullPath });
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(query ?? "");

  useEffect(() => {
    setDraft(query ?? "");
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submitSearch = useCallback(
    (value: string) => {
      const trimmed = value.trim() || undefined;
      navigate({
        search: { q: trimmed },
      });
    },
    [navigate],
  );

  const handleSelectEmail = useCallback(
    (id: string) => {
      navigate({
        to: "/email/$id",
        params: { id },
        search: {
          q: query,
          threads: undefined,
          category: undefined,
          label: undefined,
          compose: undefined,
          replyTo: undefined,
        },
      });
    },
    [navigate, query],
  );

  const handleHoverEmail = useCallback((id: string) => {
    prefetchEmailDetail(getQueryClient(), id);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b">
        <form
          className="flex h-14 items-center gap-3 px-4"
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch(draft);
          }}
        >
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setDraft("");
                submitSearch("");
              }
            }}
            placeholder="Search emails..."
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          {draft ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Clear search"
              onClick={() => {
                setDraft("");
                submitSearch("");
              }}
            >
              <X />
            </Button>
          ) : null}
        </form>
      </header>

      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <button className="rounded-full border bg-secondary px-3 py-1 text-sm font-medium">
          All
        </button>
        <button className="rounded-full border px-3 py-1 text-sm text-muted-foreground">
          Mail
        </button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" aria-label="Search filters">
            <SlidersHorizontal />
          </Button>
        </div>
      </div>

      <main className="min-h-0 flex-1 overflow-hidden">
        {!query ? (
          <div className="px-4 py-6">
            <h1 className="text-sm font-medium text-muted-foreground">
              Recent searches
            </h1>
            <div className="mt-4 text-sm text-muted-foreground">
              Search your mail by sender, subject, or message content.
            </div>
          </div>
        ) : !accountId ? (
          <div className="empty-state">
            <span className="empty-state__title">No account connected</span>
            <span className="empty-state__text">
              Connect Gmail to search messages.
            </span>
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 px-4 py-3 text-sm text-muted-foreground">
              {threads.length === 1 ? "1 result" : `${threads.length} results`}
              {query ? ` for "${query}"` : ""}
            </div>
            <EmailList
              emails={threads}
              onSelectEmail={handleSelectEmail}
              onHoverEmail={handleHoverEmail}
            />
          </div>
        )}
      </main>
    </div>
  );
}
