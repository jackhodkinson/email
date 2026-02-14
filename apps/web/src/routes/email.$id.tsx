import { useCallback, useEffect, useState } from "react";
import { createFileRoute, defer, Link, useNavigate } from "@tanstack/react-router";
import {
  getEmailById,
  getThreadedInboxEmails,
  getThreadEmails,
  searchThreadedInboxEmails,
} from "../server/functions";
import { EmailSplitView } from "../components/email-split-view";
import { NoAccount } from "../components/no-account";
import { useSearchBox } from "../lib/search-context";

export const Route = createFileRoute("/email/$id")({
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
  loader: async ({ params, deps }) => {
    const inbox = await (deps.q
      ? searchThreadedInboxEmails({ data: { query: deps.q } })
      : getThreadedInboxEmails({
          data: { threadsOnly: !!deps.threads, category: deps.category },
        }));

    // Defer email detail — navigation completes immediately,
    // the detail pane shows a loading state until this resolves.
    const emailDetail = defer(
      getEmailById({ data: { emailId: params.id } }).then(async (email) => {
        const threadEmails = email?.threadId
          ? await getThreadEmails({ data: { threadId: email.threadId } })
          : null;
        return { email, threadEmails };
      }),
    );

    return {
      selectedId: params.id,
      threads: inbox.threads,
      emailDetail,
      accountId: inbox.accountId,
      query: deps.q,
      threadsOnly: !!deps.threads,
      category: deps.category,
    };
  },
  component: EmailDetailPage,
  notFoundComponent: NotFound,
});

type EmailDetailResult = Awaited<ReturnType<typeof getEmailById>>;
type ThreadEmailsResult = Awaited<ReturnType<typeof getThreadEmails>>;

function EmailDetailPage() {
  const {
    selectedId,
    threads,
    emailDetail,
    accountId,
    query,
    threadsOnly,
    category,
  } = Route.useLoaderData();
  const navigate = useNavigate();
  const searchBoxRef = useSearchBox();

  const [detail, setDetail] = useState<{
    email: EmailDetailResult;
    threadEmails: ThreadEmailsResult;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    emailDetail.then((result) => {
      if (!cancelled) setDetail(result);
    });
    return () => {
      cancelled = true;
    };
  }, [emailDetail]);

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
      to: "/email/$id",
      params: { id: selectedId },
      search: { q: query, threads: nextThreads, category },
    });
  }, [navigate, selectedId, threadsOnly, query, category]);

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
          emails={threads}
          selectedEmailId={selectedId}
          email={detail?.email}
          threadEmails={detail?.threadEmails}
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
