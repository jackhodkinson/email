import { useCallback } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { getEmailById, getInboxEmails } from "../server/functions";
import { EmailSplitView } from "../components/email-split-view";
import { NoAccount } from "../components/no-account";

export const Route = createFileRoute("/email/$id")({
  loader: async ({ params }) => {
    const [email, inbox] = await Promise.all([
      getEmailById({ data: { emailId: params.id } }),
      getInboxEmails({ data: {} }),
    ]);

    return {
      email,
      emails: inbox.emails,
      accountId: inbox.accountId,
    };
  },
  component: EmailDetailPage,
  notFoundComponent: NotFound,
});

function EmailDetailPage() {
  const { email, emails, accountId } = Route.useLoaderData();
  const navigate = useNavigate();

  const handleSelectEmail = useCallback(
    (id: string) => {
      navigate({ to: "/email/$id", params: { id } });
    },
    [navigate]
  );

  if (!accountId) {
    return <NoAccount />;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <header className="border-b px-4 py-3 flex items-center justify-between flex-shrink-0">
        <h1 className="text-lg font-semibold">Inbox</h1>
        <span className="text-sm text-muted-foreground">
          {emails.length} emails
        </span>
      </header>

      <main className="flex-1 min-h-0 overflow-hidden">
        <EmailSplitView
          emails={emails}
          selectedEmailId={email?.id ?? null}
          email={email}
          onSelectEmail={handleSelectEmail}
        />
      </main>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <h1 className="text-2xl font-semibold">Email not found</h1>
      <p className="text-muted-foreground">
        The email you're looking for doesn't exist or has been deleted.
      </p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
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
