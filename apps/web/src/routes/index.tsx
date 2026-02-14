import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  getThreadedInboxEmails,
  searchThreadedInboxEmails,
} from "../server/functions";
import { EmailSplitView } from "../components/email-split-view";
import { NoAccount } from "../components/no-account";
import { Search, X } from "lucide-react";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : undefined,
    threads:
      search.threads === true || search.threads === "true" ? true : undefined,
  }),
  loaderDeps: ({ search }) => ({ q: search.q, threads: search.threads }),
  loader: async ({ deps }) => {
    if (deps.q) {
      return {
        ...(await searchThreadedInboxEmails({
          data: { query: deps.q },
        })),
        query: deps.q,
        threadsOnly: !!deps.threads,
      };
    }
    return {
      ...(await getThreadedInboxEmails({
        data: { threadsOnly: !!deps.threads },
      })),
      query: undefined,
      threadsOnly: !!deps.threads,
    };
  },
  component: InboxPage,
});

function InboxPage() {
  const { threads, accountId, query, threadsOnly } = Route.useLoaderData();
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchValue, setSearchValue] = useState(query ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Sync local state when URL query changes
  useEffect(() => {
    setSearchValue(query ?? "");
  }, [query]);

  const handleSelectEmail = useCallback(
    (id: string) => {
      navigate({
        to: "/email/$id",
        params: { id },
        search: { q: query, threads: threadsOnly || undefined },
      });
    },
    [navigate, query, threadsOnly],
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchValue(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        navigate({
          to: "/",
          search: {
            q: value.trim() || undefined,
            threads: threadsOnly || undefined,
          },
        });
      }, 300);
    },
    [navigate, threadsOnly],
  );

  const handleSearchClear = useCallback(() => {
    setSearchValue("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    navigate({
      to: "/",
      search: { q: undefined, threads: threadsOnly || undefined },
    });
  }, [navigate, threadsOnly]);

  const handleToggleThreadsOnly = useCallback(() => {
    const nextThreads = !threadsOnly || undefined;
    navigate({
      to: "/",
      search: { q: query, threads: nextThreads },
    });
  }, [navigate, threadsOnly, query]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleSearchClear();
        // Return focus to the email list
        searchInputRef.current?.blur();
      }
    },
    [handleSearchClear],
  );

  const focusSearch = useCallback(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, []);

  if (!accountId) {
    return <NoAccount />;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <header className="page-header flex items-center justify-between gap-4">
        <h1 className="page-header__title shrink-0">
          {query ? "Search" : "Inbox"}
        </h1>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search emails..."
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="search-input"
          />
          {searchValue && (
            <button
              onClick={handleSearchClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <span className="page-header__count shrink-0">
          {query
            ? `${threads.length} ${threads.length === 1 ? "result" : "results"}`
            : `${threads.length} ${threads.length === 1 ? "conversation" : "conversations"}`}
        </span>
      </header>

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
