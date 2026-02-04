import { useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { getInboxEmails } from "../server/functions";
import { EmailSplitView } from "../components/email-split-view";
import { NoAccount } from "../components/no-account";

export const Route = createFileRoute("/")({
  loader: async () => {
    return await getInboxEmails({ data: {} });
  },
  component: InboxPage,
});

function InboxPage() {
  const { emails, accountId } = Route.useLoaderData();
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
    <div className="min-h-screen">
      <header className="border-b px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Inbox</h1>
        <span className="text-sm text-muted-foreground">
          {emails.length} emails
        </span>
      </header>

      <main className="h-[calc(100vh-57px)]">
        <EmailSplitView emails={emails} onSelectEmail={handleSelectEmail} />
      </main>
    </div>
  );
}
