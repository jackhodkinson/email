import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  getEmailById,
  getThreadedInboxEmails,
  getThreadEmails,
  searchThreadedInboxEmails,
} from "../server/functions";
import { EmailSplitView } from "../components/email-split-view";
import { NoAccount } from "../components/no-account";
import { Search, X } from "lucide-react";

export const Route = createFileRoute("/email/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: async ({ params, deps }) => {
    const inboxPromise = deps.q
      ? searchThreadedInboxEmails({ data: { query: deps.q } })
      : getThreadedInboxEmails({ data: {} });

    const [email, inbox] = await Promise.all([
      getEmailById({ data: { emailId: params.id } }),
      inboxPromise,
    ]);

    // Load thread emails if this email belongs to a thread
    const threadEmails = email?.threadId
      ? await getThreadEmails({ data: { threadId: email.threadId } })
      : null;

    return {
      email,
      threads: inbox.threads,
      threadEmails,
      accountId: inbox.accountId,
      query: deps.q,
    };
  },
  component: EmailDetailPage,
  notFoundComponent: NotFound,
});

function EmailDetailPage() {
  const { email, threads, threadEmails, accountId, query } =
    Route.useLoaderData();
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchValue, setSearchValue] = useState(query ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    setSearchValue(query ?? "");
  }, [query]);

  const handleSelectEmail = useCallback(
    (id: string) => {
      navigate({
        to: "/email/$id",
        params: { id },
        search: { q: query },
      });
    },
    [navigate, query],
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchValue(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        navigate({
          to: "/",
          search: { q: value.trim() || undefined },
        });
      }, 300);
    },
    [navigate],
  );

  const handleSearchClear = useCallback(() => {
    setSearchValue("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    navigate({ to: "/", search: { q: undefined } });
  }, [navigate]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleSearchClear();
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

      <main className="flex-1 min-h-0 overflow-hidden">
        <EmailSplitView
          emails={threads}
          selectedEmailId={email?.id ?? null}
          email={email}
          threadEmails={threadEmails}
          onSelectEmail={handleSelectEmail}
          focusSearch={focusSearch}
          searchParams={query ? { q: query } : undefined}
        />
      </main>
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
        search={{ q: undefined }}
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
