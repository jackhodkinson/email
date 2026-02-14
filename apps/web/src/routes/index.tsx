import {
  memo,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
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

// ─── Search input (isolated state — keystrokes never re-render the page) ─────

interface SearchBoxHandle {
  focus(): void;
}

interface SearchBoxProps {
  query: string | undefined;
  threadsOnly: boolean;
}

const SearchBox = memo(function SearchBox({
  ref,
  query,
  threadsOnly,
}: SearchBoxProps & { ref?: React.Ref<SearchBoxHandle> }) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const prevQueryRef = useRef(query);

  // When the URL query changes (loader resolved, back/forward nav), sync up
  if (query !== prevQueryRef.current) {
    prevQueryRef.current = query;
    setDraft(null);
  }

  const value = draft ?? query ?? "";

  useImperativeHandle(ref, () => ({
    focus() {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
  }));

  const submitSearch = useCallback(
    (searchValue: string) => {
      const trimmed = searchValue.trim() || undefined;
      navigate({
        to: "/",
        search: { q: trimmed, threads: threadsOnly || undefined },
      });
    },
    [navigate, threadsOnly],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setDraft(e.target.value);
    },
    [],
  );

  const handleClear = useCallback(() => {
    setDraft(null);
    navigate({
      to: "/",
      search: { q: undefined, threads: threadsOnly || undefined },
    });
  }, [navigate, threadsOnly]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitSearch(e.currentTarget.value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleClear();
        inputRef.current?.blur();
      }
    },
    [submitSearch, handleClear],
  );

  return (
    <div className="relative flex-1 max-w-md">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        placeholder="Search emails..."
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="search-input"
      />
      {value && (
        <button
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      )}
    </div>
  );
});

// ─── Page ────────────────────────────────────────────────────────────────────

function InboxPage() {
  const { threads, accountId, query, threadsOnly } = Route.useLoaderData();
  const navigate = useNavigate();
  const searchBoxRef = useRef<SearchBoxHandle>(null);

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

  const handleToggleThreadsOnly = useCallback(() => {
    const nextThreads = !threadsOnly || undefined;
    navigate({
      to: "/",
      search: { q: query, threads: nextThreads },
    });
  }, [navigate, threadsOnly, query]);

  const focusSearch = useCallback(() => {
    searchBoxRef.current?.focus();
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
        <SearchBox ref={searchBoxRef} query={query} threadsOnly={threadsOnly} />
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
